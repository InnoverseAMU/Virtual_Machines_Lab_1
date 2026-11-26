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
