import { OpenAIClient, ChatCompletionRequest, ChatCompletionResponse } from './openai-client';
import { TokenCounter } from './tokenizer';
import { Schema } from '../types/schema';

export interface ExecutionContext {
  client: OpenAIClient;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
  debug?: boolean;
}

export interface ExecutionResult<T> {
  value: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: {
      prompt: number;
      completion: number;
      total: number;
    };
  };
  metadata: {
    model: string;
    duration: number;
    requestId: string;
  };
}

export class PromptExecutor {
  private context: ExecutionContext;
  private usageTracker: UsageTracker;

  constructor(context: ExecutionContext) {
    this.context = context;
    this.usageTracker = new UsageTracker();
  }

  async execute<T>(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      outputSchema?: Schema;
      systemPrompt?: string;
    } = {}
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();

    // Build messages
    const messages: any[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // Build request
    const request: ChatCompletionRequest = {
      model: options.model || 'gpt-4',
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens || this.context.maxTokens
    };

    // Add schema if provided
    if (options.outputSchema) {
      request.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: options.outputSchema.toOpenAISchema()
        }
      };
    }

    // Log debug info
    if (this.context.debug) {
      console.log('Executing prompt:', {
        model: request.model,
        promptLength: prompt.length,
        estimatedTokens: TokenCounter.countTokens(prompt, request.model)
      });
    }

    try {
      // Execute request
      const response = await this.executeWithTimeout(request);

      // Extract content
      const content = response.choices[0].message.content;
      let result: T;

      // Parse if schema provided
      if (options.outputSchema) {
        const parseResult = options.outputSchema.parse(content);
        if (!parseResult.success) {
          throw new Error(`Failed to parse response: ${JSON.stringify(parseResult.errors)}`);
        }
        result = parseResult.value as T;
      } else {
        result = content as T;
      }

      // Calculate costs
      const costDetails = TokenCounter.estimateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        request.model
      );

      // Create cost object matching the expected structure
      const cost = {
        prompt: costDetails.promptCost,
        completion: costDetails.completionCost,
        total: costDetails.totalCost
      };

      // Track usage
      this.usageTracker.track(response.usage, cost);

      return {
        value: result,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          cost
        },
        metadata: {
          model: response.model,
          duration: Date.now() - startTime,
          requestId: response.id
        }
      };
    } catch (error) {
      if (this.context.debug) {
        console.error('Execution failed:', error);
      }
      throw error;
    }
  }

  async executeStream(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      onChunk: (chunk: string) => void;
    }
  ): Promise<void> {
    const messages = [{ role: 'user' as const, content: prompt }];

    const request: ChatCompletionRequest = {
      model: options.model || 'gpt-4',
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens || this.context.maxTokens,
      stream: true
    };

    let accumulated = '';

    await this.context.client.createChatCompletionStream(request, (chunk) => {
      if (chunk.choices?.[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        accumulated += content;
        options.onChunk(content);
      }
    });
  }

  private async executeWithTimeout(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    if (!this.context.timeout) {
      return this.context.client.createChatCompletion(request);
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), this.context.timeout);
    });

    return Promise.race([
      this.context.client.createChatCompletion(request),
      timeoutPromise
    ]);
  }

  getUsageStats(): UsageStats {
    return this.usageTracker.getStats();
  }
}

class UsageTracker {
  private totalPromptTokens: number = 0;
  private totalCompletionTokens: number = 0;
  private totalCost: number = 0;
  private requestCount: number = 0;

  track(usage: any, cost: any): void {
    this.totalPromptTokens += usage.prompt_tokens;
    this.totalCompletionTokens += usage.completion_tokens;
    this.totalCost += cost.total;
    this.requestCount++;
  }

  getStats(): UsageStats {
    return {
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageTokensPerRequest: this.requestCount > 0
        ? (this.totalPromptTokens + this.totalCompletionTokens) / this.requestCount
        : 0
    };
  }
}

export interface UsageStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  averageTokensPerRequest: number;
}