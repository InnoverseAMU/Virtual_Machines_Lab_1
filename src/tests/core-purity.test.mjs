import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walkTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('Pure core import boundary', () => {
  it('nothing under src/core imports react, three, @react-three/*, or zustand', () => {
    const coreDir = path.resolve(process.cwd(), 'src/core');
    const files = walkTsFiles(coreDir);
    expect(files.length).toBeGreaterThan(0);

    const forbidden =
      /from\s+['"](react|react-dom|three|@react-three\/[^'"]+|zustand[^'"]*)['"]/;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(
        forbidden.test(content),
        `Forbidden UI/3D/store import in pure core file: ${path.relative(process.cwd(), file)}`,
      ).toBe(false);
    }
  });
});
