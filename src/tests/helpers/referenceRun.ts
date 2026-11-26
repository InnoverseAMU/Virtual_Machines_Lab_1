import { findVariacForTargetV1 } from '../../core/circuit/learn';
import { collectInternalLinks, wiresFromNetlist } from '../../core/circuit/nets';
import { STAGE2_REQUIRED_PAIRS } from '../../core/experiments/ex3_6';
import { getStage, getStageComponents } from '../../core/circuit/stages';
import {
  getCanonicalStageNetsForSeed,
  getScrambledTerminalMap,
} from '../../core/phasor/ex3_5Scramble';
import { findMeterReading, evaluateExperimentPhysics } from '../../core/physics/evaluate';
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
  'ex3.3': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const comps = getStageComponents(experiment, stage);
      const wires = wiresFromNetlist(
        stage.acceptedNetlists[0],
        collectInternalLinks(comps),
        comps,
      );

      if (stageIndex === 0) {
        // Stage 1: Primary parallel at Vp = 230 V with series-opposition check
        const knobP = findVariacForTargetV1(
          experiment,
          wires,
          stage.physicsParams.V1rated ?? 230,
          0,
          gains,
          { stageIndex, seed, meterId: 'vp', knobControlId: 'vaP.knob' },
        );
        const controls: ControlValues = {
          'sup.switch': true,
          'vaP.knob': knobP,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return [captureObservationRow(stage, output, controls, 1, 'pri_1')];
      }

      // Stage 2: Secondary loop at 25%, 50%, 75%, 100% of rated 17.39 A
      const knobP = findVariacForTargetV1(
        experiment,
        wires,
        stage.physicsParams.V1rated ?? 230,
        0,
        gains,
        { stageIndex, seed, meterId: 'vp', knobControlId: 'vaP.knob' },
      );
      const iRated = stage.physicsParams.I2rated ?? 17.39;
      const targets = [0.25, 0.5, 0.75, 1.0].map((f) => f * iRated);

      return targets.map((targetI, idx) => {
        const baseControls: ControlValues = {
          'sup.switch': true,
          'vaP.knob': knobP,
          'vaS.knob': 0,
          'ws.vRange': 15,
          'ws.iRange': 20,
        };
        const knobS = findVariacForTargetV1(
          experiment,
          wires,
          targetI,
          0,
          gains,
          {
            stageIndex,
            seed,
            meterId: 'as',
            knobControlId: 'vaS.knob',
            baseControls,
          },
        );
        const controls: ControlValues = {
          ...baseControls,
          'vaS.knob': knobS,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return captureObservationRow(stage, output, controls, idx + 1, `sec_${idx + 1}`);
      });
    },
    computeAnswers: (rowsByStage, experiment) => {
      const priStage = getStage(experiment, 0);
      const secStage = getStage(experiment, 1);
      const priRows = rowsByStage[priStage.id] ?? [];
      const secRows = rowsByStage[secStage.id] ?? [];

      const pri = priRows[0];
      const wp = getRowNumber(pri, 'wp');
      const Pi = wp / 2;

      const iRated = secStage.physicsParams.I2rated ?? 17.39;
      const vRated = secStage.physicsParams.V2rated ?? 115;

      let sumR2 = 0;
      let sumX2 = 0;
      let sumPc = 0;
      for (const r of secRows) {
        const vs = getRowNumber(r, 'vs');
        const is = getRowNumber(r, 'is');
        const ws = getRowNumber(r, 'ws');
        const z2 = vs / 2 / is;
        const r2 = ws / 2 / (is * is);
        const x2 = Math.sqrt(Math.max(0, z2 * z2 - r2 * r2));
        const pc = (iRated / is) ** 2 * (ws / 2);
        sumR2 += r2;
        sumX2 += x2;
        sumPc += pc;
      }

      const n = secRows.length;
      const R2 = sumR2 / n;
      const X2 = sumX2 / n;
      const Pc = sumPc / n;

      const VR_lag = (iRated / vRated) * (R2 * 0.8 + X2 * 0.6) * 100;
      const VR_lead = (iRated / vRated) * (R2 * 0.8 - X2 * 0.6) * 100;
      const xMaxEff = Math.sqrt(Pi / Pc);

      return {
        Pi,
        R2,
        X2,
        Pc,
        VR_lag,
        VR_lead,
        xMaxEff,
      };
    },
  },
  'ex3.4': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const comps = getStageComponents(experiment, stage);
      const wires = wiresFromNetlist(
        stage.acceptedNetlists[0],
        collectInternalLinks(comps),
        comps,
      );

      if (stageIndex === 0) {
        const knob = findVariacForTargetV1(
          experiment,
          wires,
          stage.physicsParams.V1rated ?? 230,
          0,
          gains,
          { stageIndex, seed, meterId: 'vp', knobControlId: 'va.knob' },
        );
        const controls: ControlValues = {
          'sup.switch': true,
          'va.knob': knob,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return [captureObservationRow(stage, output, controls, 1, 'pol_1')];
      }

      // Stage 2: no-load + 6 loaded steps up to ~42 A while holding V1 ~ 230 V
      const loadPoints: Array<{
        lampsOn: boolean;
        lamps: number;
        rheoOn: boolean;
        R: number;
      }> = [
        { lampsOn: false, lamps: 0, rheoOn: false, R: 100 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 20 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 10 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 5 },
        { lampsOn: true, lamps: 6, rheoOn: true, R: 6 },
        { lampsOn: false, lamps: 0, rheoOn: true, R: 3.2 },
        { lampsOn: true, lamps: 3, rheoOn: true, R: 3.0 },
      ];

      return loadPoints.map((pt, idx) => {
        const baseControls: ControlValues = {
          'sup.switch': true,
          'va.knob': 230,
          'wmA.iRange': 20,
          'wmB.iRange': 40,
          'lamps.switch': pt.lampsOn,
          'lamps.lamps': pt.lamps,
          'rheostat.switch': pt.rheoOn,
          'rheostat.R': pt.R,
        };
        const knob = findVariacForTargetV1(
          experiment,
          wires,
          stage.physicsParams.V1rated ?? 230,
          pt.lamps,
          gains,
          {
            stageIndex,
            seed,
            meterId: 'vp',
            knobControlId: 'va.knob',
            loadControlId: 'lamps.lamps',
            baseControls,
          },
        );
        const controls: ControlValues = {
          ...baseControls,
          'va.knob': knob,
        };
        const { output } = evaluateExperimentPhysics(
          experiment,
          wires,
          controls,
          gains,
          { stageIndex, seed },
        );
        return captureObservationRow(stage, output, controls, idx + 1, `par_${idx + 1}`);
      });
    },
    computeAnswers: (rowsByStage, experiment) => {
      const loadStage = getStage(experiment, 1);
      const rows = rowsByStage[loadStage.id] ?? [];

      const noLoad = rows.find((r) => getRowNumber(r, 'il') < 0.1)!;
      const circulatingCurrentA =
        (getRowNumber(noLoad, 'ia') + getRowNumber(noLoad, 'ib')) / 2;

      const iArated = loadStage.physicsParams.IArated ?? 17.39;
      const iBrated = loadStage.physicsParams.IBrated ?? 26.09;

      // Determine which transformer reaches rating first and interpolate IL
      const sorted = [...rows].sort(
        (a, b) => getRowNumber(a, 'il') - getRowNumber(b, 'il'),
      );
      const topRow = sorted[sorted.length - 1];
      const fracA = getRowNumber(topRow, 'ia') / iArated;
      const fracB = getRowNumber(topRow, 'ib') / iBrated;
      const firstTransformer = fracB >= fracA ? 'B' : 'A';
      const targetCol = firstTransformer === 'B' ? 'ib' : 'ia';
      const targetRated = firstTransformer === 'B' ? iBrated : iArated;

      let firstRatedIL = getRowNumber(topRow, 'il');
      for (let i = 1; i < sorted.length; i++) {
        const y0 = getRowNumber(sorted[i - 1], targetCol);
        const y1 = getRowNumber(sorted[i], targetCol);
        const x0 = getRowNumber(sorted[i - 1], 'il');
        const x1 = getRowNumber(sorted[i], 'il');
        if (y1 >= targetRated && y1 > y0) {
          firstRatedIL = x0 + ((targetRated - y0) / (y1 - y0)) * (x1 - x0);
          break;
        }
        if (i === sorted.length - 1 && y1 > y0) {
          firstRatedIL = x0 + ((targetRated - y0) / (y1 - y0)) * (x1 - x0);
        }
      }

      const bShareRatio =
        getRowNumber(topRow, 'ib') / Math.max(0.01, getRowNumber(topRow, 'il'));
      const proportionalShare = Math.abs(bShareRatio - 0.6) <= 0.015 ? 'yes' : 'no';

      return {
        circulatingCurrentA,
        firstRatedIL,
        firstTransformer,
        proportionalShare,
      };
    },
  },
  'ex3.5': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const t = getScrambledTerminalMap(seed).trueToTerminal;
      const wires =
        stage.id === 'identify-pairs'
          ? []
          : wiresFromNetlist(getCanonicalStageNetsForSeed(stage.id, seed), []);

      const probePairs: Record<string, [string, string]> = {
        'identify-pairs': [t.a1, t.a2],
        'identify-phases': [t.a1, t.a4],
        star: [t.a4, t.b4],
        delta: [t.b4, t.c4],
        zigzag: [t.b3, t.c3],
      };
      const [probeA, probeB] = probePairs[stage.id] ?? [t.a1, t.a2];

      const controls: ControlValues = {
        'sup3.switch': true,
        'va3.knob': 230,
        'probe.a': probeA,
        'probe.b': probeB,
      };
      const { output } = evaluateExperimentPhysics(
        experiment,
        wires,
        controls,
        gains,
        { stageIndex, seed },
      );
      return [captureObservationRow(stage, output, controls, 1, `p35_${stage.id}_1`)];
    },
    computeAnswers: (rowsByStage) => {
      const phaseRows = rowsByStage['identify-phases'] ?? [];
      const vp =
        phaseRows.length > 0 ? getRowNumber(phaseRows[0], 'probeV') : 115;

      const starRows = rowsByStage['star'] ?? [];
      const deltaRows = rowsByStage['delta'] ?? [];
      const zzRows = rowsByStage['zigzag'] ?? [];

      const starLineV =
        starRows.length > 0 ? getRowNumber(starRows[0], 'starLineV') : vp * Math.sqrt(3);
      const deltaLineV =
        deltaRows.length > 0 ? getRowNumber(deltaRows[0], 'deltaLineV') : vp;
      const zigzagPhaseV =
        zzRows.length > 0
          ? getRowNumber(zzRows[0], 'zigzagPhaseV')
          : (vp * Math.sqrt(3)) / 2;
      const zigzagLineV =
        zzRows.length > 0 ? getRowNumber(zzRows[0], 'zigzagLineV') : vp * 1.5;

      return {
        starLineV,
        deltaLineV,
        zigzagPhaseV,
        zigzagLineV,
        highestLineConn: 'star',
        sampleDiffPhasesLow: 50,
        sampleDiffPhasesHigh: 86.6,
        sampleSamePhaseLow: 0,
        sampleSamePhaseHigh: 100,
      };
    },
  },
  'ex3.6': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const wires = wiresFromNetlist(stage.acceptedNetlists[0], []);

      if (stage.id === 'three-to-six') {
        return STAGE2_REQUIRED_PAIRS.map(([probeA, probeB], idx) => {
          const controls: ControlValues = {
            'sup3.switch': true,
            'va3.knob': 230,
            'probe.a': probeA,
            'probe.b': probeB,
          };
          const { output } = evaluateExperimentPhysics(
            experiment,
            wires,
            controls,
            gains,
            { stageIndex, seed },
          );
          return captureObservationRow(stage, output, controls, idx + 1, `p36_s2_${idx + 1}`);
        });
      }

      const [probeA, probeB] =
        stage.id === 'three-to-single'
          ? ['tx.a1', 'tx.c1']
          : ['txT.a1', 'txM.b1'];
      const controls: ControlValues = {
        'sup3.switch': true,
        'va3.knob': 230,
        'probe.a': probeA,
        'probe.b': probeB,
      };
      const { output } = evaluateExperimentPhysics(
        experiment,
        wires,
        controls,
        gains,
        { stageIndex, seed },
      );
      return [captureObservationRow(stage, output, controls, 1, `p36_${stage.id}_1`)];
    },
    computeAnswers: (rowsByStage) => {
      const s1 = rowsByStage['three-to-single'] ?? [];
      const s2 = rowsByStage['three-to-six'] ?? [];
      const s3 = rowsByStage['three-to-two-scott'] ?? [];

      const singlePhaseOutputV = getRowNumber(s1[0], 'Va1c1');
      const avgVp1 =
        (getRowNumber(s1[0], 'Va1a4') +
          getRowNumber(s1[0], 'Vb1b4') +
          getRowNumber(s1[0], 'Vc1c4')) /
        3;
      const singlePhaseMultiple = singlePhaseOutputV / Math.max(1, avgVp1);

      const phaseVals = s2.slice(0, 6).map((r) => getRowNumber(r, 'probeV'));
      const adjVals = s2.slice(6, 12).map((r) => getRowNumber(r, 'probeV'));
      const sixPhasePhaseV =
        phaseVals.reduce((a, b) => a + b, 0) / Math.max(1, phaseVals.length);
      const sixPhaseLineV =
        adjVals.reduce((a, b) => a + b, 0) / Math.max(1, adjVals.length);
      const sixPhaseOppositeV = sixPhasePhaseV * 2;

      const scottVamV = getRowNumber(s3[0], 'VA1A2');
      const scottSecPhaseV =
        (getRowNumber(s3[0], 'Va1a2') + getRowNumber(s3[0], 'Vb1b2')) / 2;
      const scottVa1b1V = getRowNumber(s3[0], 'Va1b1');

      return {
        singlePhaseOutputV,
        singlePhaseMultiple,
        sixPhasePhaseV,
        sixPhaseLineV,
        sixPhaseOppositeV,
        sixPhaseAdjAngle: '60',
        scottVamV,
        scottSecPhaseV,
        scottVa1b1V,
        scott400to100MainRatio: 4,
        scott400to100TeaserRatio: 3.464,
        scottIronLossesEqual: 'yes',
      };
    },
  },
  'ex4.1': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const wires = wiresFromNetlist(stage.acceptedNetlists[0], []);
      // Manual procedure (iii)-(iv): start at rated current (~9.95 kgf -> ~5.93 A) down to belt-released no load (0 kgf)
      const loadForces = [9.95, 8.0, 6.0, 4.0, 2.0, 0.0];

      return loadForces.map((loadF, idx) => {
        const readSel = (pos: 'B' | 'C', reverseOn: boolean) =>
          evaluateExperimentPhysics(
            experiment,
            wires,
            {
              'sup3.switch': true,
              'va3.knob': 230,
              'wm.vRange': 300,
              'wm.iRange': 5,
              'wm.reverse': reverseOn,
              'sel.pos': pos,
              'motor.loadF': loadF,
            },
            gains,
            { stageIndex, seed },
          );

        let w1Rev = false;
        let outB = readSel('B', false);
        let wmB = findMeterReading(outB.output, 'wm');
        if (wmB?.reversed) {
          w1Rev = true;
          outB = readSel('B', true);
          wmB = findMeterReading(outB.output, 'wm');
        }

        const outC = readSel('C', false);
        const wmC = findMeterReading(outC.output, 'wm');

        const controls: ControlValues = {
          'sup3.switch': true,
          'va3.knob': 230,
          'wm.vRange': 300,
          'wm.iRange': 5,
          'wm.reverse': false,
          'sel.pos': 'C',
          'motor.loadF': loadF,
          'pending.w1Div': wmB?.dial ?? 0,
          'pending.w1Rev': w1Rev,
          'pending.w2Div': wmC?.dial ?? 0,
          'pending.w2Rev': false,
          'pending.wmMf': wmC?.mf ?? 10,
        };
        return captureObservationRow(stage, outC.output, controls, idx + 1, `im41_${idx + 1}`);
      });
    },
    computeAnswers: (rowsByStage) => {
      const rows = rowsByStage['im-load-test'] ?? [];
      let ratedRow = rows[0];
      let bestDiff = Math.abs(getRowNumber(ratedRow, 'I') - 5.93);
      for (const r of rows) {
        const d = Math.abs(getRowNumber(r, 'I') - 5.93);
        if (d < bestDiff) {
          ratedRow = r;
          bestDiff = d;
        }
      }
      return {
        fullLoadSlip: getRowNumber(ratedRow, 'slip'),
        fullLoadTorque: getRowNumber(ratedRow, 'torque'),
        fullLoadEff: getRowNumber(ratedRow, 'eta'),
        fullLoadPf: getRowNumber(ratedRow, 'pf'),
        pfRiseReason: 'active-grows',
      };
    },
  },
  'ex4.2': {
    runStage: ({ experiment, stageIndex, seed, gains }) => {
      const stage = getStage(experiment, stageIndex);
      const wires = wiresFromNetlist(stage.acceptedNetlists[0], []);

      if (stage.id === 'dc-test') {
        const dcCtrl: ControlValues = {
          'dcSupply.switch': true,
          'pot.p': 0.5,
        };
        const out = evaluateExperimentPhysics(experiment, wires, dcCtrl, gains, {
          stageIndex,
          seed,
        });
        return [captureObservationRow(stage, out.output, dcCtrl, 1, 'im42_dc_1')];
      }

      const captureAcRow = (
        rowId: string,
        sno: number,
        rotorBlocked: boolean,
        variacV: number,
      ) => {
        const readSel = (pos: 'B' | 'C', reverseOn: boolean) =>
          evaluateExperimentPhysics(
            experiment,
            wires,
            {
              'sup3.switch': true,
              'va3.knob': variacV,
              'wm.vRange': 300,
              'wm.iRange': 5,
              'wm.reverse': reverseOn,
              'sel.pos': pos,
              'motor.rotorBlocked': rotorBlocked,
            },
            gains,
            { stageIndex, seed },
          );

        let w1Rev = false;
        let outB = readSel('B', false);
        let wmB = findMeterReading(outB.output, 'wm');
        if (wmB?.reversed) {
          w1Rev = true;
          outB = readSel('B', true);
          wmB = findMeterReading(outB.output, 'wm');
        }

        const outC = readSel('C', false);
        const wmC = findMeterReading(outC.output, 'wm');

        const controls: ControlValues = {
          'sup3.switch': true,
          'va3.knob': variacV,
          'wm.vRange': 300,
          'wm.iRange': 5,
          'wm.reverse': false,
          'sel.pos': 'C',
          'motor.rotorBlocked': rotorBlocked,
          'pending.w1Div': wmB?.dial ?? 0,
          'pending.w1Rev': w1Rev,
          'pending.w2Div': wmC?.dial ?? 0,
          'pending.w2Rev': false,
          'pending.wmMf': wmC?.mf ?? 10,
        };
        return captureObservationRow(stage, outC.output, controls, sno, rowId);
      };

      return [
        captureAcRow('im42_nl_1', 1, false, 230),
        captureAcRow('im42_br_2', 2, true, 42.7),
      ];
    },
    computeAnswers: (rowsByStage) => {
      const dcRows = rowsByStage['dc-test'] ?? [];
      const acRows = rowsByStage['noload-blocked'] ?? [];
      const dcRow = dcRows[0];
      const nlRow = acRows.find((r) => !r.values?.rotorBlocked) ?? acRows[0];
      const brRow = acRows.find((r) => Boolean(r.values?.rotorBlocked)) ?? acRows[1];

      const vdc = getRowNumber(dcRow, 'Vdc');
      const idc = getRowNumber(dcRow, 'Idc');
      const r1 = 1.15 * 1.5 * (vdc / idc);

      const vol = getRowNumber(nlRow, 'V');
      const iol = getRowNumber(nlRow, 'I');
      const po = getRowNumber(nlRow, 'P');
      const Zo = (Math.sqrt(3) * vol) / iol;
      const rc = (3 * vol * vol) / Math.max(1e-3, po - iol * iol * r1);
      const xm = 1 / Math.sqrt(Math.max(1e-12, 1 / (Zo * Zo) - 1 / (rc * rc)));

      const vbr = getRowNumber(brRow, 'V');
      const ibr = getRowNumber(brRow, 'I');
      const pbr = getRowNumber(brRow, 'P');
      const ZBR = (Math.sqrt(3) * vbr) / ibr;
      const R = pbr / (ibr * ibr);
      const X = Math.sqrt(Math.max(0, ZBR * ZBR - R * R));

      return {
        r1,
        Zo,
        rc,
        xm,
        ZBR,
        R,
        X,
        noLoadCurrentReason: 'air-gap',
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
      experiment.components.flatMap((c) => {
        if (
          c.type === 'voltmeter' ||
          c.type === 'probeVoltmeter' ||
          c.type === 'ammeter' ||
          c.type === 'wattmeter'
        ) {
          return [c.id];
        }
        if (c.type === 'inductionMotor3ph') {
          return ['s1', 's2', 'tacho'];
        }
        return [];
      }),
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
