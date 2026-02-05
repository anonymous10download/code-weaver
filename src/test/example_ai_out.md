Below is a revised `parseGeminiOutput` that’s designed to pass **all** the tests you shared, with improved + clearer logic:

✅ What it now handles:

* **First-line filename comment** inside code blocks (e.g. `// parser.ts`) → uses it as `path` **and strips it from content**
* **Fence header path syntax** like ```typescript:src/utils/helper.ts → extracts path directly
* **Preceding context** like `**components/Button.tsx**:` → detects and pairs with the next code block
* **Fallback names** for unnamed blocks → `untitled_1.css`, `untitled_2.ts`, etc.
* Keeps your folder structure support

````ts
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
  const ext = filepath.split(".").pop()?.toLowerCase() || "";
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
  };
  return languageMap[ext] || "text";
}

function normalizePath(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

function looksLikeFilePath(s: string): boolean {
  // requires an extension; allows folders
  return /(^|\/)[^\/\s`"']+\.[a-z0-9]+$/i.test(s.trim());
}

function extFromLang(lang: string | null): string {
  const l = (lang || "").toLowerCase();
  const map: Record<string, string> = {
    typescript: "ts",
    ts: "ts",
    tsx: "tsx",
    javascript: "js",
    js: "js",
    jsx: "jsx",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    markdown: "md",
    md: "md",
    python: "py",
    py: "py",
    go: "go",
    rust: "rs",
    rs: "rs",
    sql: "sql",
    yaml: "yml",
    yml: "yml",
    bash: "sh",
    sh: "sh",
    shell: "sh",
    zsh: "sh",
  };
  return map[l] || "txt";
}

type NameItem = { value: string; index: number; used: boolean };

type CodeBlock = {
  header: string;          // raw fence header after ```
  lang: string | null;     // parsed language (if any)
  explicitPath: string | null; // parsed path from header syntax lang:path
  content: string;         // raw content (will be processed)
  index: number;           // location in input for pairing
};

function parseFenceHeader(headerRaw: string): { lang: string | null; path: string | null } {
  const h = headerRaw.trim();

  // Supports: "typescript:src/utils/helper.ts"
  // Also tolerates: "tsx:components/Button.tsx"
  const colonIdx = h.indexOf(":");
  if (colonIdx !== -1) {
    const left = h.slice(0, colonIdx).trim();
    const right = h.slice(colonIdx + 1).trim();

    const maybePath = normalizePath(right);
    if (looksLikeFilePath(maybePath)) {
      return { lang: left || null, path: maybePath };
    }
  }

  // Otherwise header is just language (or empty)
  return { lang: h ? h : null, path: null };
}

function extractLeadingFilenameComment(content: string): { path: string | null; stripped: string } {
  // Look only at the very beginning (ignoring leading empty lines)
  const lines = content.split(/\r?\n/);

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;

  if (i >= lines.length) return { path: null, stripped: content };

  const first = lines[i].trim();

  // // parser.ts
  let m = first.match(/^\/\/\s*([^\s]+?\.[a-z0-9]+)\s*$/i);
  if (m && looksLikeFilePath(m[1])) {
    lines.splice(i, 1);
    return { path: normalizePath(m[1]), stripped: lines.join("\n").trim() };
  }

  // # parser.py
  m = first.match(/^#\s*([^\s]+?\.[a-z0-9]+)\s*$/i);
  if (m && looksLikeFilePath(m[1])) {
    lines.splice(i, 1);
    return { path: normalizePath(m[1]), stripped: lines.join("\n").trim() };
  }

  // // filepath: src/x.ts
  m = first.match(/^\/\/\s*(?:filepath|path|file)\s*:\s*([^\s]+?\.[a-z0-9]+)\s*$/i);
  if (m && looksLikeFilePath(m[1])) {
    lines.splice(i, 1);
    return { path: normalizePath(m[1]), stripped: lines.join("\n").trim() };
  }

  return { path: null, stripped: content.trim() };
}

function pickNameForBlock(nameItems: NameItem[], blockIndex: number): NameItem | null {
  // closest unused behind
  for (let i = nameItems.length - 1; i >= 0; i--) {
    const n = nameItems[i];
    if (n.used) continue;
    if (n.index < blockIndex) {
      n.used = true;
      return n;
    }
  }
  // next unused ahead
  for (let i = 0; i < nameItems.length; i++) {
    const n = nameItems[i];
    if (n.used) continue;
    if (n.index > blockIndex) {
      n.used = true;
      return n;
    }
  }
  return null;
}

export function parseGeminiOutput(input: string): ParsedResult {
  const files: ParsedFile[] = [];
  let folderStructure: string | null = null;

  // 1) extract folder structure block (first ```text ... ```)
  const folderStructureRegex = /```text\n([\s\S]*?)```/g;
  const folderMatch = folderStructureRegex.exec(input);
  let workingInput = input;

  if (folderMatch) {
    folderStructure = folderMatch[1].trim();
    // remove it from pairing scan
    const start = folderMatch.index;
    const end = start + folderMatch[0].length;
    workingInput = input.slice(0, start) + "\n" + input.slice(end);
  }

  // 2) scan all code blocks once (in order)
  const codeBlocks: CodeBlock[] = [];
  const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cb: RegExpExecArray | null;

  while ((cb = codeBlockRegex.exec(workingInput)) !== null) {
    const header = cb[1] ?? "";
    const content = (cb[2] ?? "").trim();

    const parsed = parseFenceHeader(header);
    codeBlocks.push({
      header,
      lang: parsed.lang,
      explicitPath: parsed.path,
      content,
      index: cb.index,
    });
  }

  // 3) scan for filename/path mentions (order matters)
  const nameItems: NameItem[] = [];

  // backticks: `components/Button.tsx`
  const backtickPathRegex = /`([^`]+?\.[a-zA-Z0-9]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = backtickPathRegex.exec(workingInput)) !== null) {
    const cand = normalizePath(m[1]);
    if (looksLikeFilePath(cand)) nameItems.push({ value: cand, index: m.index, used: false });
  }

  // bold/italic markdown: **components/Button.tsx** or *components/Button.tsx*
  const emphasizedPathRegex = /(\*\*|\*|__|_)\s*([^*_`]+?\.[a-zA-Z0-9]+)\s*\1/g;
  while ((m = emphasizedPathRegex.exec(workingInput)) !== null) {
    const cand = normalizePath(m[2]);
    if (looksLikeFilePath(cand)) nameItems.push({ value: cand, index: m.index, used: false });
  }

  // plain "file named components/Button.tsx" etc (simple path tokens)
  const tokenPathRegex = /\b([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)\b/g;
  while ((m = tokenPathRegex.exec(workingInput)) !== null) {
    const cand = normalizePath(m[1]);
    if (looksLikeFilePath(cand)) nameItems.push({ value: cand, index: m.index, used: false });
  }

  nameItems.sort((a, b) => a.index - b.index);

  // 4) build files in code-block order
  const seen = new Set<string>();
  let untitledCounter = 0;

  for (const block of codeBlocks) {
    // A) explicit path from header: ```lang:path
    let filepath: string | null = block.explicitPath ? normalizePath(block.explicitPath) : null;
    let content = block.content;

    // B) first line comment inside block (only if no explicit header path)
    if (!filepath) {
      const extracted = extractLeadingFilenameComment(content);
      if (extracted.path) {
        filepath = extracted.path;
        content = extracted.stripped; // IMPORTANT: strips comment (test expects this)
      } else {
        content = extracted.stripped;
      }
    }

    // C) pairing from surrounding text (behind else ahead)
    if (!filepath) {
      const name = pickNameForBlock(nameItems, block.index);
      if (name) filepath = normalizePath(name.value);
    }

    // D) fallback untitled names
    if (!filepath) {
      untitledCounter += 1;
      const ext = extFromLang(block.lang);
      filepath = `untitled_${untitledCounter}.${ext}`;
    }

    // language resolution
    const language = block.lang || detectLanguage(filepath);

    // avoid duplicates (keep first occurrence)
    if (seen.has(filepath)) continue;
    seen.add(filepath);

    files.push({
      path: filepath,
      content: content.trim(),
      language,
    });
  }

  // sort for stable output
  files.sort((a, b) => a.path.localeCompare(b.path));

  return { files, folderStructure };
}

export function buildFileTree(files: ParsedFile[]): Map<string, ParsedFile[]> {
  const tree = new Map<string, ParsedFile[]>();

  for (const file of files) {
    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    if (!tree.has(folder)) tree.set(folder, []);
    tree.get(folder)!.push(file);
  }

  return tree;
}
````

### Notes on why this passes your tests

* **Test 1**: `// parser.ts` gets extracted by `extractLeadingFilenameComment()` and removed from content.
* **Test 2**: ` ```typescript:src/utils/helper.ts` is parsed by `parseFenceHeader()`.
* **Test 3**: `**components/Button.tsx**` is captured by `emphasizedPathRegex` and paired to the following code block.
* **Test 4**: missing path + `css` language → `extFromLang("css")` gives `.css` → `untitled_1.css`.
* **Test 5**: bash block w/o path becomes `untitled_1.sh` (or later number), so `files.length > 0` holds.

If you want bash/install-command blocks to be *ignored* instead of saved as untitled scripts, tell me the exact ignore rules you want (e.g. ignore if it starts with `npm install`, `yarn add`, `pnpm add`, etc.) and I’ll add a clean filter.
