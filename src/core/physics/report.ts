import { getStage } from '../circuit/stages';
import { findMeterReading, toControlValues } from './evaluate';
import type { TransformerLoadParams } from './models/transformerLoad';
import { getPhysicsModel } from './registry';
import type {
  AnswerSpec,
  ColumnDef,
  ControlValues,
  ExperimentDef,
  ObservationCellValue,
  ObservationRow,
  ObservationRowValues,
  PhysicsModel,
  PhysicsSolveOutput,
  RowRule,
  RunAnswers,
  RunCheckResult,
  RunPrerequisites,
  RunTruth,
  StageDef,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../types';

export const V1_HOLD_TOLERANCE_V = 2;
export const REGULATION_TOLERANCE_PP = 0.4;
export const MAX_EFF_LOAD_TOLERANCE_PP = 15;
export const MAX_OBSERVATION_ROWS = 20;

export function getRowValue(
  row: ObservationRow,
  colId: string,
): ObservationCellValue {
  if (colId in row.values) return row.values[colId];
  return colId in row ? (row[colId] as ObservationCellValue) : null;
}

export function getRowNumber(
  row: ObservationRow,
  colId: string,
  fallback = 0,
): number {
  const val = getRowValue(row, colId);
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = Number.parseFloat(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function roundToDecimals(value: number, decimals?: number): number {
  if (decimals === undefined) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function evaluateColumnValue(
  col: ColumnDef,
  values: ObservationRowValues,
  params: Record<string, number>,
): ObservationCellValue {
  if (col.source.kind === 'derived') {
    const raw = col.source.compute(values, params);
    if (raw === null || !Number.isFinite(raw)) return null;
    return roundToDecimals(raw, col.decimals);
  }
  return values[col.id] ?? null;
}

export interface EvaluatedRowRuleViolation {
  ruleId: string;
  amber: boolean;
  message: string;
  highlightColumnIds: string[];
}

export function evaluateRowRules(
  stage: StageDef,
  row: ObservationRow,
): EvaluatedRowRuleViolation[] {
  const violations: EvaluatedRowRuleViolation[] = [];
  for (const rule of stage.rowRules) {
    if (!rule.predicate(row, stage.physicsParams)) {
      const msg =
        typeof rule.message === 'function'
          ? rule.message(row, stage.physicsParams)
          : rule.message;
      violations.push({
        ruleId: rule.id,
        amber: rule.amber,
        message: msg,
        highlightColumnIds: rule.highlightColumnIds ?? [],
      });
    }
  }
  return violations;
}

export interface EvaluatedPrerequisite {
  id: string;
  label: string;
  met: boolean;
  failMessage: string;
  failHint: string;
}

export function evaluateStagePrerequisites(
  stage: StageDef,
  rows: ObservationRow[],
): EvaluatedPrerequisite[] {
  return stage.prerequisites.map((p) => ({
    id: p.id,
    label:
      typeof p.label === 'function'
        ? p.label(rows, stage.physicsParams)
        : p.label,
    met: p.predicate(rows, stage.physicsParams),
    failMessage: p.failMessage,
    failHint: p.failHint,
  }));
}

function normalizeLegacyOutputToGeneric(
  output: PhysicsSolveOutput | TransformerLoadOutput,
): PhysicsSolveOutput {
  if (Array.isArray(output.meters)) {
    return output as PhysicsSolveOutput;
  }
  const leg = output as TransformerLoadOutput;
  return {
    meters: [
      {
        id: 'vp',
        label: 'V primary',
        kind: 'voltmeter',
        unit: 'V',
        decimals: 1,
        ...leg.meters.vp,
      },
      {
        id: 'vs',
        label: 'V secondary',
        kind: 'voltmeter',
        unit: 'V',
        decimals: 1,
        ...leg.meters.vs,
      },
      {
        id: 'am',
        label: 'A secondary',
        kind: 'ammeter',
        unit: 'A',
        decimals: 2,
        ...leg.meters.am,
      },
      {
        id: 'wm',
        label: 'Wattmeter',
        kind: 'wattmeter',
        unit: 'W',
        decimals: 1,
        ...leg.meters.wm,
      },
    ],
    events: leg.events,
    mcbTripped: leg.mcbTripped,
    runFailed: leg.runFailed,
    outputs: {
      V1: leg.V1,
      I1: leg.I1,
      V2: leg.V2,
      I2: leg.I2,
      Pout: leg.Pout,
      Pin: leg.Pin,
      Pcu: leg.Pcu,
      Pi: leg.Pi,
      eta: leg.eta,
    },
  };
}

/**
 * Schema-driven capture of an ObservationRow from generic PhysicsSolveOutput and controls.
 */
export function captureStageObservationRow(
  stage: StageDef,
  output: PhysicsSolveOutput | TransformerLoadOutput,
  controls: ControlValues | TransformerLoadControls,
  sno: number,
  id: string,
): ObservationRow {
  const genericOutput = normalizeLegacyOutputToGeneric(output);
  const controlValues = toControlValues(controls);
  const values: ObservationRowValues = {};

  // First pass: sno, meter, control, hidden
  for (const col of stage.observationTable) {
    if (col.source.kind === 'sno') {
      values[col.id] = sno;
    } else if (col.source.kind === 'meter') {
      const m = findMeterReading(genericOutput, col.source.meterId);
      const field = col.source.field ?? 'shownValue';
      const raw =
        field === 'dial'
          ? m?.dial ?? 0
          : field === 'mf'
            ? m?.mf ?? 1
            : field === 'trueValue'
              ? m?.trueValue ?? 0
              : m?.shownValue ?? 0;
      values[col.id] = roundToDecimals(raw, col.decimals);
    } else if (col.source.kind === 'control') {
      const raw = controlValues[col.source.controlId] ?? null;
      values[col.id] =
        typeof raw === 'number' ? roundToDecimals(raw, col.decimals) : raw;
    } else if (col.source.kind === 'hidden') {
      values[col.id] = col.source.capture({
        output: genericOutput,
        controls: controlValues,
        params: stage.physicsParams,
      });
    }
  }

  // Second pass: derived columns (pure functions of row values)
  for (const col of stage.observationTable) {
    if (col.source.kind === 'derived') {
      values[col.id] = evaluateColumnValue(col, values, stage.physicsParams);
    }
  }

  const row: ObservationRow = {
    id,
    sno,
    values,
    ...values,
  };

  // Expose legacy v1OutOfRange flag if v1-hold rule fails (for compatibility)
  const v1Violated = stage.rowRules.some(
    (r) => r.amber && !r.predicate(row, stage.physicsParams),
  );
  row.v1OutOfRange = v1Violated;

  return row;
}

/**
 * Overloaded captureObservationRow supporting both the new schema-driven
 * (stage, output, controls, sno, id) signature and the legacy 4-arg 3.1 signature.
 */
export function captureObservationRow(
  stage: StageDef,
  output: PhysicsSolveOutput | TransformerLoadOutput,
  controls: ControlValues | TransformerLoadControls,
  sno: number,
  id: string,
): ObservationRow;
export function captureObservationRow(
  output: TransformerLoadOutput,
  controls: TransformerLoadControls,
  sno: number,
  id: string,
): ObservationRow;
export function captureObservationRow(
  arg1: StageDef | TransformerLoadOutput,
  arg2: PhysicsSolveOutput | TransformerLoadOutput | TransformerLoadControls,
  arg3: ControlValues | TransformerLoadControls | number,
  arg4: number | string,
  arg5?: string,
): ObservationRow {
  if (typeof arg5 === 'string' && 'observationTable' in arg1) {
    return captureStageObservationRow(
      arg1,
      arg2 as PhysicsSolveOutput | TransformerLoadOutput,
      arg3 as ControlValues | TransformerLoadControls,
      arg4 as number,
      arg5,
    );
  }
  const output = arg1 as TransformerLoadOutput;
  const controls = arg2 as TransformerLoadControls;
  const sno = arg3 as number;
  const id = arg4 as string;

  const v1 = Number(output.meters.vp.shownValue.toFixed(1));
  const i2 = Number(output.meters.am.shownValue.toFixed(2));
  const v2 = Number(output.meters.vs.shownValue.toFixed(1));
  const dial = Number(output.meters.wm.dial.toFixed(1));
  const mf = Number(output.meters.wm.mf.toFixed(2));
  const p1 = Number((output.meters.wm.dial * output.meters.wm.mf).toFixed(1));
  const v1OutOfRange = Math.abs(v1 - 230) > V1_HOLD_TOLERANCE_V;

  const values: ObservationRowValues = {
    sno,
    v1,
    i2,
    v2,
    dial,
    mf,
    p1,
    lamps: controls.lamps,
  };

  return {
    id,
    sno,
    values,
    v1,
    i2,
    v2,
    dial,
    mf,
    p1,
    lamps: controls.lamps,
    v1OutOfRange,
  };
}

export function computeRowLoadVA(row: ObservationRow): number {
  return getRowNumber(row, 'v2') * getRowNumber(row, 'i2');
}

export function computeRowEfficiency(row: ObservationRow): number {
  const p1 = getRowNumber(row, 'p1');
  const i2 = getRowNumber(row, 'i2');
  const v2 = getRowNumber(row, 'v2');
  if (p1 <= 0 || i2 <= 0) return 0;
  return ((v2 * i2) / p1) * 100;
}

/**
 * Computes true model voltage regulation (at V1 = V1rated, I2 = 0 to I2rated)
 * and maximum-efficiency load percentage (sqrt(Pi / Pcu_fl) * 100).
 */
export function computeRunTruth(params: TransformerLoadParams | Record<string, number>): RunTruth {
  const a = params.a ?? 2;
  const V1rated = params.V1rated ?? 230;
  const V2rated = params.V2rated ?? 115;
  const I2rated = params.I2rated ?? 17.39;
  const R2eq = params.R2eq ?? 0.15;
  const X2eq = params.X2eq ?? 0.22;
  const Pi = params.Pi ?? 20;

  const v1s = V1rated / a;
  const v2NoLoad = v1s;
  const v2FullLoad =
    Math.sqrt(Math.max(0, v1s * v1s - (I2rated * X2eq) ** 2)) -
    I2rated * R2eq;
  const regulationPct = ((v2NoLoad - v2FullLoad) / V2rated) * 100;

  const pcuFullLoad = I2rated * I2rated * R2eq;
  const maxEffLoadPct = Math.sqrt(Pi / pcuFullLoad) * 100;

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
  const hasNoLoadRow = rows.some((r) => getRowNumber(r, 'i2') <= 0.1);
  const hasRatedRow = rows.some((r) => {
    const i2 = getRowNumber(r, 'i2');
    return i2 >= 15 && i2 <= 19;
  });
  return {
    rowCount: rows.length,
    hasMinRows,
    hasNoLoadRow,
    hasRatedRow,
    allMet: hasMinRows && hasNoLoadRow && hasRatedRow,
  };
}

function isAnswerWithinTolerance(
  spec: AnswerSpec,
  given: number | string | undefined,
  truthVal: number | string,
): boolean {
  if (spec.kind === 'choice') {
    if (given === undefined || given === null) return false;
    return String(given).trim() === String(truthVal).trim();
  }

  const numGiven =
    typeof given === 'number'
      ? given
      : Number.parseFloat(String(given ?? ''));
  const numTruth =
    typeof truthVal === 'number'
      ? truthVal
      : Number.parseFloat(String(truthVal));

  if (!Number.isFinite(numGiven) || !Number.isFinite(numTruth)) return false;

  const diff = Math.abs(numGiven - numTruth);
  const tol = spec.tolerance;
  if (!tol) return diff === 0;

  if (tol.abs !== undefined && tol.rel !== undefined) {
    return diff <= tol.abs || diff <= Math.abs(numTruth) * tol.rel;
  }
  if (tol.abs !== undefined) {
    return diff <= tol.abs;
  }
  if (tol.rel !== undefined) {
    return diff <= Math.abs(numTruth) * tol.rel;
  }
  return false;
}

/**
 * Generic answer checker evaluating prerequisites, row rules, and answers
 * across all stages of an experiment without leaking true values.
 */
export function evaluateExperimentAnswers(
  experiment: ExperimentDef,
  rowsByStage: Record<string, ObservationRow[]>,
  answers: Record<string, number | string | undefined>,
): RunCheckResult {
  const failedCriteria: string[] = [];
  const hints: string[] = [];
  const failedPrerequisites: string[] = [];
  const failedRowRules: string[] = [];
  const failedAnswers: string[] = [];

  for (const stage of experiment.stages) {
    const stageRows = rowsByStage[stage.id] ?? [];

    for (const prereq of stage.prerequisites) {
      if (!prereq.predicate(stageRows, stage.physicsParams)) {
        failedCriteria.push(prereq.failMessage);
        failedPrerequisites.push(prereq.id);
        hints.push(prereq.failHint);
      }
    }

    for (const rule of stage.rowRules) {
      evaluateRowRuleCheck(
        rule,
        stageRows,
        stage.physicsParams,
        failedCriteria,
        failedRowRules,
        hints,
      );
    }
  }

  const primaryStage = getStage(experiment, 0);
  const primaryRows = rowsByStage[primaryStage.id] ?? [];
  const model: PhysicsModel = getPhysicsModel(primaryStage.physicsModel);

  for (const spec of experiment.answers) {
    const expected = spec.truth(
      primaryRows,
      model,
      primaryStage.physicsParams,
      rowsByStage,
    );
    const given = answers[spec.id];
    if (!isAnswerWithinTolerance(spec, given, expected)) {
      failedCriteria.push(
        spec.failMessage ?? `${spec.label} is outside the acceptable tolerance.`,
      );
      failedAnswers.push(spec.id);
      hints.push(spec.failHint(primaryRows, rowsByStage));
    }
  }

  return {
    passed: failedCriteria.length === 0,
    failedCriteria,
    hints,
    failedPrerequisites,
    failedRowRules,
    failedAnswers,
  };
}

function evaluateRowRuleCheck(
  rule: RowRule,
  stageRows: ObservationRow[],
  params: Record<string, number>,
  failedCriteria: string[],
  failedRowRules: string[],
  hints: string[],
): void {
  const badRows = stageRows.filter((r) => !rule.predicate(r, params));
  const passCount = stageRows.length - badRows.length;

  if (rule.minPassCount !== undefined && passCount < rule.minPassCount) {
    const msg = rule.failMessage
      ? rule.failMessage(passCount, stageRows.length, params)
      : `Row rule "${rule.label ?? rule.id}" passed in ${passCount} of ${stageRows.length} rows (${rule.minPassCount} required).`;
    failedCriteria.push(msg);
    failedRowRules.push(rule.id);
    if (rule.failHint && badRows.length > 0) {
      hints.push(rule.failHint(badRows, params));
    }
  }

  if (rule.crossRowHint) {
    const extraHint = rule.crossRowHint(stageRows, params);
    if (extraHint) {
      hints.push(extraHint);
    }
  }
}

/**
 * Overloaded checkRunAnswers supporting both:
 * 1. Generic: checkRunAnswers(experiment, rowsByStage, answers)
 * 2. Legacy 3.1: checkRunAnswers(rows, answers, truth) (used by golden tests)
 */
export function checkRunAnswers(
  experiment: ExperimentDef,
  rowsByStage: Record<string, ObservationRow[]>,
  answers: Record<string, number | string | undefined>,
): RunCheckResult;
export function checkRunAnswers(
  rows: ObservationRow[],
  answers: RunAnswers,
  truth: RunTruth,
): RunCheckResult;
export function checkRunAnswers(
  arg1: ExperimentDef | ObservationRow[],
  arg2: Record<string, ObservationRow[]> | RunAnswers,
  arg3: Record<string, number | string | undefined> | RunTruth,
): RunCheckResult {
  if (!Array.isArray(arg1)) {
    return evaluateExperimentAnswers(
      arg1,
      arg2 as Record<string, ObservationRow[]>,
      arg3 as Record<string, number | string | undefined>,
    );
  }

  // Legacy 3-arg call: evaluate using the exact same generic prerequisite, rowRule,
  // and tolerance rules as Exp 3.1 (using the provided truth values if overridden).
  const rows = arg1;
  const legacyAnswers = arg2 as RunAnswers;
  const truth = arg3 as RunTruth;

  const prereqs = evaluateRunPrerequisites(rows);
  const failedCriteria: string[] = [];
  const hints: string[] = [];
  const failedPrerequisites: string[] = [];
  const failedRowRules: string[] = [];
  const failedAnswers: string[] = [];

  if (!prereqs.hasMinRows) {
    failedCriteria.push('Fewer than 6 observation rows recorded.');
    failedPrerequisites.push('min-rows');
    hints.push('Record at least 6 load steps from no-load up to near rated current.');
  }

  if (!prereqs.hasNoLoadRow) {
    failedCriteria.push('Missing a no-load observation row (I2 = 0 A).');
    failedPrerequisites.push('no-load-row');
    hints.push('Switch all lamps OFF at 230 V and add a no-load row.');
  }

  if (!prereqs.hasRatedRow) {
    failedCriteria.push(
      'Missing an observation row near rated current (I2 between 15 and 19 A).',
    );
    failedPrerequisites.push('rated-row');
    hints.push(
      'Turn on 9 to 11 lamps (around 15 to 19 A) and record a near-full-load row.',
    );
  }

  const badV1RowNums = rows
    .filter((r) => Math.abs(getRowNumber(r, 'v1') - 230) > V1_HOLD_TOLERANCE_V)
    .map((r) => r.sno);
  const validV1Count = rows.length - badV1RowNums.length;

  if (validV1Count < 5) {
    failedCriteria.push(
      `Primary voltage V1 was within 230 ± ${V1_HOLD_TOLERANCE_V} V in only ${validV1Count} of ${rows.length} rows (at least 5 required).`,
    );
    failedRowRules.push('v1-hold');
    if (badV1RowNums.length > 0) {
      hints.push(
        `The primary voltage was not held at 230 ± ${V1_HOLD_TOLERANCE_V} V in ${
          badV1RowNums.length === 1 ? 'row' : 'rows'
        } ${badV1RowNums.join(', ')}.`,
      );
    }
  }

  const noLoadRow = rows.find((r) => getRowNumber(r, 'i2') <= 0.1);
  const ratedRow = rows.find((r) => {
    const i2 = getRowNumber(r, 'i2');
    return i2 >= 15 && i2 <= 19;
  });
  if (
    noLoadRow !== undefined &&
    ratedRow !== undefined &&
    Math.abs(getRowNumber(noLoadRow, 'v1') - getRowNumber(ratedRow, 'v1')) >
      V1_HOLD_TOLERANCE_V
  ) {
    hints.push(
      `Primary voltage V1 differed between your no-load row (${getRowNumber(
        noLoadRow,
        'v1',
      ).toFixed(1)} V) and your near-rated row (${getRowNumber(
        ratedRow,
        'v1',
      ).toFixed(1)} V); hold V1 steady at 230 V under load before recording.`,
    );
  }

  if (
    !Number.isFinite(legacyAnswers.regulationPct) ||
    Math.abs(legacyAnswers.regulationPct - truth.regulationPct) >
      REGULATION_TOLERANCE_PP
  ) {
    failedCriteria.push(
      'Voltage regulation (%) is outside the acceptable tolerance.',
    );
    failedAnswers.push('regulationPct');
    hints.push(
      'Check Eq. 3.1.1: Regulation = (V2 no-load − V2 full-load) / 115 × 100 using rows held at V1 = 230 V.',
    );
  }

  if (
    !Number.isFinite(legacyAnswers.maxEffLoadPct) ||
    Math.abs(legacyAnswers.maxEffLoadPct - truth.maxEffLoadPct) >
      MAX_EFF_LOAD_TOLERANCE_PP
  ) {
    failedCriteria.push(
      'Load at maximum efficiency (% of 2 kVA) is outside the acceptable tolerance.',
    );
    failedAnswers.push('maxEffLoadPct');
    hints.push(
      'Read the VA load at the peak of the efficiency curve and divide by 2000 VA × 100%.',
    );
  }

  return {
    passed: failedCriteria.length === 0,
    failedCriteria,
    hints,
    failedPrerequisites,
    failedRowRules,
    failedAnswers,
  };
}
