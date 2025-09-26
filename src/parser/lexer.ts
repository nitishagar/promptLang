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
