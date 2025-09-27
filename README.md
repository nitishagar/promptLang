# PromptLang

A functional DSL (Domain-Specific Language) for type-safe prompt engineering, inspired by lambda calculus principles and Elixir syntax.

## Overview

PromptLang is designed to make prompt engineering more reliable, composable, and type-safe. It provides a functional approach to building and managing prompts for Large Language Models (LLMs) with features like:

- **Type Safety**: Strong typing system to catch errors at compile time
- **Functional Composition**: Pipeline operators and lambda expressions for composable prompt transformations
- **Template Literals**: Built-in support for structured prompt templates with interpolation
- **Lambda Calculus Foundation**: Based on sound theoretical principles for reliable computation

## Features

### Core Language Constructs

- **Literals**: Strings, numbers, and booleans
- **Lambda Expressions**: First-class functions with type annotations
- **Pipelines**: Elixir-style pipe operator (`|>`) for function composition
- **Let Bindings**: Local variable bindings with lexical scoping
- **Templates**: Triple-quoted strings with interpolation support

### Example Syntax

```promptlang
# Simple pipeline
"raw text"
|> sanitize
|> template
|> validate

# Lambda expression
(x: string) -> uppercase x

# Let binding with template
let name = "Alice",
    age = 30
in format "Hello, {{ name }}! You are {{ age }} years old."

# Template literal
"""
Extract information from resume:
{{ schema }}

Resume text:
{{ input }}
"""
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd promptLang

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Running Examples

```bash
npm run dev
```

This will run the example parser tests in `examples/phase1_examples.ts`.

### Using the Parser

```typescript
import { Parser } from './src/parser/parser';

const input = '"Hello World" |> uppercase';
const parser = new Parser(input);
const ast = parser.parse();

console.log(JSON.stringify(ast, null, 2));
```

## Project Structure

```
promptLang/
├── src/
│   ├── ast/
│   │   └── types.ts          # AST node type definitions
│   └── parser/
│       ├── lexer.ts          # Tokenizer/lexer implementation
│       └── parser.ts         # Parser implementation
├── examples/
│   └── phase1_examples.ts    # Example usage and tests
├── functional_docs/          # Documentation and specifications
└── prds/                     # Product requirement documents
```

## Development

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run example parser tests
- `npm run test` - Run test suite (when configured)
- `npm run lint` - Run ESLint (requires configuration)
- `npm run format` - Format code with Prettier

### TypeScript Configuration

The project uses strict TypeScript settings for maximum type safety:
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Source maps enabled for debugging

## Architecture

### AST (Abstract Syntax Tree)

The AST is the core data structure representing parsed PromptLang code. Key node types include:

- **Literal**: String, number, or boolean values
- **Identifier**: Variable references
- **Lambda**: Function definitions with parameters and body
- **Application**: Function calls with arguments
- **Let**: Variable bindings with scope
- **Template**: String templates with interpolation
- **Pipeline**: Chained function applications
- **TypeAnnotation**: Type information for expressions

### Parser Pipeline

1. **Lexer**: Tokenizes input string into tokens
2. **Parser**: Builds AST from token stream
3. **Type Checker**: (Phase 2) Validates type correctness
4. **Evaluator**: (Future) Executes the AST

## Current Status

### Phase 1: Core AST and Parser ✅

- [x] AST type definitions
- [x] Lexer/tokenizer implementation
- [x] Recursive descent parser
- [x] Basic expression parsing
- [x] Pipeline operator support
- [x] Let bindings
- [x] Lambda expressions (partial)
- [x] Template literals (partial)

### Known Issues

- Lambda expressions with type annotations need refinement
- Template interpolation parsing needs improvement
- ESLint configuration pending

### Upcoming Phases

- **Phase 2**: Type System and Validation
- **Phase 3**: Evaluation and Runtime
- **Phase 4**: LLM Integration
- **Phase 5**: Advanced Features

## Contributing

Contributions are welcome! Please ensure:

1. TypeScript compiles without errors
2. Existing examples continue to work
3. Code follows the existing style conventions
4. New features include example usage

## License

MIT

## Acknowledgments

- Inspired by Elixir's pipeline operator and functional programming paradigm
- Based on lambda calculus theoretical foundations
- Designed for modern prompt engineering workflows