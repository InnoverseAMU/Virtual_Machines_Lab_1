import { describe, expect, it } from 'vitest';
import { findVariacForTargetV1 } from '../core/circuit/learn';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';
import { evaluateExperimentPhysics } from '../core/physics/evaluate';
import { drawSessionMeterGains } from '../core/physics/meters';
import { DEFAULT_TRANSFORMER_PARAMS } from '../core/physics/models/transformerLoad';
import {
  captureObservationRow,
  checkRunAnswers,
  computeRowEfficiency,
  computeRowLoadVA,
  computeRunTruth,
  evaluateRunPrerequisites,
} from '../core/physics/report';
import type { MeterGains, ObservationRow } from '../core/types';

const CANONICAL_WIRES = netlistToWirePairs(NET_A);

function executeSimulatedRun(gains: MeterGains): ObservationRow[] {
  const lampSteps = [0, 2, 4, 6, 8, 10, 11];
  return lampSteps.map((lamps, idx) => {
    const knob = findVariacForTargetV1(ex3_1, CANONICAL_WIRES, 230, lamps, gains);
    const controls = {
      supplyOn: true,
      variacV: knob,
      wmVRange: 300 as const,
      wmIRange: 10 as const,
      lamps,
    };
    const { output } = evaluateExperimentPhysics(
      ex3_1,
      CANONICAL_WIRES,
      controls,
      gains,
    );
    return captureObservationRow(output, controls, idx + 1, `r_${idx + 1}`);
  });
}

describe('Exp 3.1 observation capture, report calculations, and answer checks', () => {
  it('captures displayed meter values and marks V1 outside 230 +/- 2 V', () => {
    const gains = { vp: 0.004, vs: -0.003, am: 0.002, wm: -0.004 };
    const controls = {
      supplyOn: true,
      variacV: 230,
      wmVRange: 300 as const,
      wmIRange: 10 as const,
      lamps: 10,
    };
    const { output } = evaluateExperimentPhysics(
      ex3_1,
      CANONICAL_WIRES,
      controls,
      gains,
    );

    const row = captureObservationRow(output, controls, 1, 'row_1');
    expect(row.v1).toBeCloseTo(output.meters.vp.shownValue, 1);
    expect(row.i2).toBeCloseTo(output.meters.am.shownValue, 2);
    expect(row.v2).toBeCloseTo(output.meters.vs.shownValue, 1);
    expect(row.dial).toBeCloseTo(output.meters.wm.dial, 1);
    expect(row.mf).toBe(20);
    expect(row.p1).toBeCloseTo(output.meters.wm.dial * 20, 1);
    expect(row.lamps).toBe(10);

    // Setting variac to 225 V under load is outside 230 +/- 2 V -> flagged
    const offRow = captureObservationRow(
      evaluateExperimentPhysics(
        ex3_1,
        CANONICAL_WIRES,
        { ...controls, variacV: 225 },
        gains,
      ).output,
      { ...controls, variacV: 225 },
      2,
      'row_2',
    );
    expect(offRow.v1).toBeLessThan(228);
    expect(offRow.v1OutOfRange).toBe(true);
  });

  it('matches Spec Section 6 efficiency and model truth calculations', () => {
    const gains = { vp: 0, vs: 0, am: 0, wm: 0 };
    const rows = executeSimulatedRun(gains);
    const tenLampRow = rows.find((r) => r.lamps === 10)!;
    const eff10 = computeRowEfficiency(tenLampRow);
    const va10 = computeRowLoadVA(tenLampRow);

    expect(va10).toBeCloseTo(1910, -2);
    expect(eff10).toBeCloseTo(96.8, 0);

    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    expect(truth.regulationPct).toBeCloseTo(2.32, 1);
    expect(truth.maxEffLoadPct).toBeCloseTo(66.4, 0);
  });

  it('passes a correctly executed run across 5+ different seeded meter-gain sets', () => {
    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    const seeds = [11, 42, 108, 777, 2026, 9001];

    for (const seed of seeds) {
      const gains = drawSessionMeterGains(seed);
      const rows = executeSimulatedRun(gains);
      const prereqs = evaluateRunPrerequisites(rows);
      expect(prereqs.allMet).toBe(true);

      const noLoad = rows.find((r) => r.i2 <= 0.1)!;
      const rated = rows.find((r) => r.i2 >= 15 && r.i2 <= 19)!;
      const studentReg = ((noLoad.v2 - rated.v2) / 115) * 100;

      let bestEff = -1;
      let bestVA = 0;
      for (const r of rows) {
        const eff = computeRowEfficiency(r);
        if (eff > bestEff) {
          bestEff = eff;
          bestVA = computeRowLoadVA(r);
        }
      }
      const studentMaxEffPct = (bestVA / 2000) * 100;

      const check = checkRunAnswers(
        rows,
        {
          regulationPct: studentReg,
          maxEffLoadPct: studentMaxEffPct,
        },
        truth,
      );
      expect(check.passed, `Seed ${seed} failed: ${check.failedCriteria.join('; ')}`).toBe(
        true,
      );
    }
  });

  it('passes with extreme +/- 0.5% meter gains on every meter', () => {
    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    const extremeGainSets: MeterGains[] = [
      { vp: 0.005, vs: 0.005, am: 0.005, wm: 0.005 },
      { vp: -0.005, vs: -0.005, am: -0.005, wm: -0.005 },
      { vp: 0.005, vs: -0.005, am: 0.005, wm: -0.005 },
      { vp: -0.005, vs: 0.005, am: -0.005, wm: 0.005 },
    ];

    for (const gains of extremeGainSets) {
      const rows = executeSimulatedRun(gains);
      const noLoad = rows.find((r) => r.i2 <= 0.1)!;
      const rated = rows.find((r) => r.i2 >= 15 && r.i2 <= 19)!;
      const studentReg = ((noLoad.v2 - rated.v2) / 115) * 100;

      let bestEff = -1;
      let bestVA = 0;
      for (const r of rows) {
        const eff = computeRowEfficiency(r);
        if (eff > bestEff) {
          bestEff = eff;
          bestVA = computeRowLoadVA(r);
        }
      }
      const studentMaxEffPct = (bestVA / 2000) * 100;
      const check = checkRunAnswers(
        rows,
        { regulationPct: studentReg, maxEffLoadPct: studentMaxEffPct },
        truth,
      );
      expect(check.passed, `Extreme gain ${JSON.stringify(gains)} failed: ${check.failedCriteria.join('; ')}`).toBe(
        true,
      );
    }
  });

  it('accepts rated-current rows across the 15 A to 19 A band (9 to 11 lamps and exact boundaries)', () => {
    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    const gains = { vp: 0, vs: 0, am: 0, wm: 0 };

    // Test runs whose near-rated row uses 9 lamps (~15.3 A) and 11 lamps (~18.7 A)
    for (const ratedLamps of [9, 11]) {
      const lampSteps = [0, 2, 4, 6, 8, ratedLamps];
      const rows = lampSteps.map((lamps, idx) => {
        const knob = findVariacForTargetV1(ex3_1, CANONICAL_WIRES, 230, lamps, gains);
        const controls = {
          supplyOn: true,
          variacV: knob,
          wmVRange: 300 as const,
          wmIRange: 10 as const,
          lamps,
        };
        const { output } = evaluateExperimentPhysics(
          ex3_1,
          CANONICAL_WIRES,
          controls,
          gains,
        );
        return captureObservationRow(output, controls, idx + 1, `rb_${idx + 1}`);
      });

      const noLoad = rows.find((r) => r.i2 <= 0.1)!;
      const rated = rows.find((r) => r.i2 >= 15 && r.i2 <= 19)!;
      expect(rated).toBeDefined();

      const studentReg = ((noLoad.v2 - rated.v2) / 115) * 100;
      let bestEff = -1;
      let bestVA = 0;
      for (const r of rows) {
        const eff = computeRowEfficiency(r);
        if (eff > bestEff) {
          bestEff = eff;
          bestVA = computeRowLoadVA(r);
        }
      }
      const check = checkRunAnswers(
        rows,
        {
          regulationPct: studentReg,
          maxEffLoadPct: (bestVA / 2000) * 100,
        },
        truth,
      );
      expect(check.passed).toBe(true);
    }

    // Exact 15.0 A and 19.0 A boundary checks on prerequisites
    const baseRow = executeSimulatedRun(gains)[0];
    expect(
      evaluateRunPrerequisites([{ ...baseRow, i2: 15.0 }]).hasRatedRow,
    ).toBe(true);
    expect(
      evaluateRunPrerequisites([{ ...baseRow, i2: 19.0 }]).hasRatedRow,
    ).toBe(true);
    expect(
      evaluateRunPrerequisites([{ ...baseRow, i2: 14.99 }]).hasRatedRow,
    ).toBe(false);
    expect(
      evaluateRunPrerequisites([{ ...baseRow, i2: 19.01 }]).hasRatedRow,
    ).toBe(false);
  });

  it('fails with specific criteria and hints without leaking true numeric values', () => {
    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    const gains = { vp: 0, vs: 0, am: 0, wm: 0 };
    const rows = executeSimulatedRun(gains);

    // 1. Fewer than 6 rows
    const shortRes = checkRunAnswers(
      rows.slice(0, 4),
      { regulationPct: truth.regulationPct, maxEffLoadPct: truth.maxEffLoadPct },
      truth,
    );
    expect(shortRes.passed).toBe(false);
    expect(shortRes.failedCriteria.some((c) => c.includes('6'))).toBe(true);

    // 2. Missing no-load row
    const noZeroRes = checkRunAnswers(
      rows.slice(1),
      { regulationPct: truth.regulationPct, maxEffLoadPct: truth.maxEffLoadPct },
      truth,
    );
    expect(noZeroRes.passed).toBe(false);
    expect(noZeroRes.failedCriteria.some((c) => c.includes('no-load'))).toBe(
      true,
    );

    // 3. Missing rated current row
    const noRatedRows = rows.filter((r) => r.i2 < 15);
    const noRatedRes = checkRunAnswers(
      noRatedRows,
      { regulationPct: truth.regulationPct, maxEffLoadPct: truth.maxEffLoadPct },
      truth,
    );
    expect(noRatedRes.passed).toBe(false);
    expect(noRatedRes.failedCriteria.some((c) => c.includes('15 and 19'))).toBe(
      true,
    );

    // 4. V1 not held within 230 +/- 2 V in enough rows + unequal V1 between no-load & rated
    const saggedRows = rows.map((r, idx) =>
      idx >= 3 ? { ...r, v1: 225.0, v1OutOfRange: true } : r,
    );
    const v1Res = checkRunAnswers(
      saggedRows,
      { regulationPct: 4.5, maxEffLoadPct: 30 },
      truth,
    );
    expect(v1Res.passed).toBe(false);
    expect(v1Res.hints.some((h) => h.includes('4, 5, 6, 7'))).toBe(true);
    expect(v1Res.hints.some((h) => h.includes('differed'))).toBe(true);

    // Ensure true numeric values are never revealed
    const allText = [...v1Res.failedCriteria, ...v1Res.hints].join(' ');
    expect(allText).not.toContain(truth.regulationPct.toFixed(2));
    expect(allText).not.toContain(truth.maxEffLoadPct.toFixed(1));
  });
});
