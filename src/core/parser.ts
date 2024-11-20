import { 
  IFCEntity,
  ParseOptions,
  MaterialResult,
  StoreyResult,
  AssemblyResult,
  ConstituentResult,
  ConstituentSetResult,
  ParseResult,
  ParseError,
  Token,
  TokenType,
  ParserState,
  IFCMaterial,
  IFCWall,
  IFCElementProperties
} from './types';

import { Tokenizer } from './tokenizer';

interface IFCWall {
  id: string;
  name: string;
  isExternal?: boolean;
  isLoadBearing?: boolean;
  buildingStorey?: string;
  materials: {
    name: string;
    thickness?: number;
    layerSetName?: string;
    layerName?: string;
  }[];
}

interface IFCElementProperties {
  id: string;
  type: string;
  name: string;
  materials: {
    name: string;
    thickness?: number;
    layerSetName?: string;
    layerName?: string;
  }[];
  geometricRepresentation?: any;
  buildingStorey?: string;
  isLoadBearing?: boolean;
  isExternal?: boolean;
}

interface IMaterial {
  name: string;
  thickness?: number;
  layerSetName?: string;
  layerName?: string;
}

interface IFCAnalysis {
  elements: IFCElementProperties[];
  elementsByType: { [key: string]: number };
  elementsByStorey: { [key: string]: { [key: string]: number } };
  materialUsage: { [key: string]: { [key: string]: number } };
}

export class IFCParser {
  private tokens: Token[] = [];
  private current: number = 0;
  private errors: ParseError[] = [];
  private state: {
    entities: Map<string, any>;
    projectName?: string;
    wallNames?: string[];
    buildingElements?: any[];
    buildingStoreys?: any[];
    walls: IFCWall[];
    materialLayers: Map<string, any>;
    materialLayerSets: Map<string, any>;
    materialLayerSetUsages: Map<string, any>;
    relationshipAssigns: Map<string, any>;
    shapeRepresentations: Map<string, any>;
    relationships: Map<string, any>;
  };

  constructor(private options: ParseOptions = {}) {
    this.state = {
      entities: new Map(),
      walls: [],
      materialLayers: new Map(),
      materialLayerSets: new Map(),
      materialLayerSetUsages: new Map(),
      relationshipAssigns: new Map(),
      shapeRepresentations: new Map(),
      relationships: new Map()
    };
  }
  
  private reset() {
    this.current = 0;
    this.errors = [];
    this.tokens = [];
    this.state = {
      entities: new Map(),
      walls: [],
      materialLayers: new Map(),
      materialLayerSets: new Map(),
      materialLayerSetUsages: new Map(),
      relationshipAssigns: new Map(),
      shapeRepresentations: new Map(),
      relationships: new Map()
    };
  }
  
  async parse(content: string): Promise<IFCAnalysis> {
    this.reset();
    
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        this.parseLine(line);
      }
    }
    
    const relationships = this.processMaterialRelationships();
    const elements = this.getElementProperties(relationships);
    
    return {
      elements,
      elementsByType: Object.fromEntries(elements.reduce((acc, element) => {
        acc.set(element.type, (acc.get(element.type) || 0) + 1);
        return acc;
      }, new Map<string, number>())),
      elementsByStorey: Object.fromEntries(
        Array.from(elements.reduce((acc, element) => {
          const storey = element.buildingStorey || 'Unknown Storey';
          if (!acc.has(storey)) {
            acc.set(storey, new Map());
          }
          const storeyElements = acc.get(storey)!;
          storeyElements.set(element.type, (storeyElements.get(element.type) || 0) + 1);
          return acc;
        }, new Map<string, Map<string, number>>()).entries()).map(([storey, elements]) => [
          storey,
          Object.fromEntries(elements)
        ])
      ),
      materialUsage: Object.fromEntries(
        Array.from(elements.reduce((acc, element) => {
          if (element.materials && element.materials.length > 0) {
            if (!acc.has(element.type)) {
              acc.set(element.type, new Map());
            }
            const typeMaterials = acc.get(element.type)!;
            for (const material of element.materials) {
              const materialKey = material.name + 
                (material.layerSetName ? ` [${material.layerSetName}]` : '') +
                (material.thickness ? ` ${material.thickness}mm` : '') +
                (material.layerName ? ` (${material.layerName})` : '');
              typeMaterials.set(materialKey, (typeMaterials.get(materialKey) || 0) + 1);
            }
          }
          return acc;
        }, new Map<string, Map<string, number>>()).entries()).map(([type, materials]) => [
          type,
          Object.fromEntries(materials)
        ])
      )
    };
  }
  
  private parseLine(line: string) {
    const idMatch = line.match(/^#(\d+)/);
    if (!idMatch) return;

    const id = idMatch[1];
    const typeMatch = line.match(/=\s*(\w+)\s*\(/);
    if (!typeMatch) return;

    const type = typeMatch[1];
    const attributes = this.parseAttributes(line);
    let name: string | number | null = null;

    // Special handling for material entities
    if (type === 'IFCMATERIAL') {
      name = this.parseAttributeValue(attributes[0]);
    } else if (type.startsWith('IFC') && attributes.length > 2) {
      name = this.parseAttributeValue(attributes[2]);
    }

    const nameStr = name !== null && name !== undefined ? String(name) : '';
    
    this.state.entities.set(id, { id, type, attributes, name: nameStr });
    
    // Handle different IFC types
    switch (type) {
      case 'IFCWALL':
      case 'IFCWALLSTANDARDCASE':
        const wall: IFCWall = {
          id,
          name: nameStr,
          materials: []
        };
        this.state.walls.push(wall);
        break;
      
      case 'IFCMATERIALLAYER':
        const materialId = attributes[0];
        const thickness = this.parseAttributeValue(attributes[1]);
        const layerName = this.parseAttributeValue(attributes[3]);
        this.state.materialLayers.set(id, {
          id,
          materialId,
          thickness: typeof thickness === 'number' ? thickness : undefined,
          name: layerName
        });
        break;
      
      case 'IFCMATERIALLAYERSET':
        const layerIds = this.parseList(attributes[0]);
        const setName = this.parseAttributeValue(attributes[1]);
        this.state.materialLayerSets.set(id, {
          id,
          layerIds,
          name: setName
        });
        break;
      
      case 'IFCMATERIALLAYERSETUSAGE':
        const layerSetId = attributes[0];
        this.state.materialLayerSetUsages.set(id, {
          id,
          layerSetId
        });
        break;

      case 'IFCRELASSIGNSTOGROUP':
      case 'IFCRELCONTAINEDINSPATIALSTRUCTURE':
        const relatedIds = this.parseList(attributes[4]);
        const relatingId = attributes[5];
        this.state.relationshipAssigns.set(id, {
          id,
          type,
          relatedIds,
          relatingId
        });
        break;

      case 'IFCSHAPEREPRESENTATION':
        const representationType = this.parseAttributeValue(attributes[2]);
        const items = this.parseList(attributes[3]);
        this.state.shapeRepresentations.set(id, {
          type,
          representationType,
          items
        });
        break;
    }
  }

  private processMaterialRelationships(): Map<string, { materials: any[], spatialStructure?: any }> {
    const relationships = new Map<string, { materials: any[], spatialStructure?: any }>();

    console.log('[DEBUG] Processing relationships');
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
        console.log('[DEBUG] Processing spatial relationship:', {
          id: entity.id,
          type: entity.type,
          attributes: entity.attributes,
          name: entity.name
        });

        const relatedElements = this.parseList(entity.attributes[4]);
        const storey = this.state.entities.get(this.stripHashFromId(entity.attributes[5]));

        for (const elementRef of relatedElements) {
          const elementId = this.stripHashFromId(elementRef);
          const existing = relationships.get(elementId) || { materials: [] };
          existing.spatialStructure = storey;
          relationships.set(elementId, existing);
        }
      } else if (entity.type === 'IFCRELASSOCIATESMATERIAL') {
        console.log('[DEBUG] Processing material relationship:', {
          id: entity.id,
          type: entity.type,
          attributes: entity.attributes,
          name: entity.name
        });

        const relatedElements = this.parseList(entity.attributes[4]);
        const materialRef = this.stripHashFromId(entity.attributes[5]);
        const materialEntity = this.state.entities.get(materialRef);

        if (materialEntity) {
          let materials: any[] = [];
          console.log('[DEBUG] Processing material entity:', {
            type: materialEntity.type,
            id: materialEntity.id,
            name: materialEntity.name
          });
          
          if (materialEntity.type === 'IFCMATERIALLAYERSETUSAGE') {
            // Get the layer set from usage
            const layerSetRef = this.stripHashFromId(materialEntity.attributes[0]);
            const layerSet = this.state.entities.get(layerSetRef);
            if (layerSet && layerSet.type === 'IFCMATERIALLAYERSET') {
              const layerRefs = this.parseList(layerSet.attributes[0]);
              materials = layerRefs.map(ref => {
                const layer = this.state.entities.get(this.stripHashFromId(ref));
                if (layer && layer.type === 'IFCMATERIALLAYER') {
                  const materialRef = this.stripHashFromId(layer.attributes[0]);
                  const material = this.state.entities.get(materialRef);
                  const thickness = parseFloat(layer.attributes[1] || '0.000').toFixed(3);
                  return {
                    name: material ? material.name || 'Unknown Material' : 'Unknown Material',
                    thickness: thickness
                  };
                }
                return null;
              }).filter(Boolean);
            }
          } else if (materialEntity.type === 'IFCMATERIALCONSTITUENTSET') {
            const constituentRefs = this.parseList(materialEntity.attributes[0]);
            materials = constituentRefs.map(ref => {
              const constituent = this.state.entities.get(this.stripHashFromId(ref));
              if (constituent && constituent.type === 'IFCMATERIALCONSTITUENT') {
                const materialRef = this.stripHashFromId(constituent.attributes[2]);
                const material = this.state.entities.get(materialRef);
                // Look for width in properties
                let thickness = '0.000';
                const widthRef = constituent.attributes[3];
                if (widthRef) {
                  const width = this.state.entities.get(this.stripHashFromId(widthRef));
                  if (width && width.type === 'IFCQUANTITYLENGTH') {
                    thickness = parseFloat(width.attributes[3] || '0.000').toFixed(3);
                  }
                }
                return {
                  name: material ? material.name || 'Unknown Material' : 'Unknown Material',
                  thickness: thickness
                };
              }
              return null;
            }).filter(Boolean);
          } else if (materialEntity.type === 'IFCMATERIAL') {
            materials = [{
              name: materialEntity.name || 'Unknown Material',
              thickness: '0.000'
            }];
          }

          console.log('[DEBUG] Processed materials:', materials);

          for (const elementRef of relatedElements) {
            const elementId = this.stripHashFromId(elementRef);
            const existing = relationships.get(elementId) || { materials: [] };
            existing.materials = materials;
            relationships.set(elementId, existing);
          }
        }
      }
    }

    return relationships;
  }

  private parseAttributes(line: string): any[] {
    const attributes: any[] = [];
    let depth = 0;
    let currentAttr = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = line.indexOf('(') + 1; i < line.length; i++) {
      const char = line[i];
      
      if (escapeNext) {
        currentAttr += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        currentAttr += char;
        continue;
      }
      
      if (!inString) {
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth < 0) break;
        } else if (char === ',' && depth === 0) {
          attributes.push(this.parseAttributeValue(currentAttr.trim()));
          currentAttr = '';
          continue;
        }
      }
      
      currentAttr += char;
    }
    
    if (currentAttr) {
      attributes.push(this.parseAttributeValue(currentAttr.trim()));
    }
    
    return attributes;
  }

  private parseAttributeValue(value: any): string | number | null {
    if (value === undefined || value === null || value === '$') {
      return null;
    }

    const stringValue = String(value);

    // Handle string literals
    if (typeof stringValue === 'string') {
      if ((stringValue.startsWith('"') && stringValue.endsWith('"')) ||
          (stringValue.startsWith("'") && stringValue.endsWith("'"))) {
        return stringValue.slice(1, -1);
      }
    }

    // Try parsing as number
    if (!isNaN(Number(stringValue)) && stringValue !== '') {
      return Number(stringValue);
    }

    return stringValue;
  }

  private parseList(value: string): string[] {
    if (!value || !value.startsWith('(') || !value.endsWith(')')) {
      return [];
    }
    return value.slice(1, -1).split(',')
      .map(v => v.trim())
      .filter(v => v !== '' && v !== '$')
      .map(v => v.startsWith('#') ? v.slice(1) : v);
  }

  private getAttribute(entity: any, name: string): any {
    const index = this.getAttributeIndex(entity.type, name);
    if (index === -1) return undefined;
    return entity.attributes[index];
  }

  private getAttributeIndex(type: string, name: string): number {
    // Common attribute positions for IFC entities
    const commonAttributes: { [key: string]: number } = {
      'GlobalId': 0,
      'OwnerHistory': 1,
      'Name': 2,
      'Description': 3,
      'ObjectType': 4,
      'ObjectPlacement': 5,
      'Representation': 6,
      'Tag': 7,
      'Elevation': 8
    };

    return commonAttributes[name] ?? -1;
  }

  private stripHashFromId(id: string): string {
    return id.startsWith('#') ? id.substring(1) : id
  }

  private getElementProperties(relationships: Map<string, { materials: any[], spatialStructure?: any }>): IFCElementProperties[] {
    // First collect all shape representations
    const shapeRepresentations = new Map<string, any>();
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCSHAPEREPRESENTATION') {
        const context = entity.attributes[0];
        const identifier = this.parseAttributeValue(entity.attributes[1]);
        const type = this.parseAttributeValue(entity.attributes[2]);
        const items = this.parseList(entity.attributes[3]);
        
        console.log('[DEBUG] Found shape representation', entity.id + ':', {
          context,
          identifier,
          type,
          items
        });
        
        shapeRepresentations.set(entity.id, {
          id: entity.id,
          type: entity.type,
          representationType: type,
          representationIdentifier: identifier,
          items: items.map(id => this.state.entities.get(this.stripHashFromId(id)))
        });
      }
    }
    console.log('[DEBUG] Found', shapeRepresentations.size, 'shape representations')

    // Then collect all product definition shapes
    const productDefinitionShapes = new Map<string, string[]>();
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCPRODUCTDEFINITIONSHAPE') {
        const representations = this.parseList(entity.attributes[2]);
        console.log('[DEBUG] Found product definition shape', entity.id, 'with representations:', representations);
        productDefinitionShapes.set(entity.id, representations.map(id => this.stripHashFromId(id)));
      }
    }
    console.log('[DEBUG] Found', productDefinitionShapes.size, 'product definition shapes')

    // Find all building elements with product definition shapes
    const elementProperties: IFCElementProperties[] = [];
    for (const entity of this.state.entities.values()) {
      if (entity.type.startsWith('IFC') && 
          !entity.type.startsWith('IFCRELATIONSHIP') && 
          !entity.type.startsWith('IFCPROPERTYSET') &&
          !entity.type.startsWith('IFCOWNERHISTORY') &&
          !entity.type.startsWith('IFCPROJECT') &&
          !entity.type.startsWith('IFCSITE') &&
          !entity.type.startsWith('IFCBUILDING') &&
          !entity.type.startsWith('IFCBUILDINGSTOREY') &&
          !entity.type.startsWith('IFCGEOMETRIC') &&
          !entity.type.startsWith('IFCMATERIAL') &&
          !entity.type.startsWith('IFCPRESENTATION') &&
          !entity.type.startsWith('IFCPRODUCTDEFINITION') &&
          !entity.type.startsWith('IFCSHAPE')) {
        
        // Look for representation in the entity's attributes
        let hasGeometry = false;
        let geometricRepresentation = undefined;
        
        // Check if this entity has a representation
        for (let i = 0; i < entity.attributes.length; i++) {
          const attr = entity.attributes[i];
          if (attr && typeof attr === 'string' && attr.startsWith('#')) {
            const refId = this.stripHashFromId(attr);
            if (productDefinitionShapes.has(refId)) {
              hasGeometry = true;
              const representationShapes = productDefinitionShapes.get(refId);
              if (representationShapes) {
                geometricRepresentation = representationShapes
                  .map(id => shapeRepresentations.get(id))
                  .filter(Boolean);
              }
              break;
            }
          } else if (attr && typeof attr === 'string' && attr.includes('(#')) {
            // Handle list format like "(#123,#456)"
            const matches = attr.match(/#\d+/g);
            if (matches) {
              for (const match of matches) {
                const refId = this.stripHashFromId(match);
                if (productDefinitionShapes.has(refId)) {
                  hasGeometry = true;
                  const representationShapes = productDefinitionShapes.get(refId);
                  if (representationShapes) {
                    geometricRepresentation = representationShapes
                      .map(id => shapeRepresentations.get(id))
                      .filter(Boolean);
                  }
                  break;
                }
              }
            }
          }
        }

        if (hasGeometry) {
          console.log('[DEBUG] Processing building element:', entity.id, entity.type, 'with geometry');
          
          // Get relationship info
          const relationship = relationships.get(entity.id) || { 
            materials: [], 
            spatialStructure: { name: 'Unknown Storey' } 
          };

          elementProperties.push({
            id: entity.id,
            type: entity.type,
            name: entity.name || '',
            materials: relationship.materials,
            buildingStorey: relationship.spatialStructure?.name,
            geometricRepresentation,
            isLoadBearing: false,
            isExternal: false
          });
        }
      }
    }

    console.log('[DEBUG] Found', elementProperties.length, 'building elements');
    return elementProperties;
  }
}
