import { Parser } from '../src/parser/parser';
import { TypeChecker } from '../src/types/checker';
import { Schema } from '../src/types/schema';

// Example 1: Type checking
const code1 = `
let x = 5,
    y = "hello"
in x + y  # This should produce a type error
`;

console.log('Type Checking Example:');
const parser1 = new Parser(code1);
const ast1 = parser1.parse();
const checker1 = new TypeChecker();
const type1 = checker1.check(ast1);
console.log('Result type:', type1);
console.log('Errors:', checker1.getErrors());

// Example 2: Schema definition and validation
const resumeSchema = new Schema({
  name: 'Resume',
  fields: [
    {
      name: 'name',
      type: { kind: 'primitive', name: 'string' },
      required: true,
      description: 'Full name of the person'
    },
    {
      name: 'email',
      type: { kind: 'primitive', name: 'string' },
      required: false,
      validation: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    },
    {
      name: 'experience',
      type: {
        kind: 'list',
        element: {
          kind: 'record',
          fields: [
            { name: 'company', type: { kind: 'primitive', name: 'string' }, optional: false },
            { name: 'role', type: { kind: 'primitive', name: 'string' }, optional: false },
            { name: 'years', type: { kind: 'primitive', name: 'number' }, optional: true }
          ]
        }
      },
      required: true,
      default: []
    }
  ]
});

// Test schema validation
const testData = {
  name: "John Doe",
  email: "john@example.com",
  experience: [
    { company: "Tech Corp", role: "Engineer", years: 3 },
    { company: "StartUp Inc", role: "Senior Engineer" }
  ]
};

console.log('\nSchema Validation Example:');
console.log('Validation result:', resumeSchema.validate(testData));

// Test schema-aligned parsing
const malformedJson = `{
  "Name": "Jane Doe",
  "EMAIL": "jane@example.com",
  "experience": []
}`;

console.log('\nSchema-Aligned Parsing:');
console.log('Parse result:', resumeSchema.parse(malformedJson));

// Generate OpenAI schema
console.log('\nOpenAI Schema:');
console.log(JSON.stringify(resumeSchema.toOpenAISchema(), null, 2));
