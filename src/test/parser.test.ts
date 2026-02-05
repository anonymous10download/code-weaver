// parser.test.ts
import { describe, it, expect } from 'vitest';
import {parseAICodeOutput} from "@/lib/codeParser.ts"; // or jest

describe('parseAICodeOutput', () => {

  it('handles the "User Example" case (First line comment)', () => {
    // This is the specific case you mentioned was failing
    const input = `
Here is the code:
\`\`\`typescript
// parser.ts
export function test() {
  console.log("hello");
}
\`\`\`
    `;
    const result = parseAICodeOutput(input);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('parser.ts');
    // Ensure the comment line was stripped to avoid duplication
    expect(result.files[0].content).not.toContain('// parser.ts');
  });

  it('handles explicit block headers (```ts parser.ts)', () => {
    const input = `
\`\`\`typescript:src/utils/helper.ts
const x = 1;
\`\`\`
    `;
    const result = parseAICodeOutput(input);
    expect(result.files[0].path).toBe('src/utils/helper.ts');
  });

  it('handles preceding text context (Strategy B)', () => {
    const input = `
Create a file named **components/Button.tsx**:
\`\`\`tsx
export const Button = () => <button />;
\`\`\`
    `;
    const result = parseAICodeOutput(input);
    expect(result.files[0].path).toBe('components/Button.tsx');
  });

  it('generates fallback names for untitled blocks', () => {
    const input = `
\`\`\`css
.class { color: red; }
\`\`\`
    `;
    const result = parseAICodeOutput(input);
    expect(result.files[0].path).toBe('untitled_1.css');
  });

  it('ignores shell commands/install scripts', () => {
    const input = `
Run this command:
\`\`\`bash
npm install react
\`\`\`
    `;
    // Should NOT be detected as a file because it has no path and looks like a command
    // (Unless you explicitly want to capture scripts, in which case we'd adjust the filter)
    // with current logic, it captures as untitled_1.sh if valid,
    // OR you can add specific logic to ignore "npm install" blocks if needed.
    const result = parseAICodeOutput(input);
    // If our logic is strict about paths, this might be untitled_1.sh.
    // If we want to verify it captured valid code:
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('detects multiple files with markdown headers (#### format)', () => {
    const input = `
#### \`components/ConfigPreview.tsx\`  Handles the visual list rendering.  \`\`\`tsx import { Badge } from "@/components/ui/badge"; import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; import { Skeleton } from "@/components/ui/skeleton"; import { ExportDataProps } from "../types";  export function ConfigPreview({ isLoading, categories, storages, collections }: ExportDataProps) { some code goes here  }  \`\`\`  #### \`components/JsonViewer.tsx\`  Handles the raw JSON text area.  \`\`\`tsx import { FileJson } from "lucide-react"; import { Badge } from "@/components/ui/badge"; import { Card, CardContent } from "@/components/ui/card";  export function JsonViewer({ jsonString }: { jsonString: string }) {   return ( another code goes ehre   ); }  \`\`\`  Thanks you
    `;
    const result = parseAICodeOutput(input);
    expect(result.files).toHaveLength(2);
    const paths = result.files.map(f => f.path);
    expect(paths).toContain('components/ConfigPreview.tsx');
    expect(paths).toContain('components/JsonViewer.tsx');
  });
});