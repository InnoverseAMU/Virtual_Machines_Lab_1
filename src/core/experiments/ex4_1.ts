import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../circuit/faultFactories';
import { crossProduct } from '../circuit/nets';
import {
  computeSynchronousSpeedRpm,
  DEFAULT_IM3PH_PARAMS,
  solveSlipByBisection,
} from '../physics/motors/im3ph';
import { getRowNumber } from '../physics/report';
import type { ExperimentDef, Net, ObservationRow } from '../types';

const PHYSICS_PARAMS: Record<string, number> = {
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
  wmDivisions: 150,
  wmPf: 1.0,
};

const BASE_FIXED_NETS: Net[] = [
  ['sup3.A', 'va3.IN_A'],
  ['sup3.B', 'va3.IN_B'],
  ['sup3.C', 'va3.IN_C'],
  ['ct.P_L', 'am.IN'],
  ['wm.V2', 'sel.COM'],
  ['ct.S_M', 'wm.M'],
  ['ct.S_L', 'wm.L'],
];

const V1_VARIANTS: Net[][] = [
  [['va3.OUT_A', 'ct.P_M', 'wm.V1'], ['am.OUT', 'motor.A']],
  [['va3.OUT_A', 'ct.P_M'], ['am.OUT', 'motor.A', 'wm.V1']],
];

const VM_VARIANTS: Net[][] = [
  [['va3.OUT_B', 'motor.B', 'vm.A', 'sel.B'], ['va3.OUT_C', 'motor.C', 'vm.B', 'sel.C']],
  [['va3.OUT_B', 'motor.B', 'vm.B', 'sel.B'], ['va3.OUT_C', 'motor.C', 'vm.A', 'sel.C']],
];

const ACCEPTED_NETLISTS: Net[][] = crossProduct([
  [BASE_FIXED_NETS],
  V1_VARIANTS,
  VM_VARIANTS,
]);

const CANONICAL_NETS: Net[] = ACCEPTED_NETLISTS[0];

export const EX4_1_ACCEPTED_NETLISTS: Net[][] = ACCEPTED_NETLISTS;
export const EX4_1_CANONICAL_NETS: Net[] = CANONICAL_NETS;

// Pick row closest to rated line current (5.93 A) as the full-load row
function findRatedCurrentRow(rows: ObservationRow[]): ObservationRow | null {
  if (rows.length === 0) return null;
  let best = rows[0];
  let bestDiff = Math.abs(getRowNumber(best, 'I') - DEFAULT_IM3PH_PARAMS.ILrated);
  for (const r of rows) {
    const d = Math.abs(getRowNumber(r, 'I') - DEFAULT_IM3PH_PARAMS.ILrated);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return best;
}

function findExactRatedTorque(): number {
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const pt = solveSlipByBisection(DEFAULT_IM3PH_PARAMS.VLrated, mid, DEFAULT_IM3PH_PARAMS);
    if (pt.IL < DEFAULT_IM3PH_PARAMS.ILrated) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

const RATED_PT = solveSlipByBisection(
  DEFAULT_IM3PH_PARAMS.VLrated,
  findExactRatedTorque(),
  DEFAULT_IM3PH_PARAMS,
);

export const ex4_1: ExperimentDef = {
  id: 'ex4.1',
  title: 'Load test of three-phase induction motor',
  object: [
    'Perform a brake-load test on a 1.5 kW, 230 V, 50 Hz, 4-pole squirrel-cage induction motor using a current transformer (10/5 A) and the one-wattmeter method.',
    'Determine full-load slip, full-load torque, efficiency, and power factor, and plot speed-torque, speed-power, torque-slip, power factor-power, and efficiency-power curves.',
  ],
  components: [
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
      label: 'Ammeter (0–10 A)',
      position: [1.25, 0, -1.5],
      params: { range: 10 },
    },
    {
      id: 'vm',
      type: 'voltmeter',
      label: 'Voltmeter (0–300 V)',
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
    {
      id: 'motor',
      type: 'inductionMotor3ph',
      label: '3φ Induction Motor + Brake',
      position: [2.7, 0, 0.15],
      params: { pulleyRadiusM: 0.1 },
    },
  ],
  stages: [
    {
      id: 'im-load-test',
      title: 'Load Test (One-Wattmeter + CT)',
      summary:
        'Wire Fig. 4.1.1 with CT (10/5 A), ammeter in line A, voltmeter across B–C, selector plug feeding wm.V2 from B or C, and one-wattmeter CC on CT secondary. Raise va3 to 230 V, load first to rated current (~5.93 A), capture W1 (sel B) and W2 (sel C) for each load down to no load.',
      componentIds: ['sup3', 'va3', 'ct', 'am', 'vm', 'sel', 'wm', 'motor'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.0, 5.1, 5.7], target: [-0.1, 0.3, -0.3] },
        { id: 'supply', label: '3φ Supply & Variac', pos: [-2.7, 3.0, 2.5], target: [-2.8, 0.3, -1.4] },
        { id: 'instruments', label: 'CT, Selector & Meters', pos: [0.2, 2.8, 3.4], target: [0.0, 0.3, -0.2] },
        { id: 'motor', label: 'Motor & Spring Balances', pos: [2.9, 2.4, 3.0], target: [2.7, 0.4, 0.1] },
      ],
      acceptedNetlists: ACCEPTED_NETLISTS,
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
        ...wattmeterFaults('wm', CANONICAL_NETS),
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
          label: 'Wattmeter Reverse (REV) Switch',
          defaultValue: false,
        },
        {
          id: 'sel.pos',
          componentId: 'sel',
          kind: 'selector',
          label: 'V2 Selector Plug (W1 / W2)',
          options: ['B', 'C'],
          unit: '',
          defaultValue: 'B',
        },
        {
          id: 'motor.loadF',
          componentId: 'motor',
          kind: 'knob',
          label: 'Brake Belt Force F (T1 − T2)',
          min: 0,
          max: 16,
          step: 0.5,
          fineStep: 0.1,
          unit: 'kgf',
          defaultValue: 0,
        },
      ],
      physicsModel: 'inductionLoad',
      physicsParams: PHYSICS_PARAMS,
      twoReadingCapture: {
        selectorControlId: 'sel.pos',
        firstOption: 'B',
        secondOption: 'C',
        firstLabel: 'Capture W1 (V2 on B)',
        secondLabel: 'Capture W2 (V2 on C)',
        invalidationControlIds: ['va3.knob', 'motor.loadF'],
        meterId: 'wm',
        reverseControlId: 'wm.reverse',
      },
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'V', label: 'V', unit: 'V', source: { kind: 'meter', meterId: 'vm', field: 'shownValue' }, decimals: 1 },
        { id: 'I', label: 'I', unit: 'A', source: { kind: 'meter', meterId: 'am', field: 'shownValue' }, decimals: 2 },
        { id: 'w1Div', label: 'w1Div', source: { kind: 'control', controlId: 'pending.w1Div' }, decimals: 2, hidden: true },
        {
          id: 'w1Rev',
          label: 'W1 REV',
          source: { kind: 'control', controlId: 'pending.w1Rev' },
          hidden: false,
        },
        {
          id: 'W1',
          label: 'W1',
          unit: 'div',
          source: {
            kind: 'derived',
            compute: (r) => {
              const raw = Number(r.w1Div ?? 0);
              const rev = Boolean(r.w1Rev);
              return rev ? -Math.abs(raw) : raw;
            },
          },
          decimals: 1,
        },
        { id: 'w2Div', label: 'w2Div', source: { kind: 'control', controlId: 'pending.w2Div' }, decimals: 2, hidden: true },
        { id: 'w2Rev', label: 'w2Rev', source: { kind: 'control', controlId: 'pending.w2Rev' }, hidden: true },
        {
          id: 'W2',
          label: 'W2',
          unit: 'div',
          source: {
            kind: 'derived',
            compute: (r) => {
              const raw = Number(r.w2Div ?? 0);
              const rev = Boolean(r.w2Rev);
              return rev ? -Math.abs(raw) : raw;
            },
          },
          decimals: 1,
        },
        { id: 'mf', label: 'MF', source: { kind: 'control', controlId: 'pending.wmMf' }, decimals: 2, hidden: true },
        { id: 'T1', label: 'T1', unit: 'kgf', source: { kind: 'meter', meterId: 's1', field: 'shownValue' }, decimals: 1 },
        { id: 'T2', label: 'T2', unit: 'kgf', source: { kind: 'meter', meterId: 's2', field: 'shownValue' }, decimals: 1 },
        { id: 'n', label: 'n', unit: 'rpm', source: { kind: 'meter', meterId: 'tacho', field: 'shownValue' }, decimals: 0 },
        { id: 'f', label: 'f', unit: 'Hz', source: { kind: 'hidden', capture: ({ output }) => output.outputs.f ?? 50 }, decimals: 1, hidden: false },
        {
          id: 'Pin',
          label: 'Pin',
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
        {
          id: 'slip',
          label: 'Slip s',
          shortLabel: 's',
          source: {
            kind: 'derived',
            compute: (r, params) => {
              const ns = computeSynchronousSpeedRpm(Number(r.f ?? params.f ?? 50), params.poles ?? 4);
              const n = Number(r.n ?? 0);
              return ns > 0 ? Math.max(0, (ns - n) / ns) : 0;
            },
          },
          decimals: 4,
        },
        {
          id: 'torque',
          label: 'Torque',
          shortLabel: 'T',
          unit: 'N·m',
          source: {
            kind: 'derived',
            compute: (r, params) => {
              const radius = params.pulleyRadiusM ?? 0.1;
              return Math.max(0, (Number(r.T1 ?? 0) - Number(r.T2 ?? 0)) * radius * 9.81);
            },
          },
          decimals: 2,
        },
        {
          id: 'Pout',
          label: 'Pout',
          unit: 'W',
          source: {
            kind: 'derived',
            compute: (r) => {
              const n = Number(r.n ?? 0);
              const t = Number(r.torque ?? 0);
              return (2 * Math.PI * n * t) / 60;
            },
          },
          decimals: 1,
        },
        {
          id: 'pf',
          label: 'p.f.',
          source: {
            kind: 'derived',
            compute: (r) => {
              const w1 = Number(r.W1 ?? 0);
              const w2 = Number(r.W2 ?? 0);
              const sum = w1 + w2;
              if (Math.abs(sum) < 1e-6) return 0;
              return Math.cos(Math.atan((Math.sqrt(3) * (w1 - w2)) / sum));
            },
          },
          decimals: 3,
        },
        {
          id: 'eta',
          label: 'η',
          unit: '%',
          source: {
            kind: 'derived',
            compute: (r) => {
              const pin = Number(r.Pin ?? 0);
              const pout = Number(r.Pout ?? 0);
              return pin > 1 ? Math.max(0, (pout / pin) * 100) : 0;
            },
          },
          decimals: 1,
        },
        { id: 'loadF', label: 'loadF', source: { kind: 'control', controlId: 'motor.loadF' }, decimals: 2, hidden: true },
      ],
      rowRules: [
        {
          id: 'ex41-v-rated',
          label: 'Hold line voltage at 230 ± 3 V',
          message: 'Keep supply line voltage at 230 ± 3 V for every load reading.',
          amber: true,
          highlightColumnIds: ['V'],
          predicate: (r) => {
            const v = getRowNumber(r, 'V');
            return v >= 227 && v <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex41-min-rows',
          label: 'Record at least 6 load steps from rated current down to no load',
          predicate: (rows) => rows.length >= 6,
          failMessage: 'At least 6 observation rows are required.',
          failHint: 'Capture W1 (on B) and W2 (on C) across at least 6 loads from full load (~5.93 A) down to belt-released no load.',
        },
        {
          id: 'ex41-first-rated',
          label: 'First reading at rated line current (5.93 A ± 4%)',
          predicate: (rows) => {
            if (rows.length === 0) return false;
            const i0 = getRowNumber(rows[0], 'I');
            return Math.abs(i0 - 5.93) <= 5.93 * 0.04;
          },
          failMessage: 'First recorded row must be near rated current (5.93 A ± 4%).',
          failHint: 'Following manual Procedure (iii), tighten brake belt first until I ≈ 5.93 A (~9.9 kgf), capture W1 & W2, then unload gradually.',
        },
        {
          id: 'ex41-near-no-load',
          label: 'Include a near-no-load reading (< 15% of rated load torque, belt released)',
          predicate: (rows) =>
            rows.some((r) => getRowNumber(r, 'torque') <= RATED_PT.Tshaft * 0.15),
          failMessage: 'Missing a near-no-load reading (belt released, < 15% rated torque).',
          failHint: 'Loosen brake belt to F = 0 kgf, flip Wattmeter REV ON if W1 deflects below zero, capture W1 & W2, and add the no-load row.',
        },
      ],
      charts: [
        {
          id: 'speed-torque',
          title: 'Speed vs Torque',
          xColumn: 'torque',
          yLabel: 'Speed n (rpm)',
          xLabel: 'Torque T (N·m)',
          series: [{ yColumn: 'n', label: 'Speed n', color: '#38bdf8', showPoints: true }],
        },
        {
          id: 'speed-pout',
          title: 'Speed vs Output Power',
          xColumn: 'Pout',
          yLabel: 'Speed n (rpm)',
          xLabel: 'Pout (W)',
          series: [{ yColumn: 'n', label: 'Speed n', color: '#0ea5e9', showPoints: true }],
        },
        {
          id: 'torque-slip',
          title: 'Torque vs Slip',
          xColumn: 'slip',
          yLabel: 'Torque T (N·m)',
          xLabel: 'Slip s',
          series: [{ yColumn: 'torque', label: 'Torque T', color: '#f59e0b', showPoints: true }],
        },
        {
          id: 'pf-pout',
          title: 'Power Factor vs Output Power',
          xColumn: 'Pout',
          yLabel: 'Power Factor',
          xLabel: 'Pout (W)',
          series: [{ yColumn: 'pf', label: 'p.f.', color: '#a855f7', showPoints: true }],
        },
        {
          id: 'eff-pout',
          title: 'Efficiency vs Output Power',
          xColumn: 'Pout',
          yLabel: 'Efficiency (%)',
          xLabel: 'Pout (W)',
          series: [{ yColumn: 'eta', label: 'η (%)', color: '#10b981', showPoints: true }],
        },
      ],
      hints: [
        'Feed sup3 A/B/C -> va3 IN_A/B/C. Line A runs va3.OUT_A -> ct.P_M -> ct.P_L -> am.IN -> am.OUT -> motor.A; connect ct.S_M->wm.M and ct.S_L->wm.L.',
        'Place wm.V1 on line A and wm.V2 on sel.COM, with sel.B on line B and sel.C on line C (alongside vm across B–C).',
        'Load first to rated I ≈ 5.93 A (F ≈ 9.95 kgf), capturing W1 (sel B) and W2 (sel C) for each load down to F = 0 (flip REV ON for negative W1 at light load).',
      ],
      solutionNote:
        'Fig. 4.1.1: 3φ supply -> va3 -> Line A via CT(10/5 A) & Ammeter -> motor.A; Lines B/C -> motor.B/C, Voltmeter & selector B/C; wm.V1 on A, wm.V2 on sel.COM, CT sec on wm.M/L.',
      learnSteps: [
        {
          id: 's1-rmf-slip',
          stageId: 'im-load-test',
          title: 'Synchronous speed & slip',
          why:
            'A 3φ stator sets up a rotating magnetic field at ns = 120f/P = 1500 rpm (for 50 Hz, 4 poles). Rotor slip s = (ns − n)/ns induces rotor currents and torque, running just below ns (~1430 rpm at full load).',
          camera: 'motor',
          focus: ['motor'],
        },
        {
          id: 's1-wire-sup',
          stageId: 'im-load-test',
          title: 'Connect 3φ supply to autotransformer',
          why:
            'Wire sup3 phases A, B, C to va3 inputs IN_A, IN_B, IN_C so voltage can be brought up smoothly from 0 V to rated 230 V.',
          camera: 'supply',
          focus: ['sup3', 'va3'],
          connectTerminals: [
            ['sup3.A', 'va3.IN_A'],
            ['sup3.B', 'va3.IN_B'],
            ['sup3.C', 'va3.IN_C'],
          ],
        },
        {
          id: 's1-why-ct',
          stageId: 'im-load-test',
          title: 'Why the 10/5 A Current Transformer?',
          why:
            'Line current exceeds 5 A near full load (~5.93 A) and reaches high starting surges; a 10/5 A CT (ratio 2) steps Line A current down to safe 0–5 A instrument levels. Never open a CT secondary while primary carries current.',
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
          id: 's1-wire-bc',
          stageId: 'im-load-test',
          title: 'Connect Lines B, C, Voltmeter & Selector',
          why:
            'Connect va3 OUT_B/OUT_C directly to motor.B/motor.C and voltmeter vm across B–C, while tying sel.B and sel.C to lines B and C so selector COM switches wm.V2 between B and C.',
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
          id: 's1-noload-v',
          stageId: 'im-load-test',
          title: 'Raise line voltage to 230 V on no load',
          why:
            'Keeping the brake belt loose (F = 0 kgf), close sup3 and bring va3 to rated 230 V line-to-line.',
          camera: 'instruments',
          focus: ['va3', 'vm'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'vm',
            targetV: 230,
            toleranceV: 3,
            unit: 'V',
            targetLabel: 'Motor line voltage VL',
          },
        },
        {
          id: 's1-one-wm',
          stageId: 'im-load-test',
          title: 'Why two readings (W1 & W2) & negative W1',
          why:
            'With the one-wattmeter method, toggling sel.COM from B to C measures W1 = VL·IL·cos(30°+φ) and W2 = VL·IL·cos(30°−φ). Below 0.5 pf (φ > 60°, at light load), W1 is negative—flip wm REV ON to read it upscale and record it with a minus sign.',
          camera: 'instruments',
          focus: ['sel', 'wm'],
        },
        {
          id: 's1-torque',
          stageId: 'im-load-test',
          title: 'Why the first test row starts at rated current',
          why:
            'Belt tension creates net tangential force (T1 − T2) kgf on the 0.10 m pulley, giving torque T = (T1 − T2)×R×9.81 N·m and Pout = 2πnT/60. Loading first to rated 5.93 A captures full-load thermal conditions before cooling as you unload.',
          camera: 'motor',
          focus: ['motor'],
        },
        {
          id: 's1-trends',
          stageId: 'im-load-test',
          title: 'Efficiency & power-factor trends',
          why:
            'As brake load increases, active power current I2 rises strongly against nearly constant magnetising current I0, raising power factor from ~0.15 at no load toward ~0.77 at full load and lifting efficiency toward ~80.6%.',
          camera: 'overview',
          focus: ['wm', 'motor'],
        },
      ],
    },
  ],
  answers: [
    {
      id: 'fullLoadSlip',
      label: 'Full-load slip s_fl = (ns − n_fl) / ns (at rated I ≈ 5.93 A)',
      kind: 'number',
      placeholder: 'e.g. 0.0467',
      step: '0.001',
      truth: (_rows, _model, _params, rowsByStage) => {
        const r = findRatedCurrentRow(rowsByStage?.['im-load-test'] ?? []);
        return r ? Number(getRowNumber(r, 'slip').toFixed(4)) : Number(RATED_PT.s.toFixed(4));
      },
      tolerance: { abs: 0.005 },
      failHint: () => 'Compute s_fl = (1500 − n_fl) / 1500 from the rated-current (≈5.93 A) row (~0.047).',
    },
    {
      id: 'fullLoadTorque',
      label: 'Full-load shaft torque T = (T1 − T2) × R × 9.81',
      unit: 'N·m',
      kind: 'number',
      placeholder: 'e.g. 9.76',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) => {
        const r = findRatedCurrentRow(rowsByStage?.['im-load-test'] ?? []);
        return r ? Number(getRowNumber(r, 'torque').toFixed(2)) : Number(RATED_PT.Tshaft.toFixed(2));
      },
      tolerance: { abs: 0.8 },
      failHint: () => 'Calculate T = (T1 − T2) × 0.10 × 9.81 from the full-load (~5.93 A) spring balance readings (~9.76 N·m).',
    },
    {
      id: 'fullLoadEff',
      label: 'Full-load efficiency η = (Pout / Pin) × 100',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. 80.6',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) => {
        const r = findRatedCurrentRow(rowsByStage?.['im-load-test'] ?? []);
        return r ? Number(getRowNumber(r, 'eta').toFixed(2)) : Number(RATED_PT.etaPct.toFixed(2));
      },
      tolerance: { abs: 3.0 },
      failHint: () => 'Evaluate η = (Pout / Pin) × 100 where Pin = (W1 + W2)×MF×2 and Pout = 2πnT/60 (~80.6%).',
    },
    {
      id: 'fullLoadPf',
      label: 'Full-load input power factor (eq. 4.1.7)',
      kind: 'number',
      placeholder: 'e.g. 0.77',
      step: '0.01',
      truth: (_rows, _model, _params, rowsByStage) => {
        const r = findRatedCurrentRow(rowsByStage?.['im-load-test'] ?? []);
        return r ? Number(getRowNumber(r, 'pf').toFixed(3)) : Number(RATED_PT.pf.toFixed(3));
      },
      tolerance: { abs: 0.04 },
      failHint: () => 'Compute p.f. = cos(atan(√3 · (W1 − W2) / (W1 + W2))) at full load (~0.77).',
    },
    {
      id: 'pfRiseReason',
      label: 'Why does the induction motor power factor rise from no load to full load?',
      kind: 'choice',
      options: [
        {
          value: 'active-grows',
          label: 'The active rotor current component grows with load while the inductive magnetising current remains nearly constant.',
        },
        {
          value: 'flux-drops',
          label: 'The air-gap magnetic flux collapses linearly with mechanical torque.',
        },
        {
          value: 'slip-zero',
          label: 'The rotor reaches synchronous speed (s = 0) under heavy load.',
        },
        {
          value: 'reactance-negative',
          label: 'Leakage reactance becomes capacitive at higher shaft torque.',
        },
      ],
      truth: () => 'active-grows',
      failHint: () =>
        'Stator current has a nearly constant quadrature magnetising component I0 plus a load-proportional active component I2; as load increases, φ shrinks and cos(φ) rises.',
    },
  ],
  hints: [
    'Wire CT primary in series with Ammeter along Line A, and CT secondary S_M/S_L to Wattmeter M/L.',
    'Take full-load readings first near 5.93 A (F ≈ 9.95 kgf), capturing both W1 (sel B) and W2 (sel C) for each load step.',
    'At light load (< 0.5 pf), flip wm REV ON when pointer goes negative and record W1 as negative.',
  ],
  solutionNote:
    'One-wattmeter induction motor load test: CT 10/5 A (ratio 2) + Ammeter in Line A, Voltmeter across B–C, selector switching wm.V2 between B (W1) and C (W2); full load at ~5.93 A gives s ≈ 0.047, T ≈ 9.76 N·m, pf ≈ 0.77, η ≈ 80.6%.',
};
