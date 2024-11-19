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
  IFCWall
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
  }[];
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
  
  async parse(content: string): Promise<ParseResult> {
    this.reset();
    
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('#')) {
        this.parseLine(line);
      }
    }
    
    this.processRelationships();
    
    return {
      projectName: this.state.projectName,
      wallNames: this.state.wallNames || [],
      relationships: this.state.relationships,
      errors: this.errors,
      buildingElements: this.state.buildingElements || [],
      buildingStoreys: this.state.buildingStoreys || [],
      walls: this.getWalls()
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

  getWalls(): IFCWall[] {
    // Process relationships to find building storeys and materials
    for (const [, rel] of this.state.relationshipAssigns) {
      if (rel.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
        const storey = this.state.entities.get(rel.relatingId);
        if (storey && storey.type === 'IFCBUILDINGSTOREY') {
          for (const elementId of rel.relatedIds) {
            const wall = this.state.walls.find(w => w.id === elementId);
            if (wall) {
              wall.buildingStorey = storey.name;
            }
          }
        }
      }
    }

    // Process material layers
    for (const wall of this.state.walls) {
      const entity = this.state.entities.get(wall.id);
      if (!entity) continue;

      // Find material usage
      for (const [, usage] of this.state.materialLayerSetUsages) {
        const layerSet = this.state.materialLayerSets.get(usage.layerSetId);
        if (!layerSet) continue;

        for (const layerId of layerSet.layerIds) {
          const layer = this.state.materialLayers.get(layerId);
          if (!layer) continue;

          const material = this.state.entities.get(layer.materialId);
          if (!material) continue;

          wall.materials.push({
            name: material.name,
            thickness: layer.thickness,
            layerSetName: layerSet.name
          });
        }
      }

      // Get wall properties
      wall.isExternal = this.getAttribute(entity, 'IsExternal') === true;
      wall.isLoadBearing = this.getAttribute(entity, 'LoadBearing') === true;
    }

    return this.state.walls;
  }

  getEntitiesWithGeometry(): IFCEntity[] {
    console.log('[DEBUG] Looking for entities with geometry...')
    console.log('[DEBUG] Total entities:', this.state.entities.size)
    
    const entitiesWithGeometry: IFCEntity[] = []
    
    // First find all shape representations
    const shapeReps = new Map<string, IFCEntity>()
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCSHAPEREPRESENTATION') {
        console.log(`[DEBUG] Found shape representation ${entity.id}:`, {
          context: entity.attributes[0],
          identifier: entity.attributes[1],
          type: entity.attributes[2],
          items: entity.attributes[3]
        })
        shapeReps.set(entity.id, entity)
      }
    }
    console.log('[DEBUG] Found', shapeReps.size, 'shape representations')

    // Then find all product definition shapes that use these representations
    const prodDefShapes = new Map<string, IFCEntity>()
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCPRODUCTDEFINITIONSHAPE') {
        const representations = this.parseList(entity.attributes[2])
        const hasShapeRep = representations.some(repId => 
          shapeReps.has(this.stripHashFromId(repId))
        )
        if (hasShapeRep) {
          console.log(`[DEBUG] Found product definition shape ${entity.id} with representations:`, representations)
          prodDefShapes.set(entity.id, entity)
        }
      }
    }
    console.log('[DEBUG] Found', prodDefShapes.size, 'product definition shapes')

    // Finally find all entities that use these product definition shapes
    for (const entity of this.state.entities.values()) {
      // Product definition shape is at index 6 (representation) in most IFC entities
      const productDefShape = entity.attributes[6]
      if (productDefShape && typeof productDefShape === 'string') {
        const shapeId = this.stripHashFromId(productDefShape)
        if (prodDefShapes.has(shapeId)) {
          console.log(`[DEBUG] Found entity ${entity.id} (${entity.type}) with shape ${productDefShape}`)
          entitiesWithGeometry.push(entity)
          continue
        }
      }
      
      // Also check index 7 (some entities use this index)
      const altProductDefShape = entity.attributes[7]
      if (altProductDefShape && typeof altProductDefShape === 'string') {
        const shapeId = this.stripHashFromId(altProductDefShape)
        if (prodDefShapes.has(shapeId)) {
          console.log(`[DEBUG] Found entity ${entity.id} (${entity.type}) with shape ${altProductDefShape}`)
          entitiesWithGeometry.push(entity)
        }
      }
    }
    
    console.log('[DEBUG] Found', entitiesWithGeometry.length, 'entities with geometry')
    return entitiesWithGeometry
  }

  getGeometricRepresentation(elementId: string): any {
    console.log('[DEBUG] Getting geometric representation for', elementId)
    const element = this.state.entities.get(elementId)
    if (!element) {
      console.log('[DEBUG] Element not found:', elementId)
      return null
    }

    // Try both index 6 and 7 for product definition shape
    let productDefShape = element.attributes[6]
    if (!productDefShape || typeof productDefShape !== 'string') {
      productDefShape = element.attributes[7]
    }
    
    if (!productDefShape || typeof productDefShape !== 'string') {
      console.log('[DEBUG] No product def shape for element', elementId)
      return null
    }

    const shapeId = this.stripHashFromId(productDefShape)
    const shape = this.state.entities.get(shapeId)
    if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') {
      console.log('[DEBUG] Invalid shape for element', elementId, '- shape:', shape?.type)
      return null
    }

    // Get shape representations
    const representations = this.parseList(shape.attributes[2])
    const result = []

    for (const repId of representations) {
      const cleanRepId = this.stripHashFromId(repId)
      const rep = this.state.entities.get(cleanRepId)
      if (rep && rep.type === 'IFCSHAPEREPRESENTATION') {
        const items = this.parseList(rep.attributes[3])
        const itemEntities = items.map(itemId => {
          const cleanItemId = this.stripHashFromId(itemId)
          const entity = this.state.entities.get(cleanItemId)
          if (entity) {
            return {
              id: entity.id,
              type: entity.type,
              attributes: entity.attributes
            }
          }
          return null
        }).filter(Boolean)

        result.push({
          id: rep.id,
          type: rep.type,
          representationType: this.parseAttributeValue(rep.attributes[2]),
          representationIdentifier: this.parseAttributeValue(rep.attributes[1]),
          items: itemEntities
        })
      }
    }

    console.log('[DEBUG] Found geometric representation:', result)
    return result
  }

  private processRelationships() {
    console.log('[DEBUG] Processing relationships')
    let materialRelations = 0;
    let aggregateRelations = 0;

    // First pass: Process material relationships
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCRELASSOCIATESMATERIAL') {
        materialRelations++;
        console.log('[DEBUG] Processing material relationship:', entity);
        
        // RelatedElements is at index 4, RelatingMaterial at index 5
        const relatedElements = entity.attributes[4];
        const relatingMaterial = entity.attributes[5];

        if (relatedElements && relatingMaterial) {
          // Handle both single and array of related elements
          const elementIds = this.parseList(relatedElements);
          
          for (const elementId of elementIds) {
            console.log('[DEBUG] Processing element:', elementId);
            const element = this.state.entities.get(elementId);
            
            // Handle direct material or material set reference
            let materialId = relatingMaterial;
            const relatingEntity = this.state.entities.get(relatingMaterial);
            
            if (relatingEntity) {
              if (relatingEntity.type === 'IFCMATERIALLAYERSET') {
                // If it's a layer set, get the first layer's material
                const layers = this.parseList(relatingEntity.attributes[0]);
                if (layers.length > 0) {
                  const firstLayer = this.state.entities.get(layers[0]);
                  if (firstLayer && firstLayer.type === 'IFCMATERIALLAYER') {
                    materialId = firstLayer.attributes[0];
                  }
                }
              } else if (relatingEntity.type === 'IFCMATERIAL') {
                // If it's already a material, use it directly
                materialId = relatingEntity.id;
              }
            }
            
            const material = this.state.entities.get(materialId);
            
            if (element && material) {
              if (!this.state.relationships.has(elementId)) {
                this.state.relationships.set(elementId, { materials: [], aggregates: [] });
              }
              const relationships = this.state.relationships.get(elementId)!;
              if (!relationships.materials.includes(material)) {
                relationships.materials.push(material);
              }
            }
          }
        }
      }
    }

    // Second pass: Process aggregate relationships
    for (const entity of this.state.entities.values()) {
      if (entity.type === 'IFCRELAGGREGATES') {
        aggregateRelations++;
        const relatingObject = entity.attributes[4];
        const relatedObjects = entity.attributes[5];

        if (relatingObject && relatedObjects) {
          const parent = this.state.entities.get(relatingObject);
          const childIds = this.parseList(relatedObjects);

          for (const childId of childIds) {
            const child = this.state.entities.get(childId);
            if (parent && child) {
              if (!this.state.relationships.has(childId)) {
                this.state.relationships.set(childId, { materials: [], aggregates: [] });
              }
              const relationships = this.state.relationships.get(childId)!;
              relationships.aggregates.push(parent);
            }
          }
        }
      }
    }

    console.log('[DEBUG] Found material relations:', materialRelations);
    console.log('[DEBUG] Found aggregate relations:', aggregateRelations);
    console.log('[DEBUG] Final relationships:', this.state.relationships);
  }
}
