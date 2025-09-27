# Phase 4: OpenAI Runtime Integration Implementation Plan

## Overview
Implement the runtime system that integrates with OpenAI API, including client management, request execution, streaming support, and token counting.

## Desired End State
A production-ready runtime that can execute prompts against OpenAI API with proper error handling, retries, streaming, and usage tracking.

## Implementation Steps

### Step 1: OpenAI Client Implementation

**File**: `src/runtime/openai-client.ts`

```typescript
import axios, { AxiosInstance } from 'axios';

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  n?: number;
  stream?: boolean;
  response_format?: {
    type: 'text' | 'json_schema';
    json_schema?: {
      name: string;
      strict?: boolean;
      schema: any;
    };
  };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: any;
    };
  }>;
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIClient {
  private axios: AxiosInstance;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = {
      baseURL: 'https://api.openai.com/v1',
      timeout: 60000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };

    this.axios = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.config.organization && {
          'OpenAI-Organization': this.config.organization
        })
      }
    });
  }

  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    return this.withRetry(async () => {
      const response = await this.axios.post('/chat/completions', request);
      return response.data;
    });
  }

  async createChatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: any) => void
  ): Promise<void> {
    const streamRequest = { ...request, stream: true };

    const response = await this.axios.post('/chat/completions', streamRequest, {
      responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
      let buffer = '';

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              resolve();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              onChunk(parsed);
            } catch (error) {
              console.error('Failed to parse SSE chunk:', error);
            }
          }
        }
      });

      response.data.on('error', reject);
      response.data.on('end', resolve);
    });
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = this.isRetryableError(error);
      const hasAttemptsLeft = attempt < (this.config.maxRetries || 3);

      if (isRetryable && hasAttemptsLeft) {
        const delay = this.calculateRetryDelay(attempt);
        console.log(`Retry attempt ${attempt} after ${delay}ms...`);
        await this.sleep(delay);
        return this.withRetry(fn, attempt + 1);
      }

      throw this.enhanceError(error);
    }
  }

  private isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Rate limit errors
    if (error.response?.status === 429) {
      return true;
    }

    // Server errors
    if (error.response?.status >= 500) {
      return true;
    }

    return false;
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay || 1000;
    return baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
  }

  private enhanceError(error: any): Error {
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      const enhancedError = new Error(apiError.message || 'OpenAI API error');
      (enhancedError as any).type = apiError.type;
      (enhancedError as any).code = apiError.code;
      (enhancedError as any).statusCode = error.response.status;
      return enhancedError;
    }

    return error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 2: Token Counting Utility

**File**: `src/runtime/tokenizer.ts`

```typescript
// Simplified token counter - in production would use tiktoken
export class TokenCounter {
  private static readonly AVG_CHARS_PER_TOKEN = 4;

  static countTokens(text: string, model: string = 'gpt-4'): number {
    // Simplified estimation
    // Real implementation would use tiktoken library
    const baseCount = Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN);

    // Adjust for different models
    const modelMultiplier = this.getModelMultiplier(model);
    return Math.ceil(baseCount * modelMultiplier);
  }

  static estimateCost(
    promptTokens: number,
    completionTokens: number,
    model: string
  ): { promptCost: number; completionCost: number; totalCost: number } {
    const pricing = this.getPricing(model);

    const promptCost = (promptTokens / 1000) * pricing.prompt;
    const completionCost = (completionTokens / 1000) * pricing.completion;

    return {
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost
    };
  }

  private static getModelMultiplier(model: string): number {
    if (model.includes('gpt-4')) return 1.0;
    if (model.includes('gpt-3.5')) return 1.1;
    return 1.2;
  }

  private static getPricing(model: string): { prompt: number; completion: number } {
    // Prices per 1K tokens (as of 2024)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4-32k': { prompt: 0.06, completion: 0.12 },
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 }
    };

    for (const [key, value] of Object.entries(pricing)) {
      if (model.includes(key)) {
        return value;
      }
    }

    return { prompt: 0.03, completion: 0.06 }; // Default to GPT-4 pricing
  }

  static truncateToMaxTokens(
    text: string,
    maxTokens: number,
    model: string = 'gpt-4'
  ): string {
    const currentTokens = this.countTokens(text, model);

    if (currentTokens <= maxTokens) {
      return text;
    }

    // Binary search for the right length
    let left = 0;
    let right = text.length;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      const truncated = text.slice(0, mid);
      const tokens = this.countTokens(truncated, model);

      if (tokens <= maxTokens) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }

    return text.slice(0, left) + '...';
  }
}
```

### Step 3: Runtime Executor

**File**: `src/runtime/executor.ts`

```typescript
import { OpenAIClient, ChatCompletionRequest, ChatCompletionResponse } from './openai-client';
import { TokenCounter } from './tokenizer';
import { Schema } from '../types/schema';
import { PromptResult } from '../composition/operators';

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
      const cost = TokenCounter.estimateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        request.model
      );

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

  async executeStream<T>(
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
```

### Step 4: Circuit Breaker and Rate Limiter

**File**: `src/runtime/resilience.ts`

```typescript
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number = Date.now();

  constructor(
    private maxTokens: number = 10,
    private refillRate: number = 1, // tokens per second
    private maxBurst: number = 20
  ) {
    this.tokens = maxTokens;
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    // Calculate wait time
    const tokensNeeded = tokens - this.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000;

    await this.sleep(waitTime);
    this.tokens = 0;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.tokens + tokensToAdd, this.maxBurst);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 5: Integration and Example Usage

**File**: `examples/phase4_examples.ts`

```typescript
import { OpenAIClient } from '../src/runtime/openai-client';
import { PromptExecutor } from '../src/runtime/executor';
import { TokenCounter } from '../src/runtime/tokenizer';
import { CircuitBreaker, RateLimiter } from '../src/runtime/resilience';
import { Schema } from '../src/types/schema';

// Initialize client
const client = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key',
  organization: process.env.OPENAI_ORG,
  maxRetries: 3,
  retryDelay: 1000
});

// Initialize executor
const executor = new PromptExecutor({
  client,
  maxTokens: 1000,
  timeout: 30000,
  debug: true
});

// Example 1: Basic execution
async function basicExample() {
  console.log('=== Basic Execution Example ===');

  const result = await executor.execute(
    'What is the capital of France?',
    {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 100
    }
  );

  console.log('Response:', result.value);
  console.log('Usage:', result.usage);
  console.log('Metadata:', result.metadata);
}

// Example 2: Structured output with schema
async function schemaExample() {
  console.log('\n=== Schema Output Example ===');

  const citySchema = new Schema({
    name: 'City',
    fields: [
      { name: 'name', type: { kind: 'primitive', name: 'string' }, required: true },
      { name: 'country', type: { kind: 'primitive', name: 'string' }, required: true },
      { name: 'population', type: { kind: 'primitive', name: 'number' }, required: false },
      { name: 'landmarks', type: { kind: 'list', element: { kind: 'primitive', name: 'string' } }, required: true }
    ]
  });

  const result = await executor.execute(
    'Tell me about Paris, France',
    {
      model: 'gpt-4',
      temperature: 0.3,
      outputSchema: citySchema
    }
  );

  console.log('Structured response:', result.value);
}

// Example 3: Streaming
async function streamingExample() {
  console.log('\n=== Streaming Example ===');

  let fullResponse = '';

  await executor.executeStream(
    'Write a short story about a robot learning to paint',
    {
      model: 'gpt-3.5-turbo',
      temperature: 0.8,
      maxTokens: 200,
      onChunk: (chunk) => {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
    }
  );

  console.log('\n\nFull response length:', fullResponse.length);
}

// Example 4: Token counting
function tokenCountingExample() {
  console.log('\n=== Token Counting Example ===');

  const text = 'This is a sample text to demonstrate token counting functionality.';
  const tokens = TokenCounter.countTokens(text, 'gpt-4');

  console.log('Text:', text);
  console.log('Estimated tokens:', tokens);

  const cost = TokenCounter.estimateCost(100, 50, 'gpt-4');
  console.log('Cost for 100 prompt + 50 completion tokens:', cost);

  const truncated = TokenCounter.truncateToMaxTokens(
    'This is a very long text that needs to be truncated to fit within token limits...',
    10,
    'gpt-4'
  );
  console.log('Truncated text:', truncated);
}

// Example 5: Circuit breaker and rate limiting
async function resilienceExample() {
  console.log('\n=== Resilience Example ===');

  const circuitBreaker = new CircuitBreaker(3, 5000);
  const rateLimiter = new RateLimiter(5, 1, 10);

  // Wrap executor with circuit breaker and rate limiter
  const resilientExecute = async (prompt: string) => {
    await rateLimiter.acquire(1);

    return circuitBreaker.execute(async () => {
      return executor.execute(prompt, {
        model: 'gpt-3.5-turbo',
        maxTokens: 50
      });
    });
  };

  try {
    // Make multiple requests
    for (let i = 0; i < 3; i++) {
      console.log(`Request ${i + 1}...`);
      const result = await resilientExecute(`Count to ${i + 1}`);
      console.log(`Response ${i + 1}:`, result.value);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }

  console.log('Circuit breaker state:', circuitBreaker.getState());
}

// Example 6: Usage statistics
async function usageStatsExample() {
  console.log('\n=== Usage Statistics Example ===');

  // Make a few requests
  await executor.execute('Hello', { model: 'gpt-3.5-turbo', maxTokens: 10 });
  await executor.execute('How are you?', { model: 'gpt-3.5-turbo', maxTokens: 20 });
  await executor.execute('Goodbye', { model: 'gpt-3.5-turbo', maxTokens: 10 });

  const stats = executor.getUsageStats();
  console.log('Usage statistics:', stats);
}

// Run examples
async function runExamples() {
  try {
    // Note: These would actually call OpenAI API
    // Comment out or mock for testing without API key

    // await basicExample();
    // await schemaExample();
    // await streamingExample();
    tokenCountingExample();
    // await resilienceExample();
    // await usageStatsExample();
  } catch (error) {
    console.error('Example failed:', error);
  }
}

runExamples();
```

### Step 6: Package Dependencies Update

**File**: `package.json` (additions)

```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

## Success Criteria

### Automated Verification:
- [ ] OpenAI client successfully makes API calls with proper authentication
- [ ] Retry logic works with exponential backoff
- [ ] Token counting provides reasonable estimates
- [ ] Circuit breaker opens after threshold failures
- [ ] Rate limiter properly throttles requests
- [ ] Streaming correctly processes SSE chunks

### Manual Verification:
- [ ] Error messages from API are properly enhanced and readable
- [ ] Usage tracking accurately reports token usage and costs
- [ ] Timeout handling works correctly
- [ ] Schema-based responses are properly validated

## Next Steps
After Phase 4 is complete and tested, proceed to Phase 5: Error Handling and Developer Tools