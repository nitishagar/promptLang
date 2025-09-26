import { Parser } from '../src/parser/parser';

// Example 1: Simple literal
const example1 = `"Hello World"`;

// Example 2: Pipeline
const example2 = `
  "raw text"
  |> sanitize
  |> template
  |> validate
`;

// Example 3: Lambda expression
const example3 = `(x: string) -> uppercase x`;

// Example 4: Let binding
const example4 = `
  let name = "Alice",
      age = 30
  in format "Hello, {{ name }}! You are {{ age }} years old."
`;

// Example 5: Template with interpolation
const example5 = `"""
Extract information from resume:
{{ schema }}

Resume text:
{{ input }}
"""`;

// Test parser
function testParser(name: string, input: string) {
  console.log(`\nTesting: ${name}`);
  console.log('Input:', input);

  try {
    const parser = new Parser(input);
    const ast = parser.parse();
    console.log('AST:', JSON.stringify(ast, null, 2));
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

// Run tests
testParser('Simple Literal', example1);
testParser('Pipeline', example2);
testParser('Lambda', example3);
testParser('Let Binding', example4);
testParser('Template', example5);
