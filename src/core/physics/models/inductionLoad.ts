import { UnionFind } from '../../circuit/nets';
import { getStageHints } from '../../circuit/stages';
import { getComponentDef, resolveComponentInternalLinks } from '../../components';
import type {
  BaseConnectionState,
  MeterReading,
  NetGraphLike,
  PhysicsModel,
  PhysicsSolveInput,
  PhysicsSolveOutput,
  RuntimeEvent,
  StageValidationInput,
  TerminalId,
  ValidationResult,
  WireEndpointPair,
} from '../../types';
import { evaluateAnalogMeter, evaluateWattmeter } from '../meters';
import {
  DEFAULT_IM3PH_PARAMS,
  solveSlipByBisection,
  type IM3PHParams,
} from '../motors/im3ph';

export interface InductionLoadConnectionState extends BaseConnectionState {
  supplyOn: boolean;
  variacV: number;
  supToVariacOk: boolean;
  lineAOk: boolean;
  lineBOk: boolean;
  lineCOk: boolean;
  allMotorLinesOk: boolean;
  singlePhasing: boolean;
  vmConnected: boolean;
  amInSeries: boolean;
  ctPrimaryInCircuit: boolean;
  ctSecClosed: boolean;
  ctSecOpen: boolean;
  wmCcReversed: boolean;
  wmPcReversed: boolean;
  wmPcConnected: boolean;
  selWired: boolean;
  selConnectedPhase: 'B' | 'C' | null;
}

function getIMParams(p: Record<string, number>): IM3PHParams {
  return {
    Prated: p.Prated ?? DEFAULT_IM3PH_PARAMS.Prated,
    VLrated: p.VLrated ?? DEFAULT_IM3PH_PARAMS.VLrated,
    f: p.f ?? DEFAULT_IM3PH_PARAMS.f,
    poles: p.poles ?? DEFAULT_IM3PH_PARAMS.poles,
    ILrated: p.ILrated ?? DEFAULT_IM3PH_PARAMS.ILrated,
    r1: p.r1 ?? DEFAULT_IM3PH_PARAMS.r1,
    x1: p.x1 ?? DEFAULT_IM3PH_PARAMS.x1,
    r2: p.r2 ?? DEFAULT_IM3PH_PARAMS.r2,
    x2: p.x2 ?? DEFAULT_IM3PH_PARAMS.x2,
    xm: p.xm ?? DEFAULT_IM3PH_PARAMS.xm,
    rc: p.rc ?? DEFAULT_IM3PH_PARAMS.rc,
    Pfw: p.Pfw ?? DEFAULT_IM3PH_PARAMS.Pfw,
    pulleyRadiusM: p.pulleyRadiusM ?? DEFAULT_IM3PH_PARAMS.pulleyRadiusM,
    ctRatio: p.ctRatio ?? DEFAULT_IM3PH_PARAMS.ctRatio,
  };
}

export const inductionLoadModel: PhysicsModel<InductionLoadConnectionState> = {
  id: 'inductionLoad',

  deriveConnectionState(
    nets: NetGraphLike,
    controls,
    _stageParams,
    faults = [],
  ): InductionLoadConnectionState {
    const supplyOn = Boolean(controls['sup3.switch'] ?? controls['sup.switch']);
    const variacV = Number(controls['va3.knob'] ?? 0);

    const supToVariacOk =
      nets.areConnected('sup3.A', 'va3.IN_A') &&
      nets.areConnected('sup3.B', 'va3.IN_B') &&
      nets.areConnected('sup3.C', 'va3.IN_C');

    // Line-to-line or live-neutral short checks via galvanic connectivity
    const lineShort =
      nets.areConnected('sup3.A', 'sup3.B') ||
      nets.areConnected('sup3.B', 'sup3.C') ||
      nets.areConnected('sup3.A', 'sup3.C') ||
      nets.areConnected('va3.OUT_A', 'va3.OUT_B') ||
      nets.areConnected('va3.OUT_B', 'va3.OUT_C') ||
      nets.areConnected('va3.OUT_A', 'va3.OUT_C');

    const ctPrimaryInCircuit =
      nets.areConnected('va3.OUT_A', 'ct.P_M') &&
      nets.areConnected('ct.P_L', 'am.IN');
    const amInSeries =
      nets.areConnected('ct.P_L', 'am.IN') &&
      nets.areConnected('am.OUT', 'motor.A') &&
      !nets.areConnected('am.IN', 'am.OUT');
    const lineAOk = ctPrimaryInCircuit && amInSeries;
    const lineBOk = nets.areConnected('va3.OUT_B', 'motor.B');
    const lineCOk = nets.areConnected('va3.OUT_C', 'motor.C');

    const allMotorLinesOk = lineAOk && lineBOk && lineCOk && supToVariacOk;
    const connectedLineCount =
      (lineAOk ? 1 : 0) + (lineBOk ? 1 : 0) + (lineCOk ? 1 : 0);
    const singlePhasing = supToVariacOk && connectedLineCount === 2;

    const vmConnected =
      supToVariacOk &&
      ((nets.areConnected('va3.OUT_B', 'vm.A') &&
        nets.areConnected('va3.OUT_C', 'vm.B')) ||
        (nets.areConnected('va3.OUT_C', 'vm.A') &&
          nets.areConnected('va3.OUT_B', 'vm.B'))) &&
      !nets.areConnected('vm.A', 'vm.B');

    const ctFwd =
      nets.areConnected('ct.S_M', 'wm.M') && nets.areConnected('ct.S_L', 'wm.L');
    const ctRev =
      nets.areConnected('ct.S_L', 'wm.M') && nets.areConnected('ct.S_M', 'wm.L');
    const ctSecClosed = ctFwd || ctRev;
    const ctSecOpen =
      supToVariacOk &&
      ctPrimaryInCircuit &&
      nets.areConnected('am.OUT', 'motor.A') &&
      !ctSecClosed;

    const selWired =
      nets.areConnected('wm.V2', 'sel.COM') &&
      nets.areConnected('sel.B', 'va3.OUT_B') &&
      nets.areConnected('sel.C', 'va3.OUT_C');

    const v1OnA =
      nets.areConnected('wm.V1', 'va3.OUT_A') ||
      nets.areConnected('wm.V1', 'motor.A');
    const v2OnB = nets.areConnected('wm.V2', 'va3.OUT_B');
    const v2OnC = nets.areConnected('wm.V2', 'va3.OUT_C');
    const v2OnA =
      nets.areConnected('wm.V2', 'va3.OUT_A') ||
      nets.areConnected('wm.V2', 'motor.A');
    const v1OnBOrC =
      nets.areConnected('wm.V1', 'va3.OUT_B') ||
      nets.areConnected('wm.V1', 'va3.OUT_C');

    const wmPcReversed =
      faults.some((f) => f.id === 'wm-pc-reversed') || (!v1OnA && v2OnA && v1OnBOrC);
    const wmCcReversed =
      faults.some((f) => f.id === 'wm-cc-reversed') || ctRev;

    const selConnectedPhase: 'B' | 'C' | null = v2OnB ? 'B' : v2OnC ? 'C' : null;
    const wmPcConnected =
      (v1OnA && selConnectedPhase !== null) || wmPcReversed;

    const faultShort = faults.some((f) => f.effect === 'short') || lineShort;

    return {
      shorted: faultShort,
      shortFaults: faults.filter((f) => f.effect === 'short'),
      matchedFaultIds: faults.map((f) => f.id),
      energised: supplyOn && variacV > 0 && !faultShort && !ctSecOpen,
      supplyOn,
      variacV,
      supToVariacOk,
      lineAOk,
      lineBOk,
      lineCOk,
      allMotorLinesOk,
      singlePhasing,
      vmConnected,
      amInSeries,
      ctPrimaryInCircuit,
      ctSecClosed,
      ctSecOpen,
      wmCcReversed,
      wmPcReversed,
      wmPcConnected,
      selWired,
      selConnectedPhase,
    };
  },

  solve(input: PhysicsSolveInput<InductionLoadConnectionState>): PhysicsSolveOutput {
    const { connectionState: cs, controls, gains, params } = input;
    const p = getIMParams(params);
    const events: RuntimeEvent[] = [];

    const loadF = Math.max(0, Math.min(16, Number(controls['motor.loadF'] ?? 0)));
    const trueT1 = 1.0 + 1.556 * loadF;
    const trueT2 = 1.0 + 0.556 * loadF;
    const trueTload = loadF * p.pulleyRadiusM * 9.81;

    const wmVRange = Number(controls['wm.vRange'] ?? 300);
    const wmIRange = Number(controls['wm.iRange'] ?? 5);
    const wmReverse = Boolean(controls['wm.reverse']);
    const wmDivisions = Number(params.wmDivisions ?? 150);
    const wmPf = Number(params.wmPf ?? 1.0);

    // 1. Short / CT-secondary-open protection checks
    if (cs.supplyOn && cs.variacV > 0 && cs.shorted) {
      events.push({
        id: 'mcb-trip',
        severity: 'danger',
        message: 'Short-circuit fault detected! 3φ MCB tripped to protect equipment.',
      });
    } else if (cs.supplyOn && cs.variacV > 0 && cs.ctSecOpen) {
      events.push({
        id: 'ct-secondary-open',
        severity: 'danger',
        message:
          'CT secondary open while primary is energised! Without secondary opposing ampere-turns, high magnetising flux induces dangerously high voltage across the CT secondary — 3φ MCB tripped.',
      });
    } else if (!cs.supplyOn) {
      events.push({
        id: 'supply-off-hint',
        severity: 'info',
        message: 'Switch ON sup3 and raise va3 from 0 V to 230 V.',
      });
    } else if (cs.variacV <= 0) {
      events.push({
        id: 'variac-zero-hint',
        severity: 'info',
        message: 'Increase 3φ autotransformer va3 gradually to 230 V.',
      });
    }

    const blockedOrShortTrip = cs.supplyOn && cs.variacV > 0 && (cs.shorted || cs.ctSecOpen);

    // 2. Motor steady-state calculation
    let motorPt = solveSlipByBisection(0, 0, p);
    let IL = 0;
    let mcbTripped = blockedOrShortTrip;

    if (!blockedOrShortTrip && cs.supplyOn && cs.variacV > 0) {
      if (cs.allMotorLinesOk) {
        motorPt = solveSlipByBisection(cs.variacV, trueTload, p);
        IL = motorPt.IL;
        if (motorPt.stalled && cs.variacV > 35) {
          events.push({
            id: 'motor-overload-stall',
            severity: 'danger',
            message: `Motor stalled under excessive load torque (Tload > Tmax): line current jumped to ~${IL.toFixed(1)} A (> 2× rated). MCB tripped!`,
          });
          mcbTripped = true;
        }
      } else if (cs.singlePhasing) {
        // Single-phasing: motor cannot self-start / draws ~1.73x phase stall/overload current & hums
        IL = cs.lineAOk ? Math.min(18, (cs.variacV / 230) * 10.5) : 0;
        events.push({
          id: 'single-phasing',
          severity: 'warning',
          message:
            'Single-phasing fault (one motor supply line missing): motor hums without rotating cleanly and draws excessive current.',
        });
        if (IL > p.ILrated * 1.5 && cs.variacV > 120) {
          mcbTripped = true;
          events.push({
            id: 'single-phase-trip',
            severity: 'danger',
            message: 'Single-phasing overload current tripped the 3φ MCB!',
          });
        }
      }
    }

    const activeV = mcbTripped || !cs.supplyOn ? 0 : cs.supToVariacOk ? cs.variacV : 0;
    const activeIL = mcbTripped ? 0 : IL;

    if (!mcbTripped && cs.supplyOn && cs.variacV > 0 && cs.allMotorLinesOk && !cs.selWired) {
      events.push({
        id: 'selector-not-wired',
        severity: 'warning',
        message: 'Wire V2 selector plug (COM -> wm.V2, B -> line B, C -> line C) to measure W1 & W2.',
      });
    }

    // 3. Wattmeter one-wattmeter reading divided by CT ratio (ratio = 2)
    let rawWLine = 0;
    if (!mcbTripped && cs.supplyOn && cs.variacV > 0 && cs.allMotorLinesOk && cs.ctSecClosed && cs.wmPcConnected) {
      const angDeg =
        cs.selConnectedPhase === 'B'
          ? 30 + motorPt.phiDeg
          : 30 - motorPt.phiDeg;
      rawWLine = activeV * activeIL * Math.cos((angDeg * Math.PI) / 180);
    }

    const pInstSigned = rawWLine / p.ctRatio;
    const instrI = cs.ctSecClosed ? activeIL / p.ctRatio : 0;
    const instrV = cs.wmPcConnected ? activeV : 0;
    const naturalReversed = cs.wmCcReversed !== cs.wmPcReversed !== (pInstSigned < 0);

    const wmReadingRaw = evaluateWattmeter(
      Math.abs(pInstSigned),
      instrV,
      instrI,
      wmVRange,
      wmIRange,
      gains.wm ?? 0,
      naturalReversed,
      wmDivisions,
      wmPf,
      wmReverse,
    );

    if (wmReadingRaw.reversed && !mcbTripped && Math.abs(pInstSigned) > 2) {
      events.push({
        id: 'wm-negative-w1',
        severity: 'info',
        message:
          'Wattmeter pointer deflected below zero (light-load W1 < 0). Flip the wattmeter Reverse (REV) switch ON to read upscale, and record W1 as negative.',
      });
    }

    const vmEval = evaluateAnalogMeter(
      cs.vmConnected ? activeV : 0,
      300,
      gains.vm ?? 0,
    );
    const amEval = evaluateAnalogMeter(
      cs.amInSeries ? activeIL : 0,
      10,
      gains.am ?? 0,
    );

    // Spring balances (0-20 kgf, 0.1 kgf resolution) & tachometer (1 rpm resolution)
    const s1Shown = Number((trueT1 * (1 + (gains.s1 ?? 0))).toFixed(1));
    const s2Shown = Number((trueT2 * (1 + (gains.s2 ?? 0))).toFixed(1));
    const rpmTrue = mcbTripped || !cs.supplyOn ? 0 : motorPt.rpm;
    const rpmShown = Math.max(0, Math.round(rpmTrue * (1 + (gains.tacho ?? 0))));

    const s1Meter: MeterReading = {
      id: 's1',
      label: 'Spring Balance S1',
      kind: 'ammeter',
      unit: 'kgf',
      decimals: 1,
      ...evaluateAnalogMeter(s1Shown, 20, 0),
      trueValue: Number(trueT1.toFixed(1)),
      shownValue: s1Shown,
    };
    const s2Meter: MeterReading = {
      id: 's2',
      label: 'Spring Balance S2',
      kind: 'ammeter',
      unit: 'kgf',
      decimals: 1,
      ...evaluateAnalogMeter(s2Shown, 20, 0),
      trueValue: Number(trueT2.toFixed(1)),
      shownValue: s2Shown,
    };
    const tachoMeter: MeterReading = {
      id: 'tacho',
      label: 'Tachometer',
      kind: 'ammeter',
      unit: 'rpm',
      decimals: 0,
      ...evaluateAnalogMeter(rpmShown, 1800, 0),
      trueValue: Math.round(rpmTrue),
      shownValue: rpmShown,
    };

    const meters: MeterReading[] = [
      {
        id: 'vm',
        label: 'Voltmeter (VL)',
        kind: 'voltmeter',
        unit: 'V',
        decimals: 1,
        ...vmEval,
      },
      {
        id: 'am',
        label: 'Ammeter (IL)',
        kind: 'ammeter',
        unit: 'A',
        decimals: 2,
        ...amEval,
      },
      {
        id: 'wm',
        label: 'Wattmeter',
        kind: 'wattmeter',
        unit: 'div',
        decimals: 1,
        ...wmReadingRaw,
      },
      s1Meter,
      s2Meter,
      tachoMeter,
    ];

    const outputs: Record<string, number> = {
      V: Number(vmEval.shownValue.toFixed(1)),
      I: Number(amEval.shownValue.toFixed(2)),
      T1: s1Shown,
      T2: s2Shown,
      n: rpmShown,
      f: p.f,
      wmDial: Number(wmReadingRaw.dial.toFixed(2)),
      wmMf: Number(wmReadingRaw.mf.toFixed(3)),
      PinTrue: Number(motorPt.Pin.toFixed(2)),
      PshaftTrue: Number(motorPt.Pshaft.toFixed(2)),
      Ttrue: Number(motorPt.Tshaft.toFixed(3)),
      sTrue: Number(motorPt.s.toFixed(5)),
      pfTrue: Number(motorPt.pf.toFixed(4)),
      etaTrue: Number(motorPt.etaPct.toFixed(2)),
    };

    return {
      meters,
      events,
      mcbTripped,
      runFailed: mcbTripped,
      outputs,
    };
  },

  validateStage(input: StageValidationInput): ValidationResult | null {
    const hints = getStageHints({ hints: input.stage.hints ?? [] } as never, input.stage);
    const stageComps = input.stage.componentIds.map((id) => ({
      id,
      type:
        id === 'sup3'
          ? ('acSupply3ph' as const)
          : id === 'va3'
            ? ('variac3ph' as const)
            : id === 'motor'
              ? ('inductionMotor3ph' as const)
              : id === 'ct'
                ? ('currentTransformer' as const)
                : id === 'wm'
                  ? ('wattmeter' as const)
                  : id === 'am'
                    ? ('ammeter' as const)
                    : id === 'vm'
                      ? ('voltmeter' as const)
                      : ('selectorSwitch' as const),
      label: id,
      position: [0, 0, 0] as [number, number, number],
      params: {},
    }));

    // Build physical net graph over all real stage terminals + non-selector internal links + student wires
    const wirePairs: WireEndpointPair[] = input.wires.map((w) => [w.a, w.b]);
    const uf = new UnionFind();
    const allTerms: TerminalId[] = [];
    for (const comp of stageComps) {
      const def = getComponentDef(comp.type);
      for (const term of def.terminals) {
        const tid = `${comp.id}.${term.name}`;
        allTerms.push(tid);
        uf.add(tid);
      }
      if (comp.type !== 'selectorSwitch') {
        for (const [a, b] of resolveComponentInternalLinks(def, comp, {})) {
          uf.union(`${comp.id}.${a}`, `${comp.id}.${b}`);
        }
      }
    }
    for (const [a, b] of wirePairs) {
      if (a !== b) uf.union(a, b);
    }

    const rootToNet = new Map<string, number>();
    const rawNets: TerminalId[][] = [];
    const terminalToRawNet = new Map<TerminalId, number>();
    for (const t of [...allTerms].sort()) {
      const root = uf.find(t);
      let idx = rootToNet.get(root);
      if (idx === undefined) {
        idx = rawNets.length;
        rootToNet.set(root, idx);
        rawNets.push([]);
      }
      rawNets[idx].push(t);
      terminalToRawNet.set(t, idx);
    }

    let bestOpen: ValidationResult['openNets'] = [];
    let bestShorts: ValidationResult['shorts'] = [];
    let bestExtras: ValidationResult['extras'] = [];
    let bestScore = Infinity;
    let bestIdx = 0;

    for (let i = 0; i < input.stage.acceptedNetlists.length; i++) {
      const reqList = input.stage.acceptedNetlists[i];
      const reqTermToIdx = new Map<TerminalId, number>();
      reqList.forEach((reqNet, rIdx) => {
        for (const t of reqNet) reqTermToIdx.set(t, rIdx);
      });

      const openNets: ValidationResult['openNets'] = [];
      reqList.forEach((reqNet, rIdx) => {
        const seen = new Set<number>();
        const reps: TerminalId[] = [];
        for (const t of reqNet) {
          const sIdx = terminalToRawNet.get(t);
          if (sIdx !== undefined && !seen.has(sIdx)) {
            seen.add(sIdx);
            reps.push(t);
          }
        }
        if (seen.size > 1) {
          openNets.push({
            netIndex: rIdx,
            label: input.stage.netLabels?.[rIdx] ?? `Net ${rIdx + 1}`,
            category: input.stage.netCategories?.[rIdx] ?? 'Incomplete connection',
            missingPairHint: [reps[0], reps[1]],
          });
        }
      });

      const shorts: ValidationResult['shorts'] = [];
      const extras: ValidationResult['extras'] = [];
      for (const sNet of rawNets) {
        const reqIndices = new Set<number>();
        const outside: TerminalId[] = [];
        for (const t of sNet) {
          const ri = reqTermToIdx.get(t);
          if (ri === undefined) outside.push(t);
          else reqIndices.add(ri);
        }
        if (reqIndices.size > 1) {
          const merged = Array.from(reqIndices).sort((a, b) => a - b);
          const names = merged.map(
            (idx) => input.stage.netLabels?.[idx] ?? `Net ${idx + 1}`,
          );
          shorts.push({
            studentNet: sNet,
            mergedNetIndices: merged,
            description: `Short circuit joining ${names.join(' and ')}.`,
          });
        }
        if (outside.length > 0 && sNet.length > 1) {
          extras.push({ studentNet: sNet, extraTerminals: outside });
        }
      }

      const score = openNets.length + shorts.length * 2 + extras.length;
      if (score < bestScore) {
        bestScore = score;
        bestOpen = openNets;
        bestShorts = shorts;
        bestExtras = extras;
        bestIdx = i;
      }
      if (score === 0) break;
    }

    const faults = [...input.faults];
    const correct = bestScore === 0 && faults.length === 0;
    return {
      correct,
      matchedNetlistIndex: bestIdx,
      openNets: bestOpen,
      shorts: bestShorts,
      extras: bestExtras,
      faults,
      hintLevelAvailable: hints.length,
    };
  },
};
