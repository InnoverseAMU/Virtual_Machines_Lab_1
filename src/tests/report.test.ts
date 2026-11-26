import { describe, expect, it } from 'vitest';
import { findVariacForTargetV1 } from '../core/circuit/learn';
import { getStage } from '../core/circuit/stages';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';
import {
  evaluateExperimentPhysics,
  findMeterReading,
} from '../core/physics/evaluate';
import { DEFAULT_TRANSFORMER_PARAMS } from '../core/physics/models/transformerLoad';
import {
  captureObservationRow,
  checkRunAnswers,
  computeRowEfficiency,
  computeRowLoadVA,
  computeRunTruth,
  evaluateColumnValue,
  evaluateRowRules,
  evaluateStagePrerequisites,
  getRowNumber,
} from '../core/physics/report';
import type { MeterGains } from '../core/types';
import { referenceRun } from './helpers/referenceRun';

const CANONICAL_WIRES = netlistToWirePairs(NET_A);
const stage = getStage(ex3_1, 0);

describe('Exp 3.1 schema-driven observation capture, report answers, and referenceRun fairness', () => {
  it('captures schema-driven columns including derived efficiency and flags rowRules violations', () => {
    const gains = { vp: 0.004, vs: -0.003, am: 0.002, wm: -0.004 };
    const controls = {
      'sup.switch': true,
      'va.knob': 230,
      'wm.vRange': 300,
      'wm.iRange': 10,
      'ld.lamps': 10,
    };
    const { output } = evaluateExperimentPhysics(
      ex3_1,
      CANONICAL_WIRES,
      controls,
      gains,
    );

    const row = captureObservationRow(stage, output, controls, 1, 'row_1');
    const vp = findMeterReading(output, 'vp')!;
    const am = findMeterReading(output, 'am')!;
    const vs = findMeterReading(output, 'vs')!;
    const wm = findMeterReading(output, 'wm')!;

    expect(getRowNumber(row, 'v1')).toBeCloseTo(vp.shownValue, 1);
    expect(getRowNumber(row, 'i2')).toBeCloseTo(am.shownValue, 2);
    expect(getRowNumber(row, 'v2')).toBeCloseTo(vs.shownValue, 1);
    expect(getRowNumber(row, 'dial')).toBeCloseTo(wm.dial ?? 0, 1);
    expect(getRowNumber(row, 'mf')).toBe(20);
    expect(getRowNumber(row, 'p1')).toBeCloseTo((wm.dial ?? 0) * 20, 1);
    expect(getRowNumber(row, 'lamps')).toBe(10);

    // Efficiency column is a derived pure function of the row
    const effCol = stage.observationTable.find((c) => c.id === 'eff')!;
    const effVal = evaluateColumnValue(effCol, row.values, stage.physicsParams);
    expect(effVal).toBeCloseTo(computeRowEfficiency(row), 1);

    // Setting variac to 225 V under load fails the amber v1-hold row rule
    const offOut = evaluateExperimentPhysics(
      ex3_1,
      CANONICAL_WIRES,
      { ...controls, 'va.knob': 225 },
      gains,
    ).output;
    const offRow = captureObservationRow(
      stage,
      offOut,
      { ...controls, 'va.knob': 225 },
      2,
      'row_2',
    );
    expect(getRowNumber(offRow, 'v1')).toBeLessThan(228);
    const violations = evaluateRowRules(stage, offRow);
    expect(violations).toHaveLength(1);
    expect(violations[0].amber).toBe(true);
    expect(violations[0].ruleId).toBe('v1-hold');
  });

  it('matches Spec Section 6 efficiency and model truth calculations via referenceRun', () => {
    const run = referenceRun(ex3_1, 1, { vp: 0, vs: 0, am: 0, wm: 0 });
    expect(run.passed).toBe(true);
    const rows = run.rowsByStage[stage.id];
    const tenLampRow = rows.find((r) => getRowNumber(r, 'lamps') === 10)!;
    const eff10 = computeRowEfficiency(tenLampRow);
    const va10 = computeRowLoadVA(tenLampRow);

    expect(va10).toBeCloseTo(1910, -2);
    expect(eff10).toBeCloseTo(96.8, 0);

    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    expect(truth.regulationPct).toBeCloseTo(2.32, 1);
    expect(truth.maxEffLoadPct).toBeCloseTo(66.4, 0);
  });

  it('passes referenceRun across 5+ different seeded meter-gain sets', () => {
    const seeds = [11, 42, 108, 777, 2026, 9001];
    for (const seed of seeds) {
      const run = referenceRun(ex3_1, seed);
      expect(
        run.passed,
        `Seed ${seed} failed: ${run.result.failedCriteria.join('; ')}`,
      ).toBe(true);
    }
  });

  it('passes referenceRun with extreme +/- 0.5% meter gains on every meter (all +, all -, mixed)', () => {
    const extremeGainSets: MeterGains[] = [
      { vp: 0.005, vs: 0.005, am: 0.005, wm: 0.005 },
      { vp: -0.005, vs: -0.005, am: -0.005, wm: -0.005 },
      { vp: 0.005, vs: -0.005, am: 0.005, wm: -0.005 },
      { vp: -0.005, vs: 0.005, am: -0.005, wm: 0.005 },
    ];

    for (const gains of extremeGainSets) {
      const run = referenceRun(ex3_1, 99, gains);
      expect(
        run.passed,
        `Extreme gain ${JSON.stringify(gains)} failed: ${run.result.failedCriteria.join('; ')}`,
      ).toBe(true);
    }
  });

  it('accepts rated-current rows across the 15 A to 19 A band (9 to 11 lamps and exact boundaries)', () => {
    const gains = { vp: 0, vs: 0, am: 0, wm: 0 };

    for (const ratedLamps of [9, 11]) {
      const lampSteps = [0, 2, 4, 6, 8, ratedLamps];
      const rows = lampSteps.map((lamps, idx) => {
        const knob = findVariacForTargetV1(
          ex3_1,
          CANONICAL_WIRES,
          230,
          lamps,
          gains,
        );
        const controls = {
          'sup.switch': true,
          'va.knob': knob,
          'wm.vRange': 300,
          'wm.iRange': 10,
          'ld.lamps': lamps,
        };
        const { output } = evaluateExperimentPhysics(
          ex3_1,
          CANONICAL_WIRES,
          controls,
          gains,
        );
        return captureObservationRow(stage, output, controls, idx + 1, `rb_${idx + 1}`);
      });

      const noLoad = rows.find((r) => getRowNumber(r, 'i2') <= 0.1)!;
      const rated = rows.find((r) => {
        const i2 = getRowNumber(r, 'i2');
        return i2 >= 15 && i2 <= 19;
      })!;
      expect(rated).toBeDefined();

      const studentReg =
        ((getRowNumber(noLoad, 'v2') - getRowNumber(rated, 'v2')) / 115) * 100;
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
        ex3_1,
        { [stage.id]: rows },
        {
          regulationPct: studentReg,
          maxEffLoadPct: (bestVA / 2000) * 100,
        },
      );
      expect(check.passed).toBe(true);
    }

    const baseRow = referenceRun(ex3_1, 1, gains).rowsByStage[stage.id][0];
    const hasRated = (i2: number) =>
      evaluateStagePrerequisites(stage, [
        { ...baseRow, values: { ...baseRow.values, i2 } },
      ]).find((p) => p.id === 'rated-row')!.met;
    expect(hasRated(15.0)).toBe(true);
    expect(hasRated(19.0)).toBe(true);
    expect(hasRated(14.99)).toBe(false);
    expect(hasRated(19.01)).toBe(false);
  });

  it('returns structured failures without leaking true numeric values', () => {
    const truth = computeRunTruth(DEFAULT_TRANSFORMER_PARAMS);
    const run = referenceRun(ex3_1, 1, { vp: 0, vs: 0, am: 0, wm: 0 });
    const rows = run.rowsByStage[stage.id];

    const shortRes = checkRunAnswers(
      ex3_1,
      { [stage.id]: rows.slice(0, 4) },
      { regulationPct: truth.regulationPct, maxEffLoadPct: truth.maxEffLoadPct },
    );
    expect(shortRes.passed).toBe(false);
    expect(shortRes.failedPrerequisites).toContain('min-rows');

    const noZeroRes = checkRunAnswers(
      ex3_1,
      { [stage.id]: rows.slice(1) },
      { regulationPct: truth.regulationPct, maxEffLoadPct: truth.maxEffLoadPct },
    );
    expect(noZeroRes.passed).toBe(false);
    expect(noZeroRes.failedPrerequisites).toContain('no-load-row');

    const noRatedRows = rows.filter((r) => getRowNumber(r, 'i2') < 15);
    const noRatedRes = checkRunAnswers(
      ex3_1,
      { [stage.id]: noRatedRows },
      { regulationPct: truth.regulationPct, maxEffLoadPct: truth.maxEffLoadPct },
    );
    expect(noRatedRes.passed).toBe(false);
    expect(noRatedRes.failedPrerequisites).toContain('rated-row');

    const saggedRows = rows.map((r, idx) =>
      idx >= 3 ? { ...r, values: { ...r.values, v1: 225.0 }, v1: 225.0 } : r,
    );
    const v1Res = checkRunAnswers(
      ex3_1,
      { [stage.id]: saggedRows },
      { regulationPct: 4.5, maxEffLoadPct: 30 },
    );
    expect(v1Res.passed).toBe(false);
    expect(v1Res.failedRowRules).toContain('v1-hold');
    expect(v1Res.failedAnswers).toEqual(['regulationPct', 'maxEffLoadPct']);
    expect(v1Res.hints.some((h) => h.includes('4, 5, 6, 7'))).toBe(true);
    expect(v1Res.hints.some((h) => h.includes('differed'))).toBe(true);

    const allText = [...v1Res.failedCriteria, ...v1Res.hints].join(' ');
    expect(allText).not.toContain(truth.regulationPct.toFixed(2));
    expect(allText).not.toContain(truth.maxEffLoadPct.toFixed(1));
  });
});
