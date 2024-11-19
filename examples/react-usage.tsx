import React, { useState, useCallback } from 'react';
import { parse, parseAsync, isIfcFile, IfcParserResult } from '../dist';

interface DropzoneProps {
    onDrop: (files: FileList) => void;
}

const Dropzone: React.FC<DropzoneProps> = ({ onDrop }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop(e.dataTransfer.files);
    }, [onDrop]);

    return (
        <div
            className={`dropzone ${isDragOver ? 'dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput')?.click()}
        >
            <input
                type="file"
                id="fileInput"
                accept=".ifc"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files && onDrop(e.target.files)}
            />
            Drop an IFC file here or click to select
        </div>
    );
};

interface EntityListProps {
    entities: IfcParserResult['entities'];
}

const EntityList: React.FC<EntityListProps> = ({ entities }) => {
    return (
        <div className="entity-list">
            <h3>Entities ({entities.length})</h3>
            <div className="entity-grid">
                {entities.map((entity) => (
                    <div key={entity.id} className="entity-card">
                        <h4>{entity.type}</h4>
                        <p>ID: {entity.id}</p>
                        <details>
                            <summary>Attributes</summary>
                            <pre>{JSON.stringify(entity.attributes, null, 2)}</pre>
                        </details>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const IfcViewer: React.FC = () => {
    const [result, setResult] = useState<IfcParserResult | null>(null);
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    const handleFiles = useCallback(async (files: FileList) => {
        const file = files[0];
        
        if (!file || !isIfcFile(file.name)) {
            setError('Please select an IFC file');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const content = await file.text();
            const parseResult = await parseAsync(content, { worker: true });
            setResult(parseResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error parsing file');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    return (
        <div className="ifc-viewer">
            <h1>IFC Viewer</h1>
            <Dropzone onDrop={handleFiles} />
            
            {error && <div className="error">{error}</div>}
            {isLoading && <div className="loading">Parsing file...</div>}
            
            {result && (
                <div className="results">
                    <EntityList entities={result.entities} />
                    
                    {result.errors.length > 0 && (
                        <div className="errors">
                            <h3>Errors ({result.errors.length})</h3>
                            <ul>
                                {result.errors.map((error, index) => (
                                    <li key={index}>
                                        Line {error.line}, Column {error.column}: {error.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
                .ifc-viewer {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }

                .dropzone {
                    border: 2px dashed #ccc;
                    border-radius: 4px;
                    padding: 20px;
                    text-align: center;
                    margin: 20px 0;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .dropzone.dragover {
                    border-color: #000;
                    background: #f0f0f0;
                }

                .error {
                    color: #d00;
                    margin: 10px 0;
                }

                .loading {
                    text-align: center;
                    margin: 20px 0;
                    font-style: italic;
                }

                .entity-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                    margin: 20px 0;
                }

                .entity-card {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 15px;
                }

                .entity-card h4 {
                    margin: 0 0 10px 0;
                }

                .entity-card pre {
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 4px;
                    overflow-x: auto;
                }
            `}</style>
        </div>
    );
};
