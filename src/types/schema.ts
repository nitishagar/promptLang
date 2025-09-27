import { Type, RecordType } from './types';

export interface SchemaDefinition {
  name: string;
  fields: SchemaField[];
  description?: string;
  examples?: any[];
}

export interface SchemaField {
  name: string;
  type: Type;
  required?: boolean;
  description?: string;
  validation?: (value: any) => boolean;
  default?: any;
}

export class Schema {
  constructor(private definition: SchemaDefinition) {}

  toType(): RecordType {
    return {
      kind: 'record',
      fields: this.definition.fields.map(f => ({
        name: f.name,
        type: f.type,
        optional: !f.required,
        description: f.description
      }))
    };
  }

  validate(value: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof value !== 'object' || value === null) {
      errors.push({
        path: '',
        message: 'Value must be an object'
      });
      return { valid: false, errors };
    }

    for (const field of this.definition.fields) {
      const fieldValue = value[field.name];

      if (fieldValue === undefined) {
        if (field.required && field.default === undefined) {
          errors.push({
            path: field.name,
            message: `Required field '${field.name}' is missing`
          });
        }
        continue;
      }

      const fieldErrors = this.validateField(field, fieldValue, field.name);
      errors.push(...fieldErrors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateField(field: SchemaField, value: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Type validation
    if (!this.validateType(value, field.type)) {
      errors.push({
        path,
        message: `Expected type ${this.typeToString(field.type)}, got ${typeof value}`
      });
      return errors;
    }

    // Custom validation
    if (field.validation && !field.validation(value)) {
      errors.push({
        path,
        message: `Custom validation failed for field '${field.name}'`
      });
    }

    return errors;
  }

  private validateType(value: any, type: Type): boolean {
    switch (type.kind) {
      case 'primitive':
        switch (type.name) {
          case 'string': return typeof value === 'string';
          case 'number': return typeof value === 'number';
          case 'boolean': return typeof value === 'boolean';
          case 'null': return value === null;
        }
        break;

      case 'list':
        if (!Array.isArray(value)) return false;
        return value.every(item => this.validateType(item, type.element));

      case 'union':
        return type.types.some(t => this.validateType(value, t));

      case 'record':
        if (typeof value !== 'object' || value === null) return false;
        return type.fields.every(field => {
          if (field.optional && !(field.name in value)) return true;
          return this.validateType(value[field.name], field.type);
        });

      case 'any':
      case 'dynamic':
        return true;
    }

    return false;
  }

  private typeToString(type: Type): string {
    switch (type.kind) {
      case 'primitive': return type.name;
      case 'list': return `Array<${this.typeToString(type.element)}>`;
      case 'union': return type.types.map(t => this.typeToString(t)).join(' | ');
      case 'record': return 'object';
      default: return 'unknown';
    }
  }

  // Schema-aligned parsing: attempts to fix common formatting issues
  parse(input: string): { success: boolean; value?: any; errors?: ValidationError[] } {
    try {
      // Try direct JSON parse first
      const parsed = JSON.parse(input);
      const validation = this.validate(parsed);

      if (validation.valid) {
        return { success: true, value: this.applyDefaults(parsed) };
      }

      // Attempt to fix common issues
      const fixed = this.attemptFix(parsed);
      const revalidation = this.validate(fixed);

      if (revalidation.valid) {
        return { success: true, value: this.applyDefaults(fixed) };
      }

      return { success: false, errors: revalidation.errors };
    } catch (error: any) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return this.parse(jsonMatch[1]);
      }

      return {
        success: false,
        errors: [{ path: '', message: `Failed to parse JSON: ${error.message || 'Unknown error'}` }]
      };
    }
  }

  private attemptFix(value: any): any {
    if (typeof value !== 'object' || value === null) return value;

    const fixed: any = {};

    for (const field of this.definition.fields) {
      // Try case-insensitive field matching
      const actualField = Object.keys(value).find(
        k => k.toLowerCase() === field.name.toLowerCase()
      );

      if (actualField) {
        let fieldValue = value[actualField];

        // Type coercion attempts
        if (field.type.kind === 'primitive') {
          switch (field.type.name) {
            case 'number':
              if (typeof fieldValue === 'string') {
                const num = Number(fieldValue);
                if (!isNaN(num)) fieldValue = num;
              }
              break;
            case 'boolean':
              if (typeof fieldValue === 'string') {
                fieldValue = fieldValue.toLowerCase() === 'true';
              }
              break;
            case 'string':
              if (typeof fieldValue !== 'string') {
                fieldValue = String(fieldValue);
              }
              break;
          }
        }

        fixed[field.name] = fieldValue;
      } else if (field.default !== undefined) {
        fixed[field.name] = field.default;
      }
    }

    return fixed;
  }

  private applyDefaults(value: any): any {
    const result = { ...value };

    for (const field of this.definition.fields) {
      if (!(field.name in result) && field.default !== undefined) {
        result[field.name] = field.default;
      }
    }

    return result;
  }

  // Generate OpenAI-compatible JSON schema
  toOpenAISchema(): any {
    return {
      type: 'object',
      properties: Object.fromEntries(
        this.definition.fields.map(field => [
          field.name,
          this.typeToOpenAISchema(field.type)
        ])
      ),
      required: this.definition.fields
        .filter(f => f.required)
        .map(f => f.name)
    };
  }

  private typeToOpenAISchema(type: Type): any {
    switch (type.kind) {
      case 'primitive':
        switch (type.name) {
          case 'string': return { type: 'string' };
          case 'number': return { type: 'number' };
          case 'boolean': return { type: 'boolean' };
          case 'null': return { type: 'null' };
        }
        break;

      case 'list':
        return {
          type: 'array',
          items: this.typeToOpenAISchema(type.element)
        };

      case 'union':
        return {
          oneOf: type.types.map(t => this.typeToOpenAISchema(t))
        };

      case 'record':
        return {
          type: 'object',
          properties: Object.fromEntries(
            type.fields.map(f => [f.name, this.typeToOpenAISchema(f.type)])
          ),
          required: type.fields.filter(f => !f.optional).map(f => f.name)
        };
    }

    return { type: 'string' };
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}