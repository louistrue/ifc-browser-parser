import { readFileSync } from 'fs';

interface Material {
  name: string;
  fraction: number;
  count: number;
  layerSetName: string;
  volume?: number;
}

interface IFCElement {
  id: string;
  type: string;
  name: string;
  buildingStory?: string;
  materials: Material[];
  volume?: string;
}

interface IFCElementCollection {
  [key: string]: IFCElement[];
}

export class IFCElementExtractor {
  private entities: Map<string, any> = new Map();
  private relationships: Map<string, { materials: any[], spatialStructure?: any }> = new Map();
  private state = {
    currentLine: 0,
    inDataSection: false,
    inHeader: false
  };

  constructor(filePath: string) {
    console.log(`Reading file: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    console.log(`File size: ${content.length} bytes`);
    this.parseIFCFile(content);
    this.processMaterialRelationships();
  }

  private stripHashFromId(id: string): string {
    return id.startsWith('#') ? id.substring(1) : id;
  }

  private parseList(list: string): string[] {
    if (!list) return [];
    // Handle nested parentheses
    let result = [];
    let currentItem = '';
    let depth = 0;
    
    for (let i = 0; i < list.length; i++) {
      const char = list[i];
      if (char === '(') {
        depth++;
        if (depth === 1 && currentItem === '') continue;
        currentItem += char;
      } else if (char === ')') {
        depth--;
        if (depth === 0 && currentItem !== '') {
          result.push(currentItem.trim());
          currentItem = '';
        } else {
          currentItem += char;
        }
      } else if (char === ',' && depth === 0) {
        if (currentItem !== '') {
          result.push(currentItem.trim());
          currentItem = '';
        }
      } else {
        currentItem += char;
      }
    }
    
    if (currentItem !== '') {
      result.push(currentItem.trim());
    }
    
    return result;
  }

  private parseLine(line: string): { id: string, type: string, attributes: string[] } | null {
    const match = line.match(/^#(\d+)=\s*(\w+)\((.*)\);?$/);
    if (!match) return null;

    const [, id, type, attributesStr] = match;
    const attributes = this.parseList(attributesStr);
    return { id, type, attributes };
  }

  private parseIFCFile(content: string): void {
    console.log('Starting IFC file parsing...');
    const lines = content.split('\n');
    console.log(`Total lines: ${lines.length}`);
    let entityCount = 0;

    for (const line of lines) {
      this.state.currentLine++;
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Handle file sections
      if (trimmedLine === 'ISO-10303-21;') {
        this.state.inHeader = true;
        continue;
      } else if (trimmedLine === 'HEADER;') {
        this.state.inHeader = true;
        continue;
      } else if (trimmedLine === 'ENDSEC;') {
        this.state.inHeader = false;
        this.state.inDataSection = false;
        continue;
      } else if (trimmedLine === 'DATA;') {
        this.state.inDataSection = true;
        console.log('Found DATA section');
        continue;
      }
      
      // Only parse entity definitions in the data section
      if (!this.state.inDataSection) continue;

      const parsed = this.parseLine(trimmedLine);
      if (parsed) {
        const { id, type, attributes } = parsed;
        
        // Clean up attribute values
        const cleanAttributes = attributes.map(attr => {
          // Remove single quotes from string values
          if (attr.startsWith("'") && attr.endsWith("'")) {
            return attr.slice(1, -1);
          }
          // Handle empty values
          if (attr === '$') {
            return '';
          }
          return attr;
        });

        // Get the name from the second attribute for most entities
        const name = cleanAttributes[1] && cleanAttributes[1] !== '$' ? cleanAttributes[1] : '';

        this.entities.set(id, {
          id,
          type,
          attributes: cleanAttributes,
          name
        });
        entityCount++;

        if (entityCount % 100 === 0) {
          console.log(`Parsed ${entityCount} entities...`);
        }
      }
    }
    console.log(`Parsed ${entityCount} entities total`);
  }

  private processMaterialRelationships(): void {
    console.log('Processing material relationships...');
    let spatialCount = 0;
    let materialCount = 0;

    for (const entity of this.entities.values()) {
      if (entity.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
        const relatedElements = this.parseList(entity.attributes[4]);
        const storeyRef = this.stripHashFromId(entity.attributes[5]);
        const storey = this.entities.get(storeyRef);
        spatialCount += relatedElements.length;

        for (const elementRef of relatedElements) {
          const elementId = this.stripHashFromId(elementRef);
          const existing = this.relationships.get(elementId) || { materials: [] };
          existing.spatialStructure = storey;
          this.relationships.set(elementId, existing);
        }
      } else if (entity.type === 'IFCRELASSOCIATESMATERIAL') {
        const relatedElements = this.parseList(entity.attributes[4]);
        const materialRef = this.stripHashFromId(entity.attributes[5]);
        const materialEntity = this.entities.get(materialRef);
        materialCount += relatedElements.length;

        console.log('\n[DEBUG] Processing material relationship:');
        console.log('Related Elements:', relatedElements);
        console.log('Material Entity:', materialEntity ? {
          id: materialEntity.id,
          type: materialEntity.type,
          attributes: materialEntity.attributes
        } : 'Not found');

        if (materialEntity) {
          let materials: any[] = [];
          
          if (materialEntity.type === 'IFCMATERIALLAYERSETUSAGE') {
            console.log('\n[DEBUG] Found IFCMATERIALLAYERSETUSAGE');
            const layerSetRef = this.stripHashFromId(materialEntity.attributes[0]);
            const layerSet = this.entities.get(layerSetRef);
            console.log('Layer Set:', layerSet ? {
              id: layerSet.id,
              type: layerSet.type,
              attributes: layerSet.attributes
            } : 'Not found');

            if (layerSet && layerSet.type === 'IFCMATERIALLAYERSET') {
              console.log('\n[DEBUG] Processing material layer set:', {
                id: layerSet.id,
                type: layerSet.type,
                attributes: layerSet.attributes
              });
              const layersRef = layerSet.attributes[0];
              const layers = this.parseList(layersRef);
              
              // First pass: calculate total thickness
              let totalThickness = 0;
              const layerThicknesses: number[] = [];
              
              layers.forEach(layerRef => {
                const layer = this.entities.get(this.stripHashFromId(layerRef));
                if (layer) {
                  const rawThickness = layer.attributes[1] || '0.000';
                  const thickness = parseFloat(rawThickness);
                  layerThicknesses.push(thickness);
                  if (!isNaN(thickness) && thickness > 0) { // Only count non-zero thicknesses
                    totalThickness += thickness;
                  }
                } else {
                  layerThicknesses.push(0);
                }
              });

              console.log('[DEBUG] Total thickness:', totalThickness);

              // Second pass: create materials with fractions
              materials = layers.map((layerRef, index) => {
                const layer = this.entities.get(this.stripHashFromId(layerRef));
                if (!layer) return null;

                const materialRef = layer.attributes[0];
                const material = this.entities.get(this.stripHashFromId(materialRef));
                
                // Get the material name from the IFCMATERIAL entity
                let materialName = 'Unknown Material';
                if (material && material.type === 'IFCMATERIAL') {
                  materialName = material.attributes[0] || 'Unknown Material';
                  // Remove quotes if present
                  if (materialName.startsWith("'") && materialName.endsWith("'")) {
                    materialName = materialName.slice(1, -1);
                  }
                }

                // Calculate fraction
                const thickness = layerThicknesses[index];
                let fraction = 0;
                if (thickness <= 0) {
                  fraction = 0; // Zero thickness = zero fraction
                } else if (totalThickness > 0) {
                  fraction = thickness / totalThickness;
                }
                
                console.log('[DEBUG] Layer fraction:', {
                  materialName,
                  thickness,
                  totalThickness,
                  fraction
                });

                return {
                  name: materialName,
                  fraction,
                  layerSetName: layerSet.attributes[1] || 'Unknown Layer Set',
                  count: 1
                };
              }).filter(m => m !== null);

              // Check if fractions sum to 1 (with small epsilon for floating point errors)
              const totalFraction = materials.reduce((sum, m) => sum + m.fraction, 0);
              console.log('[DEBUG] Total fraction:', totalFraction);
              
              if (Math.abs(totalFraction) < 0.0001 && materials.length > 0) {
                // No valid thickness information found, distribute fractions equally
                console.log('[DEBUG] No valid thickness information, distributing fractions equally');
                const equalFraction = 1.0 / materials.length;
                materials.forEach(m => m.fraction = equalFraction);
              } else if (Math.abs(totalFraction - 1.0) > 0.0001 && totalFraction > 0) {
                // Normalize fractions to sum to 1
                console.log('[DEBUG] Normalizing fractions to sum to 1');
                materials.forEach(m => m.fraction = m.fraction / totalFraction);
              }
            }
          } else if (materialEntity.type === 'IFCMATERIALCONSTITUENTSET') {
            console.log('\n[DEBUG] Found IFCMATERIALCONSTITUENTSET');
            const constituentRefs = this.parseList(materialEntity.attributes[2] || '');
            
            // First pass: calculate total thickness
            let totalThickness = 0;
            const constituentThicknesses: number[] = [];
            
            constituentRefs.forEach(ref => {
              const constituentEntity = this.entities.get(this.stripHashFromId(ref));
              if (constituentEntity && constituentEntity.type === 'IFCMATERIALCONSTITUENT') {
                let thickness = 0;
                
                // Method 1: Look for IFCPHYSICALCOMPLEXQUANTITY with matching name
                const constituentName = constituentEntity.attributes[0]?.replace(/^'|'$/g, '');
                for (const entity of this.entities.values()) {
                  if (entity.type === 'IFCPHYSICALCOMPLEXQUANTITY' && 
                      entity.attributes[0] === constituentName) {  
                    console.log('[DEBUG] Found physical complex quantity:', entity);
                    // The quantities are in attributes[2] as a list
                    const quantities = this.parseList(entity.attributes[2] || '');
                    console.log('[DEBUG] Quantities list:', quantities);
                    for (const quantityRef of quantities) {
                      const quantity = this.entities.get(this.stripHashFromId(quantityRef));
                      console.log('[DEBUG] Found quantity:', quantity);
                      if (quantity?.type === 'IFCQUANTITYLENGTH') {
                        console.log('[DEBUG] Found length quantity:', quantity.attributes[0], quantity.attributes[3]);
                        if (quantity.attributes[0] === 'Width' || 
                            quantity.attributes[0] === 'LayerThickness' ||
                            quantity.attributes[0] === 'Thickness') {
                          thickness = parseFloat(quantity.attributes[3] || '0.000');
                          console.log('[DEBUG] Found thickness from physical complex quantity:', thickness);
                          break;
                        }
                      }
                    }
                    if (thickness > 0) break;
                  }
                }

                // Method 2: Look for IFCQUANTITYLENGTH before this constituent
                if (thickness === 0) {
                  const constituentId = parseInt(this.stripHashFromId(ref));
                  for (let i = constituentId - 5; i < constituentId; i++) {
                    const entity = this.entities.get(i.toString());
                    if (entity?.type === 'IFCQUANTITYLENGTH') {
                      console.log('[DEBUG] Found preceding quantity length:', entity);
                      if (entity.attributes[0] === 'Width' || 
                          entity.attributes[0] === 'LayerThickness' ||
                          entity.attributes[0] === 'Thickness') {
                        thickness = parseFloat(entity.attributes[3] || '0.000');
                        console.log('[DEBUG] Found thickness from preceding quantity:', thickness);
                        break;
                      }
                    }
                  }
                }

                // Method 3: Try to find thickness from property sets
                if (thickness === 0) {
                  const thicknessFromProps = this.findPropertyValue(constituentEntity, 'LayerThickness') || 
                                           this.findPropertyValue(constituentEntity, 'Width') || 
                                           this.findPropertyValue(constituentEntity, 'Thickness');
                  if (thicknessFromProps) {
                    thickness = parseFloat(thicknessFromProps);
                    console.log('[DEBUG] Found thickness from property:', thickness);
                  }
                }

                // Method 4: Try to find thickness from material layer sets
                if (thickness === 0) {
                  const materialRef = constituentEntity.attributes[3] || constituentEntity.attributes[2];
                  const actualMaterial = materialRef ? this.entities.get(this.stripHashFromId(materialRef)) : null;
                  const materialName = actualMaterial?.attributes[0]?.replace(/^'|'$/g, '');

                  for (const entity of this.entities.values()) {
                    if (entity.type === 'IFCMATERIALLAYERSET') {
                      console.log('[DEBUG] Found material layer set:', entity);
                      const layerRefs = this.parseList(entity.attributes[0] || '');
                      console.log('[DEBUG] Layer refs:', layerRefs);
                      for (const layerRef of layerRefs) {
                        const layer = this.entities.get(this.stripHashFromId(layerRef));
                        if (layer?.type === 'IFCMATERIALLAYER') {
                          console.log('[DEBUG] Found material layer:', layer);
                          // Check if this layer matches our material
                          const layerMaterialRef = layer.attributes[0];
                          const layerMaterial = layerMaterialRef ? this.entities.get(this.stripHashFromId(layerMaterialRef)) : null;
                          if (layerMaterial?.attributes[0]?.replace(/^'|'$/g, '') === materialName) {
                            // Layer thickness is in attributes[1]
                            const layerThickness = parseFloat(layer.attributes[1] || '0.000');
                            if (layerThickness > 0) {
                              thickness = layerThickness;
                              console.log('[DEBUG] Found thickness from material layer:', thickness);
                              break;
                            }
                          }
                        }
                      }
                      if (thickness > 0) break;
                    }
                  }
                }

                constituentThicknesses.push(thickness);
                if (thickness > 0) { // Only count non-zero thicknesses
                  totalThickness += thickness;
                }
              }
            });

            console.log('[DEBUG] Total constituent thickness:', totalThickness);

            // Second pass: create materials with fractions
            materials = constituentRefs.map((ref, index) => {
              const constituentEntity = this.entities.get(this.stripHashFromId(ref));
              if (constituentEntity && constituentEntity.type === 'IFCMATERIALCONSTITUENT') {
                const materialRef = constituentEntity.attributes[3] || constituentEntity.attributes[2];
                const actualMaterial = materialRef ? this.entities.get(this.stripHashFromId(materialRef)) : null;
                
                let materialName;
                if (actualMaterial?.attributes[0]) {
                  materialName = actualMaterial.attributes[0];
                } else if (constituentEntity.attributes[0]) {
                  materialName = constituentEntity.attributes[0];
                  if (materialName.startsWith("'") && materialName.endsWith("'")) {
                    materialName = materialName.slice(1, -1);
                  }
                  materialName = materialName.split(" (")[0];
                } else {
                  materialName = 'Unknown Material';
                }

                if (materialName.startsWith("'") && materialName.endsWith("'")) {
                  materialName = materialName.slice(1, -1);
                }

                const thickness = constituentThicknesses[index];
                let fraction = 0;
                if (thickness <= 0) {
                  fraction = 0; // Zero thickness = zero fraction
                } else if (totalThickness > 0) {
                  fraction = thickness / totalThickness;
                }

                console.log('[DEBUG] Constituent fraction:', {
                  materialName,
                  thickness,
                  totalThickness,
                  fraction
                });

                return {
                  name: materialName,
                  fraction,
                  layerSetName: materialEntity.attributes[0] || 'Unknown Constituent Set',
                  count: 1
                };
              }
              return null;
            }).filter(Boolean);

            // Check if fractions sum to 1 (with small epsilon for floating point errors)
            const totalFraction = materials.reduce((sum, m) => sum + m.fraction, 0);
            console.log('[DEBUG] Total fraction:', totalFraction);
            
            if (Math.abs(totalFraction) < 0.0001 && materials.length > 0) {
              // No valid thickness information found, distribute fractions equally
              console.log('[DEBUG] No valid thickness information, distributing fractions equally');
              const equalFraction = 1.0 / materials.length;
              materials.forEach(m => m.fraction = equalFraction);
            } else if (Math.abs(totalFraction - 1.0) > 0.0001 && totalFraction > 0) {
              // Normalize fractions to sum to 1
              console.log('[DEBUG] Normalizing fractions to sum to 1');
              materials.forEach(m => m.fraction = m.fraction / totalFraction);
            }
          } else if (materialEntity.type === 'IFCMATERIAL') {
            console.log('\n[DEBUG] Found single IFCMATERIAL');
            materials = [{
              name: materialEntity.attributes[0]?.replace(/^'|'$/g, '') || 'Unknown Material',
              fraction: 1.0,
              layerSetName: 'Single Material',
              count: 1
            }];
          }

          console.log('\n[DEBUG] Processed materials:', materials);

          for (const elementRef of relatedElements) {
            const elementId = this.stripHashFromId(elementRef);
            const element = this.entities.get(elementId);
            if (element) {
              const elementVolume = parseFloat(this.findElementVolume(element) || '0');
              console.log('[DEBUG] Found element volume:', elementVolume);

              // Calculate material volumes based on fractions
              const materialsWithVolume = materials.map(material => ({
                ...material,
                volume: material.fraction * elementVolume
              }));

              console.log('[DEBUG] Materials with volumes:', materialsWithVolume);

              const existing = this.relationships.get(elementId) || { materials: [] };
              existing.materials = materialsWithVolume;
              this.relationships.set(elementId, existing);
            }
          }
        }
      }
    }
    console.log(`Processed ${spatialCount} spatial relationships and ${materialCount} material relationships`);
  }

  private removeQuotes(str: string): string {
    if (str.startsWith("'") && str.endsWith("'")) {
      return str.slice(1, -1);
    }
    return str;
  }

  private getBaseQuantityNames(elementType: string): string[] {
    return [
      `Qto_${elementType.toLowerCase()}BaseQuantities`,
      `Qto_${elementType}BaseQuantities`,
      `BaseQuantities`,
      `${elementType.toUpperCase()}BaseQuantities`,
      `Qto_${elementType}Quantities`
    ];
  }

  private findElementVolume(element: any): string {
    try {
      // Try multiple approaches to find volume
      for (const [id, entity] of this.entities.entries()) {
        if (entity.type !== 'IFCRELDEFINESBYPROPERTIES') continue;
        if (!entity.attributes[4]?.includes(element.id)) continue;

        const propertySetRef = entity.attributes[5];
        if (!propertySetRef) continue;

        const propertySet = this.entities.get(this.stripHashFromId(propertySetRef));
        if (!propertySet) continue;

        const volume = this.checkQuantitySet(element, propertySet) || 
                      this.checkPropertySet(propertySet);
        
        if (volume) return volume;
      }
    } catch (error) {
      console.error("Error finding element volume:", error);
    }
    return "0.000";
  }

  private checkQuantitySet(element: any, propertySet: any): string | null {
    if (propertySet.type !== 'IFCELEMENTQUANTITY') return null;

    const elementType = element.type.replace('IFC', '');
    const baseNames = [
      `Qto_${elementType.toLowerCase()}BaseQuantities`,
      `Qto_${elementType}BaseQuantities`,
      `BaseQuantities`
    ];

    const setName = this.removeQuotes(propertySet.attributes[2] || '');
    if (!baseNames.some(name => setName.toLowerCase() === name.toLowerCase())) {
      return null;
    }

    const quantities = this.parseList(propertySet.attributes[5] || '');
    for (const ref of quantities) {
      const quantity = this.entities.get(this.stripHashFromId(ref));
      if (!quantity || quantity.type !== 'IFCQUANTITYVOLUME') continue;

      const name = this.removeQuotes(quantity.attributes[0] || '');
      if (name === 'NetVolume' || name === 'GrossVolume') {
        console.log(`[DEBUG] Found ${name}:`, quantity.attributes[3]);
        return quantity.attributes[3];
      }
    }
    return null;
  }

  private checkPropertySet(propertySet: any): string | null {
    if (propertySet.type !== 'IFCPROPERTYSET') return null;

    const psetName = this.removeQuotes(propertySet.attributes[2] || '');
    if (!psetName.includes('Quantity') && !psetName.includes('BaseQuantities')) {
      return null;
    }

    const properties = this.parseList(propertySet.attributes[4] || '');
    for (const ref of properties) {
      const property = this.entities.get(this.stripHashFromId(ref));
      if (!property || property.type !== 'IFCPROPERTYSINGLEVALUE') continue;

      const name = this.removeQuotes(property.attributes[0] || '');
      if (name.toLowerCase().includes('volume')) {
        console.log("[DEBUG] Found volume in property:", name, property.attributes[2]);
        return property.attributes[2];
      }
    }
    return null;
  }

  private findPropertyValue(entity: any, propertyName: string): string | null {
    // Find relationships pointing to this entity
    for (const [id, relEntity] of this.entities.entries()) {
      if (relEntity.type === 'IFCRELDEFINESBYPROPERTIES') {
        const relatedObjects = relEntity.attributes[4];
        if (!relatedObjects) continue;

        // Check if this entity is related
        const objectRefs = relatedObjects.split(',');
        const entityRef = `#${entity.id}`;
        if (!objectRefs.includes(entityRef)) continue;

        // Get property set reference
        const propertySetRef = relEntity.attributes[5];
        if (!propertySetRef) continue;

        const propertySet = this.entities.get(this.stripHashFromId(propertySetRef));
        if (!propertySet) continue;

        // Look for property
        const properties = propertySet.attributes[4];
        if (!properties) continue;

        const propertyRefs = properties.split(',');
        for (const ref of propertyRefs) {
          const property = this.entities.get(this.stripHashFromId(ref));
          if (!property) continue;

          // Check for property name
          if (property.type === 'IFCPROPERTYSINGLEVALUE' && 
              this.removeQuotes(property.attributes[0] || '') === propertyName) {
            const value = property.attributes[2];
            if (value) {
              console.log(`Found ${propertyName} from property set:`, value);
              return value;
            }
          }
        }
      }
    }

    return null;
  }

  private findThicknessFromQuantities(constituent: any): string | null {
    // Find quantity sets associated with this constituent
    for (const [id, entity] of this.entities.entries()) {
      if (entity.type === 'IFCELEMENTQUANTITY' || 
          entity.type === 'IFCPHYSICALCOMPLEXQUANTITY') {
        
        // Check if this quantity set is related to our constituent
        const constituentName = constituent.attributes[0];
        if (constituentName && entity.attributes[0] === constituentName) {
          
          // Look for quantity references
          const quantities = entity.attributes[2];
          if (!quantities) continue;

          const quantityRefs = quantities.split(',');
          for (const ref of quantityRefs) {
            const quantity = this.entities.get(this.stripHashFromId(ref));
            if (!quantity) continue;

            // Check for width/thickness quantities
            if (quantity.type === 'IFCQUANTITYLENGTH' && 
                (quantity.attributes[0] === 'Width' || 
                 quantity.attributes[0] === 'LayerThickness' ||
                 quantity.attributes[0] === 'Thickness')) {
              const thickness = quantity.attributes[3];
              if (thickness) {
                console.log("Found thickness from quantity:", thickness);
                return thickness;
              }
            }
          }
        }
      }
    }

    return null;
  }

  private getUnitScale(): number {
    console.log('\n[DEBUG] Searching for length unit...');
    // Find IFCSIUNIT for length
    for (const entity of this.entities.values()) {
      if (entity.type === 'IFCSIUNIT') {
        const attributes = entity.attributes;
        console.log('[DEBUG] Found IFCSIUNIT:', {
          attributes,
          unitType: attributes[2],
          prefix: attributes[1]
        });
        // Check if it's a length unit
        if (attributes[2] === '.LENGTHUNIT.') {
          // Check for prefix
          const prefix = attributes[1];
          let scale: number;
          switch (prefix) {
            case '.MILLI.':
              scale = 0.001; // Convert millimeters to meters
              break;
            case '.CENTI.':
              scale = 0.01; // Convert centimeters to meters
              break;
            case '.DECI.':
              scale = 0.1; // Convert decimeters to meters
              break;
            case null:
            case '$':
            case undefined:
              scale = 1.0; // Already in meters
              break;
            default:
              console.warn(`Unknown length unit prefix: ${prefix}`);
              scale = 1.0;
          }
          console.log(`[DEBUG] Using scale factor: ${scale} for prefix: ${prefix}`);
          return scale;
        }
      }
    }
    console.log('[DEBUG] No length unit found, defaulting to meters (scale: 1.0)');
    return 1.0; // Default to meters if no unit found
  }

  private convertLength(value: string | number): string {
    console.log(`\n[DEBUG] Converting length value: ${value}`);
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) {
      console.log('[DEBUG] Invalid number, returning 0.000');
      return '0.000';
    }
    
    const scale = this.getUnitScale();
    const result = (numValue * scale).toFixed(3);
    console.log(`[DEBUG] Conversion: ${numValue} * ${scale} = ${result}`);
    return result;
  }

  public extractElements(): IFCElementCollection {
    console.log('Extracting elements...');
    const elements: IFCElementCollection = {};
    const hasGeometry = new Set<string>();

    // First find all entities with geometry
    for (const entity of this.entities.values()) {
      if (entity.type === 'IFCPRODUCTDEFINITIONSHAPE') {
        const elementId = this.findElementForShape(entity.id);
        if (elementId) {
          const element = this.entities.get(elementId);
          if (element) {
            hasGeometry.add(elementId);
          }
        }
      }
    }

    console.log(`Found ${hasGeometry.size} elements with geometry`);

    // Process elements with geometry
    for (const elementId of hasGeometry) {
      const element = this.entities.get(elementId);
      const relationship = this.relationships.get(elementId);
      
      if (!elements[element.type]) {
        elements[element.type] = [];
      }

      const materialsList = relationship?.materials || [];
      const storey = relationship?.spatialStructure;
      
      // Get the building story name
      let buildingStory = 'Unknown Story';
      if (storey) {
        // Get the name from the storey entity's name attribute
        const storeyName = storey.attributes[2] || storey.attributes[1];
        if (storeyName) {
          buildingStory = storeyName;
          // Remove quotes if present
          if (buildingStory.startsWith("'") && buildingStory.endsWith("'")) {
            buildingStory = buildingStory.slice(1, -1);
          }
        }
      }

      // Get the element name
      let elementName = 'Unknown Element';
      if (element) {
        // Get the name from the element's name attribute
        const name = element.attributes[2] || element.attributes[1];
        if (name) {
          elementName = name;
          // Remove quotes if present
          if (elementName.startsWith("'") && elementName.endsWith("'")) {
            elementName = elementName.slice(1, -1);
          }
        }
      }

      const volume = this.findElementVolume(element);
      elements[element.type].push({
        id: elementId,
        type: element.type,
        name: elementName,
        buildingStory,
        materials: materialsList.map(m => ({
          name: m.name,
          fraction: m.fraction,
          volume: m.volume,
          layerSetName: m.layerSetName,
          count: m.count
        })),
        volume
      });
    }

    console.log('Element types found:', Object.keys(elements));
    for (const [type, list] of Object.entries(elements)) {
      console.log(`${type}: ${list.length} elements`);
    }

    return elements;
  }

  private findElementForShape(shapeId: string): string | null {
    for (const entity of this.entities.values()) {
      const attributes = entity.attributes;
      for (const attr of attributes) {
        if (attr === `#${shapeId}`) {
          return entity.id;
        }
      }
    }
    return null;
  }
}

// Example usage:
// const extractor = new IFCElementExtractor('path/to/file.ifc');
// const elements = extractor.extractElements();
