export interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

export interface ParsedResult {
  files: ParsedFile[];
  folderStructure: string | null;
}

// Internal structures for the timeline
type ItemType = 'path' | 'block';

interface ScanItem {
  type: ItemType;
  index: number;
  path?: string;
  used?: boolean;
  content?: string;
  language?: string;
  explicitPath?: string;
}

// Helper to determine file extension from language
function detectExtension(lang: string): string {
  const map: Record<string, string> = {
    typescript: 'ts', javascript: 'js', python: 'py', css: 'css',
    html: 'html', json: 'json', markdown: 'md', yaml: 'yaml',
    shell: 'sh', bash: 'sh', sql: 'sql', rust: 'rs', go: 'go',
    tsx: 'tsx', jsx: 'jsx', vue: 'vue', svelte: 'svelte'
  };
  return map[lang] || lang || 'txt';
}

// Helper to determine language from filename
function detectLanguage(filepath: string, langHint: string = ''): string {
  if (langHint) return langHint;

  const ext = filepath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    css: 'css', scss: 'scss', html: 'html', json: 'json', md: 'markdown',
    py: 'python', go: 'go', rs: 'rust', sql: 'sql', yaml: 'yaml', yml: 'yaml',
    sh: 'bash', bash: 'bash', vue: 'vue', svelte: 'svelte'
  };
  return languageMap[ext] || 'text';
}

export function parseAICodeOutput(input: string): ParsedResult {
  const items: ScanItem[] = [];
  let folderStructure: string | null = null;

  // --- REGEX DEFINITIONS (Top Level for Safety) ---

  // 1. Regex to strip the folder structure block
  const folderStructureRegex = /```text\n([\s\S]*?)```/g;

  // 2. Regex for code blocks: ```lang:path or ```lang
  // Also handles inline blocks where content is on the same line as backticks
  const codeBlockRegex = /```(\w+)?(?::([^\n]+))?[\n ]+([\s\S]*?)```/g;

  // 2b. Regex for inline #### `path` followed by code block pattern
  // Matches: #### `path/file.ext` optional text ```lang content ```
  const inlineHeaderBlockRegex = /####\s*`([^`]+)`[^`]*?```(\w+)?[\n ]+([\s\S]*?)```/g;

  // 3. Regex for identifying filenames in the first line of code (e.g. // File: test.ts)
  // Matches: start -> (// or # or /* comment markers) -> optional "File:" -> path
  const commentPathRegex = /^(?:\/\/|#|\/\*|<!--)?\s*(?:File:?)?\s*([a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+)/i;

  // 4. Regex patterns for finding paths in surrounding text
  const pathPatterns = [
    /###\s*.*?\(`([^`\n]+)`\)/g,           // ### Title (`path`)
    /####\s*`([^`\n]+)`/g,                 // #### `path`
    /###\s*`([^`\n]+)`/g,                  // ### `path`
    /\*\*([a-zA-Z0-9_\-\/]+\.[a-zA-Z0-9]+)\*\*/g, // **path**
    /(?:File|Path):\s*`?([a-zA-Z0-9_\-\/]+\.[a-zA-Z0-9]+)`?/g, // File: path
    /(?:^|\n)`([a-zA-Z0-9_\-\/]+\.[a-zA-Z0-9]+)`/g // `path` (start of line)
  ];

  // --- PHASE 1: SCANNING ---

  // 1. Extract Folder Structure
  const folderMatch = folderStructureRegex.exec(input);
  if (folderMatch) {
    folderStructure = folderMatch[1].trim();
  }

  // Track positions of blocks we've already processed with inline headers
  const processedBlockPositions = new Set<number>();

  // 2a. First, scan for inline header blocks (#### `path` followed by code block)
  let inlineMatch;
  while ((inlineMatch = inlineHeaderBlockRegex.exec(input)) !== null) {
    const [fullMatch, headerPath, lang = '', rawContent] = inlineMatch;

    // Find where the code block actually starts (the ``` position)
    const codeBlockStart = input.indexOf('```', inlineMatch.index + 4); // after ####
    if (codeBlockStart !== -1) {
      processedBlockPositions.add(codeBlockStart);
    }

    items.push({
      type: 'block',
      index: inlineMatch.index,
      content: rawContent.trim(),
      language: lang.toLowerCase(),
      explicitPath: headerPath.trim(),
    });
  }

  // 2b. Scan for Code Blocks (skip those already processed)
  let blockMatch;
  while ((blockMatch = codeBlockRegex.exec(input)) !== null) {
    // Skip if this block was already processed by the inline header pattern
    if (processedBlockPositions.has(blockMatch.index)) continue;

    const [fullMatch, lang = '', fencePath = '', rawContent] = blockMatch;

    // Skip if this is the folder structure block
    if (folderStructure && rawContent.trim() === folderStructure) continue;

    let content = rawContent;
    let explicitPath = fencePath ? fencePath.trim() : undefined;

    // If no path in fence (```ts:file.ts), check the first line content
    if (!explicitPath) {
      const lines = content.split('\n');
      const firstLine = lines[0].trim();

      const commentMatch = firstLine.match(commentPathRegex);

      if (commentMatch) {
        explicitPath = commentMatch[1].trim();
        // Remove the comment line so it doesn't appear in the final file
        lines.shift();
        content = lines.join('\n');
        // Clean up leading newline if it exists after shift
        if (content.startsWith('\n')) content = content.substring(1);
      }
    }

    items.push({
      type: 'block',
      index: blockMatch.index,
      content: content.trim(),
      language: lang.toLowerCase(),
      explicitPath,
    });
  }

  // 3. Scan for Text Context Paths
  for (const pattern of pathPatterns) {
    let pathMatch;
    pattern.lastIndex = 0; // Reset regex state

    while ((pathMatch = pattern.exec(input)) !== null) {
      const pathIndex = pathMatch.index;
      const foundPath = pathMatch[1].trim();

      // Ensure this path isn't inside a code block we've already detected
      const isInsideBlock = items.some(item =>
          item.type === 'block' &&
          pathIndex >= item.index &&
          pathIndex < (item.index + 20 + (item.content?.length || 0))
      );

      if (!isInsideBlock) {
        items.push({
          type: 'path',
          index: pathIndex,
          path: foundPath,
          used: false
        });
      }
    }
  }

  // 4. Sort Timeline
  items.sort((a, b) => a.index - b.index);

  // --- PHASE 2: LINKING ---

  const files: ParsedFile[] = [];
  let untitledCounter = 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type !== 'block') continue;

    let finalPath = item.explicitPath;

    // Strategy A: If no explicit path, look BACKWARDS for unused path
    if (!finalPath) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = items[j];
        if (prev.type === 'path' && !prev.used) {
          finalPath = prev.path;
          prev.used = true;
          break;
        }
      }
    }

    // Strategy B: If still no path, look FORWARDS for unused path
    if (!finalPath) {
      for (let j = i + 1; j < items.length; j++) {
        const next = items[j];
        if (next.type === 'path' && !next.used) {
          finalPath = next.path;
          next.used = true;
          break;
        }
      }
    }

    // Strategy C: Fallback to untitled
    if (!finalPath) {
      const ext = detectExtension(item.language || '');
      finalPath = `untitled_${untitledCounter}.${ext}`;
      untitledCounter++;
    }

    if (finalPath) {
      files.push({
        path: finalPath,
        content: item.content || '',
        language: item.language || detectLanguage(finalPath),
      });
    }
  }

  // Sort files alphabetically for clean output
  files.sort((a, b) => a.path.localeCompare(b.path));

  return { files, folderStructure };
}

export function buildFileTree(files: ParsedFile[]): Map<string, ParsedFile[]> {
  const tree = new Map<string, ParsedFile[]>();
  for (const file of files) {
    const parts = file.path.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!tree.has(folder)) tree.set(folder, []);
    tree.get(folder)!.push(file);
  }
  return tree;
}