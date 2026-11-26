import { z } from 'zod';
import rawAssetsManifest from '../../generated/assets.json';

export const AssetFileSchema = z.object({
  src: z.string().min(1),
  title: z.string().min(1),
});

export const DiagramAssetSchema = z.object({
  src: z.string().min(1),
  caption: z.string().min(1),
  alt: z.string().min(1),
});

export const ExperimentAssetsSchema = z.object({
  pdf: AssetFileSchema.optional(),
  diagrams: z.array(DiagramAssetSchema).default([]),
});

export const AssetManifestSchema = z.object({
  commonPdf: AssetFileSchema.optional(),
  experiments: z.record(z.string(), ExperimentAssetsSchema),
});

export type AssetFile = z.infer<typeof AssetFileSchema>;
export type DiagramAsset = z.infer<typeof DiagramAssetSchema>;
export type ExperimentAssets = z.infer<typeof ExperimentAssetsSchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/**
 * Returns { pdf, diagrams } for an experiment with safe empty defaults when
 * the experiment or asset file is missing from the manifest.
 */
export function getExperimentAssets(
  manifest: AssetManifest | null | undefined,
  experimentId: string,
): ExperimentAssets {
  const entry = manifest?.experiments?.[experimentId];
  return {
    pdf: entry?.pdf,
    diagrams: entry?.diagrams ?? [],
  };
}

/**
 * Resolves a manifest-relative path (under `public/`) against the runtime
 * base URL so assets work both at `/` and when hosted under a subpath.
 */
export function resolvePublicAssetUrl(
  relativeSrc: string,
  baseUrl = '/',
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanRel = relativeSrc.replace(/^\/+/, '');
  return `${normalizedBase}${cleanRel}`;
}

export const ASSET_MANIFEST: AssetManifest =
  AssetManifestSchema.parse(rawAssetsManifest);
