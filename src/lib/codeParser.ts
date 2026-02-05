export interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

export interface ParsedResult {
  files: ParsedFile[];
  folderStructure: string | null;
}

function detectLanguage(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    md: 'markdown',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return languageMap[ext] || 'text';
}

export function parseGeminiOutput(input: string): ParsedResult {
  const files: ParsedFile[] = [];
  let folderStructure: string | null = null;

  // Match folder structure blocks (```text with tree-like content)
  const folderStructureRegex = /```text\n([\s\S]*?)```/g;
  const folderMatch = folderStructureRegex.exec(input);
  if (folderMatch) {
    folderStructure = folderMatch[1].trim();
  }

  // Pattern to match file headers with code blocks
  // Matches patterns like:
  // ### 1. Types (`types.ts`)
  // #### `components/ExportHeader.tsx`
  // ### `useExportLogic.ts`
  const filePatterns = [
    // Pattern: ### N. Title (`filepath`)
    /###\s*\d*\.?\s*[^`]*\(`([^`]+)`\)\s*\n+```(\w+)?\n([\s\S]*?)```/g,
    // Pattern: #### `filepath`
    /####\s*`([^`]+)`\s*\n+```(\w+)?\n([\s\S]*?)```/g,
    // Pattern: ### `filepath`
    /###\s*`([^`]+)`\s*\n+```(\w+)?\n([\s\S]*?)```/g,
    // Pattern with parentheses: (`filepath`)
    /\(`([^`]+\.\w+)`\)\s*\n+```(\w+)?\n([\s\S]*?)```/g,
  ];

  const foundPaths = new Set<string>();

  for (const pattern of filePatterns) {
    let match;
    // Reset regex lastIndex for each pattern
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(input)) !== null) {
      const [, filepath, lang, content] = match;
      
      // Skip if we already found this file
      if (foundPaths.has(filepath)) continue;
      foundPaths.add(filepath);

      // Clean up the file path
      const cleanPath = filepath.trim();
      
      files.push({
        path: cleanPath,
        content: content.trim(),
        language: lang || detectLanguage(cleanPath),
      });
    }
  }

  // Fallback: try to match any remaining code blocks with inline path comments
  // Pattern: ```tsx\n// filepath: src/components/Example.tsx
  const inlinePathRegex = /```(\w+)?\n\/\/\s*(?:filepath|path|file):\s*([^\n]+)\n([\s\S]*?)```/g;
  let inlineMatch;
  while ((inlineMatch = inlinePathRegex.exec(input)) !== null) {
    const [, lang, filepath, content] = inlineMatch;
    const cleanPath = filepath.trim();
    
    if (!foundPaths.has(cleanPath)) {
      foundPaths.add(cleanPath);
      files.push({
        path: cleanPath,
        content: content.trim(),
        language: lang || detectLanguage(cleanPath),
      });
    }
  }

  // Sort files by path for better organization
  files.sort((a, b) => a.path.localeCompare(b.path));

  return { files, folderStructure };
}

export function buildFileTree(files: ParsedFile[]): Map<string, ParsedFile[]> {
  const tree = new Map<string, ParsedFile[]>();
  
  for (const file of files) {
    const parts = file.path.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    
    if (!tree.has(folder)) {
      tree.set(folder, []);
    }
    tree.get(folder)!.push(file);
  }
  
  return tree;
}
