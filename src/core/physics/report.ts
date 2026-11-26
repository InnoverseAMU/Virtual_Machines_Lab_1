import type {
  ObservationRow,
  RunAnswers,
  RunCheckResult,
  RunPrerequisites,
  RunTruth,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../types';
import type { TransformerLoadParams } from './models/transformerLoad';

export const V1_HOLD_TOLERANCE_V = 2;
export const REGULATION_TOLERANCE_PP = 0.4;
export const MAX_EFF_LOAD_TOLERANCE_PP = 15;
export const MAX_OBSERVATION_ROWS = 20;

export function captureObservationRow(
  output: TransformerLoadOutput,
  controls: TransformerLoadControls,
  sno: number,
  id: string,
): ObservationRow {
  const v1 = Number(output.meters.vp.shownValue.toFixed(1));
  const i2 = Number(output.meters.am.shownValue.toFixed(2));
  const v2 = Number(output.meters.vs.shownValue.toFixed(1));
  const dial = Number(output.meters.wm.dial.toFixed(1));
  const mf = Number(output.meters.wm.mf.toFixed(2));
  const p1 = Number((output.meters.wm.dial * output.meters.wm.mf).toFixed(1));

  return {
    id,
    sno,
    v1,
    i2,
    v2,
    dial,
    mf,
    p1,
    lamps: controls.lamps,
    v1OutOfRange: Math.abs(v1 - 230) > V1_HOLD_TOLERANCE_V,
  };
}

export function computeRowLoadVA(row: Pick<ObservationRow, 'v2' | 'i2'>): number {
  return row.v2 * row.i2;
}

export function computeRowEfficiency(
  row: Pick<ObservationRow, 'v2' | 'i2' | 'p1'>,
): number {
  if (row.p1 <= 0 || row.i2 <= 0) return 0;
  return ((row.v2 * row.i2) / row.p1) * 100;
}

/**
 * Computes true model voltage regulation (at V1 = V1rated, I2 = 0 to I2rated)
 * and maximum-efficiency load percentage (sqrt(Pi / Pcu_fl) * 100).
 */
export function computeRunTruth(params: TransformerLoadParams): RunTruth {
  const v1s = params.V1rated / params.a;
  const v2NoLoad = v1s;
  const v2FullLoad =
    Math.sqrt(Math.max(0, v1s * v1s - (params.I2rated * params.X2eq) ** 2)) -
    params.I2rated * params.R2eq;
  const regulationPct = ((v2NoLoad - v2FullLoad) / params.V2rated) * 100;

  const pcuFullLoad = params.I2rated * params.I2rated * params.R2eq;
  const maxEffLoadPct = Math.sqrt(params.Pi / pcuFullLoad) * 100;

  return {
    regulationPct,
    maxEffLoadPct,
    v2NoLoad,
    v2FullLoad,
  };
}

export function evaluateRunPrerequisites(
  rows: ObservationRow[],
): RunPrerequisites {
  const hasMinRows = rows.length >= 6;
  const hasNoLoadRow = rows.some((r) => r.i2 <= 0.1);
  const hasRatedRow = rows.some((r) => r.i2 >= 15 && r.i2 <= 19);
  return {
    rowCount: rows.length,
    hasMinRows,
    hasNoLoadRow,
    hasRatedRow,
    allMet: hasMinRows && hasNoLoadRow && hasRatedRow,
  };
}

/**
 * Checks student's observation rows and calculated report answers against
 * the model's own truth without revealing true numeric values on failure.
 */
export function checkRunAnswers(
  rows: ObservationRow[],
  answers: RunAnswers,
  truth: RunTruth,
): RunCheckResult {
  const prereqs = evaluateRunPrerequisites(rows);
  const failedCriteria: string[] = [];
  const hints: string[] = [];

  if (!prereqs.hasMinRows) {
    failedCriteria.push('Fewer than 6 observation rows recorded.');
    hints.push('Record at least 6 load steps from no-load up to near rated current.');
  }

  if (!prereqs.hasNoLoadRow) {
    failedCriteria.push('Missing a no-load observation row (I2 = 0 A).');
    hints.push('Switch all lamps OFF at 230 V and add a no-load row.');
  }

  if (!prereqs.hasRatedRow) {
    failedCriteria.push(
      'Missing an observation row near rated current (I2 between 15 and 19 A).',
    );
    hints.push(
      'Turn on 9 to 11 lamps (around 15 to 19 A) and record a near-full-load row.',
    );
  }

  const badV1RowNums = rows
    .filter((r) => Math.abs(r.v1 - 230) > V1_HOLD_TOLERANCE_V)
    .map((r) => r.sno);
  const validV1Count = rows.length - badV1RowNums.length;

  if (validV1Count < 5) {
    failedCriteria.push(
      `Primary voltage V1 was within 230 ± ${V1_HOLD_TOLERANCE_V} V in only ${validV1Count} of ${rows.length} rows (at least 5 required).`,
    );
    if (badV1RowNums.length > 0) {
      hints.push(
        `The primary voltage was not held at 230 ± ${V1_HOLD_TOLERANCE_V} V in ${
          badV1RowNums.length === 1 ? 'row' : 'rows'
        } ${badV1RowNums.join(', ')}.`,
      );
    }
  }

  const noLoadRow = rows.find((r) => r.i2 <= 0.1);
  const ratedRow = rows.find((r) => r.i2 >= 15 && r.i2 <= 19);
  const unequalV1 =
    noLoadRow !== undefined &&
    ratedRow !== undefined &&
    Math.abs(noLoadRow.v1 - ratedRow.v1) > V1_HOLD_TOLERANCE_V;

  if (unequalV1) {
    hints.push(
      `Primary voltage V1 differed between your no-load row (${noLoadRow.v1.toFixed(
        1,
      )} V) and your near-rated row (${ratedRow.v1.toFixed(
        1,
      )} V); hold V1 steady at 230 V under load before recording.`,
    );
  }

  if (
    !Number.isFinite(answers.regulationPct) ||
    Math.abs(answers.regulationPct - truth.regulationPct) >
      REGULATION_TOLERANCE_PP
  ) {
    failedCriteria.push(
      'Voltage regulation (%) is outside the acceptable tolerance.',
    );
    hints.push(
      'Check Eq. 3.1.1: Regulation = (V2 no-load − V2 full-load) / 115 × 100 using rows held at V1 = 230 V.',
    );
  }

  if (
    !Number.isFinite(answers.maxEffLoadPct) ||
    Math.abs(answers.maxEffLoadPct - truth.maxEffLoadPct) >
      MAX_EFF_LOAD_TOLERANCE_PP
  ) {
    failedCriteria.push(
      'Load at maximum efficiency (% of 2 kVA) is outside the acceptable tolerance.',
    );
    hints.push(
      'Read the VA load at the peak of the efficiency curve and divide by 2000 VA × 100%.',
    );
  }

  return {
    passed: failedCriteria.length === 0,
    failedCriteria,
    hints,
  };
}
