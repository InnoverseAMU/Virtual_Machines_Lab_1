import { UnionFind } from '../../circuit/nets';
import { getStageHints } from '../../circuit/stages';
import { getComponentDef, resolveComponentInternalLinks } from '../../components';
import type {
  BaseConnectionState,
  ComponentType,
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
  computeBlockedRotorCurrent,
  DEFAULT_IM3PH_PARAMS,
  solveSlipByBisection,
  type IM3PHParams,
} from '../motors/im3ph';

export interface InductionTestsConnectionState extends BaseConnectionState {
  testStage: 1 | 2;
  supplyOn: boolean;
  // Stage 1 (DC Test)
  potP: number;
  dcCircuitOk: boolean;
  dcAmInSeries: boolean;
  dcAmReversed: boolean;
  dcVmConnected: boolean;
  dcVmReversed: boolean;
  // Stage 2 (No-Load & Blocked-Rotor)
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

const COMP_TYPE_BY_ID: Record<string, ComponentType> = {
  dcSupply: 'dcSupply',
  pot: 'potDivider',
  dcAmmeter: 'ammeter',
  dcVoltmeter: 'voltmeter',
  sup3: 'acSupply3ph',
  va3: 'variac3ph',
  ct: 'currentTransformer',
  am: 'ammeter',
  vm: 'voltmeter',
  sel: 'selectorSwitch',
  wm: 'wattmeter',
  motor: 'inductionMotor3ph',
};

export const inductionTestsModel: PhysicsModel<InductionTestsConnectionState> = {
  id: 'inductionTests',

  deriveConnectionState(
    nets: NetGraphLike,
    controls,
    stageParams,
    faults = [],
  ): InductionTestsConnectionState {
    const testStage: 1 | 2 = Number(stageParams.testStage ?? 1) === 2 ? 2 : 1;

    if (testStage === 1) {
      const supplyOn = Boolean(controls['dcSupply.switch']);
      const potP = Math.max(0, Math.min(1, Number(controls['pot.p'] ?? 0)));

      const dcShort =
        nets.areConnected('dcSupply.+', 'dcSupply.-') ||
        nets.areConnected('pot.IN+', 'pot.IN-') ||
        nets.areConnected('pot.OUT', 'pot.IN-') ||
        faults.some((f) => f.effect === 'short');

      const supToPotPos = nets.areConnected('dcSupply.+', 'pot.IN+');
      const commonNegOk =
        nets.areConnected('dcSupply.-', 'pot.IN-') &&
        nets.areConnected('dcSupply.-', 'motor.B') &&
        nets.areConnected('dcSupply.-', 'dcVoltmeter.B');

      const amFwd =
        nets.areConnected('pot.OUT', 'dcAmmeter.IN') &&
        nets.areConnected('dcAmmeter.OUT', 'motor.A') &&
        !nets.areConnected('dcAmmeter.IN', 'dcAmmeter.OUT');
      const amRev =
        nets.areConnected('pot.OUT', 'dcAmmeter.OUT') &&
        nets.areConnected('dcAmmeter.IN', 'motor.A') &&
        !nets.areConnected('dcAmmeter.IN', 'dcAmmeter.OUT');
      const dcAmInSeries = amFwd || amRev;

      const vmFwd =
        nets.areConnected('dcVoltmeter.A', 'motor.A') &&
        nets.areConnected('dcVoltmeter.B', 'motor.B') &&
        !nets.areConnected('dcVoltmeter.A', 'dcVoltmeter.B');
      const vmRev =
        nets.areConnected('dcVoltmeter.B', 'motor.A') &&
        nets.areConnected('dcVoltmeter.A', 'motor.B') &&
        !nets.areConnected('dcVoltmeter.A', 'dcVoltmeter.B');
      const dcVmConnected = vmFwd || vmRev;

      const dcCircuitOk = supToPotPos && commonNegOk && dcAmInSeries && dcVmConnected && !dcShort;

      return {
        testStage: 1,
        shorted: dcShort,
        shortFaults: faults.filter((f) => f.effect === 'short'),
        matchedFaultIds: faults.map((f) => f.id),
        energised: supplyOn && supToPotPos && commonNegOk && dcAmInSeries && !dcShort,
        supplyOn,
        potP,
        dcCircuitOk,
        dcAmInSeries,
        dcAmReversed: amRev,
        dcVmConnected,
        dcVmReversed: vmRev,
        variacV: 0,
        supToVariacOk: false,
        lineAOk: false,
        lineBOk: false,
        lineCOk: false,
        allMotorLinesOk: false,
        singlePhasing: false,
        vmConnected: false,
        amInSeries: false,
        ctPrimaryInCircuit: false,
        ctSecClosed: false,
        ctSecOpen: false,
        wmCcReversed: false,
        wmPcReversed: false,
        wmPcConnected: false,
        selWired: false,
        selConnectedPhase: null,
      };
    }

    // Stage 2: No-Load & Blocked-Rotor Tests (Fig. 4.2.5)
    const supplyOn = Boolean(controls['sup3.switch'] ?? controls['sup.switch']);
    const variacV = Number(controls['va3.knob'] ?? 0);

    const supToVariacOk =
      nets.areConnected('sup3.A', 'va3.IN_A') &&
      nets.areConnected('sup3.B', 'va3.IN_B') &&
      nets.areConnected('sup3.C', 'va3.IN_C');

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
    const connectedLineCount = (lineAOk ? 1 : 0) + (lineBOk ? 1 : 0) + (lineCOk ? 1 : 0);
    const singlePhasing = supToVariacOk && connectedLineCount === 2;

    const vmConnected =
      supToVariacOk &&
      ((nets.areConnected('va3.OUT_B', 'vm.A') && nets.areConnected('va3.OUT_C', 'vm.B')) ||
        (nets.areConnected('va3.OUT_C', 'vm.A') && nets.areConnected('va3.OUT_B', 'vm.B'))) &&
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
      nets.areConnected('wm.V1', 'va3.OUT_A') || nets.areConnected('wm.V1', 'motor.A');
    const v2OnB = nets.areConnected('wm.V2', 'va3.OUT_B');
    const v2OnC = nets.areConnected('wm.V2', 'va3.OUT_C');
    const v2OnA =
      nets.areConnected('wm.V2', 'va3.OUT_A') || nets.areConnected('wm.V2', 'motor.A');
    const v1OnBOrC =
      nets.areConnected('wm.V1', 'va3.OUT_B') || nets.areConnected('wm.V1', 'va3.OUT_C');

    const wmPcReversed =
      faults.some((f) => f.id === 'wm-pc-reversed') || (!v1OnA && v2OnA && v1OnBOrC);
    const wmCcReversed = faults.some((f) => f.id === 'wm-cc-reversed') || ctRev;

    const selConnectedPhase: 'B' | 'C' | null = v2OnB ? 'B' : v2OnC ? 'C' : null;
    const wmPcConnected = (v1OnA && selConnectedPhase !== null) || wmPcReversed;
    const faultShort = faults.some((f) => f.effect === 'short') || lineShort;

    return {
      testStage: 2,
      shorted: faultShort,
      shortFaults: faults.filter((f) => f.effect === 'short'),
      matchedFaultIds: faults.map((f) => f.id),
      energised: supplyOn && variacV > 0 && !faultShort && !ctSecOpen,
      supplyOn,
      potP: 0,
      dcCircuitOk: false,
      dcAmInSeries: false,
      dcAmReversed: false,
      dcVmConnected: false,
      dcVmReversed: false,
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

  solve(input: PhysicsSolveInput<InductionTestsConnectionState>): PhysicsSolveOutput {
    const { connectionState: cs, controls, gains, params } = input;
    const p = getIMParams(params);
    const events: RuntimeEvent[] = [];

    if (cs.testStage === 1) {
      const r1dc = p.r1 / 1.15;
      const Rm = (2 / 3) * r1dc;
      const VdcSrc = Number(params.dcSourceV ?? 230);
      const potR = Number(params.potTotalR ?? 100);
      const leadR = Number(params.potSeriesR ?? 0.02);

      let mcbTripped = false;
      let potDamaged = false;
      let Vraw = 0;
      let Iraw = 0;

      if (cs.supplyOn && cs.shorted) {
        mcbTripped = true;
        events.push({
          id: 'dc-mcb-short',
          severity: 'danger',
          message: 'DC short circuit detected! DC MCB tripped to protect equipment.',
        });
      } else if (!cs.supplyOn) {
        events.push({
          id: 'dc-supply-off',
          severity: 'info',
          message: 'Close dcSupply MCB and raise potentiometer slider pot.p carefully (2–5.93 A).',
        });
      } else if (cs.energised) {
        Vraw =
          (VdcSrc * cs.potP * Rm) /
          (Rm + cs.potP * (1 - cs.potP) * potR + leadR);
        Iraw = Vraw / Rm;

        if (Iraw > 2 * p.ILrated) {
          potDamaged = true;
          mcbTripped = true;
          events.push({
            id: 'dc-pot-damaged',
            severity: 'danger',
            message: `Severe DC overcurrent (${Iraw.toFixed(1)} A > 2 × ${p.ILrated} A) damaged the potential divider and tripped the DC MCB!`,
          });
        } else if (Iraw > p.ILrated) {
          events.push({
            id: 'dc-overcurrent',
            severity: 'warning',
            message: `DC winding current (${Iraw.toFixed(2)} A) exceeds motor rated current (${p.ILrated} A). Reduce pot.p immediately!`,
          });
        }
      }

      if ((cs.dcAmReversed || cs.dcVmReversed) && cs.supplyOn && Iraw > 0.05) {
        events.push({
          id: 'dc-polarity-reversed',
          severity: 'warning',
          message: 'DC meter polarity is reversed — swap leads so + goes toward pot.OUT / motor.A.',
        });
      }

      const activeV = mcbTripped || !cs.supplyOn ? 0 : Vraw;
      const activeI = mcbTripped || !cs.supplyOn ? 0 : Iraw;

      const dcVmEval = evaluateAnalogMeter(
        cs.dcVmConnected ? activeV : 0,
        30,
        gains.dcVoltmeter ?? 0,
        { reversed: cs.dcVmReversed && activeV > 0.05 },
      );
      const dcAmEval = evaluateAnalogMeter(
        cs.dcAmInSeries ? activeI : 0,
        10,
        gains.dcAmmeter ?? 0,
        { reversed: cs.dcAmReversed && activeI > 0.05 },
      );

      const meters: MeterReading[] = [
        {
          id: 'dcVoltmeter',
          label: 'DC Voltmeter',
          kind: 'voltmeter',
          unit: 'V',
          decimals: 2,
          ...dcVmEval,
        },
        {
          id: 'dcAmmeter',
          label: 'DC Ammeter',
          kind: 'ammeter',
          unit: 'A',
          decimals: 2,
          ...dcAmEval,
        },
      ];

      return {
        meters,
        events,
        mcbTripped,
        runFailed: mcbTripped || potDamaged,
        outputs: {
          testStage: 1,
          Vdc: Number(dcVmEval.shownValue.toFixed(2)),
          Idc: Number(dcAmEval.shownValue.toFixed(2)),
          RmTrue: Number(Rm.toFixed(4)),
          r1dcTrue: Number(r1dc.toFixed(4)),
          r1acTrue: Number(p.r1.toFixed(4)),
          potDamaged: potDamaged ? 1 : 0,
        },
      };
    }

    // Stage 2: No-Load & Blocked-Rotor Tests
    const rotorBlocked = Boolean(controls['motor.rotorBlocked']);
    const wmVRange = Number(controls['wm.vRange'] ?? 300);
    const wmIRange = Number(controls['wm.iRange'] ?? 5);
    const wmReverse = Boolean(controls['wm.reverse']);
    const wmDivisions = Number(params.wmDivisions ?? 150);
    const wmPf = Number(params.wmPf ?? 1.0);

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
          'CT secondary open while primary is energised! High magnetising flux induces dangerous secondary voltage — 3φ MCB tripped.',
      });
    } else if (!cs.supplyOn) {
      events.push({
        id: 'supply-off-hint',
        severity: 'info',
        message: rotorBlocked
          ? 'Rotor locked (Blocked-Rotor mode). Close sup3 and slowly raise va3 from 0 V to reach IBR ≈ 5.93 A.'
          : 'Rotor unlocked (No-Load mode). Close sup3 and raise va3 from 0 V to rated 230 V.',
      });
    } else if (cs.variacV <= 0) {
      events.push({
        id: 'variac-zero-hint',
        severity: 'info',
        message: rotorBlocked
          ? 'Raise va3 gently from 0 V until line current reaches 5.93 A (≈ 43 V).'
          : 'Increase 3φ autotransformer va3 smoothly to 230 V for the no-load test.',
      });
    }

    const blockedOrShortTrip = cs.supplyOn && cs.variacV > 0 && (cs.shorted || cs.ctSecOpen);
    let motorPt = rotorBlocked
      ? computeBlockedRotorCurrent(0, p)
      : solveSlipByBisection(0, 0, p);
    let IL = 0;
    let mcbTripped = blockedOrShortTrip;

    if (!blockedOrShortTrip && cs.supplyOn && cs.variacV > 0) {
      if (cs.allMotorLinesOk) {
        motorPt = rotorBlocked
          ? computeBlockedRotorCurrent(cs.variacV, p)
          : solveSlipByBisection(cs.variacV, 0, p);
        IL = motorPt.IL;

        if (rotorBlocked) {
          if (IL > 2 * p.ILrated) {
            mcbTripped = true;
            events.push({
              id: 'blocked-rotor-trip',
              severity: 'danger',
              message: `Severe blocked-rotor overcurrent (${IL.toFixed(1)} A > 2 × ${p.ILrated} A) — 3φ MCB tripped to save windings!`,
            });
          } else if (IL > p.ILrated * 1.02) {
            events.push({
              id: 'blocked-rotor-overheat',
              severity: 'danger',
              message: `Motor overheating danger! With the rotor locked at ${IL.toFixed(2)} A (> rated ${p.ILrated} A), I²R heating rises rapidly — reduce va3 back toward ~43 V!`,
            });
          }
        }
      } else if (cs.singlePhasing) {
        IL = cs.lineAOk ? Math.min(18, (cs.variacV / 230) * 10.5) : 0;
        events.push({
          id: 'single-phasing',
          severity: 'warning',
          message: 'Single-phasing fault: one motor supply line is open.',
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

    let rawWLine = 0;
    if (
      !mcbTripped &&
      cs.supplyOn &&
      cs.variacV > 0 &&
      cs.allMotorLinesOk &&
      cs.ctSecClosed &&
      cs.wmPcConnected
    ) {
      const angDeg =
        cs.selConnectedPhase === 'B' ? 30 + motorPt.phiDeg : 30 - motorPt.phiDeg;
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
          'Wattmeter deflected below zero (light-load W1 < 0). Flip wm REV ON to read upscale, and record W1 as negative.',
      });
    }

    const vmEval = evaluateAnalogMeter(cs.vmConnected ? activeV : 0, 300, gains.vm ?? 0);
    const amEval = evaluateAnalogMeter(cs.amInSeries ? activeIL : 0, 10, gains.am ?? 0);
    const rpmTrue = mcbTripped || !cs.supplyOn || rotorBlocked ? 0 : motorPt.rpm;
    const rpmShown = Math.max(0, Math.round(rpmTrue * (1 + (gains.tacho ?? 0))));

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
      { id: 'vm', label: 'Voltmeter (VL)', kind: 'voltmeter', unit: 'V', decimals: 1, ...vmEval },
      { id: 'am', label: 'Ammeter (IL)', kind: 'ammeter', unit: 'A', decimals: 2, ...amEval },
      { id: 'wm', label: 'Wattmeter', kind: 'wattmeter', unit: 'div', decimals: 1, ...wmReadingRaw },
      tachoMeter,
    ];

    return {
      meters,
      events,
      mcbTripped,
      runFailed: mcbTripped,
      outputs: {
        testStage: 2,
        V: Number(vmEval.shownValue.toFixed(1)),
        I: Number(amEval.shownValue.toFixed(2)),
        n: rpmShown,
        f: p.f,
        wmDial: Number(wmReadingRaw.dial.toFixed(2)),
        wmMf: Number(wmReadingRaw.mf.toFixed(3)),
        PinTrue: Number(motorPt.Pin.toFixed(2)),
        pfTrue: Number(motorPt.pf.toFixed(4)),
        rotorBlocked: rotorBlocked ? 1 : 0,
      },
    };
  },

  validateStage(input: StageValidationInput): ValidationResult | null {
    const hints = getStageHints({ hints: input.stage.hints ?? [] } as never, input.stage);
    const stageComps = input.stage.componentIds.map((id) => ({
      id,
      type: COMP_TYPE_BY_ID[id] ?? ('selectorSwitch' as const),
      label: id,
      position: [0, 0, 0] as [number, number, number],
      params: {},
    }));

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
