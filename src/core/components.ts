import type {
  ComponentInstance,
  ComponentType,
  ComponentTypeDef,
  ControlValues,
  TerminalId,
} from './types';

export const COMPONENT_DEFS: Record<ComponentType, ComponentTypeDef> = {
  acSupply: {
    type: 'acSupply',
    terminals: [
      { name: 'P', label: 'Phase (P)', localPos: [-0.18, 0.25, 0.37] },
      { name: 'N', label: 'Neutral (N)', localPos: [0.18, 0.25, 0.37] },
    ],
  },
  variac1ph: {
    type: 'variac1ph',
    terminals: [
      { name: 'IN_P', label: 'Input Phase (IN_P)', localPos: [-0.33, 0.16, 0.52] },
      { name: 'IN_N', label: 'Input Neutral (IN_N)', localPos: [-0.11, 0.16, 0.52] },
      { name: 'OUT_P', label: 'Output Phase (OUT_P)', localPos: [0.11, 0.16, 0.52] },
      { name: 'OUT_N', label: 'Output Neutral (OUT_N)', localPos: [0.33, 0.16, 0.52] },
    ],
    internalLinks: [['IN_N', 'OUT_N']],
  },
  wattmeter: {
    type: 'wattmeter',
    terminals: [
      { name: 'M', label: 'Mains (M)', localPos: [-0.33, 0.15, 0.47] },
      { name: 'L', label: 'Load (L)', localPos: [-0.11, 0.15, 0.47] },
      { name: 'V1', label: 'Voltage 1 (V1)', localPos: [0.11, 0.15, 0.47] },
      { name: 'V2', label: 'Voltage 2 (V2)', localPos: [0.33, 0.15, 0.47] },
    ],
  },
  transformer1ph: {
    type: 'transformer1ph',
    terminals: [
      { name: 'P1', label: 'Primary P1 (230 V)', localPos: [-0.39, 0.2, 0.52] },
      { name: 'P2', label: 'Primary P2 (230 V)', localPos: [-0.15, 0.2, 0.52] },
      { name: 'S1', label: 'Secondary S1 (115 V)', localPos: [0.15, 0.2, 0.52] },
      { name: 'S2', label: 'Secondary S2 (115 V)', localPos: [0.39, 0.2, 0.52] },
    ],
  },
  voltmeter: {
    type: 'voltmeter',
    terminals: [
      { name: 'A', label: 'Terminal A (+)', localPos: [-0.18, 0.15, 0.42] },
      { name: 'B', label: 'Terminal B (COM)', localPos: [0.18, 0.15, 0.42] },
    ],
  },
  ammeter: {
    type: 'ammeter',
    terminals: [
      { name: 'IN', label: 'Current IN', localPos: [-0.18, 0.15, 0.42] },
      { name: 'OUT', label: 'Current OUT', localPos: [0.18, 0.15, 0.42] },
    ],
  },
  lampLoad: {
    type: 'lampLoad',
    terminals: [
      { name: 'A', label: 'Load A', localPos: [-0.26, 0.18, 0.47] },
      { name: 'B', label: 'Load B', localPos: [0.26, 0.18, 0.47] },
    ],
  },
  rheostat: {
    type: 'rheostat',
    terminals: [
      { name: 'A', label: 'Rheostat A', localPos: [-0.26, 0.16, 0.42] },
      { name: 'B', label: 'Rheostat B', localPos: [0.26, 0.16, 0.42] },
    ],
  },
  acSupply3ph: {
    type: 'acSupply3ph',
    terminals: [
      { name: 'A', label: 'Phase R (A)', localPos: [-0.28, 0.2, 0.45] },
      { name: 'B', label: 'Phase Y (B)', localPos: [-0.08, 0.2, 0.45] },
      { name: 'C', label: 'Phase B (C)', localPos: [0.12, 0.2, 0.45] },
      { name: 'N', label: 'Neutral (N)', localPos: [0.34, 0.2, 0.45] },
    ],
  },
  variac3ph: {
    type: 'variac3ph',
    terminals: [
      { name: 'IN_A', label: '3φ In A', localPos: [-0.36, 0.34, 0.56] },
      { name: 'IN_B', label: '3φ In B', localPos: [-0.12, 0.34, 0.56] },
      { name: 'IN_C', label: '3φ In C', localPos: [0.12, 0.34, 0.56] },
      { name: 'OUT_A', label: '3φ Out A', localPos: [-0.36, -0.02, 0.56] },
      { name: 'OUT_B', label: '3φ Out B', localPos: [-0.12, -0.02, 0.56] },
      { name: 'OUT_C', label: '3φ Out C', localPos: [0.12, -0.02, 0.56] },
    ],
  },
  transformer3ph: {
    type: 'transformer3ph',
    terminals: [
      { name: 'A', label: 'Primary A', localPos: [-0.42, 0.38, 0.58] },
      { name: 'B', label: 'Primary B', localPos: [0, 0.38, 0.58] },
      { name: 'C', label: 'Primary C', localPos: [0.42, 0.38, 0.58] },
      { name: 'T1', label: 'Secondary T1', localPos: [-0.75, 0.08, 0.58] },
      { name: 'T2', label: 'Secondary T2', localPos: [-0.45, 0.08, 0.58] },
      { name: 'T3', label: 'Secondary T3', localPos: [-0.15, 0.08, 0.58] },
      { name: 'T4', label: 'Secondary T4', localPos: [0.15, 0.08, 0.58] },
      { name: 'T5', label: 'Secondary T5', localPos: [0.45, 0.08, 0.58] },
      { name: 'T6', label: 'Secondary T6', localPos: [0.75, 0.08, 0.58] },
      { name: 'T7', label: 'Secondary T7', localPos: [-0.75, -0.22, 0.58] },
      { name: 'T8', label: 'Secondary T8', localPos: [-0.45, -0.22, 0.58] },
      { name: 'T9', label: 'Secondary T9', localPos: [-0.15, -0.22, 0.58] },
      { name: 'T10', label: 'Secondary T10', localPos: [0.15, -0.22, 0.58] },
      { name: 'T11', label: 'Secondary T11', localPos: [0.45, -0.22, 0.58] },
      { name: 'T12', label: 'Secondary T12', localPos: [0.75, -0.22, 0.58] },
    ],
  },
  transformer3phTrue: {
    type: 'transformer3phTrue',
    terminals: [
      { name: 'A', label: 'Primary A', localPos: [-0.42, 0.38, 0.58] },
      { name: 'B', label: 'Primary B', localPos: [0, 0.38, 0.58] },
      { name: 'C', label: 'Primary C', localPos: [0.42, 0.38, 0.58] },
      { name: 'a1', label: 'Phase a1', localPos: [-0.75, 0.08, 0.58] },
      { name: 'a2', label: 'Phase a2', localPos: [-0.45, 0.08, 0.58] },
      { name: 'b1', label: 'Phase b1', localPos: [-0.15, 0.08, 0.58] },
      { name: 'b2', label: 'Phase b2', localPos: [0.15, 0.08, 0.58] },
      { name: 'c1', label: 'Phase c1', localPos: [0.45, 0.08, 0.58] },
      { name: 'c2', label: 'Phase c2', localPos: [0.75, 0.08, 0.58] },
      { name: 'a3', label: 'Phase a3', localPos: [-0.75, -0.22, 0.58] },
      { name: 'a4', label: 'Phase a4', localPos: [-0.45, -0.22, 0.58] },
      { name: 'b3', label: 'Phase b3', localPos: [-0.15, -0.22, 0.58] },
      { name: 'b4', label: 'Phase b4', localPos: [0.15, -0.22, 0.58] },
      { name: 'c3', label: 'Phase c3', localPos: [0.45, -0.22, 0.58] },
      { name: 'c4', label: 'Phase c4', localPos: [0.75, -0.22, 0.58] },
    ],
  },
  transformerCenterTap: {
    type: 'transformerCenterTap',
    terminals: [
      { name: 'B1', label: 'Primary B1', localPos: [-0.5, 0.2, 0.51] },
      { name: 'M', label: 'Center Tap M', localPos: [-0.28, 0.2, 0.51] },
      { name: 'B2', label: 'Primary B2', localPos: [-0.06, 0.2, 0.51] },
      { name: 'b1', label: 'Secondary b1', localPos: [0.22, 0.2, 0.51] },
      { name: 'b2', label: 'Secondary b2', localPos: [0.48, 0.2, 0.51] },
    ],
  },
  transformerTeaser: {
    type: 'transformerTeaser',
    terminals: [
      { name: 'A1', label: 'Primary A1', localPos: [-0.42, 0.2, 0.51] },
      { name: 'A2', label: 'Primary A2', localPos: [-0.14, 0.2, 0.51] },
      { name: 'a1', label: 'Secondary a1', localPos: [0.18, 0.2, 0.51] },
      { name: 'a2', label: 'Secondary a2', localPos: [0.46, 0.2, 0.51] },
    ],
  },
  probeVoltmeter: {
    type: 'probeVoltmeter',
    terminals: [],
  },
  inductionMotor3ph: {
    type: 'inductionMotor3ph',
    terminals: [
      { name: 'A', label: 'Stator A', localPos: [-0.36, 0.48, 0.42] },
      { name: 'B', label: 'Stator B', localPos: [0, 0.48, 0.42] },
      { name: 'C', label: 'Stator C', localPos: [0.36, 0.48, 0.42] },
    ],
  },
  currentTransformer: {
    type: 'currentTransformer',
    terminals: [
      { name: 'P_M', label: 'Primary Mains (M)', localPos: [-0.28, 0.24, 0.44] },
      { name: 'P_L', label: 'Primary Load (L)', localPos: [0.28, 0.24, 0.44] },
      { name: 'S_M', label: 'Secondary Mains (M)', localPos: [-0.28, -0.02, 0.44] },
      { name: 'S_L', label: 'Secondary Load (L)', localPos: [0.28, -0.02, 0.44] },
    ],
  },
  selectorSwitch: {
    type: 'selectorSwitch',
    terminals: [
      { name: 'B', label: 'Phase B Input', localPos: [-0.26, 0.2, 0.42] },
      { name: 'COM', label: 'Common Out (V2)', localPos: [0, 0.2, 0.42] },
      { name: 'C', label: 'Phase C Input', localPos: [0.26, 0.2, 0.42] },
    ],
    internalLinks: (controls, instance) => {
      const pos = String(controls[`${instance.id}.pos`] ?? 'B');
      return pos === 'C' ? [['COM', 'C']] : [['COM', 'B']];
    },
  },
};

export function getComponentDef(type: ComponentType): ComponentTypeDef {
  return COMPONENT_DEFS[type];
}

export function getTerminalDef(type: ComponentType, terminalName: string) {
  return COMPONENT_DEFS[type].terminals.find((t) => t.name === terminalName);
}

export function getComponentTerminalIds(componentId: string, type: ComponentType): TerminalId[] {
  return COMPONENT_DEFS[type].terminals.map((t) => `${componentId}.${t.name}`);
}

/**
 * Resolves a component's internal links, supporting both static link arrays
 * and dynamic functions of control state (e.g. range/selector plugs).
 */
export function resolveComponentInternalLinks(
  def: ComponentTypeDef,
  instance: ComponentInstance,
  controls: ControlValues = {},
): [string, string][] {
  if (!def.internalLinks) return [];
  if (typeof def.internalLinks === 'function') {
    return def.internalLinks(controls, instance);
  }
  return def.internalLinks;
}
