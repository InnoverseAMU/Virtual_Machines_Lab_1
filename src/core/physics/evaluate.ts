import { deriveConnectionState, matchFaultPatterns } from '../circuit/faults';
import { buildNets, type WireInput } from '../circuit/nets';
import type {
  ConnectionState,
  ExperimentDef,
  MeterGains,
  RuntimeEvent,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../types';
import { DEFAULT_METER_GAINS } from './meters';
import {
  extractTransformerParams,
  solveTransformerLoad,
  type SolveOptions,
} from './models/transformerLoad';

export interface ExperimentEvaluation {
  connectionState: ConnectionState;
  output: TransformerLoadOutput;
}

/**
 * Pure bridge from experiment definition, wiring, and control inputs
 * to ConnectionState, physics quantities, meter readings, and runtime events.
 */
export function evaluateExperimentPhysics(
  experiment: ExperimentDef,
  wires: WireInput[],
  controls: TransformerLoadControls,
  gains: MeterGains = DEFAULT_METER_GAINS,
  options: SolveOptions = {},
): ExperimentEvaluation {
  const graph = buildNets(experiment.components, wires);
  const faults = matchFaultPatterns(experiment.faultPatterns, graph);
  const connectionState = deriveConnectionState(
    graph,
    faults,
    controls.supplyOn,
  );

  if (experiment.physicsModel !== 'transformerLoad') {
    throw new Error(`Unsupported physics model: ${experiment.physicsModel}`);
  }

  const params = extractTransformerParams(experiment.physicsParams);
  const output = solveTransformerLoad(
    params,
    controls,
    connectionState,
    gains,
    options,
  );

  return { connectionState, output };
}

/**
 * Checks whether powering ON with the autotransformer above 10 V should emit
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
