import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_EXPERIMENTS_DIR = path.join(REPO_ROOT, 'public', 'experiments');
export const DEFAULT_CAPTIONS_PATH = path.join(
  REPO_ROOT,
  'src',
  'core',
  'experiments',
  'diagramCaptions.json',
);
export const DEFAULT_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'src',
  'generated',
  'assets.json',
);

export const PDF_WARN_BYTES = 5 * 1024 * 1024;
export const IMAGE_WARN_BYTES = 3 * 1024 * 1024;
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.webp',
  '.jpg',
  '.jpeg',
  '.svg',
]);

// Mirror of registry titles so the generator stays pure Node without TypeScript imports.
export const EXPERIMENT_TITLES = {
  'ex3.1': 'Load test of single-phase transformer',
  'ex3.2': 'Open-circuit and short-circuit tests of single-phase transformer',
  'ex3.3': "Sumpner's test of single-phase transformer",
  'ex3.4': 'Parallel operation of single-phase transformers',
  'ex3.5': 'Study of various three-phase transformer connections',
  'ex3.6': 'Phase-transformation',
  'ex4.1': 'Load test of three-phase induction motor',
  'ex4.2': 'No-load and blocked-rotor tests of three-phase induction motor',
  'ex4.5':
    'No-load and blocked-rotor test of single-phase capacitor-start induction motor',
};

function naturalCompare(a, b) {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

function shouldIgnoreFileName(name) {
  if (!name || name.startsWith('.')) return true;
  const lower = name.toLowerCase();
  return lower === '.gitkeep' || lower === 'readme' || lower.startsWith('readme.');
}

function encodeRelativePublicPath(...segments) {
  return segments.map((seg) => encodeURIComponent(seg)).join('/');
}

/**
 * Converts folder names like `ex3-1` -> `ex3.1`.
 */
export function folderToExperimentId(folderName) {
  const match = /^ex(\d+)-(\d+)$/i.exec(folderName);
  if (!match) return null;
  return `ex${match[1]}.${match[2]}`;
}

/**
 * Derives a human-readable figure caption from a filename stem when missing
 * from diagramCaptions.json (e.g. `fig-3-1-1` -> `Figure 3.1.1`).
 */
export function deriveDiagramCaption(stem) {
  const figMatch = /^fig-(.+)$/i.exec(stem);
  if (figMatch) {
    return `Figure ${figMatch[1].replace(/-/g, '.')}`;
  }
  return stem.replace(/[-_]+/g, ' ').trim() || 'Circuit diagram';
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function loadCaptionsMap(captionsPath = DEFAULT_CAPTIONS_PATH) {
  try {
    const raw = fs.readFileSync(captionsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function selectExperimentPdf(folderName, pdfFiles, warn) {
  if (pdfFiles.length === 0) return null;
  const sorted = [...pdfFiles].sort(naturalCompare);

  const exactFolderPdf = `${folderName.toLowerCase()}.pdf`;
  const byFolderName = sorted.find((f) => f.toLowerCase() === exactFolderPdf);
  if (byFolderName) return byFolderName;

  const hyphenParts = /^ex(\d+)-(\d+)$/i.exec(folderName);
  if (hyphenParts) {
    const dashedPdf = `ex-${hyphenParts[1]}-${hyphenParts[2]}.pdf`.toLowerCase();
    const byDashedName = sorted.find((f) => f.toLowerCase() === dashedPdf);
    if (byDashedName) return byDashedName;
  }

  if (sorted.length === 1) {
    return sorted[0];
  }

  warn(
    `Multiple PDFs found in ${folderName} (${sorted.join(', ')}) and none matched ${folderName}.pdf; using ${sorted[0]}.`,
  );
  return sorted[0];
}

/**
 * Scans `experimentsDir` and builds a deterministic asset manifest JSON object.
 * Never throws on missing directories/files; logs warnings for oversized assets.
 */
export function buildAssetManifest({
  experimentsDir = DEFAULT_EXPERIMENTS_DIR,
  captions = loadCaptionsMap(),
  titles = EXPERIMENT_TITLES,
  warn = (msg) => console.warn(`[generate-assets] ${msg}`),
} = {}) {
  const manifest = {
    experiments: {},
  };

  if (!fs.existsSync(experimentsDir)) {
    return manifest;
  }

  // Common PDF: public/experiments/common/general-instructions.pdf
  const commonPdfPath = path.join(
    experimentsDir,
    'common',
    'general-instructions.pdf',
  );
  if (fs.existsSync(commonPdfPath)) {
    try {
      const stat = fs.statSync(commonPdfPath);
      if (stat.isFile()) {
        if (stat.size > PDF_WARN_BYTES) {
          warn(
            `common/general-instructions.pdf is ${(stat.size / (1024 * 1024)).toFixed(2)} MB (> 5 MB).`,
          );
        }
        manifest.commonPdf = {
          src: encodeRelativePublicPath(
            'experiments',
            'common',
            'general-instructions.pdf',
          ),
          title: 'General instructions (PDF)',
        };
      }
    } catch {
      // Ignore unreadable file
    }
  }

  const rootEntries = safeReadDir(experimentsDir)
    .filter((d) => d.isDirectory() && !shouldIgnoreFileName(d.name))
    .map((d) => d.name)
    .sort(naturalCompare);

  const rawExperiments = {};

  for (const folderName of rootEntries) {
    if (folderName === 'common') continue;
    const expId = folderToExperimentId(folderName);
    if (!expId) continue;

    const expDir = path.join(experimentsDir, folderName);
    const expFiles = safeReadDir(expDir)
      .filter((d) => d.isFile() && !shouldIgnoreFileName(d.name))
      .map((d) => d.name);

    const pdfCandidates = expFiles.filter((name) =>
      name.toLowerCase().endsWith('.pdf'),
    );
    const chosenPdfName = selectExperimentPdf(folderName, pdfCandidates, warn);

    let pdf;
    if (chosenPdfName) {
      const fullPdfPath = path.join(expDir, chosenPdfName);
      try {
        const stat = fs.statSync(fullPdfPath);
        if (stat.isFile()) {
          if (stat.size > PDF_WARN_BYTES) {
            warn(
              `${folderName}/${chosenPdfName} is ${(stat.size / (1024 * 1024)).toFixed(2)} MB (> 5 MB).`,
            );
          }
          const expTitle = titles[expId] ?? `Experiment ${expId.replace(/^ex/, '')}`;
          pdf = {
            src: encodeRelativePublicPath('experiments', folderName, chosenPdfName),
            title: `${expTitle} (PDF)`,
          };
        }
      } catch {
        // Ignore stat failure
      }
    }

    const diagramsDir = path.join(expDir, 'diagrams');
    const diagramFiles = safeReadDir(diagramsDir)
      .filter((d) => d.isFile() && !shouldIgnoreFileName(d.name))
      .map((d) => d.name)
      .filter((name) =>
        SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()),
      )
      .sort(naturalCompare);

    const diagrams = [];
    for (const fileName of diagramFiles) {
      const fullImgPath = path.join(diagramsDir, fileName);
      try {
        const stat = fs.statSync(fullImgPath);
        if (!stat.isFile()) continue;
        if (stat.size > IMAGE_WARN_BYTES) {
          warn(
            `${folderName}/diagrams/${fileName} is ${(stat.size / (1024 * 1024)).toFixed(2)} MB (> 3 MB).`,
          );
        }
      } catch {
        continue;
      }

      const stem = path.basename(fileName, path.extname(fileName));
      const captionKey = `${folderName}/${stem}`;
      const caption =
        typeof captions[captionKey] === 'string' && captions[captionKey].trim()
          ? captions[captionKey].trim()
          : deriveDiagramCaption(stem);

      diagrams.push({
        src: encodeRelativePublicPath(
          'experiments',
          folderName,
          'diagrams',
          fileName,
        ),
        caption,
        alt: caption,
      });
    }

    const entry = {};
    if (pdf) entry.pdf = pdf;
    entry.diagrams = diagrams;
    rawExperiments[expId] = entry;
  }

  for (const key of Object.keys(rawExperiments).sort(naturalCompare)) {
    manifest.experiments[key] = rawExperiments[key];
  }

  return manifest;
}

export function serializeAssetManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function writeAssetManifest({
  experimentsDir = DEFAULT_EXPERIMENTS_DIR,
  captionsPath = DEFAULT_CAPTIONS_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
  warn = (msg) => console.warn(`[generate-assets] ${msg}`),
} = {}) {
  const captions = loadCaptionsMap(captionsPath);
  const manifest = buildAssetManifest({ experimentsDir, captions, warn });
  const serialized = serializeAssetManifest(manifest);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, 'utf8')
    : null;
  if (existing !== serialized) {
    fs.writeFileSync(outputPath, serialized, 'utf8');
  }
  return { manifest, serialized };
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCli) {
  const { manifest } = writeAssetManifest();
  const expCount = Object.keys(manifest.experiments).length;
  const diagramCount = Object.values(manifest.experiments).reduce(
    (sum, item) => sum + item.diagrams.length,
    0,
  );
  console.log(
    `Generated src/generated/assets.json (${expCount} experiments, ${diagramCount} diagrams${manifest.commonPdf ? ', commonPdf' : ''}).`,
  );
}
