import { evaluateExperimentPhysics } from '../physics/evaluate';
import { DEFAULT_METER_GAINS } from '../physics/meters';
import type { WireInput } from './nets';
import type {
  ExperimentDef,
  LearnStep,
  MeterGains,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../types';

export interface LearnConditionStatus {
  hasCondition: boolean;
  met: boolean;
  canAcknowledge: boolean;
  hint: string;
}

/**
 * Pure evaluator for Learn mode step completion conditions (steps 12 to 14).
 */
export function evaluateLearnStepCondition(
  step: LearnStep,
  controls: TransformerLoadControls,
  output: TransformerLoadOutput,
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

  const vPrimary = output.meters.vp.shownValue;

  if (cond.kind === 'v1-target') {
    const vOk = Math.abs(vPrimary - cond.targetV) <= cond.toleranceV;
    const met = controls.supplyOn && vOk;
    return {
      hasCondition: true,
      met,
      canAcknowledge: false,
      hint: !controls.supplyOn
        ? `Switch the 230 V supply ON and raise the autotransformer knob to ${cond.targetV} V.`
        : !vOk
          ? `Adjust the autotransformer knob until V primary reads ${cond.targetV} ± ${cond.toleranceV} V (currently ${vPrimary.toFixed(1)} V).`
          : `V primary is within ${cond.targetV} ± ${cond.toleranceV} V.`,
    };
  }

  if (cond.kind === 'no-load-ack') {
    const vOk = Math.abs(vPrimary - cond.targetV) <= cond.toleranceV;
    const lampsOk = controls.lamps === cond.lamps;
    const readyToAck = controls.supplyOn && lampsOk && vOk;
    const met = readyToAck && acknowledged;
    return {
      hasCondition: true,
      met,
      canAcknowledge: readyToAck && !acknowledged,
      hint: !controls.supplyOn
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
  const lampsOk = controls.lamps >= cond.minLamps;
  const vOk = Math.abs(vPrimary - cond.targetV) <= cond.toleranceV;
  const met = controls.supplyOn && lampsOk && vOk;
  return {
    hasCondition: true,
    met,
    canAcknowledge: false,
    hint: !controls.supplyOn
      ? 'Switch the supply ON first.'
      : !lampsOk
        ? `Switch on at least ${cond.minLamps} lamps (currently ${controls.lamps}).`
        : !vOk
          ? `Supply sag dropped V primary to ${vPrimary.toFixed(1)} V. Re-adjust the knob to hold ${cond.targetV} ± ${cond.toleranceV} V.`
          : `Loaded V primary held at ${vPrimary.toFixed(1)} V with ${controls.lamps} lamps.`,
  };
}

/**
 * Finds the integer variac knob setting (0..270 V) that produces V1 closest to
 * targetV1 for the given lamp count and supply sag via bisection.
 * V1 increases monotonically with the variac knob setting.
 */
export function findVariacForTargetV1(
  experiment: ExperimentDef,
  wires: WireInput[],
  targetV1: number,
  lamps: number,
  gains: MeterGains = DEFAULT_METER_GAINS,
): number {
  const knobDef = experiment.controls.find(
    (c) => c.id === 'va.knob' && c.kind === 'knob',
  );
  const minV = knobDef?.kind === 'knob' ? knobDef.min : 0;
  const maxV = knobDef?.kind === 'knob' ? knobDef.max : 270;

  const measureV1 = (variacV: number): number => {
    const res = evaluateExperimentPhysics(
      experiment,
      wires,
      {
        supplyOn: true,
        variacV,
        wmVRange: 300,
        wmIRange: 10,
        lamps,
      },
      gains,
    );
    return res.output.meters.vp.shownValue;
  };

  let lo = minV;
  let hi = maxV;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (measureV1(mid) < targetV1) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const errLo = Math.abs(measureV1(lo) - targetV1);
  const errHi = Math.abs(measureV1(hi) - targetV1);
  return errLo <= errHi ? lo : hi;
}
