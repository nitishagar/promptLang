import { TokenCounter } from '../src/runtime/tokenizer';
import { CircuitBreaker } from '../src/runtime/resilience';
import { Schema } from '../src/types/schema';

console.log('=== Phase 4: Runtime Integration Examples ===\n');

// Example 1: Token counting
function tokenCountingExample() {
  console.log('=== Token Counting Example ===');

  const text = 'This is a sample text to demonstrate token counting functionality.';
  const tokens = TokenCounter.countTokens(text, 'gpt-4');

  console.log('Text:', text);
  console.log('Estimated tokens:', tokens);

  const cost = TokenCounter.estimateCost(100, 50, 'gpt-4');
  console.log('Cost for 100 prompt + 50 completion tokens:', cost);

  const truncated = TokenCounter.truncateToMaxTokens(
    'This is a very long text that needs to be truncated to fit within token limits. It contains many words and sentences that would exceed our limit.',
    10,
    'gpt-4'
  );
  console.log('Truncated text:', truncated);
}

tokenCountingExample();

// Example 2: Schema-based output (demonstration without API call)
console.log('\n=== Schema-Based Output Example ===');

const citySchema = new Schema({
  name: 'City',
  fields: [
    { name: 'name', type: { kind: 'primitive', name: 'string' }, required: true },
    { name: 'country', type: { kind: 'primitive', name: 'string' }, required: true },
    { name: 'population', type: { kind: 'primitive', name: 'number' }, required: false },
    { name: 'landmarks', type: { kind: 'list', element: { kind: 'primitive', name: 'string' } }, required: true }
  ]
});

console.log('City schema created for structured output');
console.log('OpenAI Schema format:');
console.log(JSON.stringify(citySchema.toOpenAISchema(), null, 2));

// Example 3: Resilience patterns
console.log('\n=== Resilience Example ===');

const circuitBreaker = new CircuitBreaker(3, 5000);
console.log('Circuit breaker created with threshold: 3, timeout: 5000ms');
console.log('Initial state:', circuitBreaker.getState());
console.log('Rate limiter would be created with: 5 tokens/sec, max burst: 10');

// Example 4: Client configuration (without actual API key)
console.log('\n=== Client Configuration Example ===');

// Note: This would normally use a real API key
const mockConfig = {
  apiKey: process.env.OPENAI_API_KEY || 'sk-mock-key-for-demonstration',
  organization: process.env.OPENAI_ORG,
  maxRetries: 3,
  retryDelay: 1000
};

console.log('OpenAI client configuration:');
console.log('- Max retries:', mockConfig.maxRetries);
console.log('- Retry delay:', mockConfig.retryDelay, 'ms');
console.log('- Organization:', mockConfig.organization || 'not set');

// Example 5: Executor setup
console.log('\n=== Executor Setup Example ===');

console.log('Prompt executor would be initialized with:');
console.log('- Client: OpenAI API client');
console.log('- Max tokens: 1000');
console.log('- Timeout: 30000 ms');
console.log('- Debug mode: enabled');

// Example 6: Usage tracking
console.log('\n=== Usage Tracking Example ===');

console.log('Usage statistics would track:');
console.log('- Total prompt tokens');
console.log('- Total completion tokens');
console.log('- Total cost (based on model pricing)');
console.log('- Request count');
console.log('- Average tokens per request');

console.log('\n=== Phase 4 Examples Completed ===');
console.log('\nNote: These examples demonstrate the runtime integration capabilities.');
console.log('Actual API calls require a valid OPENAI_API_KEY environment variable.');
console.log('To test with real API calls, set OPENAI_API_KEY and uncomment the execution examples.');

// Commented example of actual usage:
/*
async function realExecutionExample() {
  const client = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY!,
    maxRetries: 3
  });

  const executor = new PromptExecutor({
    client,
    maxTokens: 1000,
    timeout: 30000,
    debug: true
  });

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
*/
