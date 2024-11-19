import { IfcParser } from '../core/parser';
import { IfcParserOptions, IfcParserResult } from '../core/types';

// Worker message types
type WorkerMessage = {
    type: 'parse';
    data: string;
    options?: IfcParserOptions;
};

type WorkerResponse = {
    type: 'result' | 'error';
    data: IfcParserResult | Error;
};

// Web Worker context
const ctx: Worker = self as any;

// Handle incoming messages
ctx.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
    const { type, data, options } = event.data;

    try {
        switch (type) {
            case 'parse': {
                const result = await IfcParser.parseAsync(data, options);
                ctx.postMessage({
                    type: 'result',
                    data: result
                } as WorkerResponse);
                break;
            }
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        ctx.postMessage({
            type: 'error',
            data: error instanceof Error ? error : new Error(String(error))
        } as WorkerResponse);
    }
});

// Worker wrapper class for main thread
export class IfcParserWorker {
    private worker: Worker;

    constructor() {
        const workerBlob = new Blob(
            ['(' + workerFunction.toString() + ')()'],
            { type: 'application/javascript' }
        );
        const workerUrl = URL.createObjectURL(workerBlob);
        this.worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
    }

    public async parse(input: string, options?: IfcParserOptions): Promise<IfcParserResult> {
        return new Promise((resolve, reject) => {
            const handleMessage = (event: MessageEvent<WorkerResponse>) => {
                const { type, data } = event.data;
                if (type === 'result') {
                    resolve(data as IfcParserResult);
                } else {
                    reject(data);
                }
                this.worker.removeEventListener('message', handleMessage);
            };

            this.worker.addEventListener('message', handleMessage);
            this.worker.postMessage({
                type: 'parse',
                data: input,
                options
            } as WorkerMessage);
        });
    }

    public terminate(): void {
        this.worker.terminate();
    }
}

// Worker function that will be stringified and run in the worker context
function workerFunction() {
    // This function's body will be replaced by the actual worker code
    // when the worker is created
}

// Export worker creation helper
export function createIfcParserWorker(): IfcParserWorker {
    return new IfcParserWorker();
}
