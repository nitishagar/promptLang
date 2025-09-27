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

// Basic Type system for AST (will be extended in type checker)
export type Type =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'prompt'; input: Type; output: Type; model?: string; temperature?: number }
  | { kind: 'function'; params: ParameterType[]; returns: Type; effects?: string[] }
  | { kind: 'union'; types: Type[] }
  | { kind: 'intersection'; types: Type[] }
  | { kind: 'list'; element: Type; minLength?: number; maxLength?: number }
  | { kind: 'record'; fields: RecordField[]; open?: boolean }
  | { kind: 'dynamic'; constraint?: Type }
  | { kind: 'any' }
  | { kind: 'never' };

export interface ParameterType {
  name: string;
  type: Type;
  optional?: boolean;
  default?: any;
}

export interface RecordField {
  name: string;
  type: Type;
  optional?: boolean;
  description?: string;
}

export interface Location {
  line: number;
  column: number;
  file?: string;
}
