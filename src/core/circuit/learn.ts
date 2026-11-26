import {
  evaluateExperimentPhysics,
  findMeterReading,
  toControlValues,
} from '../physics/evaluate';
import { DEFAULT_METER_GAINS } from '../physics/meters';
import type { WireInput } from './nets';
import { getStage } from './stages';
import type {
  ControlValues,
  ExperimentDef,
  LearnStep,
  MeterGains,
  PhysicsSolveOutput,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../types';

export interface LearnConditionStatus {
  hasCondition: boolean;
  met: boolean;
  canAcknowledge: boolean;
  hint: string;
}

function readMeterShown(
  output: PhysicsSolveOutput | TransformerLoadOutput,
  meterId: string,
): number {
  if (Array.isArray(output.meters)) {
    return findMeterReading(output as PhysicsSolveOutput, meterId)?.shownValue ?? 0;
  }
  const legacyMeters = (output as TransformerLoadOutput).meters;
  if (meterId === 'vp') return legacyMeters.vp.shownValue;
  if (meterId === 'vs') return legacyMeters.vs.shownValue;
  if (meterId === 'am') return legacyMeters.am.shownValue;
  if (meterId === 'wm') return legacyMeters.wm.shownValue;
  return 0;
}

/**
 * Pure evaluator for Learn mode step completion conditions.
 */
export function evaluateLearnStepCondition(
  step: LearnStep,
  controls: ControlValues | TransformerLoadControls,
  output: PhysicsSolveOutput | TransformerLoadOutput,
  acknowledged: boolean,
): LearnConditionStatus {
  const cond = step.completionCondition;
  if (!cond) {
    return {
      hasCondition: false,
      met: true,
      canAcknowledge: false,
      hint: '',
    };
  }

  const vals = toControlValues(controls);
  const supplyOn = Boolean(vals['sup.switch']);
  const meterId = cond.meterId ?? 'vp';
  const vPrimary = readMeterShown(output, meterId);

  if (cond.kind === 'v1-target') {
    const vOk = Math.abs(vPrimary - cond.targetV) <= cond.toleranceV;
    const met = supplyOn && vOk;
    const unit = cond.unit ?? 'V';
    const label = cond.targetLabel ?? (meterId === 'vp' ? 'V primary' : meterId);
    const dec = unit === 'A' ? 2 : 1;
    return {
      hasCondition: true,
      met,
      canAcknowledge: false,
      hint: !supplyOn
        ? `Switch the 230 V supply ON and adjust the autotransformer knob until ${label} reads ${cond.targetV} ${unit}.`
        : !vOk
          ? `Adjust the autotransformer knob until ${label} reads ${cond.targetV} ± ${cond.toleranceV} ${unit} (currently ${vPrimary.toFixed(dec)} ${unit}).`
          : `${label} is within ${cond.targetV} ± ${cond.toleranceV} ${unit}.`,
    };
  }

  if (cond.kind === 'no-load-ack') {
    const loadId = cond.loadControlId ?? 'ld.lamps';
    const lamps = Number(vals[loadId] ?? 0);
    const vOk = Math.abs(vPrimary - cond.targetV) <= cond.toleranceV;
    const lampsOk = lamps === cond.lamps;
    const readyToAck = supplyOn && lampsOk && vOk;
    const met = readyToAck && acknowledged;
    return {
      hasCondition: true,
      met,
      canAcknowledge: readyToAck && !acknowledged,
      hint: !supplyOn
        ? 'Keep the 230 V supply ON with 0 lamps and V primary at 230 V.'
        : !lampsOk
          ? `Switch all lamps OFF (${cond.lamps} lamps required for no-load).`
          : !vOk
            ? `Hold V primary at ${cond.targetV} ± ${cond.toleranceV} V (currently ${vPrimary.toFixed(1)} V).`
            : acknowledged
              ? 'No-load reading recorded.'
              : 'Read V2 and the wattmeter, then press "Got it" to continue.',
    };
  }

  // loaded-v1-target
  const loadId = cond.loadControlId ?? 'ld.lamps';
  const lamps = Number(vals[loadId] ?? 0);
  const lampsOk = lamps >= cond.minLamps;
  const vOk = Math.abs(vPrimary - cond.targetV) <= cond.toleranceV;
  const met = supplyOn && lampsOk && vOk;
  return {
    hasCondition: true,
    met,
    canAcknowledge: false,
    hint: !supplyOn
      ? 'Switch the supply ON first.'
      : !lampsOk
        ? `Switch on at least ${cond.minLamps} lamps (currently ${lamps}).`
        : !vOk
          ? `Supply sag dropped V primary to ${vPrimary.toFixed(1)} V. Re-adjust the knob to hold ${cond.targetV} ± ${cond.toleranceV} V.`
          : `Loaded V primary held at ${vPrimary.toFixed(1)} V with ${lamps} lamps.`,
  };
}

export function buildDefaultControlValues(experiment: ExperimentDef, stageIndex = 0): ControlValues {
  const stage = getStage(experiment, stageIndex);
  const vals: ControlValues = {};
  for (const ctrl of stage.controls) {
    vals[ctrl.id] = ctrl.defaultValue;
  }
  return vals;
}

/**
 * Finds the knob setting (quantized to step) that produces meter reading closest
 * to targetV1 for the given load step via bisection.
 */
export function findVariacForTargetV1(
  experiment: ExperimentDef,
  wires: WireInput[],
  targetV1: number,
  lamps: number,
  gains: Record<string, number> | MeterGains = DEFAULT_METER_GAINS,
  options: {
    stageIndex?: number;
    seed?: number;
    knobControlId?: string;
    loadControlId?: string;
    meterId?: string;
    baseControls?: ControlValues;
  } = {},
): number {
  const stageIndex = options.stageIndex ?? 0;
  const stage = getStage(experiment, stageIndex);
  const knobId = options.knobControlId ?? 'va.knob';
  const loadId = options.loadControlId ?? 'ld.lamps';
  const meterId = options.meterId ?? 'vp';

  const knobDef = stage.controls.find(
    (c) => c.id === knobId && c.kind === 'knob',
  );
  const minV = knobDef?.kind === 'knob' ? knobDef.min : 0;
  const maxV = knobDef?.kind === 'knob' ? knobDef.max : 270;
  const step = knobDef?.kind === 'knob' ? knobDef.step : 1;

  const base = options.baseControls ?? buildDefaultControlValues(experiment, stageIndex);

  const measureV1 = (variacV: number): number => {
    const res = evaluateExperimentPhysics(
      experiment,
      wires,
      {
        ...base,
        'sup.switch': true,
        [knobId]: variacV,
        ...(loadId in base ? { [loadId]: lamps } : {}),
      },
      gains,
      { stageIndex, seed: options.seed },
    );
    if (res.output.mcbTripped) return Infinity;
    return findMeterReading(res.output, meterId)?.shownValue ?? 0;
  };

  const totalSteps = Math.max(1, Math.round((maxV - minV) / step));
  let loStep = 0;
  let hiStep = totalSteps;
  while (hiStep - loStep > 1) {
    const midStep = Math.floor((loStep + hiStep) / 2);
    const midV = Number((minV + midStep * step).toFixed(4));
    if (measureV1(midV) < targetV1) {
      loStep = midStep;
    } else {
      hiStep = midStep;
    }
  }

  const loV = Number((minV + loStep * step).toFixed(4));
  const hiV = Number((minV + hiStep * step).toFixed(4));
  const errLo = Math.abs(measureV1(loV) - targetV1);
  const errHi = Math.abs(measureV1(hiV) - targetV1);
  return errLo <= errHi ? loV : hiV;
}
