import { describe, expect, it } from 'vitest';
import {
  NET_WIRE_COLORS,
  TERMINAL_SELECTED_COLOR,
  THEME_TOKENS,
} from '../theme/tokens';

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const c = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('Theme token parity and contrast', () => {
  it('dark and light token sets define the exact same keys', () => {
    const darkTop = Object.keys(THEME_TOKENS.dark).sort();
    const lightTop = Object.keys(THEME_TOKENS.light).sort();
    expect(darkTop).toEqual(lightTop);

    const darkUi = Object.keys(THEME_TOKENS.dark.ui).sort();
    const lightUi = Object.keys(THEME_TOKENS.light.ui).sort();
    expect(darkUi).toEqual(lightUi);

    const darkScene = Object.keys(THEME_TOKENS.dark.scene).sort();
    const lightScene = Object.keys(THEME_TOKENS.light.scene).sort();
    expect(darkScene).toEqual(lightScene);
  });

  it('wire colors and selected terminal highlight have >= 3:1 contrast on both benches', () => {
    const darkBench = THEME_TOKENS.dark.scene.benchTop;
    const lightBench = THEME_TOKENS.light.scene.benchTop;

    for (const color of [...NET_WIRE_COLORS, TERMINAL_SELECTED_COLOR]) {
      expect(contrastRatio(color, darkBench), `${color} vs dark bench`).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(color, lightBench), `${color} vs light bench`).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('tooltip text has >= 4.5:1 contrast against tooltip background in both themes', () => {
    expect(contrastRatio('#f8fafc', '#0f172a')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#0f172a', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
