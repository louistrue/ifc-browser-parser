import { IfcParserError } from './types';

export type TokenType = 
    | 'IDENTIFIER'    // Entity names, types
    | 'NUMBER'        // Integer or float
    | 'STRING'        // Text in single quotes
    | 'EQUALS'        // =
    | 'SEMICOLON'     // ;
    | 'LPAREN'        // (
    | 'RPAREN'        // )
    | 'COMMA'         // ,
    | 'DOLLAR'        // $ (undefined value)
    | 'ASTERISK'      // * (reference)
    | 'HASH'          // # (entity reference)
    | 'DOT'           // . (dot)
    | 'EOF';          // End of file

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

export class Tokenizer {
    private input: string;
    private position: number = 0;
    private line: number = 1;
    private column: number = 1;
    private errors: IfcParserError[] = [];

    constructor(input: string) {
        this.input = input;
    }

    private isEOF(): boolean {
        return this.position >= this.input.length;
    }

    private peek(): string {
        return this.isEOF() ? '\0' : this.input[this.position];
    }

    private advance(): string {
        const char = this.peek();
        this.position++;
        if (char === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return char;
    }

    private skipWhitespace(): void {
        while (!this.isEOF() && /\s/.test(this.peek())) {
            this.advance();
        }
    }

    private readNumber(): Token {
        let value = '';
        const startColumn = this.column;

        while (!this.isEOF() && /[\d.-]/.test(this.peek())) {
            value += this.advance();
        }

        return {
            type: 'NUMBER',
            value,
            line: this.line,
            column: startColumn
        };
    }

    private readString(): Token {
        const startColumn = this.column;
        this.advance(); // Skip opening quote
        let value = '';

        while (!this.isEOF() && this.peek() !== "'") {
            value += this.advance();
        }

        if (this.peek() === "'") {
            this.advance(); // Skip closing quote
        } else {
            this.errors.push({
                line: this.line,
                column: this.column,
                message: 'Unterminated string literal',
                severity: 'error'
            });
        }

        return {
            type: 'STRING',
            value: value, 
            line: this.line,
            column: startColumn
        };
    }

    private readIdentifier(): Token {
        let value = '';
        const startColumn = this.column;

        // Allow dots in identifiers for IFC format
        while (!this.isEOF() && /[A-Za-z0-9_.]/.test(this.peek())) {
            value += this.advance();
        }

        return {
            type: 'IDENTIFIER',
            value,
            line: this.line,
            column: startColumn
        };
    }

    public nextToken(): Token {
        this.skipWhitespace();

        if (this.isEOF()) {
            return { type: 'EOF', value: '', line: this.line, column: this.column };
        }

        const char = this.peek();

        // Handle numbers (including negative and decimal)
        if (/[\d-]/.test(char)) {
            return this.readNumber();
        }

        if (char === "'") {
            return this.readString();
        }

        if (/[A-Za-z_]/.test(char)) {
            return this.readIdentifier();
        }

        // Single character tokens
        const startColumn = this.column;
        switch (char) {
            case '#': this.advance(); return { type: 'HASH', value: '#', line: this.line, column: startColumn };
            case '=': this.advance(); return { type: 'EQUALS', value: '=', line: this.line, column: startColumn };
            case ';': this.advance(); return { type: 'SEMICOLON', value: ';', line: this.line, column: startColumn };
            case '(': this.advance(); return { type: 'LPAREN', value: '(', line: this.line, column: startColumn };
            case ')': this.advance(); return { type: 'RPAREN', value: ')', line: this.line, column: startColumn };
            case ',': this.advance(); return { type: 'COMMA', value: ',', line: this.line, column: startColumn };
            case '$': this.advance(); return { type: 'DOLLAR', value: '$', line: this.line, column: startColumn };
            case '*': this.advance(); return { type: 'ASTERISK', value: '*', line: this.line, column: startColumn };
            case '.': this.advance(); return { type: 'DOT', value: '.', line: this.line, column: startColumn };
            default:
                this.errors.push({
                    line: this.line,
                    column: this.column,
                    message: `Unexpected character: ${char}`,
                    severity: 'error'
                });
                this.advance(); // Skip the invalid character
                return this.nextToken();
        }
    }

    public tokenize(): { tokens: Token[], errors: IfcParserError[] } {
        const tokens: Token[] = [];
        let token: Token;

        do {
            token = this.nextToken();
            tokens.push(token);
        } while (token.type !== 'EOF');

        return {
            tokens,
            errors: this.errors
        };
    }
}
