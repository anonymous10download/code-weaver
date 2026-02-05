// read file in current directory and print content to console
import fs from 'node:fs';
import {parseAICodeOutput} from "@/lib/codeParser.ts";

fs.readFile('./example_ai_out.md', 'utf-8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
    }
    const result = parseAICodeOutput(data);
    console.log('Parsed Files:', JSON.stringify(result, null, 2));
});