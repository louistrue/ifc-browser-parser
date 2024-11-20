# IFC Browser Parser

A TypeScript-based parser for Industry Foundation Classes (IFC) files, designed to efficiently extract data from Ifc models.

[Repository](https://github.com/louistrue/ifc-browser-parser)

## Features

- **Efficient IFC Parsing**: Parses IFC files with optimized memory usage
- **Type Support**: Full TypeScript support with comprehensive type definitions
- **Entity Relationships**: Handles complex relationships between IFC entities

## Installation

```bash
npm install
```

## Usage

```typescript
// Basic usage
import { IFCParser } from './src/core/parser';
const parser = new IFCParser();

// Parse an IFC file
const content = fs.readFileSync('path/to/file.ifc', 'utf-8');
await parser.parse(content);

// Get all entities with geometric representations
const entitiesWithGeometry = parser.getEntitiesWithGeometry();
console.log('Found', entitiesWithGeometry.length, 'entities with geometry');

// Get all walls
const walls = parser.getWalls();
console.log('Found', walls.length, 'walls');

// Get specific wall information
for (const wall of walls) {
    console.log('Wall:', {
        id: wall.id,
        name: wall.name,
        type: wall.type
    });
}

```

## 🏗️ IFC Element Concept

> Industry Foundation Classes (IFC) elements are the building blocks of your BIM models. Here's how we handle them.

<details>
<summary>🔍 What is an IFC Element?</summary>

An IFC element represents any physical or abstract component in a building model - from walls and doors to spaces and zones. Each element carries rich metadata about its properties, relationships, and position in the building hierarchy.

</details>

### 📊 Element Structure

```typescript
interface IFCElement {
  id: string;        // Unique identifier
  type: string;      // e.g., IfcWall, IfcDoor
  name: string;      // Human-readable name
  buildingStory?: string;  // Level location
  materials: Material[];   // Associated materials
  volume?: string;   // Volumetric data
}
```

### 🎨 Material Properties

| Property | Description | Example |
|----------|-------------|---------|
| `name` | Material identifier | "Concrete" |
| `fraction` | Volume fraction | 0.75 |
| `count` | Instance count | 1 |
| `layerSetName` | Layer configuration | "External Wall" |
| `volume` | Material volume | "2.5m³" |

### 🔗 Key Features

- ✨ **Rich Metadata**: Each element maintains comprehensive property data
- 🌳 **Hierarchical**: Elements understand their place in the building structure
- 🤝 **Relational**: Built-in support for element-to-element relationships
- 📏 **Geometric**: Optional geometric and volumetric properties
- 🎯 **Type-Safe**: Full TypeScript support with strict typing

### 💡 Usage Example

```typescript
// Get all walls from a specific story
const walls = parser.getElements()
  .filter(element => 
    element.type === 'IfcWall' && 
    element.buildingStory === 'Level 1'
  );

// Analyze wall materials
const wallMaterials = walls.flatMap(wall => 
  wall.materials.map(material => ({
    wallId: wall.id,
    material: material.name,
    volume: material.volume
  }))
);
```

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup Development Environment

1. Clone the repository
```bash
git clone https://github.com/louistrue/ifc-browser-parser.git
cd ifc-browser-parser
```

2. Install dependencies
```bash
npm install
```

3. Run tests
```bash
npm test
```

### Project Structure

```
ifc-browser-parser/
├── src/
│   ├── core/
│   │   ├── parser.ts       # Main parser implementation
│   │   └── types.ts        # TypeScript type definitions
│   └── patterns/
│       └── index.ts        # IFC pattern matching
├── __tests__/
│   ├── files/             # Test IFC files
│   └── parser.test.ts     # Parser test suite
└── package.json
```

## Testing

The project uses Vitest for testing. Run the test suite with:

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](https://github.com/louistrue/ifc-browser-parser/blob/main/LICENSE) file for details.

## Acknowledgments

- Built with TypeScript
- Testing with Vitest
- Inspired by the need for efficient IFC parsing in browser environments
