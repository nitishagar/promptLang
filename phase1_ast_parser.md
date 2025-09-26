# Phase 1: Core AST and Parser Implementation Plan

## Overview
Implement the foundational Abstract Syntax Tree (AST) and parser for PromptLang, based on lambda calculus principles with Elixir-inspired syntax.

## Desired End State
A working parser that can parse PromptLang syntax into an AST representation, supporting basic expressions, function definitions, and type annotations.

## Implementation Steps

### Step 1: Define Core AST Types (TypeScript)

**File**: `src/ast/types.ts`

```typescript
// Core AST node types
export type ASTNode =
  | Literal
  | Identifier
  | Lambda
  | Application
  | Let
  | Template
  | Pipeline
  | TypeAnnotation;

export interface Literal {
  kind: 'literal';
  value: string | number | boolean;
  type?: Type;
  location: Location;
}

export interface Identifier {
  kind: 'identifier';
  name: string;
  type?: Type;
  location: Location;
}

export interface Lambda {
  kind: 'lambda';
  params: Parameter[];
  body: ASTNode;
  returnType?: Type;
  location: Location;
}

export interface Parameter {
  name: string;
  type?: Type;
  defaultValue?: ASTNode;
}

export interface Application {
  kind: 'application';
  func: ASTNode;
  args: ASTNode[];
  location: Location;
}

export interface Let {
  kind: 'let';
  bindings: Binding[];
  body: ASTNode;
  location: Location;
}

export interface Binding {
  name: string;
  value: ASTNode;
  type?: Type;
}

export interface Template {
  kind: 'template';
  parts: TemplatePart[];
  location: Location;
}

export type TemplatePart =
  | { kind: 'text'; value: string }
  | { kind: 'interpolation'; expression: ASTNode };

export interface Pipeline {
  kind: 'pipeline';
  stages: ASTNode[];
  location: Location;
}

export interface TypeAnnotation {
  kind: 'type_annotation';
  expression: ASTNode;
  type: Type;
  location: Location;
}

// Type system (basic for Phase 1)
export type Type =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' }
  | { kind: 'prompt'; inner: Type }
  | { kind: 'function'; params: Type[]; returns: Type }
  | { kind: 'any' };

export interface Location {
  line: number;
  column: number;
  file?: string;
}
```

### Step 2: Implement Tokenizer/Lexer

**File**: `src/parser/lexer.ts`

```typescript
export enum TokenType {
  // Literals
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',

  // Keywords
  DEFPROMPT = 'DEFPROMPT',
  LET = 'LET',
  IN = 'IN',
  CASE = 'CASE',
  WHEN = 'WHEN',
  END = 'END',

  // Identifiers and operators
  IDENTIFIER = 'IDENTIFIER',
  PIPE = '|>',
  ARROW = '->',
  FAT_ARROW = '=>',

  // Delimiters
  LPAREN = '(',
  RPAREN = ')',
  LBRACE = '{',
  RBRACE = '}',
  LBRACKET = '[',
  RBRACKET = ']',
  COMMA = ',',
  COLON = ':',
  DOUBLE_COLON = '::',
  DOT = '.',
  AT = '@',

  // Template literals
  TEMPLATE_START = '"""',
  TEMPLATE_END = '"""',
  TEMPLATE_INTERP_START = '{{',
  TEMPLATE_INTERP_END = '}}',

  EOF = 'EOF'
}

export interface Token {
  type: TokenType;
  value: string;
  location: Location;
}

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  nextToken(): Token {
    this.skipWhitespace();

    if (this.position >= this.input.length) {
      return this.makeToken(TokenType.EOF, '');
    }

    // Multi-character operators
    if (this.match('|>')) return this.makeToken(TokenType.PIPE, '|>');
    if (this.match('->')) return this.makeToken(TokenType.ARROW, '->');
    if (this.match('=>')) return this.makeToken(TokenType.FAT_ARROW, '=>');
    if (this.match('::')) return this.makeToken(TokenType.DOUBLE_COLON, '::');
    if (this.match('"""')) return this.scanTemplate();

    // Single character tokens
    const char = this.advance();
    switch (char) {
      case '(': return this.makeToken(TokenType.LPAREN, char);
      case ')': return this.makeToken(TokenType.RPAREN, char);
      case '{': return this.makeToken(TokenType.LBRACE, char);
      case '}': return this.makeToken(TokenType.RBRACE, char);
      case '[': return this.makeToken(TokenType.LBRACKET, char);
      case ']': return this.makeToken(TokenType.RBRACKET, char);
      case ',': return this.makeToken(TokenType.COMMA, char);
      case ':': return this.makeToken(TokenType.COLON, char);
      case '.': return this.makeToken(TokenType.DOT, char);
      case '@': return this.makeToken(TokenType.AT, char);
      case '"': return this.scanString();
      default:
        if (this.isDigit(char)) {
          return this.scanNumber();
        }
        if (this.isAlpha(char)) {
          return this.scanIdentifier();
        }
        throw new Error(`Unexpected character: ${char} at ${this.line}:${this.column}`);
    }
  }

  private scanTemplate(): Token {
    const start = this.position - 3;
    let value = '';

    while (this.position < this.input.length && !this.match('"""')) {
      if (this.match('{{')) {
        // Handle interpolation
        value += '{{';
        while (!this.match('}}')) {
          value += this.advance();
        }
        value += '}}';
      } else {
        value += this.advance();
      }
    }

    return this.makeToken(TokenType.STRING, value);
  }

  private scanString(): Token {
    let value = '';
    while (this.peek() !== '"' && this.position < this.input.length) {
      if (this.peek() === '\\') {
        this.advance();
        value += this.escape(this.advance());
      } else {
        value += this.advance();
      }
    }
    this.advance(); // closing quote
    return this.makeToken(TokenType.STRING, value);
  }

  private scanNumber(): Token {
    const start = this.position - 1;
    while (this.isDigit(this.peek())) {
      this.advance();
    }
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // decimal point
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }
    return this.makeToken(TokenType.NUMBER, this.input.slice(start, this.position));
  }

  private scanIdentifier(): Token {
    const start = this.position - 1;
    while (this.isAlphaNum(this.peek()) || this.peek() === '_') {
      this.advance();
    }

    const value = this.input.slice(start, this.position);
    const type = this.keywordType(value);
    return this.makeToken(type, value);
  }

  private keywordType(word: string): TokenType {
    switch (word) {
      case 'defprompt': return TokenType.DEFPROMPT;
      case 'let': return TokenType.LET;
      case 'in': return TokenType.IN;
      case 'case': return TokenType.CASE;
      case 'when': return TokenType.WHEN;
      case 'end': return TokenType.END;
      case 'true':
      case 'false': return TokenType.BOOLEAN;
      default: return TokenType.IDENTIFIER;
    }
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
      } else if (char === '\n') {
        this.line++;
        this.column = 0;
        this.advance();
      } else if (char === '#') {
        // Comments
        while (this.peek() !== '\n' && this.position < this.input.length) {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private advance(): string {
    const char = this.input[this.position++];
    this.column++;
    return char;
  }

  private peek(): string {
    return this.input[this.position] || '';
  }

  private peekNext(): string {
    return this.input[this.position + 1] || '';
  }

  private match(str: string): boolean {
    if (this.input.slice(this.position, this.position + str.length) === str) {
      this.position += str.length;
      this.column += str.length;
      return true;
    }
    return false;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isAlphaNum(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private escape(char: string): string {
    switch (char) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case '"': return '"';
      default: return char;
    }
  }

  private makeToken(type: TokenType, value: string): Token {
    return {
      type,
      value,
      location: {
        line: this.line,
        column: this.column - value.length
      }
    };
  }
}
```

### Step 3: Implement Parser

**File**: `src/parser/parser.ts`

```typescript
import { Lexer, Token, TokenType } from './lexer';
import * as AST from '../ast/types';

export class Parser {
  private lexer: Lexer;
  private current: Token;

  constructor(input: string) {
    this.lexer = new Lexer(input);
    this.current = this.lexer.nextToken();
  }

  parse(): AST.ASTNode {
    return this.parseExpression();
  }

  private parseExpression(): AST.ASTNode {
    return this.parsePipeline();
  }

  private parsePipeline(): AST.ASTNode {
    let left = this.parseApplication();

    while (this.match(TokenType.PIPE)) {
      const stages = [left];
      stages.push(this.parseApplication());

      while (this.match(TokenType.PIPE)) {
        stages.push(this.parseApplication());
      }

      left = {
        kind: 'pipeline',
        stages,
        location: stages[0].location
      };
    }

    return left;
  }

  private parseApplication(): AST.ASTNode {
    let left = this.parsePrimary();

    while (this.isStartOfPrimary()) {
      const args = [this.parsePrimary()];

      while (this.isStartOfPrimary() && !this.check(TokenType.PIPE)) {
        args.push(this.parsePrimary());
      }

      left = {
        kind: 'application',
        func: left,
        args,
        location: left.location
      };
    }

    return left;
  }

  private parsePrimary(): AST.ASTNode {
    // Literals
    if (this.check(TokenType.STRING)) {
      const token = this.advance();
      return {
        kind: 'literal',
        value: token.value,
        location: token.location
      };
    }

    if (this.check(TokenType.NUMBER)) {
      const token = this.advance();
      return {
        kind: 'literal',
        value: parseFloat(token.value),
        location: token.location
      };
    }

    if (this.check(TokenType.BOOLEAN)) {
      const token = this.advance();
      return {
        kind: 'literal',
        value: token.value === 'true',
        location: token.location
      };
    }

    // Template literals
    if (this.current.value.includes('{{')) {
      return this.parseTemplate();
    }

    // Lambda expression
    if (this.match(TokenType.LPAREN)) {
      if (this.check(TokenType.IDENTIFIER) && this.peekAhead(TokenType.COLON)) {
        return this.parseLambda();
      }
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    // Let expression
    if (this.match(TokenType.LET)) {
      return this.parseLet();
    }

    // Identifier
    if (this.check(TokenType.IDENTIFIER)) {
      const token = this.advance();
      return {
        kind: 'identifier',
        name: token.value,
        location: token.location
      };
    }

    throw new Error(`Unexpected token: ${this.current.type} at ${this.current.location.line}:${this.current.location.column}`);
  }

  private parseLambda(): AST.Lambda {
    const location = this.current.location;
    const params: AST.Parameter[] = [];

    // Parse parameters
    do {
      const name = this.consume(TokenType.IDENTIFIER, "Expected parameter name").value;
      let type: AST.Type | undefined;

      if (this.match(TokenType.COLON)) {
        type = this.parseType();
      }

      params.push({ name, type });
    } while (this.match(TokenType.COMMA));

    this.consume(TokenType.RPAREN, "Expected ')' after parameters");
    this.consume(TokenType.ARROW, "Expected '->' after parameters");

    const body = this.parseExpression();

    return {
      kind: 'lambda',
      params,
      body,
      location
    };
  }

  private parseLet(): AST.Let {
    const location = this.current.location;
    const bindings: AST.Binding[] = [];

    do {
      const name = this.consume(TokenType.IDENTIFIER, "Expected binding name").value;
      this.consume(TokenType.ARROW, "Expected '=' after binding name");
      const value = this.parseExpression();
      bindings.push({ name, value });
    } while (this.match(TokenType.COMMA));

    this.consume(TokenType.IN, "Expected 'in' after bindings");
    const body = this.parseExpression();

    return {
      kind: 'let',
      bindings,
      body,
      location
    };
  }

  private parseTemplate(): AST.Template {
    const location = this.current.location;
    const parts: AST.TemplatePart[] = [];
    const templateStr = this.advance().value;

    let current = '';
    let i = 0;

    while (i < templateStr.length) {
      if (templateStr[i] === '{' && templateStr[i + 1] === '{') {
        if (current) {
          parts.push({ kind: 'text', value: current });
          current = '';
        }

        i += 2;
        let interpStr = '';
        while (!(templateStr[i] === '}' && templateStr[i + 1] === '}')) {
          interpStr += templateStr[i++];
        }
        i += 2;

        const parser = new Parser(interpStr);
        parts.push({
          kind: 'interpolation',
          expression: parser.parse()
        });
      } else {
        current += templateStr[i++];
      }
    }

    if (current) {
      parts.push({ kind: 'text', value: current });
    }

    return {
      kind: 'template',
      parts,
      location
    };
  }

  private parseType(): AST.Type {
    const typeName = this.consume(TokenType.IDENTIFIER, "Expected type name").value;

    switch (typeName) {
      case 'string':
      case 'number':
      case 'boolean':
        return { kind: 'primitive', name: typeName };
      case 'prompt':
        if (this.match(TokenType.LBRACKET)) {
          const inner = this.parseType();
          this.consume(TokenType.RBRACKET, "Expected ']' after type parameter");
          return { kind: 'prompt', inner };
        }
        return { kind: 'prompt', inner: { kind: 'any' } };
      default:
        return { kind: 'any' };
    }
  }

  private isStartOfPrimary(): boolean {
    return this.check(TokenType.STRING) ||
           this.check(TokenType.NUMBER) ||
           this.check(TokenType.BOOLEAN) ||
           this.check(TokenType.IDENTIFIER) ||
           this.check(TokenType.LPAREN) ||
           this.check(TokenType.LET);
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private check(type: TokenType): boolean {
    return this.current.type === type;
  }

  private peekAhead(type: TokenType): boolean {
    const saved = this.current;
    this.advance();
    const result = this.check(type);
    this.current = saved;
    return result;
  }

  private advance(): Token {
    const token = this.current;
    if (this.current.type !== TokenType.EOF) {
      this.current = this.lexer.nextToken();
    }
    return token;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new Error(`${message} at ${this.current.location.line}:${this.current.location.column}`);
  }
}
```

### Step 4: Create Example Usage and Tests

**File**: `examples/phase1_examples.ts`

```typescript
import { Parser } from '../src/parser/parser';
import { ASTNode } from '../src/ast/types';

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
    console.error('Error:', error.message);
  }
}

// Run tests
testParser('Simple Literal', example1);
testParser('Pipeline', example2);
testParser('Lambda', example3);
testParser('Let Binding', example4);
testParser('Template', example5);
```

### Step 5: Package Configuration

**File**: `package.json`

```json
{
  "name": "promptlang",
  "version": "0.1.0",
  "description": "A functional DSL for type-safe prompt engineering",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "dev": "ts-node examples/phase1_examples.ts",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  },
  "keywords": ["prompt", "dsl", "functional", "openai"],
  "author": "",
  "license": "MIT",
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.5.0",
    "prettier": "^3.0.0",
    "ts-jest": "^29.0.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.0.0"
  }
}
```

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Success Criteria

### Automated Verification:
- [ ] TypeScript compiles without errors: `npm run build`
- [ ] All examples parse successfully: `npm run dev`
- [ ] Linting passes: `npm run lint`
- [ ] AST nodes have correct structure
- [ ] Parser handles all basic syntax forms

### Manual Verification:
- [ ] Parser produces correct AST for all example inputs
- [ ] Error messages are clear and helpful
- [ ] Code is well-structured and maintainable
- [ ] Documentation is complete

## Next Steps
After Phase 1 is complete and tested, proceed to Phase 2: Type System and Validation