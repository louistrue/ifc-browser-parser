import { IfcEntity, IfcObject, IfcProperty, IfcGeometry } from '../core/types';

/**
 * Helper functions for working with IFC entities
 */

export function isIfcObject(entity: IfcEntity): entity is IfcObject {
    return 'properties' in entity;
}

export function getEntityById(entities: IfcEntity[], id: string): IfcEntity | undefined {
    return entities.find(entity => entity.id === id);
}

export function getEntitiesByType(entities: IfcEntity[], type: string): IfcEntity[] {
    return entities.filter(entity => entity.type === type);
}

export function getPropertyValue(obj: IfcObject, propertyName: string): string | number | boolean | undefined {
    const property = obj.properties.find(p => p.name === propertyName);
    return property?.value;
}

export function createProperty(name: string, value: string | number | boolean, unit?: string): IfcProperty {
    return { name, value, unit };
}

export function createGeometry(type: IfcGeometry['type'], coordinates: number[], parameters?: Record<string, any>): IfcGeometry {
    return { type, coordinates, parameters };
}

/**
 * File handling helpers
 */

export function isIfcFile(filename: string): boolean {
    return filename.toLowerCase().endsWith('.ifc');
}

export async function readIfcFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

/**
 * Validation helpers
 */

export function validateEntityReference(reference: string): boolean {
    return /^#\d+$/.test(reference);
}

export function validatePropertyName(name: string): boolean {
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
}

export function validateGeometryType(type: string): type is IfcGeometry['type'] {
    return ['point', 'line', 'curve', 'surface', 'solid'].includes(type as any);
}

/**
 * Error handling helpers
 */

export function formatError(error: Error, context?: any): string {
    return `Error: ${error.message}${context ? `\nContext: ${JSON.stringify(context)}` : ''}`;
}

export function tryParseNumber(value: string): number | null {
    const num = Number(value);
    return isNaN(num) ? null : num;
}

/**
 * Data transformation helpers
 */

export function convertToMeters(value: number, unit: string): number {
    switch (unit.toLowerCase()) {
        case 'mm':
            return value / 1000;
        case 'cm':
            return value / 100;
        case 'm':
            return value;
        case 'in':
            return value * 0.0254;
        case 'ft':
            return value * 0.3048;
        default:
            throw new Error(`Unsupported unit: ${unit}`);
    }
}

export function formatDimension(value: number, precision: number = 2): string {
    return value.toFixed(precision);
}

/**
 * Browser compatibility helpers
 */

export function isWebWorkerSupported(): boolean {
    return typeof Worker !== 'undefined';
}

export function isBlobSupported(): boolean {
    try {
        return !!new Blob();
    } catch {
        return false;
    }
}

export function getDefaultOptions() {
    return {
        worker: isWebWorkerSupported(),
        strict: true,
        maxErrors: 100,
        geometryProcessing: true
    };
}
