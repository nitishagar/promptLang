import { TemplateEngine } from '../src/templates/engine';
import { defprompt } from '../src/prompts/definition';
import { Schema } from '../src/types/schema';

// Example 1: Basic template rendering
console.log('=== Template Engine Example ===');
const engine = new TemplateEngine({
  variables: new Map<string, any>([
    ['name', 'Alice'],
    ['items', ['apple', 'banana', 'orange']],
    ['showDetails', true]
  ])
});

const template1 = `
Hello, {{ name }}!

{% if showDetails %}
Your items:
{% for item in items %}
  - {{ uppercase(item) }}{% if item_last %} (last item){% endif %}
{% endfor %}
{% else %}
No details available.
{% endif %}
`;

console.log(engine.render(template1));

// Example 2: Prompt definition with schemas
console.log('\n=== Prompt Definition Example ===');

const resumeSchema = new Schema({
  name: 'Resume',
  fields: [
    { name: 'name', type: { kind: 'primitive', name: 'string' }, required: true },
    { name: 'email', type: { kind: 'primitive', name: 'string' }, required: false },
    { name: 'skills', type: { kind: 'list', element: { kind: 'primitive', name: 'string' } }, required: true }
  ]
});

const extractResume = defprompt<{ text: string }, any>(`
Extract resume information from the following text:

{{ text }}

Please return the data in this JSON format:
{{ json(@output_schema) }}
`)
  .withOutput(resumeSchema)
  .withConfig({ temperature: 0.3 })
  .preprocess(input => ({ ...input, text: input.text.trim() }))
  .validate(output => output.skills && output.skills.length > 0);

console.log('Prompt definition created successfully');
console.log('Template:', extractResume['template']);

// Example 3: Composition operators
console.log('\n=== Composition Example ===');

// Define prompts for composition
defprompt<{ text: string }, { sentiment: string }>(`
Analyze the sentiment of this text:
{{ text }}
`).withConfig({ model: 'gpt-3.5-turbo' });

defprompt<{ text: string }, { entities: string[] }>(`
Extract named entities from this text:
{{ text }}
`);

defprompt<{ text: string }, { summary: string }>(`
Summarize this text in one sentence:
{{ text }}
`);

console.log('Composition operators defined successfully');
console.log('These would run in parallel in actual execution');

// Example 4: Complex template with all features
console.log('\n=== Complex Template Example ===');

const complexTemplate = `
# API Documentation

## Model: {{ model }}
## Temperature: {{ temperature }}

{% if schemas %}
## Schemas:
{% for schema in schemas %}
### {{ schema.name }}
\`\`\`json
{{ json(schema) }}
\`\`\`
{% endfor %}
{% endif %}

## Examples:
{% for example in examples %}
{{ example_index }}. Input: {{ example.input }}
   Output: {{ example.output }}
{% endfor %}
`;

const complexEngine = new TemplateEngine({
  variables: new Map<string, any>([
    ['model', 'gpt-4'],
    ['temperature', 0.7],
    ['schemas', [
      { name: 'User', fields: ['id', 'name', 'email'] },
      { name: 'Post', fields: ['id', 'title', 'content'] }
    ]],
    ['examples', [
      { input: 'Hello', output: 'Hi there!' },
      { input: 'How are you?', output: 'I am doing well!' }
    ]]
  ])
});

console.log(complexEngine.render(complexTemplate));

console.log('\n=== Phase 3 Examples Completed ===');
