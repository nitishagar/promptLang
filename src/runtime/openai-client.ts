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