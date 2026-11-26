import type {
  BaseConnectionState,
  ControlValues,
  FaultPattern,
  NetGraphLike,
  PhysicsModel,
  PhysicsSolveInput,
  PhysicsSolveOutput,
  RuntimeEvent,
  TerminalId,
} from '../../types';
import {
  evaluateAnalogMeter,
  evaluateWattmeter,
  toAnalogMeterReading,
  toWattmeterMeterReading,
} from '../meters';

export interface OcScConnectionState extends BaseConnectionState {
  testMode: 1 | 2; // 1 = OC (LV), 2 = SC (HV)
  hvNotOpen: boolean;
  wrongSideForOc: boolean;
  lvNotShorted: boolean;
  pcOnMSide: boolean;
  vmInSeries: boolean;
  amInSeries: boolean;
  vmConnected: boolean;
  wmCcEnergised: boolean;
  wmPcEnergised: boolean;
  wmReversed: boolean;
}

export interface TransformerOcScParams {
  testMode: 1 | 2;
  a: number;
  Srated: number;
  V1rated: number;
  V2rated: number;
  I1rated: number;
  I2rated: number;
  R_hv: number;
  X_hv: number;
  rc_hv: number;
  xm_hv: number;
  rc_lv: number;
  xm_lv: number;
  r_lv: number;
  Pi_rated: number;
  Rs: number;
  Rs_sc: number;
  meterLoopR: number;
  vmRange: number;
  amRange: number;
  wmDivisions: number;
  wmPf: number;
  wmDefaultVRange: number;
  wmDefaultIRange: number;
}

export const DEFAULT_OC_SC_PARAMS: Omit<TransformerOcScParams, 'testMode'> = {
  a: 2,
  Srated: 2000,
  V1rated: 230,
  V2rated: 115,
  I1rated: 8.7,
  I2rated: 17.39,
  R_hv: 0.6,
  X_hv: 0.88,
  rc_hv: 2645,
  xm_hv: 678.4,
  rc_lv: 661.25,
  xm_lv: 169.6,
  r_lv: 0.075,
  Pi_rated: 20,
  Rs: 0.3,
  Rs_sc: 0,
  meterLoopR: 0.15,
  vmRange: 150,
  amRange: 1,
  wmDivisions: 150,
  wmPf: 0.2,
  wmDefaultVRange: 150,
  wmDefaultIRange: 1,
};

export function extractOcScParams(
  raw: Record<string, number>,
): TransformerOcScParams {
  const testMode: 1 | 2 = raw.testMode === 2 ? 2 : 1;
  return {
    testMode,
    a: raw.a ?? DEFAULT_OC_SC_PARAMS.a,
    Srated: raw.Srated ?? DEFAULT_OC_SC_PARAMS.Srated,
    V1rated: raw.V1rated ?? DEFAULT_OC_SC_PARAMS.V1rated,
    V2rated: raw.V2rated ?? DEFAULT_OC_SC_PARAMS.V2rated,
    I1rated: raw.I1rated ?? DEFAULT_OC_SC_PARAMS.I1rated,
    I2rated: raw.I2rated ?? DEFAULT_OC_SC_PARAMS.I2rated,
    R_hv: raw.R_hv ?? DEFAULT_OC_SC_PARAMS.R_hv,
    X_hv: raw.X_hv ?? DEFAULT_OC_SC_PARAMS.X_hv,
    rc_hv: raw.rc_hv ?? DEFAULT_OC_SC_PARAMS.rc_hv,
    xm_hv: raw.xm_hv ?? DEFAULT_OC_SC_PARAMS.xm_hv,
    rc_lv: raw.rc_lv ?? DEFAULT_OC_SC_PARAMS.rc_lv,
    xm_lv: raw.xm_lv ?? DEFAULT_OC_SC_PARAMS.xm_lv,
    r_lv: raw.r_lv ?? DEFAULT_OC_SC_PARAMS.r_lv,
    Pi_rated: raw.Pi_rated ?? DEFAULT_OC_SC_PARAMS.Pi_rated,
    Rs: raw.Rs ?? DEFAULT_OC_SC_PARAMS.Rs,
    Rs_sc: raw.Rs_sc ?? DEFAULT_OC_SC_PARAMS.Rs_sc,
    meterLoopR: raw.meterLoopR ?? DEFAULT_OC_SC_PARAMS.meterLoopR,
    vmRange: raw.vmRange ?? (testMode === 1 ? 150 : 30),
    amRange: raw.amRange ?? (testMode === 1 ? 1 : 15),
    wmDivisions: raw.wmDivisions ?? DEFAULT_OC_SC_PARAMS.wmDivisions,
    wmPf: raw.wmPf ?? (testMode === 1 ? 0.2 : 1.0),
    wmDefaultVRange: raw.wmDefaultVRange ?? (testMode === 1 ? 150 : 75),
    wmDefaultIRange: raw.wmDefaultIRange ?? (testMode === 1 ? 1 : 10),
  };
}

function anyConnectedTo(
  graph: NetGraphLike,
  target: TerminalId,
  candidates: TerminalId[],
): boolean {
  return candidates.some((c) => graph.areConnected(target, c));
}

function pairAcross(
  graph: NetGraphLike,
  t1: TerminalId,
  t2: TerminalId,
  sideA: TerminalId[],
  sideB: TerminalId[],
): boolean {
  const fwd = anyConnectedTo(graph, t1, sideA) && anyConnectedTo(graph, t2, sideB);
  const rev = anyConnectedTo(graph, t2, sideA) && anyConnectedTo(graph, t1, sideB);
  return fwd || rev;
}

export interface OcScMethodTruth {
  Vo: number;
  Io: number;
  Po: number;
  rc_lv: number;
  xm_lv: number;
  R_hv: number;
  X_hv: number;
  Pc: number;
  Rpu: number;
  Xpu: number;
  VR_lag08: number;
  VR_lead08: number;
  xMaxEff: number;
}

/**
 * Computes noise-free method truth by applying the manual's Eqs. (3.2.22)-(3.2.40)
 * to noise-free OC (at 115 V) and SC (at rated 8.70 A) model outputs.
 */
export function computeOcScMethodTruth(
  rawParams: Record<string, number>,
): OcScMethodTruth {
  const p = extractOcScParams(rawParams);

  // Noise-free OC at rated LV voltage (115 V)
  const Vo = p.V2rated;
  const Io = Vo * Math.hypot(1 / p.rc_lv, 1 / p.xm_lv);
  const Po = (Vo * Vo) / p.rc_lv + Io * Io * p.r_lv;

  const Zo = Vo / Io;
  const rc_lv = (Vo * Vo) / Po;
  const xm_lv = 1 / Math.sqrt(Math.max(1e-12, 1 / (Zo * Zo) - 1 / (rc_lv * rc_lv)));

  // Noise-free SC at rated HV current (8.70 A)
  const Zeq = Math.hypot(p.R_hv, p.X_hv);
  const Isc = p.I1rated;
  const Vsc = Isc * Zeq;
  const Psc = Isc * Isc * p.R_hv + p.Pi_rated * (Vsc / p.V1rated) ** 2;

  const Z_sc = Vsc / Isc;
  const R_hv = Psc / (Isc * Isc);
  const X_hv = Math.sqrt(Math.max(0, Z_sc * Z_sc - R_hv * R_hv));
  const Pc = (p.I1rated / Isc) ** 2 * Psc;

  const Rpu = (p.I1rated * R_hv) / p.V1rated;
  const Xpu = (p.I1rated * X_hv) / p.V1rated;
  const cosPhi = 0.8;
  const sinPhi = 0.6;
  const VR_lag08 = (Rpu * cosPhi + Xpu * sinPhi) * 100;
  const VR_lead08 = (Rpu * cosPhi - Xpu * sinPhi) * 100;
  const xMaxEff = Math.sqrt(Po / Pc);

  return {
    Vo,
    Io,
    Po,
    rc_lv,
    xm_lv,
    R_hv,
    X_hv,
    Pc,
    Rpu,
    Xpu,
    VR_lag08,
    VR_lead08,
    xMaxEff,
  };
}

export const transformerOcScModel: PhysicsModel<OcScConnectionState> = {
  id: 'transformerOcSc',

  deriveConnectionState(
    nets: NetGraphLike,
    controls: ControlValues,
    stageParams: Record<string, number>,
    faults: FaultPattern[] = [],
  ): OcScConnectionState {
    const p = extractOcScParams(stageParams);
    const faultIds = faults.map((f) => f.id);
    const shortFaults = faults.filter((f) => f.effect === 'short');
    const shorted = shortFaults.length > 0;
    const supplyOn = Boolean(controls['sup.switch']);
    const supConnectedToVariac =
      nets.areConnected('sup.P', 'va.IN_P') &&
      nets.areConnected('sup.N', 'va.IN_N');

    const vmInSeries = faultIds.includes('voltmeter-in-series');
    const hvNotOpen = faultIds.includes('hv-winding-not-open');
    const wrongSideForOc = faultIds.includes('wrong-side-for-oc');
    const pcOnMSide = faultIds.includes('pc-on-m-side');
    const lvNotShorted =
      p.testMode === 2 &&
      (faultIds.includes('lv-not-shorted') || !nets.areConnected('tx.S1', 'tx.S2'));

    if (p.testMode === 1) {
      // Stage 1: Open-circuit test on LV side (S1, S2)
      const neutralSide: TerminalId[] = ['sup.N', 'va.IN_N', 'va.OUT_N', 'tx.S2'];
      const ccFwd =
        nets.areConnected('va.OUT_P', 'wm.M') &&
        (nets.areConnected('wm.L', 'am.IN') ||
          nets.areConnected('wm.L', 'am.OUT') ||
          nets.areConnected('wm.L', 'tx.S1'));
      const ccRev =
        nets.areConnected('va.OUT_P', 'wm.L') &&
        (nets.areConnected('wm.M', 'am.IN') ||
          nets.areConnected('wm.M', 'am.OUT') ||
          nets.areConnected('wm.M', 'tx.S1'));

      const wmExit: TerminalId = ccFwd ? 'wm.L' : ccRev ? 'wm.M' : 'va.OUT_P';
      const amInSeries =
        (nets.areConnected(wmExit, 'am.IN') &&
          nets.areConnected('am.OUT', 'tx.S1')) ||
        (nets.areConnected(wmExit, 'am.OUT') &&
          nets.areConnected('am.IN', 'tx.S1'));
      const directToLv = nets.areConnected(wmExit, 'tx.S1');
      const lvReturn = nets.areConnected('tx.S2', 'sup.N');

      const energised =
        supplyOn &&
        !shorted &&
        !vmInSeries &&
        !wrongSideForOc &&
        supConnectedToVariac &&
        lvReturn &&
        (amInSeries || directToLv);

      const liveTerms: TerminalId[] = ['va.OUT_P', 'wm.M', 'wm.L', 'am.IN', 'am.OUT', 'tx.S1'];
      const vmConnected =
        supplyOn &&
        !shorted &&
        supConnectedToVariac &&
        (pairAcross(nets, 'vm.A', 'vm.B', ['va.OUT_P', 'wm.M', 'wm.L', 'tx.S1'], neutralSide) ||
          vmInSeries);

      const pcFwd =
        anyConnectedTo(nets, 'wm.V1', liveTerms) &&
        anyConnectedTo(nets, 'wm.V2', neutralSide);
      const pcRev =
        anyConnectedTo(nets, 'wm.V1', neutralSide) &&
        anyConnectedTo(nets, 'wm.V2', liveTerms);

      const wmPcEnergised =
        supplyOn && !shorted && supConnectedToVariac && (pcFwd || pcRev);
      const wmCcEnergised = energised && (ccFwd || ccRev);

      return {
        testMode: 1,
        shorted,
        shortFaults,
        matchedFaultIds: faultIds,
        energised,
        hvNotOpen,
        wrongSideForOc,
        lvNotShorted: false,
        pcOnMSide: false,
        vmInSeries,
        amInSeries,
        vmConnected,
        wmCcEnergised,
        wmPcEnergised,
        wmReversed: ccRev !== pcRev,
      };
    }

    // Stage 2: Short-circuit test on HV side (P1, P2), LV (S1, S2) shorted
    const neutralSide: TerminalId[] = ['sup.N', 'va.IN_N', 'va.OUT_N', 'tx.P2'];
    const amInSeries =
      (nets.areConnected('va.OUT_P', 'am.IN') &&
        (nets.areConnected('am.OUT', 'wm.M') ||
          nets.areConnected('am.OUT', 'wm.L') ||
          nets.areConnected('am.OUT', 'tx.P1'))) ||
      (nets.areConnected('va.OUT_P', 'am.OUT') &&
        (nets.areConnected('am.IN', 'wm.M') ||
          nets.areConnected('am.IN', 'wm.L') ||
          nets.areConnected('am.IN', 'tx.P1')));

    const amExitCandidates: TerminalId[] = amInSeries
      ? ['am.OUT', 'am.IN']
      : ['va.OUT_P'];
    const ccFwd =
      anyConnectedTo(nets, 'wm.M', amExitCandidates) &&
      nets.areConnected('wm.L', 'tx.P1');
    const ccRev =
      anyConnectedTo(nets, 'wm.L', amExitCandidates) &&
      nets.areConnected('wm.M', 'tx.P1');
    const hvReturn = nets.areConnected('tx.P2', 'sup.N');

    const energised =
      supplyOn &&
      !shorted &&
      !vmInSeries &&
      supConnectedToVariac &&
      hvReturn &&
      (ccFwd || ccRev || nets.areConnected('va.OUT_P', 'tx.P1'));

    const liveTerms: TerminalId[] = ['va.OUT_P', 'am.IN', 'am.OUT', 'wm.M', 'wm.L', 'tx.P1'];
    const vmConnected =
      supplyOn &&
      !shorted &&
      supConnectedToVariac &&
      (pairAcross(nets, 'vm.A', 'vm.B', ['wm.L', 'tx.P1', 'wm.M', 'va.OUT_P'], neutralSide) ||
        vmInSeries);

    const pcFwd =
      anyConnectedTo(nets, 'wm.V1', liveTerms) &&
      anyConnectedTo(nets, 'wm.V2', neutralSide);
    const pcRev =
      anyConnectedTo(nets, 'wm.V1', neutralSide) &&
      anyConnectedTo(nets, 'wm.V2', liveTerms);

    const wmPcEnergised =
      supplyOn && !shorted && supConnectedToVariac && (pcFwd || pcRev);
    const wmCcEnergised = energised && (ccFwd || ccRev);

    return {
      testMode: 2,
      shorted,
      shortFaults,
      matchedFaultIds: faultIds,
      energised,
      hvNotOpen: false,
      wrongSideForOc: false,
      lvNotShorted,
      pcOnMSide,
      vmInSeries,
      amInSeries,
      vmConnected,
      wmCcEnergised,
      wmPcEnergised,
      wmReversed: ccRev !== pcRev,
    };
  },

  solve(input: PhysicsSolveInput<OcScConnectionState>): PhysicsSolveOutput {
    const p = extractOcScParams(input.params);
    const conn = input.connectionState;
    const supplyOn = Boolean(input.controls['sup.switch']);
    const vSet = Number(input.controls['va.knob'] ?? 0);
    const wmVRange = Number(input.controls['wm.vRange'] ?? p.wmDefaultVRange);
    const wmIRange = Number(input.controls['wm.iRange'] ?? p.wmDefaultIRange);
    const wmReverseSwitch = Boolean(input.controls['wm.reverse']);

    const labelOf = (id: string, fallback: string) =>
      input.components?.find((c) => c.id === id)?.label ?? fallback;

    const events: RuntimeEvent[] = [];

    const buildZeroOutput = (
      mcbTripped: boolean,
      runFailed: boolean,
    ): PhysicsSolveOutput => ({
      meters: [
        toAnalogMeterReading(
          'vm',
          labelOf('vm', 'Voltmeter'),
          'voltmeter',
          'V',
          evaluateAnalogMeter(0, p.vmRange, input.gains.vm ?? 0),
          p.testMode === 1 ? 1 : 2,
        ),
        toAnalogMeterReading(
          'am',
          labelOf('am', 'Ammeter'),
          'ammeter',
          'A',
          evaluateAnalogMeter(0, p.amRange, input.gains.am ?? 0),
          p.testMode === 1 ? 3 : 2,
        ),
        toWattmeterMeterReading(
          'wm',
          labelOf('wm', 'Wattmeter'),
          evaluateWattmeter(
            0,
            0,
            0,
            wmVRange,
            wmIRange,
            input.gains.wm ?? 0,
            false,
            p.wmDivisions,
            p.wmPf,
            wmReverseSwitch,
          ),
          2,
        ),
      ],
      events,
      mcbTripped,
      runFailed,
      outputs:
        p.testMode === 1
          ? { V: 0, I: 0, P: 0, Vo: 0, Io: 0, Po: 0 }
          : { V: 0, I: 0, P: 0, Vsc: 0, Isc: 0, Psc: 0 },
    });

    if (!supplyOn) {
      return buildZeroOutput(false, false);
    }

    if (conn.shorted) {
      const shortMsg =
        conn.shortFaults[0]?.description ??
        'Short circuit detected. MCB tripped.';
      events.push({
        id: 'mcb-trip',
        severity: 'danger',
        message: `MCB tripped: ${shortMsg}`,
      });
      return buildZeroOutput(true, true);
    }

    if (p.testMode === 1) {
      if (conn.hvNotOpen || conn.wrongSideForOc) {
        events.push({
          id: 'hv-not-open-danger',
          severity: 'danger',
          message: conn.wrongSideForOc
            ? 'In this lab the open-circuit test is done on the LV side as the manual recommends.'
            : 'Danger: HV winding (P1/P2) carries 230 V and must stay completely open during the OC test.',
        });
      }

      let V = 0;
      let Io = 0;
      let Po = 0;

      if (conn.vmInSeries) {
        V = vSet;
      } else if (!conn.energised) {
        if (conn.vmConnected) V = vSet;
      } else {
        const rs = input.options?.noSag ? 0 : p.Rs;
        const yo = Math.hypot(1 / p.rc_lv, 1 / p.xm_lv);
        V = vSet;
        const iterations = rs === 0 ? 1 : 8;
        for (let k = 0; k < iterations; k++) {
          Io = V * yo;
          V = Math.max(0, vSet - Io * rs);
        }
        Io = V * yo;
        Po = (V * V) / p.rc_lv + Io * Io * p.r_lv;
      }

      if (V > p.V2rated * 1.15) {
        events.push({
          id: 'oc-overvoltage',
          severity: 'warning',
          message: `LV voltage (${V.toFixed(1)} V) exceeds 115% of rated 115 V.`,
        });
      }

      const vmReading = evaluateAnalogMeter(
        conn.vmConnected ? V : 0,
        p.vmRange,
        input.gains.vm ?? 0,
      );
      const amReading = evaluateAnalogMeter(
        conn.amInSeries && conn.energised ? Io : 0,
        p.amRange,
        input.gains.am ?? 0,
      );
      const wmReading = evaluateWattmeter(
        conn.wmCcEnergised && conn.wmPcEnergised ? Po : 0,
        conn.wmPcEnergised ? V : 0,
        conn.wmCcEnergised ? Io : 0,
        wmVRange,
        wmIRange,
        input.gains.wm ?? 0,
        conn.wmReversed,
        p.wmDivisions,
        p.wmPf,
        wmReverseSwitch,
      );

      appendMeterEvents(events, vmReading, amReading, wmReading, wmVRange, wmIRange);

      return {
        meters: [
          toAnalogMeterReading('vm', labelOf('vm', 'Voltmeter'), 'voltmeter', 'V', vmReading, 1),
          toAnalogMeterReading('am', labelOf('am', 'Ammeter'), 'ammeter', 'A', amReading, 3),
          toWattmeterMeterReading('wm', labelOf('wm', 'Wattmeter'), wmReading, 2),
        ],
        events,
        mcbTripped: false,
        runFailed: false,
        outputs: { V, I: Io, P: Po, Vo: V, Io, Po },
      };
    }

    // Stage 2: Short-circuit test on HV side
    let V = 0;
    let Isc = 0;
    let Psc = 0;

    if (conn.vmInSeries) {
      V = vSet;
    } else if (!conn.energised) {
      if (conn.vmConnected) V = vSet;
    } else {
      const rs = input.options?.noSag ? 0 : p.Rs_sc;
      if (conn.lvNotShorted) {
        // LV winding left open: draws only tiny HV open-circuit current
        const yoHv = Math.hypot(1 / p.rc_hv, 1 / p.xm_hv);
        V = vSet;
        Isc = V * yoHv;
        Psc = (V * V) / p.rc_hv;
        if (vSet > 1) {
          events.push({
            id: 'lv-not-shorted',
            severity: 'warning',
            message:
              'The LV winding (S1–S2) is not shorted, so current stays tiny like an open-circuit test.',
          });
        }
      } else {
        const Zeq = Math.hypot(p.R_hv, p.X_hv);
        V = vSet;
        const iterations = rs === 0 ? 1 : 6;
        for (let k = 0; k < iterations; k++) {
          Isc = V / Zeq;
          V = Math.max(0, vSet - Isc * rs);
        }
        Isc = V / Zeq;
        Psc = Isc * Isc * p.R_hv + p.Pi_rated * (V / p.V1rated) ** 2;
      }
    }

    // Overcurrent protection: Isc above 125% of 8.70 A trips the supply
    const tripLimit = p.I1rated * 1.25;
    if (Isc > tripLimit) {
      events.push({
        id: 'mcb-trip',
        severity: 'danger',
        message: `Overcurrent trip: Isc (${Isc.toFixed(2)} A) exceeded 125% of rated 8.70 A (${tripLimit.toFixed(2)} A). Supply tripped.`,
      });
      return buildZeroOutput(true, true);
    }

    const wmPower =
      conn.wmCcEnergised && conn.wmPcEnergised
        ? Psc + (conn.pcOnMSide ? Isc * Isc * p.meterLoopR : 0)
        : 0;
    const wmV =
      conn.wmPcEnergised
        ? conn.pcOnMSide
          ? V + Isc * p.meterLoopR
          : V
        : 0;

    if (conn.pcOnMSide && conn.energised) {
      events.push({
        id: 'pc-on-m-side',
        severity: 'warning',
        message:
          'Pressure coil is on M side and includes ammeter/current-coil drops. Connect V1 to L.',
      });
    }

    const vmReading = evaluateAnalogMeter(
      conn.vmConnected ? V : 0,
      p.vmRange,
      input.gains.vm ?? 0,
    );
    const amReading = evaluateAnalogMeter(
      conn.amInSeries && conn.energised ? Isc : 0,
      p.amRange,
      input.gains.am ?? 0,
    );
    const wmReading = evaluateWattmeter(
      wmPower,
      wmV,
      conn.wmCcEnergised ? Isc : 0,
      wmVRange,
      wmIRange,
      input.gains.wm ?? 0,
      conn.wmReversed,
      p.wmDivisions,
      p.wmPf,
      wmReverseSwitch,
    );

    appendMeterEvents(events, vmReading, amReading, wmReading, wmVRange, wmIRange);

    return {
      meters: [
        toAnalogMeterReading('vm', labelOf('vm', 'Voltmeter'), 'voltmeter', 'V', vmReading, 2),
        toAnalogMeterReading('am', labelOf('am', 'Ammeter'), 'ammeter', 'A', amReading, 2),
        toWattmeterMeterReading('wm', labelOf('wm', 'Wattmeter'), wmReading, 2),
      ],
      events,
      mcbTripped: false,
      runFailed: false,
      outputs: { V, I: Isc, P: Psc, Vsc: V, Isc, Psc },
    };
  },
};

function appendMeterEvents(
  events: RuntimeEvent[],
  vm: ReturnType<typeof evaluateAnalogMeter>,
  am: ReturnType<typeof evaluateAnalogMeter>,
  wm: ReturnType<typeof evaluateWattmeter>,
  wmVRange: number,
  wmIRange: number,
): void {
  if (vm.damaged) {
    events.push({
      id: 'vm-damaged',
      severity: 'danger',
      message: 'Voltmeter damaged (>150% range). Reads zero.',
    });
  } else if (vm.overrange) {
    events.push({
      id: 'vm-overrange',
      severity: 'warning',
      message: 'Voltmeter overrange — pointer pegged.',
    });
  }

  if (am.damaged) {
    events.push({
      id: 'am-damaged',
      severity: 'danger',
      message: 'Ammeter damaged (>150% range). Reads zero.',
    });
  } else if (am.overrange) {
    events.push({
      id: 'am-overrange',
      severity: 'warning',
      message: 'Ammeter overrange — pointer pegged.',
    });
  }

  if (wm.damaged) {
    events.push({
      id: 'wm-damaged',
      severity: 'danger',
      message: 'Wattmeter damaged (>150% coil rating). Reads zero.',
    });
  } else if (wm.overrange) {
    events.push({
      id: 'wm-overrange',
      severity: 'warning',
      message:
        wm.ccOverrange && wm.pcOverrange
          ? 'Wattmeter current and voltage coils overrange — pointer pegged.'
          : wm.ccOverrange
            ? `Wattmeter current coil overrange (${wm.i1.toFixed(2)} A > ${wmIRange} A) — pointer pegged.`
            : wm.pcOverrange
              ? `Wattmeter pressure coil overrange (${wm.v1.toFixed(1)} V > ${wmVRange} V) — pointer pegged.`
              : 'Wattmeter overrange — pointer pegged.',
    });
  }
}
