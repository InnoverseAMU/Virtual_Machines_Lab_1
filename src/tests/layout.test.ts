import { describe, expect, it } from 'vitest';
import { checkStageLayoutSpacing, layoutBenchRow } from '../core/circuit/layout';
import { getStageCameraPresets, getStageComponents } from '../core/circuit/stages';
import { EXPERIMENTS } from '../core/experiments/registry';
import type { ComponentInstance } from '../core/types';

describe('Stage layout spacing and camera presets', () => {
  it('ensures no two components or inter-component terminals in any registered stage are closer than 0.35 units', () => {
    for (const exp of Object.values(EXPERIMENTS)) {
      for (const stage of exp.stages) {
        const comps = getStageComponents(exp, stage);
        const spacing = checkStageLayoutSpacing(comps, 0.35);
        expect(
          spacing.valid,
          `${exp.id}/${stage.id} spacing violations: ${JSON.stringify(spacing.violations)}`,
        ).toBe(true);
        expect(spacing.minComponentDistance).toBeGreaterThanOrEqual(0.35);
        expect(spacing.minInterTerminalDistance).toBeGreaterThanOrEqual(0.35);
      }
    }
  });

  it('ensures every stage declares camera presets and every learn step references a declared preset', () => {
    for (const exp of Object.values(EXPERIMENTS)) {
      for (const stage of exp.stages) {
        const presets = getStageCameraPresets(stage);
        expect(presets.length).toBeGreaterThanOrEqual(1);
        const ids = new Set(presets.map((p) => p.id));
        expect(ids.has('overview')).toBe(true);
        for (const step of stage.learnSteps) {
          expect(
            ids.has(step.camera),
            `Stage ${stage.id} learn step ${step.id} uses undeclared camera "${step.camera}"`,
          ).toBe(true);
        }
      }
    }
  });

  it('detects spacing violations when components or terminals are closer than 0.35 units and layoutBenchRow avoids them', () => {
    const crowded: ComponentInstance[] = [
      { id: 'vp1', type: 'voltmeter', label: 'V1', position: [0, 0, 0], params: { range: 300 } },
      { id: 'vp2', type: 'voltmeter', label: 'V2', position: [0.25, 0, 0], params: { range: 300 } },
    ];
    const check = checkStageLayoutSpacing(crowded, 0.35);
    expect(check.valid).toBe(false);
    expect(check.violations.some((v) => v.kind === 'component')).toBe(true);

    const rowPos = layoutBenchRow([
      { id: 'vp1', type: 'voltmeter' },
      { id: 'vp2', type: 'voltmeter' },
      { id: 'am1', type: 'ammeter' },
    ]);
    const spaced: ComponentInstance[] = [
      { id: 'vp1', type: 'voltmeter', label: 'V1', position: rowPos.vp1, params: { range: 300 } },
      { id: 'vp2', type: 'voltmeter', label: 'V2', position: rowPos.vp2, params: { range: 300 } },
      { id: 'am1', type: 'ammeter', label: 'A1', position: rowPos.am1, params: { range: 10 } },
    ];
    expect(checkStageLayoutSpacing(spaced, 0.35).valid).toBe(true);
  });
});
