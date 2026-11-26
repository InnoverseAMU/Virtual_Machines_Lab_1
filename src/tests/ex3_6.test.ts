import { describe, expect, it } from 'vitest';
import { wiresFromNetlist } from '../core/circuit/nets';
import { getStage } from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { ex3_6, STAGE2_REQUIRED_PAIRS } from '../core/experiments/ex3_6';
import { cAngleDeg } from '../core/phasor/complex';
import { measureTerminalVoltage } from '../core/phasor/network';
import { evaluateExperimentPhysics, findMeterReading } from '../core/physics/evaluate';
import {
  solveStage1Or2,
  solveStage3Scott,
} from '../core/physics/models/phaseTransformation';
import { evaluateStagePrerequisites } from '../core/physics/report';
import type { WireEndpointPair } from '../core/types';
import { referenceRun } from './helpers/referenceRun';

describe('Experiment 3.6: Phase-transformation', () => {
  it('Stage 1 (3φ to 1φ) validates Fig. 3.6.1 and outputs 230 V (2 × Vp) between a1 and c1', () => {
    const stage1 = getStage(ex3_6, 0);
    const wires = wiresFromNetlist(stage1.acceptedNetlists[0], []);
    expect(validateWiring(ex3_6, wires, 0).correct).toBe(true);

    const evalRes = evaluateExperimentPhysics(
      ex3_6,
      wires,
      { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': 'tx.a1', 'probe.b': 'tx.c1' },
      { probe: 0 },
      { stageIndex: 0 },
    );
    expect(evalRes.output.mcbTripped).toBe(false);
    expect(evalRes.output.outputs.Va1a4).toBeCloseTo(115, 1);
    expect(evalRes.output.outputs.Vb1b4).toBeCloseTo(115, 1);
    expect(evalRes.output.outputs.Vc1c4).toBeCloseTo(115, 1);
    expect(evalRes.output.outputs.Va1c1).toBeCloseTo(230, 1);
    expect(findMeterReading(evalRes.output, 'probe')?.shownValue).toBeCloseTo(230, 1);

    // Omitting c4-b4 breaks the 1φ output chain
    const openWires = wires.filter(
      ([a, b]) => !((a === 'tx.c4' && b === 'tx.b4') || (a === 'tx.b4' && b === 'tx.c4')),
    );
    expect(validateWiring(ex3_6, openWires, 0).correct).toBe(false);

    // Check raw solver phasor equality
    const { sol } = solveStage1Or2(wires, 230, 230, 57.5);
    expect(measureTerminalVoltage(sol, 'tx.a1', 'tx.c1').magnitude).toBeCloseTo(230, 2);
  });

  it('Stage 2 (3φ to 6φ Double Star) yields 57.5 V at 0, 60, 120, 180, 240, 300 deg and 115 V opposite', () => {
    const stage2 = getStage(ex3_6, 1);
    const wires = wiresFromNetlist(stage2.acceptedNetlists[0], []);
    expect(validateWiring(ex3_6, wires, 1).correct).toBe(true);

    const { sol } = solveStage1Or2(wires, 230, 230, 57.5);
    const sixOrder: Array<[string, number]> = [
      ['tx.a1', 0],
      ['tx.b4', 60],
      ['tx.c1', 120],
      ['tx.a4', 180],
      ['tx.b1', -120], // 240°
      ['tx.c4', -60],  // 300°
    ];
    for (const [term, deg] of sixOrder) {
      const m = measureTerminalVoltage(sol, term, 'tx.a2');
      expect(m.magnitude).toBeCloseTo(57.5, 2);
      expect(cAngleDeg(m.phasor)).toBeCloseTo(deg, 1);
    }

    // Check all 12 manual pairs = 57.5 V within 1%
    for (const [ta, tb] of STAGE2_REQUIRED_PAIRS) {
      expect(measureTerminalVoltage(sol, ta, tb).magnitude).toBeCloseTo(57.5, 2);
    }
    // Check opposite terminal voltages = 115 V
    expect(measureTerminalVoltage(sol, 'tx.a1', 'tx.a4').magnitude).toBeCloseTo(115, 2);
    expect(measureTerminalVoltage(sol, 'tx.b4', 'tx.b1').magnitude).toBeCloseTo(115, 2);
    expect(measureTerminalVoltage(sol, 'tx.c1', 'tx.c4').magnitude).toBeCloseTo(115, 2);

    // Check 12-pair prerequisite enforcement
    const partialRef = referenceRun(ex3_6, 202601, { probe: 0 });
    const fullRows = partialRef.rowsByStage['three-to-six'];
    expect(fullRows).toHaveLength(12);
    expect(evaluateStagePrerequisites(stage2, fullRows.slice(0, 11))[0].met).toBe(false);
    expect(evaluateStagePrerequisites(stage2, fullRows)[0].met).toBe(true);
  });

  it('Stage 3 (Scott 3φ to 2φ) solves center-tap quadrature & catches wrong-tap and reversed-teaser faults', () => {
    const stage3 = getStage(ex3_6, 2);
    // Accepted with a2-b2 joined (index 0) and secondaries free (index 1)
    const wiresJoined = wiresFromNetlist(stage3.acceptedNetlists[0], []);
    const wiresFree = wiresFromNetlist(stage3.acceptedNetlists[1], []);

    expect(validateWiring(ex3_6, wiresJoined, 2).correct).toBe(true);
    expect(validateWiring(ex3_6, wiresFree, 2).correct).toBe(true);

    // Balanced Scott voltages within 1%
    const scottFree = solveStage3Scott(wiresFree, 230, 230);
    expect(scottFree.scottCenterTapOk).toBe(true);
    expect(scottFree.scottAngleDiffDeg).toBeCloseTo(90, 1);

    const evalJoined = evaluateExperimentPhysics(
      ex3_6,
      wiresJoined,
      { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': 'txT.a1', 'probe.b': 'txM.b1' },
      { probe: 0 },
      { stageIndex: 2 },
    );
    expect(evalJoined.output.outputs.VAB).toBeCloseTo(230, 1);
    expect(evalJoined.output.outputs.VBC).toBeCloseTo(230, 1);
    expect(evalJoined.output.outputs.VCA).toBeCloseTo(230, 1);
    expect(evalJoined.output.outputs.VB1B2).toBeCloseTo(230, 1);
    expect(evalJoined.output.outputs.VA1A2).toBeCloseTo(199.19, 1);
    expect(evalJoined.output.outputs.Va1a2).toBeCloseTo(115, 1);
    expect(evalJoined.output.outputs.Vb1b2).toBeCloseTo(115, 1);
    expect(evalJoined.output.outputs.Va1b1).toBeCloseTo(162.63, 1);
    expect(findMeterReading(evalJoined.output, 'probe')?.shownValue).toBeCloseTo(162.6, 1);

    // Fault 1: A2 on B1 instead of center tap M -> VAM becomes 230 V, teaser unbalanced at 132.8 V
    const wrongTapWires: WireEndpointPair[] = [
      ['sup3.A', 'va3.IN_A'],
      ['sup3.B', 'va3.IN_B'],
      ['sup3.C', 'va3.IN_C'],
      ['va3.OUT_A', 'txT.A1'],
      ['txT.A2', 'txM.B1'],
      ['va3.OUT_B', 'txM.B1'],
      ['va3.OUT_C', 'txM.B2'],
    ];
    const wrongTapVal = validateWiring(ex3_6, wrongTapWires, 2);
    expect(wrongTapVal.correct).toBe(false);
    expect(wrongTapVal.faults.some((f) => f.id === 'scott-center-tap-miss')).toBe(true);
    const wrongTapEval = evaluateExperimentPhysics(
      ex3_6,
      wrongTapWires,
      { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': 'txT.a1', 'probe.b': 'txT.a2' },
      { probe: 0 },
      { stageIndex: 2 },
    );
    expect(wrongTapEval.output.outputs.VA1A2).toBeCloseTo(230, 1);
    expect(wrongTapEval.output.outputs.Va1a2).toBeCloseTo(132.8, 1);

    // Fault 2: Center tap taken wrongly (B connected to M, B1 left open -> 2x flux on main!)
    const wrongCenterTerminal: WireEndpointPair[] = [
      ['sup3.A', 'va3.IN_A'],
      ['sup3.B', 'va3.IN_B'],
      ['sup3.C', 'va3.IN_C'],
      ['va3.OUT_A', 'txT.A1'],
      ['txT.A2', 'txM.B1'],
      ['va3.OUT_B', 'txM.M'],
      ['va3.OUT_C', 'txM.B2'],
    ];
    expect(validateWiring(ex3_6, wrongCenterTerminal, 2).correct).toBe(false);
    const doubleMainEval = evaluateExperimentPhysics(
      ex3_6,
      wrongCenterTerminal,
      { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': 'txM.b1', 'probe.b': 'txM.b2' },
      { probe: 0 },
      { stageIndex: 2 },
    );
    expect(doubleMainEval.output.outputs.Vb1b2).toBeCloseTo(230, 1);

    // Fault 3: Teaser secondary reversed (a1 joined to b2 instead of a2 to b2)
    const reversedSecWires: WireEndpointPair[] = [
      ['sup3.A', 'va3.IN_A'],
      ['sup3.B', 'va3.IN_B'],
      ['sup3.C', 'va3.IN_C'],
      ['va3.OUT_A', 'txT.A1'],
      ['txT.A2', 'txM.M'],
      ['va3.OUT_B', 'txM.B1'],
      ['va3.OUT_C', 'txM.B2'],
      ['txT.a1', 'txM.b2'],
    ];
    const revVal = validateWiring(ex3_6, reversedSecWires, 2);
    expect(revVal.correct).toBe(false);
    expect(revVal.faults.some((f) => f.id === 'scott-teaser-reversed')).toBe(true);
    const revEval = evaluateExperimentPhysics(
      ex3_6,
      reversedSecWires,
      { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': 'txT.a2', 'probe.b': 'txM.b1' },
      { probe: 0 },
      { stageIndex: 2 },
    );
    expect(revEval.output.events.some((e) => e.id === 'scott-teaser-reversed')).toBe(true);
    // Probe(a1, b1) equals Vb1b2 = 115 V since a1 is bonded to b2, whereas open diag(a2, b1) is 162.6 V
    expect(revEval.output.outputs.Va1b1).toBeCloseTo(115, 1);
    expect(findMeterReading(revEval.output, 'probe')?.shownValue).toBeCloseTo(162.6, 1);
  });

  it('passes referenceRun across 5 seeds and extreme probe gains (-0.5%, 0%, +0.5%)', () => {
    for (const seed of [202601, 101, 555, 777, 9999]) {
      for (const gain of [-0.005, 0, 0.005]) {
        const res = referenceRun(ex3_6, seed, { probe: gain });
        expect(
          res.passed,
          `Failed referenceRun seed=${seed} gain=${gain}: ${res.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }
    }
  });
});
