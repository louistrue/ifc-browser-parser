/**
 * Regular expression patterns for parsing IFC files
 */

// Entity definition pattern: #ID=ENTITY_TYPE(attributes);
export const ENTITY_PATTERN = /^#(\d+)=([A-Za-z0-9_]+)\((.*)\);$/;

// Reference pattern: #ID or $
export const REFERENCE_PATTERN = /^(#\d+|\$)$/;

// Enumeration pattern: .ENUM.
export const ENUM_PATTERN = /^\.[A-Z_]+\.$/;

// String pattern: 'content'
export const STRING_PATTERN = /^'([^']*)'$/;

// Number pattern: integer or float
export const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

// List pattern: (item1,item2,...)
export const LIST_PATTERN = /^\((.*)\)$/;

// Header section pattern: HEADER;...ENDSEC;
export const HEADER_PATTERN = /^HEADER;([\s\S]*?)ENDSEC;/;

// Data section pattern: DATA;...ENDSEC;
export const DATA_PATTERN = /^DATA;([\s\S]*?)ENDSEC;/;

// End pattern: END-ISO-10303-21;
export const END_PATTERN = /^END-ISO-10303-21;$/;

/**
 * Helper functions for pattern matching
 */

export function isEntityDefinition(line: string): boolean {
    return ENTITY_PATTERN.test(line.trim());
}

export function isReference(value: string): boolean {
    return REFERENCE_PATTERN.test(value.trim());
}

export function isEnumeration(value: string): boolean {
    return ENUM_PATTERN.test(value.trim());
}

export function isString(value: string): boolean {
    return STRING_PATTERN.test(value.trim());
}

export function isNumber(value: string): boolean {
    return NUMBER_PATTERN.test(value.trim());
}

export function isList(value: string): boolean {
    return LIST_PATTERN.test(value.trim());
}

export function parseList(value: string): string[] {
    const match = value.trim().match(LIST_PATTERN);
    if (!match) return [];
    return match[1].split(',').map(item => item.trim());
}

export function parseEntityDefinition(line: string): { id: string; type: string; attributes: string } | null {
    const match = line.trim().match(ENTITY_PATTERN);
    if (!match) return null;
    return {
        id: match[1],
        type: match[2],
        attributes: match[3]
    };
}
