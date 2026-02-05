import { extractCodeBlocks, CodeBlock } from "@/lib/blockParser.ts";
import { MarkdownPathExtractor } from "@/lib/pathExtractor.ts";

export interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

export interface ParsedResult {
  files: ParsedFile[];
}

// Helper to map languages to default extensions for fallback naming
const LANG_TO_EXT: Record<string, string> = {
  javascript: 'js', js: 'js',
  typescript: 'ts', ts: 'ts',
  python: 'py',
  json: 'json',
  html: 'html',
  css: 'css',
  bash: 'sh', shell: 'sh',
  markdown: 'md',
  java: 'java',
  c: 'c', cpp: 'cpp',
  go: 'go',
  rust: 'rs',
  php: 'php',
  ruby: 'rb',
  sql: 'sql',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml'
};

/**
 * Orchestrates the extraction of code blocks and their associated file paths.
 * @param content The raw Markdown string.
 * @returns An object containing an array of ParsedFile.
 */
export function parseAICodeOutput(content: string): ParsedResult {
  // 1. Extract all code blocks (raw content)
  const blocks: CodeBlock[] = extractCodeBlocks(content);

  // 2. Extract paths associated with those blocks using the context-aware extractor
  const mdExtractor = new MarkdownPathExtractor(content, blocks);
  const extractedPaths = mdExtractor.extractPaths();

  // 3. Create a lookup map for paths by block index for O(1) access
  //    Key: block index, Value: filepath string
  const blockIndexToPath = new Map<number, string>();
  extractedPaths.forEach(item => {
    blockIndexToPath.set(item.associated_block_idx, item.filepath);
  });

  // 4. Merge blocks with paths to create the final ParsedFile objects
  const files: ParsedFile[] = blocks.map((block, index) => {
    let filePath = blockIndexToPath.get(index);

    // Fallback: If no path was detected in the text, generate a unique one.
    if (!filePath) {
      const lang = block.language.toLowerCase().trim();
      const ext = LANG_TO_EXT[lang] || 'txt'; // Default to .txt if unknown
      // Use index to ensure uniqueness: file_1.js, file_2.css, etc.
      filePath = `generated_file_${index + 1}.${ext}`;
    }

    return {
      path: filePath,
      content: block.content,
      language: block.language
    };
  });

  return { files };
}

// --- Usage Example ---

/*
const markdownContent = `
Here is the config:
\`\`\`json
{ "foo": "bar" }
\`\`\`

And update \`src/utils.ts\`:
\`\`\`typescript
export const add = (a, b) => a + b;
\`\`\`
`;

const result = parseMarkdownToFiles(markdownContent);
console.log(JSON.stringify(result, null, 2));
*/