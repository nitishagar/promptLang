import { ASTNode } from '../ast/types';
import { Type, isSubtype } from './types';

export interface TypeEnvironment {
  bindings: Map<string, Type>;
  parent?: TypeEnvironment;
}

export class TypeChecker {
  private globalEnv: TypeEnvironment;
  private errors: TypeError[] = [];

  constructor() {
    this.globalEnv = {
      bindings: new Map([
        ['string', { kind: 'primitive', name: 'string' }],
        ['number', { kind: 'primitive', name: 'number' }],
        ['boolean', { kind: 'primitive', name: 'boolean' }],
      ])
    };
  }

  check(node: ASTNode, env?: TypeEnvironment): Type {
    const currentEnv = env || this.globalEnv;

    switch (node.kind) {
      case 'literal':
        return this.checkLiteral(node);

      case 'identifier':
        return this.checkIdentifier(node, currentEnv);

      case 'lambda':
        return this.checkLambda(node, currentEnv);

      case 'application':
        return this.checkApplication(node, currentEnv);

      case 'let':
        return this.checkLet(node, currentEnv);

      case 'pipeline':
        return this.checkPipeline(node, currentEnv);

      case 'template':
        return this.checkTemplate(node, currentEnv);

      case 'type_annotation':
        return this.checkTypeAnnotation(node, currentEnv);

      default:
        throw new TypeError(`Unknown node kind: ${(node as any).kind}`);
    }
  }

  private checkLiteral(node: any): Type {
    const value = node.value;

    if (typeof value === 'string') {
      return { kind: 'primitive', name: 'string' };
    } else if (typeof value === 'number') {
      return { kind: 'primitive', name: 'number' };
    } else if (typeof value === 'boolean') {
      return { kind: 'primitive', name: 'boolean' };
    } else if (value === null) {
      return { kind: 'primitive', name: 'null' };
    }

    return { kind: 'any' };
  }

  private checkIdentifier(node: any, env: TypeEnvironment): Type {
    const type = this.lookupType(node.name, env);
    if (!type) {
      this.addError(`Undefined identifier: ${node.name}`, node.location);
      return { kind: 'any' };
    }
    return type;
  }

  private checkLambda(node: any, env: TypeEnvironment): Type {
    const newEnv: TypeEnvironment = {
      bindings: new Map(),
      parent: env
    };

    const paramTypes: any[] = [];

    for (const param of node.params) {
      const paramType = param.type || { kind: 'dynamic' };
      paramTypes.push({
        name: param.name,
        type: paramType,
        optional: param.defaultValue !== undefined
      });
      newEnv.bindings.set(param.name, paramType);
    }

    const bodyType = this.check(node.body, newEnv);

    return {
      kind: 'function',
      params: paramTypes,
      returns: node.returnType || bodyType
    };
  }

  private checkApplication(node: any, env: TypeEnvironment): Type {
    const funcType = this.check(node.func, env);

    if (funcType.kind !== 'function') {
      this.addError(`Cannot apply non-function type: ${funcType.kind}`, node.location);
      return { kind: 'any' };
    }

    const argTypes = node.args.map((arg: ASTNode) => this.check(arg, env));

    // Check argument count
    const required = funcType.params.filter((p: any) => !p.optional).length;
    if (argTypes.length < required) {
      this.addError(`Too few arguments: expected at least ${required}, got ${argTypes.length}`, node.location);
    }
    if (argTypes.length > funcType.params.length) {
      this.addError(`Too many arguments: expected at most ${funcType.params.length}, got ${argTypes.length}`, node.location);
    }

    // Check argument types
    for (let i = 0; i < Math.min(argTypes.length, funcType.params.length); i++) {
      if (!isSubtype(argTypes[i], funcType.params[i].type)) {
        this.addError(
          `Type mismatch in argument ${i + 1}: expected ${this.typeToString(funcType.params[i].type)}, got ${this.typeToString(argTypes[i])}`,
          node.location
        );
      }
    }

    return funcType.returns;
  }

  private checkLet(node: any, env: TypeEnvironment): Type {
    const newEnv: TypeEnvironment = {
      bindings: new Map(),
      parent: env
    };

    for (const binding of node.bindings) {
      const valueType = this.check(binding.value, env);
      const bindingType = binding.type || valueType;

      if (!isSubtype(valueType, bindingType)) {
        this.addError(
          `Type mismatch in binding ${binding.name}: expected ${this.typeToString(bindingType)}, got ${this.typeToString(valueType)}`,
          node.location
        );
      }

      newEnv.bindings.set(binding.name, bindingType);
    }

    return this.check(node.body, newEnv);
  }

  private checkPipeline(node: any, env: TypeEnvironment): Type {
    let currentType = this.check(node.stages[0], env);

    for (let i = 1; i < node.stages.length; i++) {
      const stageType = this.check(node.stages[i], env);

      if (stageType.kind === 'function') {
        const params = stageType.params;
        if (params.length === 0) {
          this.addError(`Pipeline stage ${i} expects no arguments`, node.location);
        } else if (!isSubtype(currentType, params[0].type)) {
          this.addError(
            `Type mismatch in pipeline stage ${i}: expected ${this.typeToString(params[0].type)}, got ${this.typeToString(currentType)}`,
            node.location
          );
        }
        currentType = stageType.returns;
      } else {
        this.addError(`Pipeline stage ${i} is not a function`, node.location);
        currentType = { kind: 'any' };
      }
    }

    return currentType;
  }

  private checkTemplate(node: any, env: TypeEnvironment): Type {
    for (const part of node.parts) {
      if (part.kind === 'interpolation') {
        this.check(part.expression, env);
      }
    }
    return { kind: 'primitive', name: 'string' };
  }

  private checkTypeAnnotation(node: any, env: TypeEnvironment): Type {
    const exprType = this.check(node.expression, env);

    if (!isSubtype(exprType, node.type)) {
      this.addError(
        `Type annotation mismatch: expression has type ${this.typeToString(exprType)}, but annotated as ${this.typeToString(node.type)}`,
        node.location
      );
    }

    return node.type;
  }

  private lookupType(name: string, env: TypeEnvironment): Type | undefined {
    const type = env.bindings.get(name);
    if (type) return type;
    if (env.parent) return this.lookupType(name, env.parent);
    return undefined;
  }

  private addError(message: string, location: any): void {
    this.errors.push(new TypeError(message, location));
  }

  private typeToString(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        return type.name;
      case 'function':
        return `(${type.params.map((p: any) => this.typeToString(p.type)).join(', ')}) -> ${this.typeToString(type.returns)}`;
      case 'union':
        return type.types.map(t => this.typeToString(t)).join(' | ');
      case 'list':
        return `[${this.typeToString(type.element)}]`;
      case 'record':
        return `{${type.fields.map((f: any) => `${f.name}: ${this.typeToString(f.type)}`).join(', ')}}`;
      case 'prompt':
        return `prompt<${this.typeToString(type.output)}>`;
      case 'dynamic':
        return 'dynamic';
      case 'any':
        return 'any';
      case 'never':
        return 'never';
      default:
        return 'unknown';
    }
  }

  getErrors(): TypeError[] {
    return this.errors;
  }
}

export class TypeError extends Error {
  constructor(message: string, public location?: any) {
    super(message);
    this.name = 'TypeError';
  }
}