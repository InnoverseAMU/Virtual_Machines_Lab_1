import { describe, expect, it } from 'vitest';
import { getStage } from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { ex3_5 } from '../core/experiments/ex3_5';
import {
  canonicalPairKey,
  getCanonicalStageWiresForSeed,
  getScrambledTerminalMap,
} from '../core/phasor/ex3_5Scramble';
import type { WireEndpointPair } from '../core/types';
import { evaluateExperimentPhysics, findMeterReading } from '../core/physics/evaluate';
import { referenceRun } from './helpers/referenceRun';

describe('Experiment 3.5: Three-phase transformer connections', () => {
  it('Stage 1 requires zero bench wires and 6 identified half-winding pairs', () => {
    const seed = 4242;
    const map = getScrambledTerminalMap(seed);
    const pairs = map.halfWindings.map(
      (hw) => [hw.posTerminal, hw.negTerminal] as [string, string],
    );

    const emptyFail = validateWiring(ex3_5, [], 0, {}, {
      seed,
      identification: { pairs: pairs.slice(0, 5) },
    });
    expect(emptyFail.correct).toBe(false);

    const wireFail = validateWiring(ex3_5, [[pairs[0][0], pairs[0][1]]], 0, {}, {
      seed,
      identification: { pairs },
    });
    expect(wireFail.correct).toBe(false);

    const ok = validateWiring(ex3_5, [], 0, {}, {
      seed,
      identification: { pairs },
    });
    expect(ok.correct).toBe(true);

    // Live probing reads ~57.5 V on pair and 0 V when supply off or different windings
    const onPair = evaluateExperimentPhysics(
      ex3_5,
      [],
      { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': pairs[0][0], 'probe.b': pairs[0][1] },
      { probe: 0 },
      { stageIndex: 0, seed },
    );
    expect(findMeterReading(onPair.output, 'probe')?.shownValue).toBeCloseTo(57.5, 1);

    const offSupply = evaluateExperimentPhysics(
      ex3_5,
      [],
      { 'sup3.switch': false, 'va3.knob': 230, 'probe.a': pairs[0][0], 'probe.b': pairs[0][1] },
      { probe: 0 },
      { stageIndex: 0, seed },
    );
    expect(findMeterReading(offSupply.output, 'probe')?.shownValue).toBe(0);
  });

  it('Stage 2 validates phase groups and series-aiding 115 V full phases', () => {
    const seed = 777;
    const map = getScrambledTerminalMap(seed);
    const wires = getCanonicalStageWiresForSeed('identify-phases', seed);
    const phaseGroups = (['a', 'b', 'c'] as const).map((ph) =>
      map.halfWindings
        .filter((hw) => hw.phase === ph)
        .map((hw) => canonicalPairKey(hw.posTerminal, hw.negTerminal)),
    );

    const valid = validateWiring(ex3_5, wires, 1, {}, {
      seed,
      identification: { phaseGroups },
    });
    expect(valid.correct).toBe(true);

    const wrongGroups = [
      [phaseGroups[0][0], phaseGroups[1][0]],
      [phaseGroups[0][1], phaseGroups[1][1]],
      phaseGroups[2],
    ];
    const invalidGroups = validateWiring(ex3_5, wires, 1, {}, {
      seed,
      identification: { phaseGroups: wrongGroups },
    });
    expect(invalidGroups.correct).toBe(false);
  });

  it('Stages 3, 4, 5 validate Star, Delta, and Zig-Zag across multiple seeds & catch faults', () => {
    for (const seed of [202601, 1337, 8888]) {
      const t = getScrambledTerminalMap(seed).trueToTerminal;

      // Stage 3: Star (Vp = 115 V, VL = 199.2 V)
      const starWires = getCanonicalStageWiresForSeed('star', seed);
      expect(validateWiring(ex3_5, starWires, 2, {}, { seed }).correct).toBe(true);
      const starEval = evaluateExperimentPhysics(
        ex3_5,
        starWires,
        { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': t.a4, 'probe.b': t.b4 },
        { probe: 0 },
        { stageIndex: 2, seed },
      );
      expect(findMeterReading(starEval.output, 'probe')?.shownValue).toBeCloseTo(199.2, 1);

      // Reversed Star neutral point fails validation
      const badStarWires: WireEndpointPair[] = [
        [t.a4, t.b1],
        [t.b1, t.c1],
        [t.a2, t.a3],
        [t.b2, t.b3],
        [t.c2, t.c3],
      ];
      expect(validateWiring(ex3_5, badStarWires, 2, {}, { seed }).correct).toBe(false);

      // Stage 4: Delta (VL = 115 V) and wrong-polarity MCB trip fault
      const deltaWires = getCanonicalStageWiresForSeed('delta', seed);
      expect(validateWiring(ex3_5, deltaWires, 3, {}, { seed }).correct).toBe(true);
      const deltaEval = evaluateExperimentPhysics(
        ex3_5,
        deltaWires,
        { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': t.b4, 'probe.b': t.c4 },
        { probe: 0 },
        { stageIndex: 3, seed },
      );
      expect(deltaEval.output.mcbTripped).toBe(false);
      expect(findMeterReading(deltaEval.output, 'probe')?.shownValue).toBeCloseTo(115.0, 1);

      const reversedDeltaWires: WireEndpointPair[] = [
        [t.a2, t.a3],
        [t.b2, t.b3],
        [t.c2, t.c3],
        [t.a4, t.b1],
        [t.b4, t.c4],
        [t.c1, t.a1],
      ];
      const deltaFault = validateWiring(ex3_5, reversedDeltaWires, 3, {}, { seed });
      expect(deltaFault.correct).toBe(false);
      expect(deltaFault.faults.some((f) => f.effect === 'short')).toBe(true);

      const tripEval = evaluateExperimentPhysics(
        ex3_5,
        reversedDeltaWires,
        { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': t.a1, 'probe.b': t.b1 },
        { probe: 0 },
        { stageIndex: 3, seed },
      );
      expect(tripEval.output.mcbTripped).toBe(true);

      // Stage 5: Zig-Zag Fig. 3.5.3 (Vp = 99.6 V, VL = 172.5 V)
      const zzWires = getCanonicalStageWiresForSeed('zigzag', seed);
      expect(validateWiring(ex3_5, zzWires, 4, {}, { seed }).correct).toBe(true);
      const zzPhaseEval = evaluateExperimentPhysics(
        ex3_5,
        zzWires,
        { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': t.b3, 'probe.b': t.a1 },
        { probe: 0 },
        { stageIndex: 4, seed },
      );
      expect(findMeterReading(zzPhaseEval.output, 'probe')?.shownValue).toBeCloseTo(99.6, 1);
      const zzLineEval = evaluateExperimentPhysics(
        ex3_5,
        zzWires,
        { 'sup3.switch': true, 'va3.knob': 230, 'probe.a': t.b3, 'probe.b': t.c3 },
        { probe: 0 },
        { stageIndex: 4, seed },
      );
      expect(findMeterReading(zzLineEval.output, 'probe')?.shownValue).toBeCloseTo(172.5, 1);

      // Incorrect cross-phase polarity (a2-b3 instead of a2-b4 -> gives 57.5 V phase instead of 99.6 V)
      const badZzWires: WireEndpointPair[] = [
        [t.a1, t.b1],
        [t.b1, t.c1],
        [t.a2, t.b3],
        [t.b2, t.c3],
        [t.c2, t.a3],
      ];
      expect(validateWiring(ex3_5, badZzWires, 4, {}, { seed }).correct).toBe(false);
    }
  });

  it('passes referenceRun across multiple seeds and extreme probe-voltmeter gain perturbations', () => {
    for (const seed of [202601, 42, 31415]) {
      for (const gain of [-0.005, 0, 0.005]) {
        const res = referenceRun(ex3_5, seed, { probe: gain });
        expect(
          res.passed,
          `Failed referenceRun seed=${seed} gain=${gain}: ${res.result.failedCriteria.join('; ')}`,
        ).toBe(true);
      }
    }
    expect(getStage(ex3_5, 4).id).toBe('zigzag');
  });
});
