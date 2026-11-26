export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface UiThemeTokens {
  pageBg: string;
  panel: string;
  panelHover: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentText: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
}

export interface SceneThemeTokens {
  background: string;
  fog: string;
  floor: string;
  benchTop: string;
  benchEdge: string;
  benchLegs: string;
  ambientColor: string;
  ambientIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  keyLightColor: string;
  keyLightIntensity: number;
  fillLightColor: string;
  fillLightIntensity: number;
}

export interface ThemeTokens {
  ui: UiThemeTokens;
  scene: SceneThemeTokens;
}

/**
 * High-contrast net wire colors (>= 3:1 contrast against both dark #0e1726
 * and light #f1f5f9 benches).
 */
export const NET_WIRE_COLORS = [
  '#f43f5e', // rose-crimson
  '#3b82f6', // cobalt blue
  '#c26a06', // deep amber
  '#059669', // emerald
  '#a855f7', // violet
  '#0891b2', // cyan-teal
  '#ec4899', // magenta
  '#ea580c', // orange
] as const;

export const TERMINAL_SELECTED_COLOR = '#0284c7';

export const THEME_TOKENS: Record<ResolvedTheme, ThemeTokens> = {
  dark: {
    ui: {
      pageBg: '#04070b',
      panel: 'rgba(11, 16, 27, 0.92)',
      panelHover: '#131d31',
      text: '#f8fafc',
      textMuted: '#cbd5e1',
      border: 'rgba(56, 189, 248, 0.24)',
      accent: '#00f2fe',
      accentText: '#020617',
      tooltipBg: 'rgba(11, 16, 27, 0.97)',
      tooltipText: '#f8fafc',
      tooltipBorder: 'rgba(56, 189, 248, 0.35)',
    },
    scene: {
      background: '#050911',
      fog: '#050911',
      floor: '#04070b',
      benchTop: '#0e1726',
      benchEdge: '#164e63',
      benchLegs: '#0a111d',
      ambientColor: '#e0f2fe',
      ambientIntensity: 0.85,
      hemisphereSky: '#e2e8f0',
      hemisphereGround: '#0f172a',
      hemisphereIntensity: 0.58,
      keyLightColor: '#fffbeb',
      keyLightIntensity: 1.62,
      fillLightColor: '#bae6fd',
      fillLightIntensity: 0.68,
    },
  },
  light: {
    ui: {
      pageBg: '#f4f7fb',
      panel: 'rgba(255, 255, 255, 0.94)',
      panelHover: '#e2e8f0',
      text: '#0f172a',
      textMuted: '#334155',
      border: 'rgba(148, 163, 184, 0.65)',
      accent: '#0284c7',
      accentText: '#ffffff',
      tooltipBg: 'rgba(255, 255, 255, 0.97)',
      tooltipText: '#0f172a',
      tooltipBorder: '#94a3b8',
    },
    scene: {
      background: '#dbe6f2',
      fog: '#dbe6f2',
      floor: '#cbd5e1',
      benchTop: '#f1f5f9',
      benchEdge: '#0284c7',
      benchLegs: '#334155',
      ambientColor: '#ffffff',
      ambientIntensity: 0.85,
      hemisphereSky: '#ffffff',
      hemisphereGround: '#cbd5e1',
      hemisphereIntensity: 0.65,
      keyLightColor: '#ffffff',
      keyLightIntensity: 1.45,
      fillLightColor: '#bae6fd',
      fillLightIntensity: 0.45,
    },
  },
};
