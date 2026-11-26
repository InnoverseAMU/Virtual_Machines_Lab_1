import { getComponentDef } from '../components';
import type { ComponentInstance, ComponentType, TerminalId } from '../types';

export const COMPONENT_FOOTPRINTS: Record<ComponentType, [number, number, number]> = {
  acSupply: [1.04, 0.86, 0.84],
  acSupply3ph: [1.18, 0.92, 0.88],
  variac1ph: [1.12, 0.94, 1.06],
  variac3ph: [1.32, 1.04, 1.12],
  wattmeter: [1.14, 0.72, 1.04],
  transformer1ph: [1.34, 1.04, 1.06],
  transformer3ph: [2.05, 1.18, 1.16],
  voltmeter: [0.96, 0.7, 0.92],
  probeVoltmeter: [1.06, 0.78, 0.96],
  ammeter: [0.96, 0.7, 0.92],
  lampLoad: [1.54, 0.98, 1.02],
  rheostat: [1.34, 0.86, 0.94],
};

export interface SpacingViolation {
  kind: 'component' | 'terminal';
  a: string;
  b: string;
  distance: number;
}

export interface LayoutSpacingResult {
  valid: boolean;
  minDistance: number;
  minComponentDistance: number;
  minInterTerminalDistance: number;
  violations: SpacingViolation[];
}

function euclidean(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Verifies that no two components and no two inter-component terminals in a
 * stage sit closer than `minDistance` (default 0.35 world units).
 */
export function checkStageLayoutSpacing(
  components: ComponentInstance[],
  minDistance = 0.35,
): LayoutSpacingResult {
  const violations: SpacingViolation[] = [];
  let minComponentDistance = Infinity;
  let minInterTerminalDistance = Infinity;

  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const ca = components[i];
      const cb = components[j];
      const d = euclidean(ca.position, cb.position);
      if (d < minComponentDistance) minComponentDistance = d;
      if (d < minDistance) {
        violations.push({
          kind: 'component',
          a: ca.id,
          b: cb.id,
          distance: d,
        });
      }
    }
  }

  const worldTerminals: {
    id: TerminalId;
    compId: string;
    pos: [number, number, number];
  }[] = [];

  for (const comp of components) {
    const def = getComponentDef(comp.type);
    for (const term of def.terminals) {
      worldTerminals.push({
        id: `${comp.id}.${term.name}`,
        compId: comp.id,
        pos: [
          comp.position[0] + term.localPos[0],
          comp.position[1] + term.localPos[1],
          comp.position[2] + term.localPos[2],
        ],
      });
    }
  }

  for (let i = 0; i < worldTerminals.length; i++) {
    for (let j = i + 1; j < worldTerminals.length; j++) {
      const ta = worldTerminals[i];
      const tb = worldTerminals[j];
      if (ta.compId === tb.compId) continue;
      const d = euclidean(ta.pos, tb.pos);
      if (d < minInterTerminalDistance) minInterTerminalDistance = d;
      if (d < minDistance) {
        violations.push({
          kind: 'terminal',
          a: ta.id,
          b: tb.id,
          distance: d,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    minDistance,
    minComponentDistance:
      minComponentDistance === Infinity ? 0 : minComponentDistance,
    minInterTerminalDistance:
      minInterTerminalDistance === Infinity ? 0 : minInterTerminalDistance,
    violations,
  };
}

/**
 * Helper to lay out a horizontal row of components along X with guaranteed spacing.
 */
export function layoutBenchRow(
  items: { id: string; type: ComponentType; z?: number; y?: number }[],
  startX = -4.3,
  gap = 0.6,
): Record<string, [number, number, number]> {
  const positions: Record<string, [number, number, number]> = {};
  let cursorX = startX;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const [w] = COMPONENT_FOOTPRINTS[item.type];
    if (i > 0) {
      const [prevW] = COMPONENT_FOOTPRINTS[items[i - 1].type];
      cursorX += prevW / 2 + gap + w / 2;
    }
    positions[item.id] = [Number(cursorX.toFixed(2)), item.y ?? 0, item.z ?? 0];
  }
  return positions;
}
