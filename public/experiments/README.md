# Experiment Assets (`public/experiments/`)

Circuit diagrams and lab manual PDFs in this directory are scanned automatically into `src/generated/assets.json` by `scripts/generate-assets.mjs`.

## Folder Layout

```text
public/experiments/
  common/
    general-instructions.pdf
  ex3-1/
    ex3-1.pdf          # or ex-3-1.pdf
    diagrams/
      fig-3-1-1.png
  ex3-2/
    ex3-2.pdf          # or ex-3-2.pdf
    diagrams/
      fig-3-2-7.png
      fig-3-2-8.png
  ...
```

Folder names use hyphens and map automatically to dotted experiment IDs (`ex3-1` → `ex3.1`, `ex4-5` → `ex4.5`).

## Naming & Formats

- **Common PDF**: `public/experiments/common/general-instructions.pdf`
- **Experiment PDF**: `<folder>.pdf` (for example `ex3-1/ex3-1.pdf`) or `ex-<part1>-<part2>.pdf` (for example `ex3-1/ex-3-1.pdf`).
  - Keep PDFs under **5 MB** (larger files trigger a build warning).
- **Circuit diagrams**: place images under `public/experiments/<folder>/diagrams/` named with `fig-` and hyphens (for example `fig-3-1-1.png`).
  - Supported formats: `.png`, `.webp`, `.jpg`, `.jpeg`, `.svg`.
  - Keep images under **3 MB** (larger files trigger a build warning).
  - Recommended target width: ~1200–2000 px on crisp light/white backgrounds.
  - `.gitkeep`, `README*`, dotfiles, and unsupported extensions are ignored.

## Adding or Updating Files

1. Drop the new PDF or diagram image into the appropriate folder above.
2. Run `npm run assets:generate` or restart `npm run dev` (and `npm run build`) so `src/generated/assets.json` updates automatically.
3. Optional: add a custom caption in `src/core/experiments/diagramCaptions.json` keyed by `<folder>/<filename-without-ext>` (for example `"ex3-1/fig-3-1-1"`). If omitted, a default caption is derived from the filename (`fig-3-1-1` → `Figure 3.1.1`).
