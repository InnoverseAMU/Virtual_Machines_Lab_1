import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST,
  AssetManifestSchema,
  getExperimentAssets,
  resolvePublicAssetUrl,
} from '../core/experiments/assets';

describe('Asset manifest schema and core helpers', () => {
  it('validates the generated ASSET_MANIFEST against AssetManifestSchema', () => {
    const parsed = AssetManifestSchema.safeParse(ASSET_MANIFEST);
    expect(parsed.success).toBe(true);
    expect(ASSET_MANIFEST.commonPdf?.src).toBe(
      'experiments/common/lab-manual.pdf',
    );
    expect(ASSET_MANIFEST.commonPdf?.title).toBe('Lab Manual (PDF)');
  });

  it('returns safe empty defaults from getExperimentAssets when missing', () => {
    expect(getExperimentAssets(undefined, 'ex3.1')).toEqual({
      pdf: undefined,
      diagrams: [],
    });
    expect(getExperimentAssets(null, 'ex3.1')).toEqual({
      pdf: undefined,
      diagrams: [],
    });
    expect(getExperimentAssets(ASSET_MANIFEST, 'ex9.9')).toEqual({
      pdf: undefined,
      diagrams: [],
    });
  });

  it('returns configured PDF and diagrams for existing experiments', () => {
    const ex31 = getExperimentAssets(ASSET_MANIFEST, 'ex3.1');
    expect(ex31.pdf?.src).toBe('experiments/ex3-1/ex-3-1.pdf');
    expect(ex31.diagrams).toHaveLength(1);
    expect(ex31.diagrams[0].caption).toBe(
      'Fig. 3.1.1 Circuit diagram for load-test of a transformer',
    );
  });

  it('resolvePublicAssetUrl prefixes relative paths with runtime BASE_URL', () => {
    expect(resolvePublicAssetUrl('experiments/ex3-1/ex-3-1.pdf', '/')).toBe(
      '/experiments/ex3-1/ex-3-1.pdf',
    );
    expect(
      resolvePublicAssetUrl('experiments/ex3-1/ex-3-1.pdf', '/vm-lab/'),
    ).toBe('/vm-lab/experiments/ex3-1/ex-3-1.pdf');
    expect(
      resolvePublicAssetUrl('/experiments/ex3-1/ex-3-1.pdf', '/vm-lab'),
    ).toBe('/vm-lab/experiments/ex3-1/ex-3-1.pdf');
  });
});
