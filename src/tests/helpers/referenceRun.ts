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
  ControlValues,
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
  'ex3.2': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const comps = getStageComponents(experiment, stage);
      const wires = wiresFromNetlist(
        stage.acceptedNetlists[0],
        collectInternalLinks(comps),
        comps,
      );

      if (stageIndex === 0) {
        // Stage 1: OC test at Vo = 115 V
        const knob = findVariacForTargetV1(
          experiment,
          wires,
          stage.physicsParams.V2rated ?? 115,
          0,
          gains,
          { stageIndex, seed, meterId: 'vm', knobControlId: 'va.knob' },
        );
        const controls: ControlValues = {
          'sup.switch': true,
          'va.knob': knob,
          'wm.vRange': 150,
          'wm.iRange': 1,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return [captureObservationRow(stage, output, controls, 1, 'oc_1')];
      }

      // Stage 2: SC test at 25%, 50%, 75%, 100% of rated 8.70 A
      const iRated = stage.physicsParams.I1rated ?? 8.7;
      const targets = [0.25, 0.5, 0.75, 1.0].map((f) => f * iRated);
      return targets.map((targetI, idx) => {
        const knob = findVariacForTargetV1(
          experiment,
          wires,
          targetI,
          0,
          gains,
          { stageIndex, seed, meterId: 'am', knobControlId: 'va.knob' },
        );
        const controls: ControlValues = {
          'sup.switch': true,
          'va.knob': knob,
          'wm.vRange': 75,
          'wm.iRange': 10,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return captureObservationRow(stage, output, controls, idx + 1, `sc_${idx + 1}`);
      });
    },
    computeAnswers: (rowsByStage, experiment) => {
      const ocStage = getStage(experiment, 0);
      const scStage = getStage(experiment, 1);
      const ocRows = rowsByStage[ocStage.id] ?? [];
      const scRows = rowsByStage[scStage.id] ?? [];

      const oc = ocRows[0];
      const vo = getRowNumber(oc, 'vo');
      const io = getRowNumber(oc, 'io');
      const po = getRowNumber(oc, 'po');

      const zo = vo / io;
      const rc_lv = (vo * vo) / po;
      const xm_lv =
        1 / Math.sqrt(Math.max(1e-12, 1 / (zo * zo) - 1 / (rc_lv * rc_lv)));

      const iRated = scStage.physicsParams.I1rated ?? 8.7;
      const vRated = scStage.physicsParams.V1rated ?? 230;
      let sumR = 0;
      let sumX = 0;
      let sumPc = 0;
      for (const r of scRows) {
        const isc = getRowNumber(r, 'isc');
        const vsc = getRowNumber(r, 'vsc');
        const psc = getRowNumber(r, 'psc');
        const z = vsc / isc;
        const R = psc / (isc * isc);
        const X = Math.sqrt(Math.max(0, z * z - R * R));
        const pc = (iRated / isc) ** 2 * psc;
        sumR += R;
        sumX += X;
        sumPc += pc;
      }
      const n = scRows.length;
      const R_hv = sumR / n;
      const X_hv = sumX / n;
      const Pc = sumPc / n;

      const rpu = (iRated * R_hv) / vRated;
      const xpu = (iRated * X_hv) / vRated;
      const VR_lag = (rpu * 0.8 + xpu * 0.6) * 100;
      const VR_lead = (rpu * 0.8 - xpu * 0.6) * 100;
      const xMaxEff = Math.sqrt(po / Pc);

      return {
        rc_lv,
        xm_lv,
        R_hv,
        X_hv,
        Pc,
        VR_lag,
        VR_lead,
        xMaxEff,
      };
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
