/**
 * IFC Browser Parser
 * A TypeScript library for parsing IFC (Industry Foundation Classes) files in the browser
 */

export { IFCParser } from './core/parser';
export {
  IFCEntity,
  MaterialResult,
  StoreyResult,
  AssemblyResult,
  ConstituentResult,
  ConstituentSetResult,
  ParseOptions,
  ParseResult,
  ParseError
} from './core/types';
export * as patterns from './patterns';
export * from './utils/helpers';
export { createIfcParserWorker, IfcParserWorker } from './utils/worker';

// Default parser instance
import { IFCParser } from './core/parser';
import { ParseOptions } from './core/types';
import { getDefaultOptions } from './utils/helpers';

/**
 * Parse IFC content synchronously
 * @param input IFC file content as string
 * @param options Parser options
 */
export function parse(input: string, options?: ParseOptions) {
    const parser = new IFCParser({ ...getDefaultOptions(), ...options });
    return parser.parse(input);
}

/**
 * Parse IFC content asynchronously, optionally using a Web Worker
 * @param input IFC file content as string
 * @param options Parser options
 */
export async function parseAsync(input: string, options?: ParseOptions) {
    return IFCParser.parseAsync(input, { ...getDefaultOptions(), ...options });
}

// Version information
export const VERSION = '0.1.0';
