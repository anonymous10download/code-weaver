import {CodeBlock} from "@/lib/blockParser.ts";

export interface FileReference {
    filepath: string;
    filename: string;
    found_at_line_idx: number;
    associated_block_idx: number;
}

// Map common languages to known file extensions
const LANGUAGE_TO_EXTENSION: Record<string, string[]> = {
    javascript: ['.js', '.mjs', '.cjs', '.jsx'],
    js: ['.js', '.mjs', '.cjs', '.jsx'],
    typescript: ['.ts', '.tsx', '.mts'],
    ts: ['.ts', '.tsx', '.mts'],
    tsx: ['.ts', '.tsx', '.mts'],
    python: ['.py', '.pyw'],
    py: ['.py'],
    java: ['.java', '.class', '.jar'],
    c: ['.c', '.h'],
    cpp: ['.cpp', '.hpp', '.cc', '.cxx'],
    'c++': ['.cpp', '.hpp', '.cc', '.cxx'],
    csharp: ['.cs'],
    cs: ['.cs'],
    html: ['.html', '.htm'],
    css: ['.css', '.scss', '.sass', '.less'],
    json: ['.json'],
    markdown: ['.md', '.markdown'],
    md: ['.md', '.markdown'],
    xml: ['.xml'],
    yaml: ['.yaml', '.yml'],
    yml: ['.yaml', '.yml'],
    bash: ['.sh', '.bash'],
    sh: ['.sh', '.bash'],
    go: ['.go'],
    rust: ['.rs'],
    php: ['.php'],
    ruby: ['.rb'],
    swift: ['.swift'],
    kotlin: ['.kt', '.kts'],
    sql: ['.sql'],
    dockerfile: ['Dockerfile'],
    docker: ['Dockerfile']
};

export class MarkdownPathExtractor {
    private contentLines: string[];
    private codeBlocks: CodeBlock[];

    constructor(content: string, codeBlocks: CodeBlock[]) {
        this.contentLines = content.split(/\r?\n/);
        this.codeBlocks = codeBlocks;
    }

    /**
     * Main method to extract paths associated with code blocks.
     * Strategy:
     * 1. Iterate over provided code blocks.
     * 2. Determine valid extensions based on block language.
     * 3. Search strictly above the block (context) or inside the block (comments).
     */
    public extractPaths(): FileReference[] {
        const results: FileReference[] = [];

        this.codeBlocks.forEach((block, blockIndex) => {
            // Normalize language and get extensions
            const language = block.language.toLowerCase().trim();
            const validExtensions = LANGUAGE_TO_EXTENSION[language];

            // If language is unknown or generic, we might skip specific extension matching
            // or default to capturing any 'filename-looking' string.
            // For safety, we skip blocks where we can't verify the extension.
            if (!validExtensions) return;

            // 0. Check for explicit path in block header (```lang:path/to/file.ext)
            if (block.filePath) {
                results.push({
                    filepath: block.filePath,
                    filename: block.filePath.split(/[\\/]/).pop() || block.filePath,
                    found_at_line_idx: block.first_line_idx,
                    associated_block_idx: blockIndex
                });
                return; // Skip further searching if we already have a path
            }

            // 1. Search Preceding Lines (Context)
            const searchEnd = block.first_line_idx;

            let found = false;

            for (let i = searchEnd - 1; i >= 0; i--) {
                const line = this.contentLines[i];
                const extracted = this.findPathInLine(line, validExtensions, i, blockIndex);
                if (extracted) {
                    results.push(extracted);
                    found = true;
                    break; // Stop once we find a path for this block
                }
            }

            // 2. Search Inside Code Block (if not found above)
            // Often files are named in the first line: // src/utils.js
            if (!found) {
                const blockContentLines = block.content.split(/\r?\n/);
                // Check only the first 2 lines of the code content
                for(let j = 0; j < Math.min(2, blockContentLines.length); j++) {
                    const line = blockContentLines[j];
                    // Calculate absolute line index: start + 1 (for opening ```) + relative index
                    const absoluteLineIdx = block.first_line_idx + 1 + j;

                    const extracted = this.findPathInLine(line, validExtensions, absoluteLineIdx, blockIndex);
                    if (extracted) {
                        results.push(extracted);
                        break;
                    }
                }
            }
        });

        return results;
    }

    /**
     * Helper to regex match a path in a single line.
     * strictly enforcing NO SPACES.
     */
    private findPathInLine(
        line: string,
        extensions: string[],
        lineIdx: number,
        blockIdx: number
    ): FileReference | null {
        // 1. Build Extension Group: e.g., (?:\.js|\.jsx|\.ts)
        // specific check for Dockerfile which has no extension usually
        const isDockerfile = extensions.includes('Dockerfile');

        let pattern: RegExp;

        if (isDockerfile) {
            // Match "Dockerfile" optionally preceded by path
            // (?:[a-zA-Z]:[\\/]|[\\/])? -> Optional Root/Drive
            // (?:[\w.\-_]+[\\/])* -> Optional folders (no spaces)
            // Dockerfile\b              -> Literal filename
            pattern = /(?:[a-zA-Z]:[\\/]|[\\/])?(?:[\w.\-_]+[\\/])*Dockerfile\b/;
        } else {
            const escapedExts = extensions.map(e => e.replace('.', '\\.'));
            const extGroup = `(?:${escapedExts.join('|')})`;

            // Regex Components:
            // (?:[a-zA-Z]:[\\/]|[\\/])?   -> Optional Drive (C:\) or Root (/)
            // (?:[\w.\-_]+[\\/])* -> Optional Folders. Allowed chars: A-Z a-z 0-9 . - _
            // [\w.\-_]+                   -> Filename part (no spaces)
            // ${extGroup}                 -> Must end with valid extension
            // \b                          -> Word boundary
            pattern = new RegExp(`(?:[a-zA-Z]:[\\\\]|[\\/])?(?:[\\w.\\-_]+[\\\\/])*[\\w.\\-_]+${extGroup}\\b`, 'i');
        }

        const match = line.match(pattern);

        if (match) {
            const fullPath = match[0];
            // Split by / or \ to get the last segment as filename
            const filename = fullPath.split(/[\\/]/).pop() || fullPath;

            return {
                filepath: fullPath,
                filename: filename,
                found_at_line_idx: lineIdx,
                associated_block_idx: blockIdx
            };
        }
        return null;
    }
}