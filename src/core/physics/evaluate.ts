import { matchFaultPatterns } from '../circuit/faults';
import { buildNets, type WireInput } from '../circuit/nets';
import { getStage, getStageComponents } from '../circuit/stages';
import type {
  BaseConnectionState,
  ControlValues,
  ExperimentDef,
  MeterGains,
  MeterReading,
  PhysicsSolveOutput,
  RuntimeEvent,
  TransformerLoadControls,
} from '../types';
import { DEFAULT_METER_GAINS } from './meters';
import { getPhysicsModel } from './registry';

export interface EvaluateOptions {
  stageIndex?: number;
  seed?: number;
  noSag?: boolean;
}

export interface ExperimentEvaluation<
  TConn extends BaseConnectionState = BaseConnectionState,
> {
  connectionState: TConn;
  output: PhysicsSolveOutput;
}

/**
 * Normalizes either legacy TransformerLoadControls or generic ControlValues
 * into a flat ControlValues map keyed by control id.
 */
export function getSupplySwitchId(
  controls: ControlValues | Record<string, unknown>,
): string {
  if ('dcSupply.switch' in controls) return 'dcSupply.switch';
  if ('sup3.switch' in controls) return 'sup3.switch';
  return 'sup.switch';
}

export function isSupplySwitchOn(
  controls: ControlValues | TransformerLoadControls,
): boolean {
  const vals = toControlValues(controls);
  return Boolean(
    vals['sup.switch'] ?? vals['sup3.switch'] ?? vals['dcSupply.switch'],
  );
}

export function toControlValues(
  controls: ControlValues | TransformerLoadControls,
): ControlValues {
  if (
    'supplyOn' in controls &&
    !('sup.switch' in controls) &&
    !('sup3.switch' in controls) &&
    !('dcSupply.switch' in controls)
  ) {
    const legacy = controls as TransformerLoadControls;
    return {
      'sup.switch': legacy.supplyOn,
      'va.knob': legacy.variacV,
      'wm.vRange': legacy.wmVRange,
      'wm.iRange': legacy.wmIRange,
      'ld.lamps': legacy.lamps,
    };
  }
  return controls as ControlValues;
}

/**
 * Looks up a meter reading by component id from a generic PhysicsSolveOutput.
 */
export function findMeterReading(
  output: PhysicsSolveOutput | undefined,
  meterId: string,
): MeterReading | undefined {
  return output?.meters.find((m) => m.id === meterId);
}

/**
 * Pure bridge from experiment stage, wiring, and control inputs
 * to ConnectionState, physics quantities, generic meter readings, and runtime events.
 */
export function evaluateExperimentPhysics(
  experiment: ExperimentDef,
  wires: WireInput[],
  controls: ControlValues | TransformerLoadControls,
  gains: Record<string, number> | MeterGains = DEFAULT_METER_GAINS,
  options: EvaluateOptions = {},
): ExperimentEvaluation {
  const stage = getStage(experiment, options.stageIndex ?? 0);
  const components = getStageComponents(experiment, stage);
  const controlValues = toControlValues(controls);

  const graph = buildNets(components, wires, controlValues);
  const faults = matchFaultPatterns(stage.faultPatterns, graph);
  const model = getPhysicsModel(stage.physicsModel);

  const connectionState = model.deriveConnectionState(
    graph,
    controlValues,
    stage.physicsParams,
    faults,
    options.seed,
  );

  const output = model.solve({
    params: stage.physicsParams,
    controls: controlValues,
    connectionState,
    gains,
    seed: options.seed,
    options: { noSag: options.noSag },
    components,
  });

  return { connectionState, output };
}

/**
 * Checks whether powering ON with an autotransformer above 10 V should emit
 * a startup safety warning (Spec Section 8).
 */
export function checkPowerOnSafety(variacV: number): RuntimeEvent | null {
  if (variacV > 10) {
    return {
      id: 'power-on-non-zero',
      severity: 'warning',
      message: 'Start the autotransformer from zero.',
    };
  }
  return null;
}
