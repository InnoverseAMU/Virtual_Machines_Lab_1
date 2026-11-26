import { findVariacForTargetV1 } from '../../core/circuit/learn';
import { collectInternalLinks, wiresFromNetlist } from '../../core/circuit/nets';
import { getStage, getStageComponents } from '../../core/circuit/stages';
import { evaluateExperimentPhysics } from '../../core/physics/evaluate';
import { drawSessionMeterGains } from '../../core/physics/meters';
import {
  captureObservationRow,
  checkRunAnswers,
  computeRowEfficiency,
  computeRowLoadVA,
  getRowNumber,
} from '../../core/physics/report';
import type {
  ExperimentDef,
  ObservationRow,
  RunCheckResult,
} from '../../core/types';

export interface ReferenceRunResult {
  passed: boolean;
  result: RunCheckResult;
  rowsByStage: Record<string, ObservationRow[]>;
  studentAnswers: Record<string, number | string>;
  gains: Record<string, number>;
}

export type StageProcedureRunner = (ctx: {
  experiment: ExperimentDef;
  stageIndex: number;
  seed: number;
  gains: Record<string, number>;
}) => ObservationRow[];

export type AnswerCalculator = (
  rowsByStage: Record<string, ObservationRow[]>,
  experiment: ExperimentDef,
) => Record<string, number | string>;

const DEFAULT_PROCEDURES: Record<
  string,
  {
    runStage: StageProcedureRunner;
    computeAnswers: AnswerCalculator;
  }
> = {
  'ex3.1': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const comps = getStageComponents(experiment, stage);
      const wires = wiresFromNetlist(
        stage.acceptedNetlists[0],
        collectInternalLinks(comps),
        comps,
      );
      const lampSteps = [0, 2, 4, 6, 8, 10, 11];
      return lampSteps.map((lamps, idx) => {
        const knob = findVariacForTargetV1(
          experiment,
          wires,
          stage.physicsParams.V1rated ?? 230,
          lamps,
          gains,
          { stageIndex, seed },
        );
        const controls = {
          'sup.switch': true,
          'va.knob': knob,
          'wm.vRange': 300,
          'wm.iRange': 10,
          'ld.lamps': lamps,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return captureObservationRow(stage, output, controls, idx + 1, `ref_${idx + 1}`);
      });
    },
    computeAnswers: (rowsByStage, experiment) => {
      const stage = getStage(experiment, 0);
      const rows = rowsByStage[stage.id] ?? [];
      const noLoad = rows.find((r) => getRowNumber(r, 'i2') <= 0.1)!;
      const rated = rows.find((r) => {
        const i2 = getRowNumber(r, 'i2');
        return i2 >= 15 && i2 <= 19;
      })!;
      const regulationPct =
        ((getRowNumber(noLoad, 'v2') - getRowNumber(rated, 'v2')) /
          (stage.physicsParams.V2rated ?? 115)) *
        100;

      let bestEff = -1;
      let bestVA = 0;
      for (const r of rows) {
        const eff = computeRowEfficiency(r);
        if (eff > bestEff) {
          bestEff = eff;
          bestVA = computeRowLoadVA(r);
        }
      }
      const maxEffLoadPct = (bestVA / 2000) * 100;
      return { regulationPct, maxEffLoadPct };
    },
  },
};

/**
 * QUEUE_RULES referenceRun helper:
 * Wires the canonical netlist for each stage, runs the manual's procedure,
 * records schema-driven rows, computes the manual's student answers from the
 * noisy recorded rows, and checks all prerequisites, row rules, and answers.
 */
export function referenceRun(
  experiment: ExperimentDef,
  seed: number,
  gains?: Record<string, number>,
  custom?: {
    runStage?: StageProcedureRunner;
    computeAnswers?: AnswerCalculator;
  },
): ReferenceRunResult {
  const allMeterIds = Array.from(
    new Set(
      experiment.components
        .filter(
          (c) =>
            c.type === 'voltmeter' ||
            c.type === 'ammeter' ||
            c.type === 'wattmeter',
        )
        .map((c) => c.id),
    ),
  );
  const resolvedGains = gains ?? drawSessionMeterGains(seed, allMeterIds);
  const proc = DEFAULT_PROCEDURES[experiment.id];
  const runStage = custom?.runStage ?? proc?.runStage;
  const computeAnswers = custom?.computeAnswers ?? proc?.computeAnswers;

  if (!runStage || !computeAnswers) {
    throw new Error(`No reference procedure registered for ${experiment.id}`);
  }

  const rowsByStage: Record<string, ObservationRow[]> = {};
  for (let i = 0; i < experiment.stages.length; i++) {
    const stage = experiment.stages[i];
    rowsByStage[stage.id] = runStage({
      experiment,
      stageIndex: i,
      seed,
      gains: resolvedGains,
    });
  }

  const studentAnswers = computeAnswers(rowsByStage, experiment);
  const result = checkRunAnswers(experiment, rowsByStage, studentAnswers);

  return {
    passed: result.passed,
    result,
    rowsByStage,
    studentAnswers,
    gains: resolvedGains,
  };
}
