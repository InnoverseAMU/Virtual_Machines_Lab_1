export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface UiThemeTokens {
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
 * High-contrast net wire colors (>= 3:1 contrast against both dark #332a23
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
      panel: 'rgba(15, 23, 42, 0.88)',
      panelHover: '#1e293b',
      text: '#f8fafc',
      textMuted: '#cbd5e1',
      border: 'rgba(71, 85, 105, 0.85)',
      accent: '#0ea5e9',
      accentText: '#020617',
      tooltipBg: 'rgba(15, 23, 42, 0.96)',
      tooltipText: '#f8fafc',
      tooltipBorder: '#475569',
    },
    scene: {
      background: '#131c2e',
      fog: '#131c2e',
      floor: '#0f172a',
      benchTop: '#332a23',
      benchEdge: '#64748b',
      benchLegs: '#1e293b',
      ambientColor: '#ffffff',
      ambientIntensity: 0.78,
      hemisphereSky: '#e2e8f0',
      hemisphereGround: '#334155',
      hemisphereIntensity: 0.56,
      keyLightColor: '#fffbeb',
      keyLightIntensity: 1.55,
      fillLightColor: '#cbd5e1',
      fillLightIntensity: 0.65,
    },
  },
  light: {
    ui: {
      panel: 'rgba(255, 255, 255, 0.9)',
      panelHover: '#e2e8f0',
      text: '#0f172a',
      textMuted: '#334155',
      border: 'rgba(148, 163, 184, 0.85)',
      accent: '#0284c7',
      accentText: '#ffffff',
      tooltipBg: 'rgba(255, 255, 255, 0.97)',
      tooltipText: '#0f172a',
      tooltipBorder: '#94a3b8',
    },
    scene: {
      background: '#dbe4ee',
      fog: '#dbe4ee',
      floor: '#cbd5e1',
      benchTop: '#f1f5f9',
      benchEdge: '#94a3b8',
      benchLegs: '#475569',
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
