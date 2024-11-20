/**
 * Core IFC types and interfaces
 */

// Token types and interfaces
export type TokenType = 
  | 'IDENTIFIER'    // Entity names, types
  | 'NUMBER'        // Integer or float
  | 'STRING'        // Text in single quotes
  | 'EQUALS'        // =
  | 'SEMICOLON'     // ;
  | 'LPAREN'        // (
  | 'RPAREN'        // )
  | 'COMMA'         // ,
  | 'DOLLAR'        // $ (undefined value)
  | 'ASTERISK'      // * (reference)
  | 'HASH'          // # (entity reference)
  | 'EOF';          // End of file

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// Parser state and options
export interface ParserState {
  entities: Map<string, IFCEntity>;
  relationships: Map<string, string[]>;
  walls: IFCWall[];
  materialLayers: Map<string, any>;
  materialLayerSets: Map<string, any>;
  materialLayerSetUsages: Map<string, any>;
  relationshipAssigns: Map<string, any>;
  shapeRepresentations: Map<string, any>;
}

export interface ParseOptions {
  maxErrors?: number;
  debug?: boolean;
  maxLines?: number;
}

export interface ParseResult {
  entities: Map<string, IFCEntity>;
  relationships: Map<string, string[]>;
  elements: IFCElementProperties[];
  errors: IfcParserError[];
  success: boolean;
  error?: ParseError;
}

export interface IfcParserError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

// IFC Entity types
export interface IFCEntity {
  id: string;
  type: string;
  name?: string;
  attributes: any[];
}

// Material types
export interface MaterialResult {
  id: string;
  type: 'material' | 'material_list' | 'material_layer_set' | 'material_profile_set';
  name?: string;
  materials: {
    id: string;
    name?: string;
    thickness?: number;
    position?: number;
  }[];
}

// Constituent types
export interface ConstituentResult {
  id: string;
  type: string;
  name?: string;
  fraction?: number;
  category?: string;
  material?: MaterialResult | null;
}

export interface ConstituentSetResult {
  id: string;
  name?: string;
  constituents: ConstituentResult[];
}

// Assembly types
export interface AssemblyResult {
  id: string;
  type: string;
  name?: string;
  constituentSet?: ConstituentSetResult;
  layerSet?: MaterialResult;
  profileSet?: MaterialResult;
}

// Building structure types
export interface StoreyResult {
  id: string;
  name?: string;
  elevation?: number;
  elements: {
    id: string;
    type: string;
    name?: string;
  }[];
}

// Geometric representation types
export interface IFCMaterial {
  name: string;
  thickness?: number;
  layerSetName?: string;
}

export interface IFCWall {
  id: string;
  name: string;
  materials: IFCMaterial[];
  isExternal?: boolean;
  isLoadBearing?: boolean;
  geometricRepresentation?: IFCGeometricRepresentation[];
}

export interface IFCGeometricRepresentation {
  id: string;
  type: string;
  representationType: string;
  items: any[];
}

export interface IFCElementProperties {
  id: string;
  type: string;
  name: string;
  buildingStorey?: string;
  isLoadBearing?: boolean;
  isExternal?: boolean;
  geometricRepresentation?: any;
  materials: {
    name: string;
    thickness?: number;
    layerSetName?: string;
  }[];
}

export enum TokenType {
  ID = 'ID',
  TYPE = 'TYPE',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  SEMICOLON = 'SEMICOLON',
  EQUALS = 'EQUALS',
  EOF = 'EOF'
}
