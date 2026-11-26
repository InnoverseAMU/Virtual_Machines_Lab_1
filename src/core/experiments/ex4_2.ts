import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../circuit/faultFactories';
import {
  computeBlockedRotorCurrent,
  DEFAULT_IM3PH_PARAMS,
  solveSlipByBisection,
} from '../physics/motors/im3ph';
import { getRowNumber } from '../physics/report';
import type { ExperimentDef, Net, ObservationRow } from '../types';
import { EX4_1_ACCEPTED_NETLISTS, EX4_1_CANONICAL_NETS } from './ex4_1';

const SHARED_MOTOR_PARAMS: Record<string, number> = {
  Prated: DEFAULT_IM3PH_PARAMS.Prated,
  VLrated: DEFAULT_IM3PH_PARAMS.VLrated,
  f: DEFAULT_IM3PH_PARAMS.f,
  poles: DEFAULT_IM3PH_PARAMS.poles,
  ILrated: DEFAULT_IM3PH_PARAMS.ILrated,
  r1: DEFAULT_IM3PH_PARAMS.r1,
  x1: DEFAULT_IM3PH_PARAMS.x1,
  r2: DEFAULT_IM3PH_PARAMS.r2,
  x2: DEFAULT_IM3PH_PARAMS.x2,
  xm: DEFAULT_IM3PH_PARAMS.xm,
  rc: DEFAULT_IM3PH_PARAMS.rc,
  Pfw: DEFAULT_IM3PH_PARAMS.Pfw,
  pulleyRadiusM: DEFAULT_IM3PH_PARAMS.pulleyRadiusM,
  ctRatio: DEFAULT_IM3PH_PARAMS.ctRatio,
};

// Stage 1: DC Test (Fig. 4.2.6)
const DC_NETS: Net[] = [
  ['dcSupply.+', 'pot.IN+'],
  ['dcSupply.-', 'pot.IN-', 'motor.B', 'dcVoltmeter.B'],
  ['pot.OUT', 'dcAmmeter.IN'],
  ['dcAmmeter.OUT', 'motor.A', 'dcVoltmeter.A'],
];

const DC_ACCEPTED_NETLISTS: Net[][] = [DC_NETS];

function findNearestDcRow(rows: ObservationRow[]): ObservationRow | null {
  const valid = rows.filter(
    (r) => getRowNumber(r, 'Idc') >= 2.0 && getRowNumber(r, 'Idc') <= 6.0,
  );
  const pool = valid.length > 0 ? valid : rows;
  if (pool.length === 0) return null;
  let best = pool[0];
  let bestDiff = Math.abs(getRowNumber(best, 'Idc') - 4.2);
  for (const r of pool) {
    const d = Math.abs(getRowNumber(r, 'Idc') - 4.2);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return best;
}

function findNoLoadRow(rows: ObservationRow[]): ObservationRow | null {
  const nlRows = rows.filter((r) => !r.values?.rotorBlocked);
  if (nlRows.length === 0) return null;
  let best = nlRows[0];
  let bestDiff = Math.abs(getRowNumber(best, 'V') - DEFAULT_IM3PH_PARAMS.VLrated);
  for (const r of nlRows) {
    const d = Math.abs(getRowNumber(r, 'V') - DEFAULT_IM3PH_PARAMS.VLrated);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return best;
}

function findBlockedRotorRow(rows: ObservationRow[]): ObservationRow | null {
  const brRows = rows.filter((r) => Boolean(r.values?.rotorBlocked));
  if (brRows.length === 0) return null;
  let best = brRows[0];
  let bestDiff = Math.abs(getRowNumber(best, 'I') - DEFAULT_IM3PH_PARAMS.ILrated);
  for (const r of brRows) {
    const d = Math.abs(getRowNumber(r, 'I') - DEFAULT_IM3PH_PARAMS.ILrated);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return best;
}

function computeBlockedRatedVoltage(): number {
  let lo = 10;
  let hi = 120;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const pt = computeBlockedRotorCurrent(mid, DEFAULT_IM3PH_PARAMS);
    if (pt.IL < DEFAULT_IM3PH_PARAMS.ILrated) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

const FALLBACK_NL = solveSlipByBisection(DEFAULT_IM3PH_PARAMS.VLrated, 0, DEFAULT_IM3PH_PARAMS);
const FALLBACK_BR_V = computeBlockedRatedVoltage();
const FALLBACK_BR = computeBlockedRotorCurrent(FALLBACK_BR_V, DEFAULT_IM3PH_PARAMS);

function computeR1FromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const dcRow = findNearestDcRow(rowsByStage?.['dc-test'] ?? []);
  if (!dcRow) return DEFAULT_IM3PH_PARAMS.r1;
  const vdc = getRowNumber(dcRow, 'Vdc');
  const idc = getRowNumber(dcRow, 'Idc');
  return idc > 0.05 ? 1.15 * 1.5 * (vdc / idc) : DEFAULT_IM3PH_PARAMS.r1;
}

function computeZoFromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const nlRow = findNoLoadRow(rowsByStage?.['noload-blocked'] ?? []);
  const v = nlRow ? getRowNumber(nlRow, 'V') : DEFAULT_IM3PH_PARAMS.VLrated;
  const i = nlRow ? getRowNumber(nlRow, 'I') : FALLBACK_NL.IL;
  return i > 0.05 ? (Math.sqrt(3) * v) / i : 0;
}

function computeRcFromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const nlRow = findNoLoadRow(rowsByStage?.['noload-blocked'] ?? []);
  const v = nlRow ? getRowNumber(nlRow, 'V') : DEFAULT_IM3PH_PARAMS.VLrated;
  const i = nlRow ? getRowNumber(nlRow, 'I') : FALLBACK_NL.IL;
  const po = nlRow ? getRowNumber(nlRow, 'P') : FALLBACK_NL.Pin;
  const r1 = computeR1FromRows(rowsByStage);
  const denom = Math.max(1e-3, po - i * i * r1);
  return (3 * v * v) / denom;
}

function computeXmFromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const zo = computeZoFromRows(rowsByStage);
  const rc = computeRcFromRows(rowsByStage);
  if (zo <= 0 || rc <= 0 || zo >= rc) return DEFAULT_IM3PH_PARAMS.xm;
  return 1 / Math.sqrt(Math.max(1e-12, 1 / (zo * zo) - 1 / (rc * rc)));
}

function computeZbrFromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const brRow = findBlockedRotorRow(rowsByStage?.['noload-blocked'] ?? []);
  const vbr = brRow ? getRowNumber(brRow, 'V') : FALLBACK_BR_V;
  const ibr = brRow ? getRowNumber(brRow, 'I') : FALLBACK_BR.IL;
  return ibr > 0.05 ? (Math.sqrt(3) * vbr) / ibr : 0;
}

function computeReqFromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const brRow = findBlockedRotorRow(rowsByStage?.['noload-blocked'] ?? []);
  const ibr = brRow ? getRowNumber(brRow, 'I') : FALLBACK_BR.IL;
  const pbr = brRow ? getRowNumber(brRow, 'P') : FALLBACK_BR.Pin;
  return ibr > 0.05 ? pbr / (ibr * ibr) : 0;
}

function computeXeqFromRows(rowsByStage?: Record<string, ObservationRow[]>): number {
  const zbr = computeZbrFromRows(rowsByStage);
  const r = computeReqFromRows(rowsByStage);
  return Math.sqrt(Math.max(0, zbr * zbr - r * r));
}

export const ex4_2: ExperimentDef = {
  id: 'ex4.2',
  title: 'No-load and blocked-rotor tests of three-phase induction motor',
  object: [
    'Determine the per-phase equivalent-circuit parameters (r1, Zo, rc, xm, ZBR, R = r1 + r2′, and X = x1 + x2′) of a 1.5 kW, 230 V, 50 Hz, 4-pole delta-connected three-phase induction motor.',
    'Perform the DC stator-resistance test using a potential divider, then conduct the no-load test at rated 230 V and the blocked-rotor test at rated line current (5.93 A) with the one-wattmeter + 10/5 A CT setup.',
  ],
  components: [
    // Stage 1 (DC test) components
    {
      id: 'dcSupply',
      type: 'dcSupply',
      label: '230 V DC Supply',
      position: [-3.5, 0, -1.35],
      params: { V: 230 },
    },
    {
      id: 'pot',
      type: 'potDivider',
      label: 'Potential Divider (100 Ω)',
      position: [-1.55, 0, -1.35],
      params: { totalR: 100 },
    },
    {
      id: 'dcAmmeter',
      type: 'ammeter',
      label: 'DC Ammeter (0–10 A)',
      position: [0.45, 0, -1.35],
      params: { range: 10, currentMode: 'DC' },
    },
    {
      id: 'dcVoltmeter',
      type: 'voltmeter',
      label: 'DC Voltmeter (0–30 V)',
      position: [-0.8, 0, 0.55],
      params: { range: 30, currentMode: 'DC' },
    },
    // Stage 2 (No-load & Blocked-rotor) components
    {
      id: 'sup3',
      type: 'acSupply3ph',
      label: '3φ AC Supply (230 V L-L)',
      position: [-3.8, 0, -1.5],
      params: { V: 230, frequency: 50 },
    },
    {
      id: 'va3',
      type: 'variac3ph',
      label: '3φ Autotransformer',
      position: [-2.05, 0, -1.5],
      params: { vIn: 230, vMax: 270, fineStep: 0.1 },
    },
    {
      id: 'ct',
      type: 'currentTransformer',
      label: 'Current Transformer (10/5 A)',
      position: [-0.3, 0, -1.5],
      params: { ratio: 2 },
    },
    {
      id: 'am',
      type: 'ammeter',
      label: 'AC Ammeter (0–10 A)',
      position: [1.25, 0, -1.5],
      params: { range: 10 },
    },
    {
      id: 'vm',
      type: 'voltmeter',
      label: 'AC Voltmeter (0–300 V)',
      position: [-2.15, 0, 0.45],
      params: { range: 300 },
    },
    {
      id: 'sel',
      type: 'selectorSwitch',
      label: 'V2 Selector Plug (B/C)',
      position: [-0.85, 0, 0.45],
      params: {},
    },
    {
      id: 'wm',
      type: 'wattmeter',
      label: 'Wattmeter (300 V / 5 A)',
      position: [0.6, 0, 0.45],
      params: {
        vRanges: [150, 300],
        iRanges: [2.5, 5],
        vRange: 300,
        iRange: 5,
        divisions: 150,
        pf: 1.0,
        reverseSwitch: true,
      },
    },
    // Shared 3φ induction motor (pulley/spring balances hidden in Exp 4.2)
    {
      id: 'motor',
      type: 'inductionMotor3ph',
      label: '3φ Induction Motor',
      position: [2.7, 0, 0.15],
      params: { pulleyRadiusM: 0.1, hideBrake: true },
    },
  ],
  stages: [
    {
      id: 'dc-test',
      title: 'Stage 1: DC Stator Resistance Test (Fig. 4.2.6)',
      summary:
        'Wire the 230 V DC supply across the potential divider, feed pot.OUT through the DC ammeter to motor.A, join dcSupply.−, pot.IN−, motor.B, and dcVoltmeter.B, and connect dcVoltmeter.A to motor.A. Raise pot.p carefully to record Vdc and Idc between 2 A and 5.93 A.',
      componentIds: ['dcSupply', 'pot', 'dcAmmeter', 'dcVoltmeter', 'motor'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [-0.3, 4.4, 4.9], target: [-0.5, 0.25, -0.35] },
        { id: 'dc-feed', label: 'DC Supply & Divider', pos: [-2.2, 2.7, 2.3], target: [-2.4, 0.3, -1.2] },
        { id: 'meters', label: 'DC Meters & Stator', pos: [0.8, 2.6, 3.0], target: [0.6, 0.3, -0.4] },
      ],
      acceptedNetlists: DC_ACCEPTED_NETLISTS,
      netLabels: [
        'dcSupply.+ -> pot.IN+',
        'dcSupply.− / pot.IN− / motor.B / dcVoltmeter.B',
        'pot.OUT -> dcAmmeter.IN',
        'dcAmmeter.OUT -> motor.A & dcVoltmeter.A',
      ],
      netCategories: [
        'DC positive supply lead',
        'DC negative common return',
        'Divider tap to DC ammeter',
        'Motor stator winding A feed & voltmeter +',
      ],
      faultPatterns: [
        ammeterAcrossSource('dcAmmeter', ['dcSupply.+', 'dcSupply.-'], {
          id: 'dc-am-across-sup',
          description: 'DC ammeter wired directly across the 230 V DC supply — MCB tripped!',
        }),
        ammeterAcrossSource('dcAmmeter', ['pot.OUT', 'pot.IN-'], {
          id: 'dc-am-across-pot',
          description: 'DC ammeter shorted across potential divider output!',
        }),
        voltmeterInSeries(
          'dcVoltmeter',
          [
            ['pot.OUT', 'dcAmmeter.IN'],
            ['dcAmmeter.OUT', 'motor.A'],
          ],
          ['motor.B'],
          {
            id: 'dc-vm-series',
            description: 'DC voltmeter wired in series with the motor winding.',
          },
        ),
        liveNeutralShort([['dcSupply.+', 'pot.IN+']], ['dcSupply.-', 'pot.IN-'], {
          id: 'dc-sup-short',
          description: '230 V DC supply shorted (+ to −) — DC MCB tripped!',
        }),
        liveNeutralShort([['pot.OUT', 'dcAmmeter.IN']], ['pot.IN-', 'motor.B'], {
          id: 'pot-out-short',
          description: 'Divider output shorted to negative bus — DC MCB tripped!',
        }),
      ],
      controls: [
        {
          id: 'dcSupply.switch',
          componentId: 'dcSupply',
          kind: 'switch',
          label: '230 V DC Supply MCB',
          defaultValue: false,
        },
        {
          id: 'pot.p',
          componentId: 'pot',
          kind: 'knob',
          label: 'Potential Divider Slider',
          min: 0,
          max: 1,
          step: 0.05,
          fineStep: 0.01,
          unit: 'p',
          defaultValue: 0,
        },
      ],
      physicsModel: 'inductionTests',
      physicsParams: {
        ...SHARED_MOTOR_PARAMS,
        testStage: 1,
        dcSourceV: 230,
        potTotalR: 100,
        potSeriesR: 0.02,
      },
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' } },
        {
          id: 'Vdc',
          label: 'Vdc',
          unit: 'V',
          source: { kind: 'meter', meterId: 'dcVoltmeter', field: 'shownValue' },
          decimals: 2,
        },
        {
          id: 'Idc',
          label: 'Idc',
          unit: 'A',
          source: { kind: 'meter', meterId: 'dcAmmeter', field: 'shownValue' },
          decimals: 2,
        },
        {
          id: 'r1dc',
          label: 'r1dc',
          unit: 'Ω',
          source: {
            kind: 'derived',
            compute: (r) => {
              const i = Number(r.Idc ?? 0);
              const v = Number(r.Vdc ?? 0);
              return i > 0.05 ? 1.5 * (v / i) : null;
            },
          },
          decimals: 3,
        },
        {
          id: 'r1ac',
          label: 'r1 (1.15×r1dc)',
          shortLabel: 'r1',
          unit: 'Ω',
          source: {
            kind: 'derived',
            compute: (r) => {
              const i = Number(r.Idc ?? 0);
              const v = Number(r.Vdc ?? 0);
              return i > 0.05 ? 1.15 * 1.5 * (v / i) : null;
            },
          },
          decimals: 3,
        },
      ],
      rowRules: [
        {
          id: 'dc-current-window',
          label: 'Idc within 2.0–5.93 A',
          message: 'Adjust potential divider slider so 2.0 A ≤ Idc ≤ 5.93 A.',
          amber: true,
          highlightColumnIds: ['Idc', 'Vdc'],
          predicate: (r) => {
            const i = getRowNumber(r, 'Idc');
            return i >= 2.0 && i <= DEFAULT_IM3PH_PARAMS.ILrated + 0.05;
          },
          minPassCount: 1,
          failMessage: () => 'Record at least one DC reading with Idc between 2.0 A and 5.93 A.',
          failHint: () => 'Raise pot.p slowly (e.g. p ≈ 0.50 -> Idc ≈ 4.2 A) with dcSupply ON.',
        },
      ],
      prerequisites: [
        {
          id: 'has-valid-dc-row',
          label: 'Record DC test reading (2 A ≤ Idc ≤ 5.93 A)',
          predicate: (rows) =>
            rows.some((r) => {
              const i = getRowNumber(r, 'Idc');
              return i >= 2.0 && i <= DEFAULT_IM3PH_PARAMS.ILrated + 0.05;
            }),
          failMessage: 'Stage 1 incomplete: no valid DC stator resistance reading captured.',
          failHint: 'Close dcSupply, adjust pot.p so Idc is between 2 A and 5.93 A, and click + Add row.',
        },
      ],
      hints: [
        'Connect dcSupply.+ -> pot.IN+, join dcSupply.−, pot.IN−, motor.B, and dcVoltmeter.B together.',
        'Connect pot.OUT -> dcAmmeter.IN, then dcAmmeter.OUT -> motor.A and dcVoltmeter.A (leaving motor.C disconnected).',
        'Keep pot.p = 0 when closing dcSupply MCB, then raise pot.p near 0.50 (Vdc ≈ 9.75 V, Idc ≈ 4.21 A) before clicking + Add row.',
      ],
      solutionNote:
        'DC stator test (Fig. 4.2.6): potential divider feeds stator terminals A–B via dcAmmeter in series and dcVoltmeter across A–B; r1 = 1.15 × 1.5 × Vdc / Idc.',
      learnSteps: [
        {
          id: 's1-dc-theory',
          stageId: 'dc-test',
          title: 'Why measure DC stator resistance first?',
          why:
            'Because a 3φ delta winding puts one phase (r1dc) in parallel with two phases in series (2·r1dc), the terminal resistance between A and B is (2/3)·r1dc. Thus r1dc = 1.5·(Vdc/Idc), multiplied by 1.15 for 50 Hz skin/proximity effects.',
          camera: 'meters',
          focus: ['motor', 'dcVoltmeter'],
        },
        {
          id: 's1-wire-divider',
          stageId: 'dc-test',
          title: 'Connect DC supply across potential divider',
          why:
            'Applying 230 V DC straight onto a 2.32 Ω winding would drive nearly 100 A. Wire dcSupply.+ to pot.IN+ and dcSupply.− to pot.IN−, motor.B, and dcVoltmeter.B so only a small adjustable fraction reaches the stator.',
          camera: 'dc-feed',
          focus: ['dcSupply', 'pot'],
          connectTerminals: [
            ['dcSupply.+', 'pot.IN+'],
            ['dcSupply.-', 'pot.IN-'],
            ['pot.IN-', 'motor.B'],
            ['motor.B', 'dcVoltmeter.B'],
          ],
        },
        {
          id: 's1-wire-series',
          stageId: 'dc-test',
          title: 'Insert DC ammeter in series & voltmeter across A–B',
          why:
            'Take pot.OUT through dcAmmeter (IN -> OUT) to motor.A and clip dcVoltmeter.A directly on motor.A (leaving terminal C open) so Vdc measures only the winding drop without ammeter drop.',
          camera: 'meters',
          focus: ['dcAmmeter', 'dcVoltmeter', 'motor'],
          connectTerminals: [
            ['pot.OUT', 'dcAmmeter.IN'],
            ['dcAmmeter.OUT', 'motor.A'],
            ['motor.A', 'dcVoltmeter.A'],
          ],
        },
        {
          id: 's1-adjust-pot',
          stageId: 'dc-test',
          title: 'Energise & raise slider to safe DC current (≈ 4.2 A)',
          why:
            'Ensure pot.p starts at 0, close dcSupply MCB, and advance pot.p slowly into the 2–5.93 A window (p = 0.50 gives Vdc ≈ 9.75 V, Idc ≈ 4.21 A; exceeding 5.93 A warns of overcurrent and >11.86 A damages the divider).',
          camera: 'dc-feed',
          focus: ['dcSupply', 'pot', 'dcAmmeter'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'pot.p',
            meterId: 'dcVoltmeter',
            targetV: 9.75,
            toleranceV: 4.0,
            unit: 'V',
            targetLabel: 'DC winding voltage Vdc (2–5.93 A)',
          },
        },
        {
          id: 's1-record-dc',
          stageId: 'dc-test',
          title: 'Capture DC observation & proceed to Stage 2',
          why:
            'Click + Add row in Observations to log Vdc and Idc, verifying r1 ≈ 4.0 Ω before switching to the No-Load and Blocked-Rotor tests.',
          camera: 'overview',
          focus: ['dcAmmeter', 'dcVoltmeter'],
        },
      ],
    },
    {
      id: 'noload-blocked',
      title: 'Stage 2: No-Load & Blocked-Rotor Tests (Fig. 4.2.5)',
      summary:
        'Wire Fig. 4.2.5 with CT (10/5 A), one-wattmeter + V2 selector plug (B/C). Keep rotor unlocked and capture the No-Load row at VoL = 230 V (flipping REV ON for negative W1). Shut off supply, toggle Rotor Lock Pin ON, energise slowly to rated IBR ≈ 5.93 A (≈ 43 V), and capture the Blocked-Rotor row.',
      componentIds: ['sup3', 'va3', 'ct', 'am', 'vm', 'sel', 'wm', 'motor'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.0, 5.1, 5.7], target: [-0.1, 0.3, -0.3] },
        { id: 'supply', label: '3φ Supply & Variac', pos: [-2.7, 3.0, 2.5], target: [-2.8, 0.3, -1.4] },
        { id: 'instruments', label: 'CT, Selector & Meters', pos: [0.2, 2.8, 3.4], target: [0.0, 0.3, -0.2] },
        { id: 'motor', label: 'Induction Motor & Lock Pin', pos: [2.9, 2.4, 3.0], target: [2.7, 0.4, 0.1] },
      ],
      acceptedNetlists: EX4_1_ACCEPTED_NETLISTS,
      netLabels: [
        'Supply A -> Variac IN_A',
        'Supply B -> Variac IN_B',
        'Supply C -> Variac IN_C',
        'Line A Primary + wm.V1',
        'CT Primary Out -> Ammeter IN',
        'Ammeter Out -> Motor A',
        'Line B + Voltmeter + sel.B',
        'Line C + Voltmeter + sel.C',
        'Wattmeter V2 -> Selector COM',
        'CT Secondary M -> Wattmeter M',
        'CT Secondary L -> Wattmeter L',
      ],
      netCategories: [
        '3φ supply lead A',
        '3φ supply lead B',
        '3φ supply lead C',
        'CT primary & wattmeter PC live',
        'Line A current series link',
        'Motor phase A feed',
        'Line B bus & selector B',
        'Line C bus & selector C',
        'Wattmeter V2 common lead',
        'CT secondary mains',
        'CT secondary load',
      ],
      faultPatterns: [
        ...wattmeterFaults('wm', EX4_1_CANONICAL_NETS),
        ammeterAcrossSource('am', ['va3.OUT_A', 'va3.OUT_B']),
        ammeterAcrossSource('am', ['va3.OUT_A', 'va3.OUT_C'], { id: 'am-across-ac' }),
        voltmeterInSeries(
          'vm',
          [
            ['va3.OUT_A', 'ct.P_M'],
            ['ct.P_L', 'am.IN'],
            ['am.OUT', 'motor.A'],
          ],
          ['va3.OUT_C'],
        ),
        liveNeutralShort([['sup3.A', 'va3.OUT_A']], ['sup3.B', 'va3.OUT_B'], {
          id: 'line-ab-short',
          description: 'Line A shorted to Line B — dead short trip!',
        }),
        liveNeutralShort([['sup3.B', 'va3.OUT_B']], ['sup3.C', 'va3.OUT_C'], {
          id: 'line-bc-short',
          description: 'Line B shorted to Line C — dead short trip!',
        }),
      ],
      controls: [
        {
          id: 'sup3.switch',
          componentId: 'sup3',
          kind: 'switch',
          label: '3φ Supply MCB',
          defaultValue: false,
        },
        {
          id: 'va3.knob',
          componentId: 'va3',
          kind: 'knob',
          label: '3φ Autotransformer Line Voltage',
          min: 0,
          max: 270,
          step: 1,
          fineStep: 0.1,
          unit: 'V',
          defaultValue: 0,
        },
        {
          id: 'wm.vRange',
          componentId: 'wm',
          kind: 'selector',
          label: 'Wattmeter PC Range',
          options: [150, 300],
          unit: 'V',
          defaultValue: 300,
        },
        {
          id: 'wm.iRange',
          componentId: 'wm',
          kind: 'selector',
          label: 'Wattmeter CC Range',
          options: [2.5, 5],
          unit: 'A',
          defaultValue: 5,
        },
        {
          id: 'wm.reverse',
          componentId: 'wm',
          kind: 'switch',
          label: 'Wattmeter REV Switch',
          defaultValue: false,
        },
        {
          id: 'sel.pos',
          componentId: 'sel',
          kind: 'selector',
          label: 'V2 Selector Plug',
          options: ['B', 'C'],
          unit: '',
          defaultValue: 'B',
        },
        {
          id: 'motor.rotorBlocked',
          componentId: 'motor',
          kind: 'switch',
          label: 'Rotor Lock Pin (Blocked-Rotor)',
          defaultValue: false,
          lockWhenSupplyOn: true,
        },
      ],
      physicsModel: 'inductionTests',
      physicsParams: {
        ...SHARED_MOTOR_PARAMS,
        testStage: 2,
        wmDivisions: 150,
        wmPf: 1.0,
      },
      twoReadingCapture: {
        selectorControlId: 'sel.pos',
        firstOption: 'B',
        secondOption: 'C',
        firstLabel: 'Capture W1 (V2 on B)',
        secondLabel: 'Capture W2 (V2 on C)',
        meterId: 'wm',
        reverseControlId: 'wm.reverse',
        invalidationControlIds: ['va3.knob', 'wm.vRange', 'wm.iRange', 'motor.rotorBlocked'],
      },
      rowGroupColumnId: 'testType',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' } },
        {
          id: 'testType',
          label: 'Section',
          source: {
            kind: 'hidden',
            capture: ({ controls }) =>
              controls['motor.rotorBlocked'] ? 'Blocked-Rotor' : 'No-Load',
          },
          hidden: true,
        },
        {
          id: 'rotorBlocked',
          label: 'Locked',
          source: { kind: 'control', controlId: 'motor.rotorBlocked' },
          hidden: true,
        },
        {
          id: 'V',
          label: 'VL',
          unit: 'V',
          source: { kind: 'meter', meterId: 'vm', field: 'shownValue' },
          decimals: 1,
        },
        {
          id: 'I',
          label: 'IL',
          unit: 'A',
          source: { kind: 'meter', meterId: 'am', field: 'shownValue' },
          decimals: 2,
        },
        {
          id: 'w1Div',
          label: 'w1Div',
          source: { kind: 'control', controlId: 'pending.w1Div' },
          decimals: 2,
          hidden: true,
        },
        {
          id: 'w1Rev',
          label: 'w1Rev',
          source: { kind: 'control', controlId: 'pending.w1Rev' },
          hidden: true,
        },
        {
          id: 'W1',
          label: 'W1',
          unit: 'div',
          source: {
            kind: 'derived',
            compute: (r) => {
              const raw = Number(r.w1Div ?? 0);
              return Boolean(r.w1Rev) ? -Math.abs(raw) : raw;
            },
          },
          decimals: 1,
        },
        {
          id: 'w2Div',
          label: 'w2Div',
          source: { kind: 'control', controlId: 'pending.w2Div' },
          decimals: 2,
          hidden: true,
        },
        {
          id: 'w2Rev',
          label: 'w2Rev',
          source: { kind: 'control', controlId: 'pending.w2Rev' },
          hidden: true,
        },
        {
          id: 'W2',
          label: 'W2',
          unit: 'div',
          source: {
            kind: 'derived',
            compute: (r) => {
              const raw = Number(r.w2Div ?? 0);
              return Boolean(r.w2Rev) ? -Math.abs(raw) : raw;
            },
          },
          decimals: 1,
        },
        {
          id: 'mf',
          label: 'MF',
          source: { kind: 'control', controlId: 'pending.wmMf' },
          decimals: 2,
          hidden: true,
        },
        {
          id: 'n',
          label: 'n',
          unit: 'rpm',
          source: { kind: 'meter', meterId: 'tacho', field: 'shownValue' },
          decimals: 0,
        },
        {
          id: 'P',
          label: 'P (W1+W2)',
          shortLabel: 'P',
          unit: 'W',
          source: {
            kind: 'derived',
            compute: (r, params) => {
              const w1 = Number(r.W1 ?? 0);
              const w2 = Number(r.W2 ?? 0);
              const mf = Number(r.mf ?? 10);
              const ct = params.ctRatio ?? 2;
              return (w1 + w2) * mf * ct;
            },
          },
          decimals: 1,
        },
      ],
      rowRules: [
        {
          id: 'test-point-window',
          label: 'No-Load at 230 V / Blocked-Rotor at ≤ 5.93 A',
          message: (row) =>
            row.values?.rotorBlocked
              ? 'Blocked-Rotor row should be captured near rated IBR ≈ 5.93 A (≤ 6.23 A) with rotor stationary.'
              : 'No-Load row should be captured at rated voltage VoL = 230 V (±5 V).',
          amber: true,
          highlightColumnIds: ['V', 'I'],
          predicate: (row) => {
            if (row.values?.rotorBlocked) {
              const i = getRowNumber(row, 'I');
              return i >= 3.0 && i <= DEFAULT_IM3PH_PARAMS.ILrated * 1.05;
            }
            const v = getRowNumber(row, 'V');
            return Math.abs(v - DEFAULT_IM3PH_PARAMS.VLrated) <= 5;
          },
        },
      ],
      prerequisites: [
        {
          id: 'has-noload-row',
          label: 'No-Load reading at VoL = 230 V (±5 V)',
          predicate: (rows) =>
            rows.some(
              (r) =>
                !r.values?.rotorBlocked &&
                Math.abs(getRowNumber(r, 'V') - DEFAULT_IM3PH_PARAMS.VLrated) <= 5,
            ),
          failMessage: 'Missing No-Load reading at rated 230 V.',
          failHint:
            'Keep Rotor Lock Pin OFF, raise va3 to 230 V, record W1 (REV ON if negative) and W2, then click + Add row.',
        },
        {
          id: 'has-blocked-row',
          label: 'Blocked-Rotor reading at IBR ≈ 5.93 A (±5%)',
          predicate: (rows) =>
            rows.some(
              (r) =>
                Boolean(r.values?.rotorBlocked) &&
                Math.abs(getRowNumber(r, 'I') - DEFAULT_IM3PH_PARAMS.ILrated) <= 0.35,
            ),
          failMessage: 'Missing Blocked-Rotor reading at rated current (≈ 5.93 A).',
          failHint:
            'Turn supply OFF, toggle Rotor Lock Pin ON, raise va3 gently to ~42.7 V (IL ≈ 5.93 A), record W1 & W2, and click + Add row.',
        },
      ],
      hints: [
        'Same AC wiring as Exp 4.1: CT (10/5 A) + Ammeter in Line A, Voltmeter across B–C, Selector B/C -> wm.V2, wm.V1 on Line A.',
        'For No-Load (Rotor Lock OFF), raise va3 to 230 V and capture W1 (with REV ON because pf ≈ 0.15 < 0.5 -> W1 < 0) and W2.',
        'Turn sup3 OFF before locking the rotor! Engage Rotor Lock Pin ON, zero va3, close sup3, raise va3 carefully to ~42.7 V (IBR ≈ 5.93 A) and capture W1 & W2.',
      ],
      solutionNote:
        'No-load (VoL = 230 V, IoL ≈ 3.36 A, Po ≈ 204 W) yields Zo, rc, xm; Blocked-rotor (IBR ≈ 5.93 A at VBR ≈ 42.7 V, PBR ≈ 243 W) yields ZBR, R = r1 + r2′, X = x1 + x2′.',
      learnSteps: [
        {
          id: 's2-equivalent-circuit',
          stageId: 'noload-blocked',
          title: 'How No-Load & Blocked-Rotor separate motor branches',
          why:
            'On no load (s ≈ 0), the rotor branch r2′(1−s)/s approaches infinity, leaving only core/excitation shunt branch Zo, rc, xm. With the rotor blocked (s = 1) at low voltage (~18% of 230 V), shunt current is small so VBR/IBR/PBR give series impedance ZBR, R, X.',
          camera: 'overview',
          focus: ['motor', 'wm'],
        },
        {
          id: 's2-wire-supply',
          stageId: 'noload-blocked',
          title: 'Wire 3φ supply to autotransformer',
          why:
            'Connect sup3 phases A, B, C to va3 inputs IN_A, IN_B, IN_C so voltage can be set both to rated 230 V (no load) and smoothly to low ~43 V (blocked rotor).',
          camera: 'supply',
          focus: ['sup3', 'va3'],
          connectTerminals: [
            ['sup3.A', 'va3.IN_A'],
            ['sup3.B', 'va3.IN_B'],
            ['sup3.C', 'va3.IN_C'],
          ],
        },
        {
          id: 's2-wire-ct-line-a',
          stageId: 'noload-blocked',
          title: 'Connect CT (10/5 A), Ammeter & Wattmeter CC',
          why:
            'Feed Line A through CT primary (P_M -> P_L) and ammeter to motor.A, while terminating CT secondary (S_M/S_L) on wattmeter M/L. Never energise an open CT secondary.',
          camera: 'instruments',
          focus: ['ct', 'am', 'wm'],
          connectTerminals: [
            ['va3.OUT_A', 'ct.P_M'],
            ['ct.P_L', 'am.IN'],
            ['am.OUT', 'motor.A'],
            ['ct.S_M', 'wm.M'],
            ['ct.S_L', 'wm.L'],
          ],
        },
        {
          id: 's2-wire-bc-sel',
          stageId: 'noload-blocked',
          title: 'Connect Lines B, C, Voltmeter & V2 Selector',
          why:
            'Run va3.OUT_B/OUT_C to motor.B/C, Voltmeter across B–C, selector contacts B/C, wm.V1 on Line A, and wm.V2 on sel.COM.',
          camera: 'instruments',
          focus: ['vm', 'sel', 'motor'],
          connectTerminals: [
            ['va3.OUT_B', 'motor.B'],
            ['motor.B', 'vm.A'],
            ['vm.A', 'sel.B'],
            ['va3.OUT_C', 'motor.C'],
            ['motor.C', 'vm.B'],
            ['vm.B', 'sel.C'],
            ['va3.OUT_A', 'wm.V1'],
            ['wm.V2', 'sel.COM'],
          ],
        },
        {
          id: 's2-noload-voltage',
          stageId: 'noload-blocked',
          title: 'No-Load Test: energise & bring va3 to 230 V',
          why:
            'Confirm Rotor Lock Pin is OFF. Close sup3 and raise va3 to 230 V line-to-line (~1498 rpm, IoL ≈ 3.36 A).',
          camera: 'instruments',
          focus: ['va3', 'vm'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'vm',
            targetV: 230,
            toleranceV: 3,
            unit: 'V',
            targetLabel: 'No-load line voltage VoL',
          },
        },
        {
          id: 's2-noload-capture',
          stageId: 'noload-blocked',
          title: 'No-Load Test: capture negative W1 (REV ON) & W2',
          why:
            'At no load pf ≈ 0.15 (< 0.5), so W1 on Sel B deflects below zero: flip wm REV ON to read it upscale (captured as negative W1), switch Sel C for W2, then click + Add row.',
          camera: 'instruments',
          focus: ['sel', 'wm'],
        },
        {
          id: 's2-lock-safety',
          stageId: 'noload-blocked',
          title: 'Safety lock rule: shut off supply before blocking rotor',
          why:
            'Return va3 to 0 V and shut off sup3. The mechanical rotor locking pin refuses engagement while live — once off, toggle Rotor Lock Pin ON.',
          camera: 'motor',
          focus: ['sup3', 'motor'],
        },
        {
          id: 's2-blocked-voltage',
          stageId: 'noload-blocked',
          title: 'Blocked-Rotor Test: raise va3 slowly to IBR ≈ 5.93 A',
          why:
            'With the rotor locked (n = 0 rpm, s = 1), small voltage produces large current and rapid I²R heating above rated current. Raise va3 carefully to ~42.7 V until IBR ≈ 5.93 A, then record W1′, W2′ (+ Add row).',
          camera: 'instruments',
          focus: ['va3', 'am', 'wm'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'vm',
            targetV: 42.7,
            toleranceV: 4.0,
            unit: 'V',
            targetLabel: 'Blocked-rotor voltage VBR (≈ 42.7 V for 5.93 A)',
          },
        },
        {
          id: 's2-report-formulas',
          stageId: 'noload-blocked',
          title: 'Compute Zo, rc, xm, ZBR, R, and X in Report',
          why:
            'Open Observations -> Report and calculate r1 (eq. 4.2.12), Zo, rc, xm (eqs. 4.2.3–4.2.7), and ZBR, R, X (eqs. 4.2.8–4.2.10) from your logged rows.',
          camera: 'overview',
          focus: ['motor', 'wm'],
        },
      ],
    },
  ],
  answers: [
    {
      id: 'r1',
      label: 'Stator AC resistance per phase r1 = 1.15 × 1.5 × (Vdc / Idc) (eq. 4.2.12)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 4.00',
      step: '0.01',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeR1FromRows(rowsByStage).toFixed(3)),
      tolerance: { rel: 0.05 },
      failHint: () => 'Compute r1 = 1.15 × (3/2) × (Vdc / Idc) from your Stage 1 DC test reading (≈ 4.00 Ω).',
    },
    {
      id: 'Zo',
      label: 'Shunt branch impedance Zo = √3 · VoL / IoL (eq. 4.2.3)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 118.5',
      step: '0.5',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeZoFromRows(rowsByStage).toFixed(2)),
      tolerance: { rel: 0.05 },
      failHint: () => 'Compute Zo = √3 × VoL / IoL using your No-Load reading at 230 V (~118.5 Ω).',
    },
    {
      id: 'rc',
      label: 'Core-loss resistance rc = 3·VoL² / (Po − IoL²·r1) (eq. 4.2.6)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 997',
      step: '5',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeRcFromRows(rowsByStage).toFixed(1)),
      tolerance: { rel: 0.08 },
      failHint: () => 'Compute rc = 3 × VoL² / (Po − IoL² × r1) where Po = (W1 + W2)×MF×2 (~997 Ω).',
    },
    {
      id: 'xm',
      label: 'Magnetising reactance xm = 1 / √(1/Zo² − 1/rc²) (eq. 4.2.7)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 119.3',
      step: '0.5',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeXmFromRows(rowsByStage).toFixed(2)),
      tolerance: { rel: 0.05 },
      failHint: () => 'Compute xm = 1 / √(1/Zo² − 1/rc²) from Zo and rc (~119.3 Ω).',
    },
    {
      id: 'ZBR',
      label: 'Blocked-rotor impedance ZBR = √3 · VBR / IBR (eq. 4.2.8)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 12.47',
      step: '0.05',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeZbrFromRows(rowsByStage).toFixed(3)),
      tolerance: { rel: 0.05 },
      failHint: () => 'Compute ZBR = √3 × VBR / IBR from your Blocked-Rotor reading (~12.47 Ω).',
    },
    {
      id: 'R',
      label: 'Equivalent series resistance R = PBR / IBR² (eq. 4.2.9)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 6.92',
      step: '0.05',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeReqFromRows(rowsByStage).toFixed(3)),
      tolerance: { rel: 0.06 },
      failHint: () => 'Compute R = PBR / IBR² where PBR = (W1′ + W2′)×MF×2 (~6.92 Ω).',
    },
    {
      id: 'X',
      label: 'Equivalent leakage reactance X = √(ZBR² − R²) (eq. 4.2.10)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 10.37',
      step: '0.05',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(computeXeqFromRows(rowsByStage).toFixed(3)),
      tolerance: { rel: 0.06 },
      failHint: () => 'Compute X = √(ZBR² − R²) from ZBR and R (~10.37 Ω).',
    },
    {
      id: 'noLoadCurrentReason',
      label: 'Why is the no-load current (%) of an induction motor much larger than that of a transformer?',
      kind: 'choice',
      options: [
        {
          value: 'air-gap',
          label: 'The air gap between stator and rotor introduces high magnetic reluctance, requiring large magnetising current.',
        },
        {
          value: 'copper-loss',
          label: 'The rotor carries full-load slip current even with zero mechanical load.',
        },
        {
          value: 'skin-effect',
          label: 'Skin effect increases 50 Hz stator resistance by more than 10 times.',
        },
        {
          value: 'delta-connection',
          label: 'Delta-connected windings double the per-phase magnetising flux compared with star windings.',
        },
      ],
      truth: () => 'air-gap',
      failHint: () =>
        'Unlike a closed-core transformer, an induction motor has a stator-to-rotor air gap whose high reluctance demands large magnetising current.',
    },
  ],
  hints: [
    'Stage 1 (Fig. 4.2.6): wire DC supply across potDivider, take pot.OUT through dcAmmeter to motor.A, tie common negative to motor.B & dcVoltmeter.B, adjust pot.p for 2–5.93 A.',
    'Stage 2 (Fig. 4.2.5): wire CT (10/5 A) + one-wattmeter + V2 selector as in Exp 4.1; run No-Load at 230 V first with Rotor Lock OFF.',
    'Turn off sup3 before engaging Rotor Lock Pin! Zero va3, switch Rotor Lock ON, energise and raise slowly to ~42.7 V (IBR ≈ 5.93 A) without lingering above rated current.',
  ],
  solutionNote:
    'Exp 4.2 determines delta IM equivalent-circuit parameters via DC test (Fig. 4.2.6 -> r1), No-load at 230 V (Zo, rc, xm), and Blocked-rotor at 5.93 A (ZBR, R, X).',
};
