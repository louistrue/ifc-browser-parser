import { IFCElementExtractor } from './src/ifc-elements.js';
import path from 'path';

// Test with all three IFC files
const testFiles = [
  './__tests__/files/4_DT.ifc',
  './__tests__/files/2x3_CV_2.0.ifc',
  './__tests__/files/4_RV_Str.ifc',
  './__tests__/files/02_BIMcollab_Example_STR.ifc',
  './__tests__/files/2309_231212_BIM_Tragwerkmodell.ifc'
];

function formatMaterials(elements: any) {
  for (const [type, elementList] of Object.entries(elements)) {
    console.log(`\n${type}:`);
    for (const element of elementList as any[]) {
      console.log(formatElement(element));
    }
  }
}

function formatElement(element: any): string {
  let output = '';
  output += `\nElement ID: ${element.id}\n`;
  output += `Element Name: ${element.name || 'Unnamed'}\n`;
  if (element.buildingStory) {
    output += `Building Story: ${element.buildingStory}\n`;
  }
  
  // Add volume information
  if (element.volume && element.volume !== "0.000") {
    output += `Net Volume: ${element.volume} m³\n`;
  }
  
  // Add materials
  if (element.materials && element.materials.length > 0) {
    output += 'Materials:\n';
    for (const material of element.materials) {
      const fraction = material.fraction;
      const percentage = (fraction * 100).toFixed(1);
      const volume = material.volume ? ` (${material.volume.toFixed(3)} m³)` : '';
      output += `  - ${material.name} (${material.layerSetName}): ${percentage}%${volume}\n`;
    }
  }
  return output;
}

// Test each file
for (const file of testFiles) {
  const filePath = path.resolve(file);
  console.log(`\nProcessing file: ${path.basename(file)}`);
  console.log('='.repeat(50));
  
  try {
    const extractor = new IFCElementExtractor(filePath);
    const elements = extractor.extractElements();
    formatMaterials(elements);
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
}