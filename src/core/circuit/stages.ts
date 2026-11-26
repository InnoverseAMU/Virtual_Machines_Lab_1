import { getComponentDef } from '../components';
import type {
  CameraPresetDef,
  ComponentInstance,
  ControlValues,
  ExperimentDef,
  LearnStep,
  StageDef,
  TerminalId,
  Wire,
} from '../types';
import { collectInternalLinks, UnionFind } from './nets';

export const DEFAULT_CAMERA_PRESETS: CameraPresetDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    pos: [0.25, 9.2, 8.4],
    target: [0.25, -1.15, 0.05],
  },
  {
    id: 'supply',
    label: 'Supply',
    pos: [-3.45, 3.8, 4.3],
    target: [-3.45, -0.75, -0.15],
  },
  {
    id: 'meters',
    label: 'Meters',
    pos: [0.05, 6.2, 6.0],
    target: [0.05, -1.1, -0.15],
  },
  {
    id: 'transformer',
    label: 'Transformer',
    pos: [0.15, 4.4, 4.8],
    target: [0.15, -0.75, 0.15],
  },
  {
    id: 'load',
    label: 'Load',
    pos: [2.0, 6.6, 6.3],
    target: [2.0, -1.2, -0.15],
  },
];

export function getStage(
  experiment: ExperimentDef,
  stageIndex = 0,
): StageDef {
  const clamped = Math.max(0, Math.min(experiment.stages.length - 1, stageIndex));
  return experiment.stages[clamped];
}

export function getStageIndexById(
  experiment: ExperimentDef,
  stageId: string | undefined,
): number {
  if (!stageId) return 0;
  const idx = experiment.stages.findIndex((s) => s.id === stageId);
  return idx >= 0 ? idx : 0;
}

export function getStageComponents(
  experiment: ExperimentDef,
  stage: StageDef,
): ComponentInstance[] {
  const byId = new Map(experiment.components.map((c) => [c.id, c]));
  const result: ComponentInstance[] = [];
  for (const cid of stage.componentIds) {
    const comp = byId.get(cid);
    if (!comp) continue;
    const overridePos = stage.componentPositions?.[cid];
    const overrideParams = stage.componentParams?.[cid];
    if (overridePos || overrideParams) {
      result.push({
        ...comp,
        ...(overridePos ? { position: overridePos } : {}),
        ...(overrideParams ? { params: { ...comp.params, ...overrideParams } } : {}),
      });
    } else {
      result.push(comp);
    }
  }
  return result;
}

export function getStageCameraPresets(stage: StageDef): CameraPresetDef[] {
  return stage.cameraPresets && stage.cameraPresets.length > 0
    ? stage.cameraPresets
    : DEFAULT_CAMERA_PRESETS;
}

export interface StageTerminalNetInfo {
  netIndex: number;
  label: string;
}

/**
 * Finds which canonical stage net a terminal belongs to (for Observe mode tooltips and highlighting).
 */
export function findStageTerminalNetInfo(
  stage: StageDef,
  terminalId: TerminalId,
): StageTerminalNetInfo | null {
  const netlist = stage.acceptedNetlists[0];
  if (!netlist) return null;
  const netIndex = netlist.findIndex((net) => net.includes(terminalId));
  if (netIndex < 0) return null;
  return {
    netIndex,
    label: stage.netLabels?.[netIndex] ?? `Net ${netIndex + 1}`,
  };
}

export function getAllLearnSteps(experiment: ExperimentDef): LearnStep[] {
  return experiment.stages.flatMap((stage) =>
    stage.learnSteps.map((step) => ({
      ...step,
      stageId: step.stageId ?? stage.id,
    })),
  );
}

export function getStageHints(
  experiment: ExperimentDef,
  stage: StageDef,
): string[] {
  return stage.hints && stage.hints.length > 0 ? stage.hints : experiment.hints;
}

export function getStageSolutionNote(
  experiment: ExperimentDef,
  stage: StageDef,
): string {
  return stage.solutionNote ?? experiment.solutionNote;
}

/**
 * Applies stage carryOver policy when transitioning from one stage to the next.
 * - 'none' (default): returns [] (fresh bench).
 * - 'consistent-wires': keeps wires whose terminals both exist in the next stage
 *   and belong to the same net in at least one of the next stage's acceptedNetlists.
 */
export function applyStageCarryOver(
  wires: Wire[],
  nextStage: StageDef,
  nextStageComponents: ComponentInstance[],
  nextControls: ControlValues = {},
): Wire[] {
  if (nextStage.carryOver !== 'consistent-wires') {
    return [];
  }

  const validTerminals = new Set<TerminalId>();
  for (const comp of nextStageComponents) {
    const def = getComponentDef(comp.type);
    for (const term of def.terminals) {
      validTerminals.add(`${comp.id}.${term.name}`);
    }
  }

  const internalLinks = collectInternalLinks(nextStageComponents, nextControls);
  const netlistGraphs = nextStage.acceptedNetlists.map((netlist) => {
    const uf = new UnionFind();
    for (const [a, b] of internalLinks) {
      uf.union(a, b);
    }
    for (const net of netlist) {
      for (let i = 1; i < net.length; i++) {
        uf.union(net[0], net[i]);
      }
    }
    return uf;
  });

  const acceptedTerminals = new Set<TerminalId>(
    nextStage.acceptedNetlists.flat(2),
  );

  return wires.filter((w) => {
    if (!validTerminals.has(w.a) || !validTerminals.has(w.b)) return false;
    if (!acceptedTerminals.has(w.a) || !acceptedTerminals.has(w.b)) return false;
    return netlistGraphs.some((uf) => uf.connected(w.a, w.b));
  });
}
