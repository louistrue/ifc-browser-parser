import { describe, expect, it } from 'vitest';
import { IFCParser } from '../src/core/parser';
import * as fs from 'fs';
import * as path from 'path';

async function readIFCFile(filename: string): Promise<string> {
  const filePath = path.join(__dirname, 'files', filename);
  return fs.readFileSync(filePath, 'utf8');
}

function printFileSummary(result: any) {
  console.log('\n' + '='.repeat(50));
  console.log(`IFC File Analysis`);
  console.log('='.repeat(50));

  console.log('1. Element Types:');
  console.log('-'.repeat(20));
  
  // Print element types
  for (const [type, count] of Object.entries(result.elementsByType)) {
    console.log(type.padEnd(30), count, 'elements');
  }
  console.log();

  // Print building storeys
  console.log('2. Building Storeys:');
  console.log('-'.repeat(20));
  for (const [storey, elements] of Object.entries(result.elementsByStorey)) {
    console.log(storey + ':');
    for (const [type, count] of Object.entries(elements)) {
      console.log('  -', type.padEnd(30), count, 'elements');
    }
  }
  console.log();

  // Print material usage
  console.log('3. Materials Usage:');
  console.log('-'.repeat(20));
  for (const [type, materials] of Object.entries(result.materialUsage)) {
    console.log(type + ':');
    for (const [material, count] of Object.entries(materials)) {
      console.log('  -', material.padEnd(50), count, 'elements');
    }
  }
  console.log();

  // Print structural properties
  console.log('4. Structural Properties:');
  console.log('-'.repeat(20));
  const structuralElements = result.elements.filter(e => e.isLoadBearing || e.isExternal);
  if (structuralElements.length === 0) {
    console.log('No structural property information found');
  } else {
    for (const element of structuralElements) {
      if (element.isLoadBearing) {
        console.log(`${element.type} ${element.id} is load bearing`);
      }
      if (element.isExternal) {
        console.log(`${element.type} ${element.id} is external`);
      }
    }
  }
  console.log();

  console.log('\n' + '='.repeat(50) + '\n');
}

describe('IFCParser', () => {
  const testFiles = [
    '4_DT.ifc',
    '2x3_CV_2.0.ifc',
    '4_RV_Str.ifc'
  ];

  testFiles.forEach(filename => {
    describe(`Testing ${filename}`, () => {
      it('should analyze file structure', async () => {
        const content = await readIFCFile(filename);
        const parser = new IFCParser();
        const result = await parser.parse(content);

        // Print summary
        printFileSummary(result);

        // Basic validations
        expect(result.elements.length).toBeGreaterThan(0);
        
        // Verify each element has ALL required properties
        for (const element of result.elements) {
          // Required properties
          expect(element).toHaveProperty('id');
          expect(element).toHaveProperty('type');
          expect(element).toHaveProperty('name');
          expect(element).toHaveProperty('materials');
          expect(element).toHaveProperty('buildingStorey', expect.any(String), 
            `Element ${element.id} (${element.type}) is missing building storey information`);
          
          // Material information must be present
          expect(element.materials.length).toBeGreaterThan(0, 
            `Element ${element.id} (${element.type}) has no material information`);
          for (const material of element.materials) {
            expect(material.name).toBeTruthy();
            expect(typeof material.name).toBe('string');
            expect(material.name).not.toBe('');
          }

          // Structural properties must be defined
          expect(typeof element.isLoadBearing).toBe('boolean',
            `Element ${element.id} (${element.type}) is missing load bearing information`);
          expect(typeof element.isExternal).toBe('boolean',
            `Element ${element.id} (${element.type}) is missing external information`);
        }
      });
    });
  });
});