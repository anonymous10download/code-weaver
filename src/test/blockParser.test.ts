import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "../lib/blockParser";

describe("extractCodeBlocks", () => {
  it("should extract a single code block with language", () => {
    const markdown = `
# My AI Project

Here is a python function:

\`\`\`python
def hello_world():
    print("Hello AI")
\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("python");
    expect(result[0].content).toBe('def hello_world():\n    print("Hello AI")');
    expect(result[0].first_line_idx).toBe(5);
    expect(result[0].last_line_idx).toBe(8);
  });

  it("should extract multiple code blocks", () => {
    const markdown = `
# My AI Project

Here is a python function:

\`\`\`python
def hello_world():
    print("Hello AI")
\`\`\`

And here is some JSON configuration:

\`\`\`json
{
  "model": "gemini-1.5-pro",
  "temperature": 0.7
}
\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(2);

    // First block
    expect(result[0].language).toBe("python");
    expect(result[0].content).toBe('def hello_world():\n    print("Hello AI")');

    // Second block
    expect(result[1].language).toBe("json");
    expect(result[1].content).toContain('"model": "gemini-1.5-pro"');
    expect(result[1].content).toContain('"temperature": 0.7');
  });

  it("should handle code blocks without language specification", () => {
    const markdown = `
\`\`\`
plain code block
\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("plaintext");
    expect(result[0].content).toBe("plain code block");
  });

  it("should handle tildes as fence markers", () => {
    const markdown = `
~~~javascript
console.log("test");
~~~
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("javascript");
    expect(result[0].content).toBe('console.log("test");');
  });

  it("should not close block if fence types don't match", () => {
    const markdown = `
\`\`\`python
def test():
~~~
    pass
\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("~~~");
  });

  it("should return empty array for markdown without code blocks", () => {
    const markdown = `
# Just a heading

Some regular text without any code blocks.
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(0);
  });

  it("should handle empty code blocks", () => {
    const markdown = `
\`\`\`javascript
\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("javascript");
    expect(result[0].content).toBe("");
  });

  it("should handle code blocks with longer fences", () => {
    const markdown = `
\`\`\`\`typescript
const x = 1;
\`\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("typescript");
    expect(result[0].content).toBe("const x = 1;");
  });

  it("should preserve indentation in code blocks", () => {
    const markdown = `
\`\`\`python
def test():
    if True:
        print("indented")
\`\`\`
`;

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('def test():\n    if True:\n        print("indented")');
  });

  it("should handle Windows line endings", () => {
    const markdown = "```javascript\r\nconsole.log('test');\r\n```";

    const result = extractCodeBlocks(markdown);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe("javascript");
    expect(result[0].content).toBe("console.log('test');");
  });
});
