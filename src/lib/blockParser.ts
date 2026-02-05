export interface CodeBlock {
    language: string;
    filePath: string | null; // This may be null if not provided in the info string
    content: string;
    first_line_idx: number;
    last_line_idx: number | null;
}

export function extractCodeBlocks(markdownText: string): CodeBlock[] {
    const lines = markdownText.split(/\r?\n/);
    const blocks: CodeBlock[] = [];

    let inBlock = false;
    let currentBlock: CodeBlock | null = null;

    // We need to track the type of fence (``` or ~~~) to ensure we close it correctly
    let fenceType: string | null = null;

    lines.forEach((line, index) => {
        const trimmedLine = line.trim();

        // Check for the start or end of a code block
        // CommonMark spec: Code blocks start with 3 or more backticks or tildes
        const isFence = /^(`{3,}|~{3,})/.test(trimmedLine);

        if (isFence) {
            const match = trimmedLine.match(/^(`{3,}|~{3,})(.*)$/);
            if (!match) return;

            const marker = match[1];
            const infoString = match[2].trim();
            // remove : if present example: typescript:src/utils/helper.ts
            const infoParts = infoString.split(':');
            const language = infoParts[0];
            const filePath = infoParts[1] || null;

            if (!inBlock) {
                // --- START OF BLOCK ---
                inBlock = true;
                fenceType = marker[0]; // Remember if it was ` or ~

                currentBlock = {
                    language: language || 'plaintext', // Default to plaintext if no lang specified
                    filePath: filePath, // This may be null if not provided in the info string
                    content: [], // We will join this array later
                    first_line_idx: index,
                    last_line_idx: null
                } as any;
            } else {
                // --- END OF BLOCK ---
                // Only close if the marker matches the opening type (e.g. ``` closes ```)
                if (marker[0] === fenceType && currentBlock) {
                    inBlock = false;
                    currentBlock.last_line_idx = index;

                    // Convert content array to a single string
                    // We usually join with \n to preserve formatting
                    currentBlock.content = (currentBlock.content as any).join('\n');

                    blocks.push(currentBlock);
                    currentBlock = null;
                    fenceType = null;
                } else {
                    // If fences don't match, treat this line as part of the code content
                    if (currentBlock) {
                        (currentBlock.content as any).push(line);
                    }
                }
            }
        } else if (inBlock) {
            // --- INSIDE BLOCK ---
            // Just add the line to the content
            if (currentBlock) {
                (currentBlock.content as any).push(line);
            }
        }
    });

    return blocks;
}
