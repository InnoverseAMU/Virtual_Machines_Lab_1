import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAssetManifest,
  deriveDiagramCaption,
  folderToExperimentId,
  IMAGE_WARN_BYTES,
  PDF_WARN_BYTES,
  serializeAssetManifest,
} from '../../scripts/generate-assets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vml-assets-gen-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Asset manifest generator (scripts/generate-assets.mjs)', () => {
  it('handles missing root directory cleanly', () => {
    const missing = path.join(os.tmpdir(), `does-not-exist-${Date.now()}`);
    const manifest = buildAssetManifest({ experimentsDir: missing });
    expect(manifest).toEqual({ experiments: {} });
  });

  it('maps hyphenated folder ids to dotted experiment ids and derives missing captions', () => {
    expect(folderToExperimentId('ex3-1')).toBe('ex3.1');
    expect(folderToExperimentId('ex4-5')).toBe('ex4.5');
    expect(folderToExperimentId('common')).toBeNull();
    expect(deriveDiagramCaption('fig-3-1-1')).toBe('Figure 3.1.1');
    expect(deriveDiagramCaption('fig-4-5-12')).toBe('Figure 4.5.12');
  });

  it('scans fixture folders deterministically, ignores junk files, sorts naturally, and prefers folder PDFs', () => {
    const root = makeTempDir();
    const warnings = [];

    fs.mkdirSync(path.join(root, 'common'), { recursive: true });
    fs.writeFileSync(path.join(root, 'common', 'general-instructions.pdf'), 'pdf');

    // ex3-1 has both ex3-1.pdf and ex-3-1.pdf -> prefers ex3-1.pdf
    const ex31 = path.join(root, 'ex3-1');
    fs.mkdirSync(path.join(ex31, 'diagrams'), { recursive: true });
    fs.writeFileSync(path.join(ex31, '.gitkeep'), '');
    fs.writeFileSync(path.join(ex31, 'README.md'), 'ignore');
    fs.writeFileSync(path.join(ex31, 'ex3-1.pdf'), 'preferred');
    fs.writeFileSync(path.join(ex31, 'ex-3-1.pdf'), 'fallback');
    fs.writeFileSync(path.join(ex31, 'diagrams', '.gitkeep'), '');
    fs.writeFileSync(path.join(ex31, 'diagrams', 'notes.txt'), 'unsupported');
    fs.writeFileSync(path.join(ex31, 'diagrams', 'fig-3-1-10.png'), 'png10');
    fs.writeFileSync(path.join(ex31, 'diagrams', 'fig-3-1-2.webp'), 'webp2');
    fs.writeFileSync(path.join(ex31, 'diagrams', 'fig-3-1-1.png'), 'png1');

    // ex3-2 has only ex-3-2.pdf + known and fallback captions
    const ex32 = path.join(root, 'ex3-2');
    fs.mkdirSync(path.join(ex32, 'diagrams'), { recursive: true });
    fs.writeFileSync(path.join(ex32, 'ex-3-2.pdf'), 'dashed');
    fs.writeFileSync(path.join(ex32, 'diagrams', 'fig-3-2-7.png'), 'known');
    fs.writeFileSync(path.join(ex32, 'diagrams', 'fig-3-2-99.svg'), 'custom');

    // ex3-3 has two non-matching PDFs -> deterministically picks first & warns
    const ex33 = path.join(root, 'ex3-3');
    fs.mkdirSync(ex33, { recursive: true });
    fs.writeFileSync(path.join(ex33, 'b-manual.pdf'), 'b');
    fs.writeFileSync(path.join(ex33, 'a-manual.pdf'), 'a');

    // ex4-5 empty folder -> diagrams: [] and no pdf
    fs.mkdirSync(path.join(root, 'ex4-5'), { recursive: true });

    const manifest = buildAssetManifest({
      experimentsDir: root,
      warn: (msg) => warnings.push(msg),
    });

    expect(manifest.commonPdf).toEqual({
      src: 'experiments/common/general-instructions.pdf',
      title: 'General instructions (PDF)',
    });
    expect(manifest.experiments['ex3.1'].pdf?.src).toBe(
      'experiments/ex3-1/ex3-1.pdf',
    );
    expect(manifest.experiments['ex3.1'].diagrams.map((d) => d.src)).toEqual([
      'experiments/ex3-1/diagrams/fig-3-1-1.png',
      'experiments/ex3-1/diagrams/fig-3-1-2.webp',
      'experiments/ex3-1/diagrams/fig-3-1-10.png',
    ]);
    expect(manifest.experiments['ex3.1'].diagrams[0].caption).toBe(
      'Fig. 3.1.1 Circuit diagram for load-test of a transformer',
    );
    expect(manifest.experiments['ex3.1'].diagrams[1].caption).toBe('Figure 3.1.2');
    expect(manifest.experiments['ex3.1'].diagrams[1].alt).toBe('Figure 3.1.2');

    expect(manifest.experiments['ex3.2'].pdf?.src).toBe(
      'experiments/ex3-2/ex-3-2.pdf',
    );
    expect(manifest.experiments['ex3.2'].diagrams[1].caption).toBe('Figure 3.2.99');

    expect(manifest.experiments['ex3.3'].pdf?.src).toBe(
      'experiments/ex3-3/a-manual.pdf',
    );
    expect(manifest.experiments['ex4.5']).toEqual({ diagrams: [] });
    expect(warnings.length).toBe(1);

    const first = serializeAssetManifest(manifest);
    const second = serializeAssetManifest(
      buildAssetManifest({ experimentsDir: root, warn: () => {} }),
    );
    expect(first).toBe(second);
    expect(first.includes('\r\n')).toBe(false);
  });

  it('prints warnings without throwing when PDF or image exceeds size thresholds', () => {
    const root = makeTempDir();
    const warnings = [];
    const ex31 = path.join(root, 'ex3-1');
    fs.mkdirSync(path.join(ex31, 'diagrams'), { recursive: true });

    const pdfPath = path.join(ex31, 'ex3-1.pdf');
    fs.writeFileSync(pdfPath, '');
    fs.truncateSync(pdfPath, PDF_WARN_BYTES + 1);

    const imgPath = path.join(ex31, 'diagrams', 'fig-3-1-1.png');
    fs.writeFileSync(imgPath, '');
    fs.truncateSync(imgPath, IMAGE_WARN_BYTES + 1);

    const manifest = buildAssetManifest({
      experimentsDir: root,
      warn: (msg) => warnings.push(msg),
    });
    expect(manifest.experiments['ex3.1'].pdf).toBeDefined();
    expect(manifest.experiments['ex3.1'].diagrams).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it('URL-encodes filenames with spaces', () => {
    const root = makeTempDir();
    const ex31 = path.join(root, 'ex3-1', 'diagrams');
    fs.mkdirSync(ex31, { recursive: true });
    fs.writeFileSync(path.join(ex31, 'fig 3-1-1.png'), 'img');

    const manifest = buildAssetManifest({ experimentsDir: root, warn: () => {} });
    expect(manifest.experiments['ex3.1'].diagrams[0].src).toBe(
      'experiments/ex3-1/diagrams/fig%203-1-1.png',
    );
  });

  it('committed src/generated/assets.json equals live generator output for public/experiments', () => {
    const generatedPath = path.join(REPO_ROOT, 'src', 'generated', 'assets.json');
    const committedText = fs.readFileSync(generatedPath, 'utf8');
    const freshManifest = buildAssetManifest({
      experimentsDir: path.join(REPO_ROOT, 'public', 'experiments'),
    });
    const freshText = serializeAssetManifest(freshManifest);
    expect(committedText).toBe(freshText);
  });
});
