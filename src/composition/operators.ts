export type PromptResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'error'; error: Error };

export type Prompt<T> = () => Promise<PromptResult<T>>;

// Pipe operator: sequential composition
export function pipe<A, B>(
  pa: Prompt<A>,
  f: (a: A) => Prompt<B>
): Prompt<B> {
  return async () => {
    const resultA = await pa();
    if (resultA.kind === 'error') {
      return resultA;
    }
    return f(resultA.value)();
  };
}

// Map operator: transform the result
export function map<A, B>(
  pa: Prompt<A>,
  f: (a: A) => B
): Prompt<B> {
  return async () => {
    const result = await pa();
    if (result.kind === 'error') {
      return result;
    }
    return { kind: 'success', value: f(result.value) };
  };
}

// Parallel operator: run multiple prompts concurrently
export function parallel<T extends readonly Prompt<any>[]>(
  ...prompts: T
): Prompt<{ [K in keyof T]: T[K] extends Prompt<infer U> ? U : never }> {
  return async () => {
    const results = await Promise.all(prompts.map(p => p()));

    // Check for errors
    for (const result of results) {
      if (result.kind === 'error') {
        return { kind: 'error', error: result.error };
      }
    }

    // Extract values
    const values = results.map(r => (r as any).value);
    return { kind: 'success', value: values as any };
  };
}

// Alternative operator: fallback on error
export function alternative<T>(
  primary: Prompt<T>,
  fallback: Prompt<T>
): Prompt<T> {
  return async () => {
    const primaryResult = await primary();
    if (primaryResult.kind === 'success') {
      return primaryResult;
    }

    console.warn('Primary prompt failed, trying fallback:', primaryResult.error);
    return fallback();
  };
}

// Retry operator: retry with exponential backoff
export function retry<T>(
  prompt: Prompt<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Prompt<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;

  return async () => {
    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await prompt();

      if (result.kind === 'success') {
        return result;
      }

      lastError = result.error;

      if (attempt < maxAttempts) {
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await sleep(delay);
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }

    return {
      kind: 'error',
      error: new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`)
    };
  };
}

// Cache operator: cache results
const cache = new Map<string, { value: any; expiry: number }>();

export function cached<T>(
  prompt: Prompt<T>,
  key: string,
  ttl: number = 60000 // 1 minute default
): Prompt<T> {
  return async () => {
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && cached.expiry > now) {
      return { kind: 'success', value: cached.value };
    }

    const result = await prompt();

    if (result.kind === 'success') {
      cache.set(key, {
        value: result.value,
        expiry: now + ttl
      });
    }

    return result;
  };
}

// Timeout operator
export function timeout<T>(
  prompt: Prompt<T>,
  ms: number
): Prompt<T> {
  return async () => {
    const timeoutPromise = new Promise<PromptResult<T>>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });

    try {
      return await Promise.race([prompt(), timeoutPromise]);
    } catch (error) {
      return { kind: 'error', error: error as Error };
    }
  };
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Combinator for building complex flows
export class PromptBuilder<T> {
  constructor(private prompt: Prompt<T>) {}

  pipe<U>(f: (value: T) => Prompt<U>): PromptBuilder<U> {
    return new PromptBuilder(pipe(this.prompt, f));
  }

  map<U>(f: (value: T) => U): PromptBuilder<U> {
    return new PromptBuilder(map(this.prompt, f));
  }

  fallback(alternativePrompt: Prompt<T>): PromptBuilder<T> {
    return new PromptBuilder(alternative(this.prompt, alternativePrompt));
  }

  retry(options?: Parameters<typeof retry>[1]): PromptBuilder<T> {
    return new PromptBuilder(retry(this.prompt, options));
  }

  cache(key: string, ttl?: number): PromptBuilder<T> {
    return new PromptBuilder(cached(this.prompt, key, ttl));
  }

  timeout(ms: number): PromptBuilder<T> {
    return new PromptBuilder(timeout(this.prompt, ms));
  }

  build(): Prompt<T> {
    return this.prompt;
  }

  async execute(): Promise<T> {
    const result = await this.prompt();
    if (result.kind === 'error') {
      throw result.error;
    }
    return result.value;
  }
}