// Extended type system with set-theoretic types
export type Type =
  | PrimitiveType
  | PromptType
  | FunctionType
  | UnionType
  | IntersectionType
  | ListType
  | RecordType
  | DynamicType
  | AnyType
  | NeverType;

export interface PrimitiveType {
  kind: 'primitive';
  name: 'string' | 'number' | 'boolean' | 'null';
}

export interface PromptType {
  kind: 'prompt';
  input: Type;
  output: Type;
  model?: string;
  temperature?: number;
}

export interface FunctionType {
  kind: 'function';
  params: ParameterType[];
  returns: Type;
  effects?: string[];
}

export interface ParameterType {
  name: string;
  type: Type;
  optional?: boolean;
  default?: any;
}

export interface UnionType {
  kind: 'union';
  types: Type[];
}

export interface IntersectionType {
  kind: 'intersection';
  types: Type[];
}

export interface ListType {
  kind: 'list';
  element: Type;
  minLength?: number;
  maxLength?: number;
}

export interface RecordType {
  kind: 'record';
  fields: RecordField[];
  open?: boolean; // allows additional fields
}

export interface RecordField {
  name: string;
  type: Type;
  optional?: boolean;
  description?: string;
}

export interface DynamicType {
  kind: 'dynamic';
  constraint?: Type; // runtime type check
}

export interface AnyType {
  kind: 'any';
}

export interface NeverType {
  kind: 'never';
}

// Type utilities
export function isSubtype(sub: Type, sup: Type): boolean {
  if (sup.kind === 'any') return true;
  if (sub.kind === 'never') return true;
  if (sub.kind === 'dynamic') return true;

  if (sub.kind === sup.kind) {
    switch (sub.kind) {
      case 'primitive':
        return (sub as PrimitiveType).name === (sup as PrimitiveType).name;

      case 'list':
        return isSubtype((sub as ListType).element, (sup as ListType).element);

      case 'union':
        const subUnion = sub as UnionType;
        const supUnion = sup as UnionType;
        return subUnion.types.every(t =>
          supUnion.types.some(st => isSubtype(t, st))
        );

      case 'record':
        const subRecord = sub as RecordType;
        const supRecord = sup as RecordType;
        return supRecord.fields.every(supField => {
          const subField = subRecord.fields.find(f => f.name === supField.name);
          if (!subField) return supField.optional;
          return isSubtype(subField.type, supField.type);
        });

      default:
        return false;
    }
  }

  if (sup.kind === 'union') {
    return (sup as UnionType).types.some(t => isSubtype(sub, t));
  }

  return false;
}

export function unionType(...types: Type[]): Type {
  const flattened: Type[] = [];
  for (const type of types) {
    if (type.kind === 'union') {
      flattened.push(...(type as UnionType).types);
    } else {
      flattened.push(type);
    }
  }

  // Remove duplicates and never types
  const unique = flattened.filter(t => t.kind !== 'never');
  if (unique.length === 0) return { kind: 'never' };
  if (unique.length === 1) return unique[0];

  return { kind: 'union', types: unique };
}

export function intersectionType(...types: Type[]): Type {
  const flattened: Type[] = [];
  for (const type of types) {
    if (type.kind === 'intersection') {
      flattened.push(...(type as IntersectionType).types);
    } else {
      flattened.push(type);
    }
  }

  // Check for any contradictions
  if (flattened.some(t => t.kind === 'never')) return { kind: 'never' };
  if (flattened.some(t => t.kind === 'any')) {
    return { kind: 'intersection', types: flattened.filter(t => t.kind !== 'any') };
  }

  return { kind: 'intersection', types: flattened };
}