'use client';

import { useState } from 'react';
import { IFCElementExtractor } from '../src/ifc-elements';

export default function IFCViewer() {
  const [elements, setElements] = useState<any>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // In a real Next.js app, you'd want to handle the file upload to server
    // and process it there, since fs operations aren't available in the browser
    const extractor = new IFCElementExtractor(file.path);
    const extractedElements = extractor.extractElements();
    setElements(extractedElements);
  };

  return (
    <div className="p-4">
      <input
        type="file"
        accept=".ifc"
        onChange={handleFileUpload}
        className="mb-4"
      />

      {elements && (
        <div className="space-y-4">
          {Object.entries(elements).map(([type, elementList]: [string, any[]]) => (
            <div key={type} className="border p-4 rounded">
              <h2 className="text-xl font-bold mb-2">{type}</h2>
              <div className="space-y-2">
                {elementList.map((element, idx) => (
                  <div key={element.id} className="ml-4">
                    <p className="font-semibold">Building Story: {element.buildingStory}</p>
                    <ul className="list-disc ml-8">
                      {element.materials.map((material: any, midx: number) => (
                        <li key={`${element.id}-${midx}`}>
                          {material.name} ({material.thickness}m)
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
