import { describe, test, expect } from 'vitest'
import { IFCParser } from '../src/core/parser'
import * as fs from 'fs'
import * as path from 'path'

describe('IFCParser', () => {
  let parser: IFCParser
  let ifc: string

  beforeEach(() => {
    parser = new IFCParser()
    // Read only the first 100KB of the file to avoid memory issues
    const buffer = Buffer.alloc(100 * 1024) // 100KB
    const fd = fs.openSync(path.join(__dirname, 'files', '4_DT.ifc'), 'r')
    fs.readSync(fd, buffer, 0, buffer.length, 0)
    fs.closeSync(fd)
    ifc = buffer.toString('utf8')
  })

  test('should get wall information', async () => {
    await parser.parse(ifc)
    const walls = parser.getWalls()
    
    expect(walls.length).toBeGreaterThan(0)
    
    // Test the first wall
    const firstWall = walls[0]
    expect(firstWall).toHaveProperty('id')
    expect(firstWall).toHaveProperty('name')
    expect(firstWall).toHaveProperty('materials')
    
    console.log('First wall:', JSON.stringify(firstWall, null, 2))
    
    // Test wall materials
    const wallWithLayers = walls.find(w => w.materials.length > 0)
    if (wallWithLayers) {
      console.log('Wall with layers:', JSON.stringify(wallWithLayers, null, 2))
      
      for (const material of wallWithLayers.materials) {
        expect(material).toHaveProperty('name')
        expect(material).toHaveProperty('thickness')
        expect(material).toHaveProperty('layerSetName')
      }
    }
    
    // Test wall properties
    const wallsWithProperties = walls.filter(w => 
      w.isExternal !== undefined || w.isLoadBearing !== undefined
    )
    
    if (wallsWithProperties.length > 0) {
      console.log('Walls with properties:', wallsWithProperties.slice(0, 5).map(w => ({
        name: w.name,
        isExternal: w.isExternal,
        isLoadBearing: w.isLoadBearing
      })))
    }
  })

  test('should get elements with geometric representation', async () => {
    const filePath = path.join(__dirname, 'files', '4_DT.ifc')
    const content = fs.readFileSync(filePath, 'utf-8')
    const parser = new IFCParser()
    await parser.parse(content)

    const entitiesWithGeometry = parser.getEntitiesWithGeometry()
    
    if (entitiesWithGeometry.length > 0) {
      // Group entities by type
      const entityTypes = new Map<string, IFCEntity[]>()
      for (const entity of entitiesWithGeometry) {
        if (!entityTypes.has(entity.type)) {
          entityTypes.set(entity.type, [])
        }
        entityTypes.get(entity.type)!.push(entity)
      }

      console.log('\n[DEBUG] Entities with geometry by type:')
      for (const [type, entities] of entityTypes) {
        console.log(`\n[DEBUG] Type: ${type}`)
        console.log('[DEBUG] Names:')
        for (const entity of entities) {
          // Name is usually at index 2 for IFC entities
          const name = entity.attributes[2]
          console.log(`[DEBUG]   - ${name}`)
        }
      }
    } else {
      console.log('\n[DEBUG] No entities with geometry found')
    }
    
    // Test expectations
    expect(entitiesWithGeometry.length).toBeGreaterThan(0)
    
    // Check that we found IFCWALL entities
    const wallEntities = entitiesWithGeometry.filter(e => e.type === 'IFCWALL')
    expect(wallEntities.length).toBeGreaterThan(0)
    
    // Verify that these entities have shape data and names
    for (const entity of entitiesWithGeometry) {
      // Check geometry
      const geometry = parser.getGeometricRepresentation(entity.id)
      expect(geometry).toBeDefined()
      expect(geometry.length).toBeGreaterThan(0)
      
      // Check name
      const name = entity.attributes[2]
      expect(name).toBeDefined()
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })
})