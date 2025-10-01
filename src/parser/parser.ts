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

    // Lambda expression or grouped expression
    if (this.check(TokenType.LPAREN)) {
      // Look ahead to determine if this is a lambda: (identifier: or (identifier,  or (identifier)
      if (this.isLambdaExpression()) {
        this.advance(); // consume '('
        return this.parseLambda();
      }
      this.advance(); // consume '('
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
      this.consume(TokenType.EQUALS, "Expected '=' after binding name");
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
    // For now, implement a basic version that supports extended types
    // We'll implement more sophisticated type parsing in a later phase
    
    if (this.check(TokenType.LPAREN) && this.peekAhead(TokenType.IDENTIFIER) && this.getTokenAfterAhead(TokenType.COLON)) {
      // Function type: (param: Type) -> ReturnType
      this.advance(); // consume '('
      const params: AST.ParameterType[] = [];
      
      if (!this.check(TokenType.RPAREN)) {
        do {
          const paramName = this.consume(TokenType.IDENTIFIER, "Expected parameter name").value;
          this.consume(TokenType.COLON, "Expected ':' after parameter name");
          const paramType = this.parseType();
          
          // Check if it's optional with '?'
          let optional = false;
          if (this.match(TokenType.QUESTION)) {
            optional = true;
          }
          
          params.push({
            name: paramName,
            type: paramType,
            optional
          });
        } while (this.match(TokenType.COMMA));
      }
      
      this.consume(TokenType.RPAREN, "Expected ')' after parameters");
      this.consume(TokenType.ARROW, "Expected '->' after parameters");
      const returnType = this.parseType();
      
      return {
        kind: 'function',
        params,
        returns: returnType
      };
    } else if (this.check(TokenType.IDENTIFIER)) {
      const typeName = this.consume(TokenType.IDENTIFIER, "Expected type name").value;

      switch (typeName) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'null':
          return { kind: 'primitive', name: typeName as 'string' | 'number' | 'boolean' | 'null' };
        
        case 'prompt':
          if (this.match(TokenType.LBRACKET)) {
            this.consume(TokenType.LPAREN, "Expected '(' after prompt[");
            const inputType = this.parseType();
            this.consume(TokenType.COMMA, "Expected ',' after input type");
            const outputType = this.parseType();
            this.consume(TokenType.RPAREN, "Expected ')' after types");
            let model: string | undefined;
            let temperature: number | undefined;
            
            // Optional model and temperature
            if (this.match(TokenType.COMMA)) {
              if (this.check(TokenType.STRING)) {
                model = this.advance().value;
              }
              if (this.match(TokenType.COMMA)) {
                if (this.check(TokenType.NUMBER)) {
                  temperature = parseFloat(this.advance().value);
                }
              }
            }
            this.consume(TokenType.RBRACKET, "Expected ']' after prompt parameters");
            
            return { 
              kind: 'prompt', 
              input: inputType,
              output: outputType,
              model,
              temperature
            };
          }
          return { kind: 'prompt', input: { kind: 'any' }, output: { kind: 'any' } };
        
        case 'list':
          if (this.match(TokenType.LBRACKET)) {
            const elementType = this.parseType();
            this.consume(TokenType.RBRACKET, "Expected ']' after element type");
            return { kind: 'list', element: elementType };
          }
          return { kind: 'list', element: { kind: 'any' } };
        
        case 'record':
          if (this.match(TokenType.LBRACE)) {
            const fields: AST.RecordField[] = [];
            
            if (!this.check(TokenType.RBRACE)) {
              do {
                const fieldName = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
                this.consume(TokenType.COLON, "Expected ':' after field name");
                const fieldType = this.parseType();
                
                let optional = false;
                if (this.match(TokenType.QUESTION)) {
                  optional = true;
                }
                
                fields.push({
                  name: fieldName,
                  type: fieldType,
                  optional
                });
              } while (this.match(TokenType.COMMA));
            }
            
            this.consume(TokenType.RBRACE, "Expected '}' after record fields");
            return { kind: 'record', fields };
          }
          return { kind: 'record', fields: [] };
        
        case 'dynamic':
          if (this.match(TokenType.LBRACKET)) {
            const constraint = this.parseType();
            this.consume(TokenType.RBRACKET, "Expected ']' after constraint");
            return { kind: 'dynamic', constraint };
          }
          return { kind: 'dynamic' };
        
        case 'any':
          return { kind: 'any' };
        
        case 'never':
          return { kind: 'never' };
        
        default:
          return { kind: 'any' };
      }
    } else {
      // For union types using pipe operator (a | b), we'd need more complex parsing
      // For now, just return any
      return { kind: 'any' };
    }
  }

  // Helper method to look ahead more than one token
  private getTokenAfterAhead(tokenType: TokenType): boolean {
    const saved = this.current;
    this.advance();
    const result = this.check(tokenType);
    this.current = saved;
    return result;
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

  private isLambdaExpression(): boolean {
    // This is a lookahead only - don't consume any tokens
    // We need to save the entire lexer state, not just current
    // For simplicity, we'll do a heuristic check without consuming

    if (!this.check(TokenType.LPAREN)) {
      return false;
    }

    // Look ahead in the input to detect lambda pattern
    // Pattern: (id:type) -> or (id, id) -> or (id) -> or () ->

    // We use a simple saved position approach
    const savedPosition = this.lexer['position'];
    const savedLine = this.lexer['line'];
    const savedColumn = this.lexer['column'];
    const savedCurrent = this.current;

    try {
      this.advance(); // consume (

      // Empty params: () ->
      if (this.check(TokenType.RPAREN)) {
        this.advance();
        const result = this.check(TokenType.ARROW);
        return result;
      }

      // Must have identifier
      if (!this.check(TokenType.IDENTIFIER)) {
        return false;
      }

      this.advance(); // consume identifier

      // Check if followed by :, , or ) ->
      if (this.check(TokenType.COLON) || this.check(TokenType.COMMA)) {
        return true;
      }

      if (this.check(TokenType.RPAREN)) {
        this.advance();
        return this.check(TokenType.ARROW);
      }

      return false;
    } finally {
      // Restore lexer state
      this.lexer['position'] = savedPosition;
      this.lexer['line'] = savedLine;
      this.lexer['column'] = savedColumn;
      this.current = savedCurrent;
    }
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
