import { Schema } from '../types/schema';

export interface TemplateContext {
  variables: Map<string, any>;
  schemas: Map<string, Schema>;
  functions: Map<string, Function>;
}

export class TemplateEngine {
  private context: TemplateContext;

  constructor(context?: Partial<TemplateContext>) {
    this.context = {
      variables: context?.variables || new Map(),
      schemas: context?.schemas || new Map(),
      functions: new Map([
        ['uppercase', (s: string) => s.toUpperCase()],
        ['lowercase', (s: string) => s.toLowerCase()],
        ['trim', (s: string) => s.trim()],
        ['json', (obj: any) => JSON.stringify(obj, null, 2)],
        ['length', (arr: any[]) => arr.length],
        ...Array.from(context?.functions || [])
      ])
    };
  }

  render(template: string, data?: Record<string, any>): string {
    // Add data to context
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        this.context.variables.set(key, value);
      }
    }

    // Process template
    return this.processTemplate(template);
  }

  private processTemplate(template: string): string {
    let result = template;

    // Process interpolations {{ expression }}
    result = result.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
      return this.evaluateExpression(expr.trim());
    });

    // Process conditionals {% if condition %} ... {% endif %}
    result = this.processConditionals(result);

    // Process loops {% for item in items %} ... {% endfor %}
    result = this.processLoops(result);

    // Process includes {% include "template_name" %}
    result = this.processIncludes(result);

    return result;
  }

  private evaluateExpression(expr: string): string {
    // Handle dot notation (e.g., user.name)
    if (expr.includes('.')) {
      const parts = expr.split('.');
      let value = this.context.variables.get(parts[0]);

      for (let i = 1; i < parts.length; i++) {
        if (value == null) return '';
        value = value[parts[i]];
      }

      return this.stringify(value);
    }

    // Handle function calls (e.g., uppercase(name))
    const funcMatch = expr.match(/(\w+)\((.+)\)/);
    if (funcMatch) {
      const [, funcName, args] = funcMatch;
      const func = this.context.functions.get(funcName);

      if (func) {
        const argValues = args.split(',').map(arg => {
          const trimmed = arg.trim();
          return this.context.variables.get(trimmed) || this.parseLiteral(trimmed);
        });

        return this.stringify(func(...argValues));
      }
    }

    // Handle schema references (e.g., @Resume)
    if (expr.startsWith('@')) {
      const schemaName = expr.substring(1);
      const schema = this.context.schemas.get(schemaName);

      if (schema) {
        return JSON.stringify(schema.toOpenAISchema(), null, 2);
      }
    }

    // Simple variable lookup
    const value = this.context.variables.get(expr);
    return value !== undefined ? this.stringify(value) : expr;
  }

  private processConditionals(template: string): string {
    const conditionalRegex = /\{%\s*if\s+(.+?)\s*%\}([\s\S]*?)(?:\{%\s*else\s*%\}([\s\S]*?))?\{%\s*endif\s*%\}/g;

    return template.replace(conditionalRegex, (_, condition, ifBlock, elseBlock = '') => {
      if (this.evaluateCondition(condition)) {
        return this.processTemplate(ifBlock);
      } else {
        return this.processTemplate(elseBlock);
      }
    });
  }

  private processLoops(template: string): string {
    const loopRegex = /\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;

    return template.replace(loopRegex, (_, itemVar, collectionVar, loopBody) => {
      const collection = this.context.variables.get(collectionVar);

      if (!Array.isArray(collection)) {
        return '';
      }

      const results: string[] = [];

      for (let i = 0; i < collection.length; i++) {
        // Create new context with loop variables
        const loopContext = new Map(this.context.variables);
        loopContext.set(itemVar, collection[i]);
        loopContext.set(`${itemVar}_index`, i);
        loopContext.set(`${itemVar}_first`, i === 0);
        loopContext.set(`${itemVar}_last`, i === collection.length - 1);

        // Temporarily swap context
        const savedVariables = this.context.variables;
        this.context.variables = loopContext;

        results.push(this.processTemplate(loopBody));

        // Restore context
        this.context.variables = savedVariables;
      }

      return results.join('');
    });
  }

  private processIncludes(template: string): string {
    const includeRegex = /\{%\s*include\s+"([^"]+)"\s*%\}/g;

    return template.replace(includeRegex, (_, templateName) => {
      // In a real implementation, this would load from file system or database
      const includedTemplate = this.loadTemplate(templateName);
      return this.processTemplate(includedTemplate);
    });
  }

  private evaluateCondition(condition: string): boolean {
    // Simple condition evaluation
    const parts = condition.split(/\s+(==|!=|>|<|>=|<=)\s+/);

    if (parts.length === 3) {
      const left = this.getValue(parts[0]);
      const operator = parts[1];
      const right = this.getValue(parts[2]);

      switch (operator) {
        case '==': return left == right;
        case '!=': return left != right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
      }
    }

    // Boolean variable
    const value = this.context.variables.get(condition);
    return !!value;
  }

  private getValue(expr: string): any {
    const trimmed = expr.trim();

    // Check if it's a literal
    const literal = this.parseLiteral(trimmed);
    if (literal !== trimmed) return literal;

    // Otherwise, it's a variable
    return this.context.variables.get(trimmed);
  }

  private parseLiteral(str: string): any {
    // String literal
    if ((str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }

    // Number literal
    const num = Number(str);
    if (!isNaN(num)) return num;

    // Boolean literal
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str === 'null') return null;

    return str;
  }

  private stringify(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  private loadTemplate(name: string): string {
    // Placeholder - in real implementation would load from storage
    return `Template: ${name}`;
  }
}