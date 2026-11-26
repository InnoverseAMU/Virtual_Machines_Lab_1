import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../circuit/faultFactories';
import { crossProduct } from '../circuit/nets';
import { computeOcScMethodTruth } from '../physics/models/transformerOcSc';
import { getRowNumber } from '../physics/report';
import type { ExperimentDef, Net, StageDef, TerminalId } from '../types';

const OC_STAGE_ID = 'oc-test';
const SC_STAGE_ID = 'sc-test';

const SHARED_PARAMS: Record<string, number> = {
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
  wmDivisions: 150,
};

// Stage 1: Open-Circuit test (Fig. 3.2.7) on LV side (S1, S2), HV (P1, P2) open
const OC_N1: Net = ['sup.P', 'va.IN_P'];
const OC_N2: Net = ['sup.N', 'va.IN_N', 'va.OUT_N', 'vm.B', 'wm.V2', 'tx.S2'];
const OC_N5: Net = ['am.OUT', 'tx.S1'];

const OC_WM_VARIANTS: Net[][] = [
  // Canonical Fig 3.2.7: V1 on M side
  [
    ['va.OUT_P', 'vm.A', 'wm.M', 'wm.V1'],
    ['wm.L', 'am.IN'],
  ],
  // Variant: V1 on L side
  [
    ['va.OUT_P', 'vm.A', 'wm.M'],
    ['wm.L', 'wm.V1', 'am.IN'],
  ],
];

export const [OC_NET_A, OC_NET_B] = crossProduct([
  [[OC_N1, OC_N2]],
  OC_WM_VARIANTS,
  [[OC_N5]],
]);

// Stage 2: Short-Circuit test (Fig. 3.2.8) on HV side (P1, P2), LV (S1, S2) shorted
export const SC_NET_A: Net[] = [
  ['sup.P', 'va.IN_P'],
  ['sup.N', 'va.IN_N', 'va.OUT_N', 'wm.V2', 'tx.P2', 'vm.B'],
  ['va.OUT_P', 'am.IN'],
  ['am.OUT', 'wm.M'],
  ['wm.L', 'wm.V1', 'tx.P1', 'vm.A'],
  ['tx.S1', 'tx.S2'],
];

const OC_STAGE_TERMINALS: TerminalId[] = [
  'sup.P',
  'sup.N',
  'va.IN_P',
  'va.IN_N',
  'va.OUT_P',
  'va.OUT_N',
  'vm.A',
  'vm.B',
  'wm.M',
  'wm.L',
  'wm.V1',
  'wm.V2',
  'am.IN',
  'am.OUT',
  'tx.S1',
  'tx.S2',
];

const HV_ANY_WIRE_PAIRS: [TerminalId, TerminalId][] = [
  ...OC_STAGE_TERMINALS.map((t): [TerminalId, TerminalId] => ['tx.P1', t]),
  ...OC_STAGE_TERMINALS.map((t): [TerminalId, TerminalId] => ['tx.P2', t]),
  ['tx.P1', 'tx.P2'],
];

const ocStage: StageDef = {
  id: OC_STAGE_ID,
  title: 'Open-Circuit Test (LV)',
  summary:
    'Wire the open-circuit test on the 115 V LV winding with HV (P1, P2) left open, apply 115 V, and record Vo, Io, and Po.',
  componentIds: ['sup', 'va', 'vm', 'wm', 'am', 'tx'],
  componentPositions: {
    sup: [-4.1, 0, -0.15],
    va: [-2.35, 0, -0.15],
    vm: [-0.55, 0.36, -1.2],
    wm: [-0.55, 0, 0.75],
    am: [1.25, 0, 0.75],
    tx: [3.15, 0, -0.15],
  },
  componentParams: {
    wm: {
      vRange: 150,
      iRange: 1,
      vRanges: [75, 150],
      iRanges: [0.5, 1],
      divisions: 150,
      pf: 0.2,
    },
    vm: { range: 150 },
    am: { range: 1 },
  },
  cameraPresets: [
    {
      id: 'overview',
      label: 'Overview',
      pos: [-0.4, 8.8, 8.0],
      target: [-0.4, -1.1, 0.0],
    },
    {
      id: 'supply',
      label: 'Supply',
      pos: [-3.2, 3.8, 4.3],
      target: [-3.2, -0.75, -0.15],
    },
    {
      id: 'meters',
      label: 'Meters',
      pos: [0.3, 5.8, 5.8],
      target: [0.3, -1.0, -0.1],
    },
    {
      id: 'transformer',
      label: 'Transformer',
      pos: [2.8, 4.4, 4.8],
      target: [2.8, -0.75, -0.15],
    },
  ],
  acceptedNetlists: [OC_NET_A, OC_NET_B],
  netLabels: [
    'Supply Live (N1)',
    'Neutral Return (N2)',
    'Variac Output to Voltmeter & Wattmeter M (N3)',
    'Wattmeter L to Ammeter (N4)',
    'Ammeter to LV Winding (N5)',
  ],
  netCategories: [
    'The supply connection is incomplete.',
    'The neutral return path is incomplete.',
    'The wattmeter / voltmeter input path is incomplete.',
    'The wattmeter to ammeter path is incomplete.',
    'The LV winding feed from the ammeter is incomplete.',
  ],
  netCategoryKeys: ['supply', 'primary', 'wattmeter', 'wattmeter', 'secondary'],
  netPurposes: {
    supply: 'Supply: feeds 230 V AC mains into the autotransformer input.',
    primary:
      'Neutral: shares the common neutral across supply, autotransformer, voltmeter, wattmeter V2, and LV terminal S2.',
    wattmeter:
      'Wattmeter & Voltmeter: measures LV voltage before the current coil and feeds the LPF wattmeter current coil in series.',
    secondary:
      'LV Excitation: connects the 0–1 A ammeter in series with the 115 V LV winding while HV stays open.',
  },
  faultPatterns: [
    ...wattmeterFaults('wm', OC_NET_A),
    {
      id: 'hv-winding-not-open',
      description:
        'The HV winding (P1, P2) carries 230 V and must stay completely open in the open-circuit test.',
      match: {
        anyConnected: HV_ANY_WIRE_PAIRS,
      },
      effect: 'danger',
      effectTarget: 'tx',
    },
    {
      id: 'wrong-side-for-oc',
      description:
        'In this lab the open-circuit test is done on the LV side as the manual recommends.',
      match: {
        anyConnected: [
          ['tx.P1', 'am.OUT'],
          ['tx.P1', 'wm.L'],
          ['tx.P1', 'va.OUT_P'],
          ['tx.P1', 'sup.P'],
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'tx',
    },
    ammeterAcrossSource('am', ['va.OUT_P', 'sup.N'], {
      id: 'ammeter-across-source',
      description:
        'The ammeter is wired across the source instead of in series with the LV winding. An ammeter is almost a short circuit.',
    }),
    liveNeutralShort(
      [
        OC_N1,
        ['va.OUT_P', 'vm.A', 'wm.M', 'wm.V1'],
        ['wm.L', 'am.IN'],
        OC_N5,
      ],
      OC_N2,
    ),
    voltmeterInSeries(
      'vm',
      [
        ['va.OUT_P', 'wm.M'],
        ['wm.L', 'am.IN'],
        ['am.OUT', 'tx.S1'],
      ],
      ['sup.N', 'va.OUT_N', 'tx.S2'],
      {
        id: 'voltmeter-in-series',
        description:
          'A voltmeter must be connected across what it measures, not in series with the circuit.',
      },
    ),
  ],
  controls: [
    {
      id: 'sup.switch',
      componentId: 'sup',
      kind: 'switch',
      label: '230 V AC Supply MCB',
      defaultValue: false,
    },
    {
      id: 'va.knob',
      componentId: 'va',
      kind: 'knob',
      label: 'Autotransformer Knob',
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
      options: [75, 150],
      unit: 'V',
      defaultValue: 150,
    },
    {
      id: 'wm.iRange',
      componentId: 'wm',
      kind: 'selector',
      label: 'Wattmeter CC Range (PF 0.2)',
      options: [0.5, 1],
      unit: 'A',
      defaultValue: 1,
    },
  ],
  physicsModel: 'transformerOcSc',
  physicsParams: {
    ...SHARED_PARAMS,
    testMode: 1,
    vmRange: 150,
    amRange: 1,
    wmPf: 0.2,
    wmDefaultVRange: 150,
    wmDefaultIRange: 1,
  },
  observationTable: [
    {
      id: 'sno',
      label: 'S.No.',
      shortLabel: '#',
      source: { kind: 'sno' },
      decimals: 0,
    },
    {
      id: 'vo',
      label: 'OC Voltage Vo',
      shortLabel: 'Vo',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vm' },
      decimals: 1,
      displayDecimals: 1,
    },
    {
      id: 'io',
      label: 'No-Load Current Io',
      shortLabel: 'Io',
      unit: 'A',
      source: { kind: 'meter', meterId: 'am' },
      decimals: 3,
      displayDecimals: 3,
    },
    {
      id: 'dial',
      label: 'Wattmeter Dial',
      shortLabel: 'Dial',
      unit: 'div',
      source: { kind: 'meter', meterId: 'wm', field: 'dial' },
      decimals: 1,
      displayDecimals: 1,
    },
    {
      id: 'mf',
      label: 'MF',
      shortLabel: 'MF',
      unit: 'W/div',
      source: { kind: 'meter', meterId: 'wm', field: 'mf' },
      decimals: 2,
      displayDecimals: 2,
    },
    {
      id: 'po',
      label: 'No-Load Power Po',
      shortLabel: 'Po',
      unit: 'W',
      source: { kind: 'meter', meterId: 'wm', field: 'shownValue' },
      decimals: 2,
      displayDecimals: 2,
    },
  ],
  rowRules: [
    {
      id: 'vo-hold',
      label: 'Hold Vo within 115 ± 2 V',
      amber: true,
      highlightColumnIds: ['vo'],
      predicate: (row, params) =>
        Math.abs(getRowNumber(row, 'vo') - (params.V2rated ?? 115)) <= 2,
      message: (row) =>
        `Row ${row.sno} recorded with Vo = ${getRowNumber(row, 'vo').toFixed(1)} V (outside 115 ± 2 V).`,
      minPassCount: 1,
      failMessage: () =>
        'Open-circuit test requires at least one reading held at Vo = 115 ± 2 V.',
      failHint: (badRows) =>
        `Re-adjust the autotransformer to 115 V on the LV voltmeter before recording (check row ${badRows.map((r) => r.sno).join(', ')}).`,
    },
  ],
  prerequisites: [
    {
      id: 'oc-valid-row',
      label: 'At least one OC row at Vo = 115 ± 2 V',
      predicate: (rows, params) =>
        rows.some(
          (r) =>
            Math.abs(getRowNumber(r, 'vo') - (params.V2rated ?? 115)) <= 2,
        ),
      failMessage: 'Missing a valid open-circuit row at Vo = 115 ± 2 V.',
      failHint:
        'In Stage 1 (OC test), set the LV voltmeter to 115 V and add at least one observation row.',
    },
  ],
  learnSteps: [
    {
      id: 'oc-step-1',
      stageId: OC_STAGE_ID,
      camera: 'overview',
      focus: ['sup', 'va', 'vm', 'wm', 'am', 'tx'],
      title: 'Why Open-Circuit & Short-Circuit Tests',
      why: 'Direct loading of large transformers is costly and wastes energy. Open-circuit and short-circuit tests find the equivalent-circuit parameters at very low power so regulation and efficiency can be calculated for any load.',
    },
    {
      id: 'oc-step-2',
      stageId: OC_STAGE_ID,
      camera: 'transformer',
      focus: ['tx'],
      title: 'Why OC Test Uses the LV Side',
      why: 'The open-circuit test applies rated voltage to the 115 V LV winding while the 230 V HV winding stays open. Even though P1 and P2 are open-circuited, they develop 230 V by transformer action, so never touch or wire them during this test.',
    },
    {
      id: 'oc-step-3',
      stageId: OC_STAGE_ID,
      camera: 'meters',
      focus: ['wm', 'am'],
      title: 'Low-Power-Factor Wattmeter',
      why: 'No-load current is small and highly inductive, giving a very low power factor. A 0.2 power-factor wattmeter (150 V, 1 A, MF = 0.2 W/div) gives a clear deflection near 100 divisions instead of barely moving.',
    },
    {
      id: 'oc-step-4',
      stageId: OC_STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'va'],
      title: 'Wire Supply to Autotransformer',
      why: 'Connect the 230 V AC mains to the autotransformer input terminals IN_P and IN_N so you can raise the LV voltage smoothly from zero.',
      connectTerminals: [
        ['sup.P', 'va.IN_P'],
        ['sup.N', 'va.IN_N'],
      ],
    },
    {
      id: 'oc-step-5',
      stageId: OC_STAGE_ID,
      camera: 'meters',
      focus: ['vm', 'wm'],
      title: 'Connect Voltmeter & LPF Wattmeter',
      why: 'Place the 0–150 V voltmeter across the variac output before the wattmeter current coil, tie V1 to M, and return V2 and vm.B to neutral.',
      connectTerminals: [
        ['va.OUT_P', 'vm.A'],
        ['vm.A', 'wm.M'],
        ['wm.V1', 'wm.M'],
        ['vm.B', 'va.OUT_N'],
        ['wm.V2', 'va.OUT_N'],
      ],
    },
    {
      id: 'oc-step-6',
      stageId: OC_STAGE_ID,
      camera: 'transformer',
      focus: ['wm', 'am', 'tx'],
      title: 'Connect Ammeter & LV Winding',
      why: 'Wire the 0–1 A ammeter in series from wattmeter L to LV terminal S1, and return S2 to neutral. Leave HV terminals P1 and P2 completely unconnected.',
      connectTerminals: [
        ['wm.L', 'am.IN'],
        ['am.OUT', 'tx.S1'],
        ['tx.S2', 'va.OUT_N'],
      ],
    },
    {
      id: 'oc-step-7',
      stageId: OC_STAGE_ID,
      camera: 'meters',
      focus: ['va', 'vm', 'wm', 'am'],
      title: 'Apply 115 V & Observe OC Readings',
      why: 'Switch the supply on and adjust the autotransformer until the LV voltmeter reads 115 V. Note Io (~0.70 A) and Po (~20 W) to determine core-loss resistance rc and magnetising reactance xm.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 115,
        toleranceV: 2,
        meterId: 'vm',
        controlId: 'va.knob',
        unit: 'V',
        targetLabel: 'LV Voltmeter',
      },
    },
  ],
  hints: [
    'Use the 115 V LV terminals (S1, S2) and leave HV terminals P1, P2 completely unconnected.',
    'Place the voltmeter across the variac output, then pass live through wattmeter M–L and ammeter IN–OUT to S1.',
    'Connect sup.N, va.IN_N/OUT_N, vm.B, wm.V2, and tx.S2 to the common neutral line.',
    'Tie wm.V1 to wm.M (or wm.L) for the pressure coil, with M facing the variac.',
    'Connect the incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: Fig. 3.2.7 OC test on the 115 V LV side with HV (P1, P2) open. V1 tied to M or L is accepted.',
};

const scStage: StageDef = {
  id: SC_STAGE_ID,
  title: 'Short-Circuit Test (HV)',
  summary:
    'Short the LV winding (S1–S2), apply reduced voltage to the 230 V HV winding using 0.1 V steps, and record 25%, 50%, 75%, and 100% of rated current (8.70 A).',
  componentIds: ['sup', 'va', 'am', 'wm', 'vm', 'tx'],
  componentPositions: {
    sup: [-4.1, 0, -0.15],
    va: [-2.35, 0, -0.15],
    am: [-0.55, 0, 0.75],
    wm: [1.25, 0, 0.75],
    vm: [1.25, 0.36, -1.2],
    tx: [3.15, 0, -0.15],
  },
  componentParams: {
    wm: {
      vRange: 75,
      iRange: 10,
      vRanges: [75, 150],
      iRanges: [5, 10],
      divisions: 150,
      pf: 1.0,
    },
    vm: { range: 30 },
    am: { range: 15 },
  },
  cameraPresets: [
    {
      id: 'overview',
      label: 'Overview',
      pos: [-0.4, 8.8, 8.0],
      target: [-0.4, -1.1, 0.0],
    },
    {
      id: 'supply',
      label: 'Supply',
      pos: [-3.2, 3.8, 4.3],
      target: [-3.2, -0.75, -0.15],
    },
    {
      id: 'meters',
      label: 'Meters',
      pos: [0.3, 5.8, 5.8],
      target: [0.3, -1.0, -0.1],
    },
    {
      id: 'transformer',
      label: 'Transformer',
      pos: [2.8, 4.4, 4.8],
      target: [2.8, -0.75, -0.15],
    },
  ],
  acceptedNetlists: [SC_NET_A],
  netLabels: [
    'Supply Live (N1)',
    'Neutral Return (N2)',
    'Variac Output to Ammeter (N3)',
    'Ammeter to Wattmeter M (N4)',
    'Wattmeter L, PC V1, HV P1 & Voltmeter (N5)',
    'LV Short Circuit (N6)',
  ],
  netCategories: [
    'The supply connection is incomplete.',
    'The neutral return path is incomplete.',
    'The ammeter series connection is incomplete.',
    'The ammeter to wattmeter path is incomplete.',
    'The HV winding / voltmeter / pressure-coil connection is incomplete.',
    'The LV winding is not short-circuited.',
  ],
  netCategoryKeys: [
    'supply',
    'primary',
    'wattmeter',
    'wattmeter',
    'primary',
    'secondary',
  ],
  netPurposes: {
    supply: 'Supply: feeds 230 V AC mains into the autotransformer.',
    primary:
      'HV Test Side: feeds reduced voltage across HV winding P1–P2 with V1 and the voltmeter directly across the winding.',
    wattmeter:
      'Series Current Path: passes HV current through the 0–15 A ammeter first, then wattmeter M–L so V1 on L excludes meter drops.',
    secondary:
      'LV Short: joins S1 and S2 directly so rated current flows at less than 5% of rated HV voltage.',
  },
  faultPatterns: [
    ...wattmeterFaults('wm', SC_NET_A),
    {
      id: 'pc-on-m-side',
      description:
        'The wattmeter pressure coil is on the M side, so it also measures the ammeter and current-coil drops. Connect V1 to L as in the manual.',
      match: {
        anyConnected: [
          ['wm.V1', 'wm.M'],
          ['wm.V1', 'am.OUT'],
        ],
        notConnected: [
          ['wm.V1', 'wm.L'],
          ['wm.V1', 'tx.P1'],
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'wm',
    },
    {
      id: 'lv-not-shorted',
      description:
        'The LV winding (S1–S2) is not shorted, so current stays tiny like an open-circuit test.',
      match: {
        notConnected: [['tx.S1', 'tx.S2']],
        anyConnected: [
          ['sup.P', 'va.IN_P'],
          ['wm.L', 'tx.P1'],
          ['tx.P2', 'sup.N'],
          ['tx.P2', 'va.OUT_N'],
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'tx',
    },
    ammeterAcrossSource('am', ['va.OUT_P', 'sup.N'], {
      id: 'ammeter-across-source',
      description:
        'The ammeter is across the source instead of in series with the HV winding. An ammeter is almost a short circuit.',
    }),
    liveNeutralShort([SC_NET_A[0], SC_NET_A[2], SC_NET_A[3], SC_NET_A[4]], SC_NET_A[1]),
    voltmeterInSeries(
      'vm',
      [
        ['wm.L', 'tx.P1'],
        ['am.OUT', 'wm.M'],
      ],
      ['sup.N', 'va.OUT_N', 'tx.P2'],
      {
        id: 'voltmeter-in-series',
        description:
          'A voltmeter must be connected across the HV winding, not in series with it.',
      },
    ),
  ],
  controls: [
    {
      id: 'sup.switch',
      componentId: 'sup',
      kind: 'switch',
      label: '230 V AC Supply MCB',
      defaultValue: false,
    },
    {
      id: 'va.knob',
      componentId: 'va',
      kind: 'knob',
      label: 'Autotransformer Knob (Fine)',
      min: 0,
      max: 30,
      step: 0.1,
      fineStep: 0.1,
      unit: 'V',
      defaultValue: 0,
    },
    {
      id: 'wm.vRange',
      componentId: 'wm',
      kind: 'selector',
      label: 'Wattmeter PC Range',
      options: [75, 150],
      unit: 'V',
      defaultValue: 75,
    },
    {
      id: 'wm.iRange',
      componentId: 'wm',
      kind: 'selector',
      label: 'Wattmeter CC Range (PF 1.0)',
      options: [5, 10],
      unit: 'A',
      defaultValue: 10,
    },
  ],
  physicsModel: 'transformerOcSc',
  physicsParams: {
    ...SHARED_PARAMS,
    testMode: 2,
    vmRange: 30,
    amRange: 15,
    wmPf: 1.0,
    wmDefaultVRange: 75,
    wmDefaultIRange: 10,
  },
  observationTable: [
    {
      id: 'sno',
      label: 'S.No.',
      shortLabel: '#',
      source: { kind: 'sno' },
      decimals: 0,
    },
    {
      id: 'isc',
      label: 'SC Current Isc',
      shortLabel: 'Isc',
      unit: 'A',
      source: { kind: 'meter', meterId: 'am' },
      decimals: 2,
      displayDecimals: 2,
    },
    {
      id: 'vsc',
      label: 'SC Voltage Vsc',
      shortLabel: 'Vsc',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vm' },
      decimals: 2,
      displayDecimals: 2,
    },
    {
      id: 'dial',
      label: 'Wattmeter Dial',
      shortLabel: 'Dial',
      unit: 'div',
      source: { kind: 'meter', meterId: 'wm', field: 'dial' },
      decimals: 1,
      displayDecimals: 1,
    },
    {
      id: 'mf',
      label: 'MF',
      shortLabel: 'MF',
      unit: 'W/div',
      source: { kind: 'meter', meterId: 'wm', field: 'mf' },
      decimals: 2,
      displayDecimals: 1,
    },
    {
      id: 'psc',
      label: 'SC Power Psc',
      shortLabel: 'Psc',
      unit: 'W',
      source: { kind: 'meter', meterId: 'wm', field: 'shownValue' },
      decimals: 2,
      displayDecimals: 2,
    },
  ],
  rowRules: [
    {
      id: 'isc-safe',
      label: 'Keep Isc <= 110% of rated 8.70 A',
      amber: true,
      highlightColumnIds: ['isc'],
      predicate: (row, params) =>
        getRowNumber(row, 'isc') <= (params.I1rated ?? 8.7) * 1.1,
      message: (row) =>
        `Row ${row.sno} has Isc = ${getRowNumber(row, 'isc').toFixed(2)} A (above 110% rated 8.70 A).`,
      minPassCount: 4,
      failMessage: () =>
        'Short-circuit rows must stay at or below 110% of rated 8.70 A (9.57 A).',
      failHint: (badRows) =>
        `Remove or re-record rows above 9.57 A (${badRows.map((r) => `row ${r.sno}`).join(', ')}).`,
    },
  ],
  prerequisites: [
    {
      id: 'sc-25',
      label: '25% rated current (~2.18 A ± 8%)',
      predicate: (rows, params) => {
        const target = (params.I1rated ?? 8.7) * 0.25;
        return rows.some((r) => Math.abs(getRowNumber(r, 'isc') - target) <= target * 0.08);
      },
      failMessage: 'Missing SC reading near 25% of 8.70 A (2.00–2.35 A).',
      failHint: 'Adjust the variac near 2.3 V (~2.18 A) and add an SC row.',
    },
    {
      id: 'sc-50',
      label: '50% rated current (~4.35 A ± 8%)',
      predicate: (rows, params) => {
        const target = (params.I1rated ?? 8.7) * 0.5;
        return rows.some((r) => Math.abs(getRowNumber(r, 'isc') - target) <= target * 0.08);
      },
      failMessage: 'Missing SC reading near 50% of 8.70 A (4.00–4.70 A).',
      failHint: 'Adjust the variac near 4.6 V (~4.35 A) and add an SC row.',
    },
    {
      id: 'sc-75',
      label: '75% rated current (~6.53 A ± 8%)',
      predicate: (rows, params) => {
        const target = (params.I1rated ?? 8.7) * 0.75;
        return rows.some((r) => Math.abs(getRowNumber(r, 'isc') - target) <= target * 0.08);
      },
      failMessage: 'Missing SC reading near 75% of 8.70 A (6.00–7.05 A).',
      failHint: 'Adjust the variac near 7.0 V (~6.53 A) and add an SC row.',
    },
    {
      id: 'sc-100',
      label: '100% rated current (~8.70 A ± 8%)',
      predicate: (rows, params) => {
        const target = params.I1rated ?? 8.7;
        return rows.some((r) => Math.abs(getRowNumber(r, 'isc') - target) <= target * 0.08);
      },
      failMessage: 'Missing SC reading near 100% of 8.70 A (8.00–9.40 A).',
      failHint: 'Adjust the variac near 9.3 V (~8.70 A) and add an SC row.',
    },
    {
      id: 'sc-no-overload',
      label: 'No SC row above 110% of 8.70 A',
      predicate: (rows, params) =>
        rows.length > 0 &&
        rows.every((r) => getRowNumber(r, 'isc') <= (params.I1rated ?? 8.7) * 1.1),
      failMessage: 'One or more SC rows exceed 110% of 8.70 A.',
      failHint: 'Delete any SC row above 9.57 A.',
    },
  ],
  learnSteps: [
    {
      id: 'sc-step-1',
      stageId: SC_STAGE_ID,
      camera: 'overview',
      focus: ['sup', 'va', 'am', 'wm', 'vm', 'tx'],
      title: 'Why Short-Circuit Test Uses HV Side & Reduced Voltage',
      why: 'In the short-circuit test the LV winding is shorted and less than 10% of rated voltage circulates rated current in the HV winding. Testing on the HV side keeps the current lower (8.70 A instead of 17.39 A) and easier to meter.',
    },
    {
      id: 'sc-step-2',
      stageId: SC_STAGE_ID,
      camera: 'meters',
      focus: ['wm', 'vm', 'am'],
      title: 'Why Pressure Coil Connects to L Here',
      why: 'At ~9 V applied, the voltage drop across the ammeter and wattmeter current coil is comparable to the winding voltage. Connecting wattmeter V1 to L (and the voltmeter across P1–P2) ensures they measure only the transformer winding voltage.',
    },
    {
      id: 'sc-step-3',
      stageId: SC_STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'va'],
      title: 'Wire Supply to Autotransformer',
      why: 'Start with the autotransformer at 0 V and wire the 230 V supply to IN_P and IN_N.',
      connectTerminals: [
        ['sup.P', 'va.IN_P'],
        ['sup.N', 'va.IN_N'],
      ],
    },
    {
      id: 'sc-step-4',
      stageId: SC_STAGE_ID,
      camera: 'meters',
      focus: ['am', 'wm'],
      title: 'Connect Ammeter & Wattmeter CC',
      why: 'Wire the 0–15 A ammeter from variac OUT_P into wattmeter M, and connect wattmeter V2 to neutral.',
      connectTerminals: [
        ['va.OUT_P', 'am.IN'],
        ['am.OUT', 'wm.M'],
        ['wm.V2', 'va.OUT_N'],
      ],
    },
    {
      id: 'sc-step-5',
      stageId: SC_STAGE_ID,
      camera: 'transformer',
      focus: ['wm', 'vm', 'tx'],
      title: 'Connect HV Winding, PC V1 & Voltmeter',
      why: 'Connect wattmeter L, pressure coil V1, and voltmeter vm.A to HV terminal P1, and return P2 and vm.B to neutral.',
      connectTerminals: [
        ['wm.L', 'tx.P1'],
        ['wm.V1', 'wm.L'],
        ['vm.A', 'tx.P1'],
        ['tx.P2', 'va.OUT_N'],
        ['vm.B', 'va.OUT_N'],
      ],
    },
    {
      id: 'sc-step-6',
      stageId: SC_STAGE_ID,
      camera: 'transformer',
      focus: ['tx'],
      title: 'Short-Circuit the LV Winding',
      why: 'Place a solid shorting link across LV terminals S1 and S2. Never exceed ~10 V on the variac once shorted or heavy overcurrent will trip the MCB.',
      connectTerminals: [['tx.S1', 'tx.S2']],
    },
    {
      id: 'sc-step-7',
      stageId: SC_STAGE_ID,
      camera: 'meters',
      focus: ['va', 'am', 'vm', 'wm'],
      title: 'Raise Voltage Slowly Using 0.1 V Steps',
      why: 'Switch the supply on and slowly increase the variac using 0.1 V fine steps up to rated HV current 8.70 A (about 9.3 V, ~45.4 W). In Self mode, record readings at 25%, 50%, 75%, and 100% of 8.70 A.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 8.7,
        toleranceV: 0.35,
        meterId: 'am',
        controlId: 'va.knob',
        unit: 'A',
        targetLabel: 'HV Ammeter',
      },
    },
    {
      id: 'sc-step-8',
      stageId: SC_STAGE_ID,
      camera: 'overview',
      focus: [],
      title: 'Computing Parameters, Regulation & Efficiency',
      why: 'From OC readings compute Zo = Vo/Io, rc = Vo²/Po, and xm. From SC readings compute Z = Vsc/Isc, R = Psc/Isc², X = √(Z²−R²), full-load copper loss Pc, regulation Rpu cos φ ± Xpu sin φ, and efficiency vs per-unit load x.',
    },
  ],
  hints: [
    'Place the ammeter first (va.OUT_P → am.IN, am.OUT → wm.M), then feed tx.P1 from wm.L.',
    'Connect wm.V1 and vm.A to the L / P1 side so the pressure coil excludes meter drops.',
    'Remember to short-circuit LV terminals tx.S1 and tx.S2.',
    'Connect sup.N, va.IN_N/OUT_N, wm.V2, tx.P2, and vm.B to the common neutral line.',
    'Connect the incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: Fig. 3.2.8 SC test on the HV side with wm.V1 on L and LV terminals (S1, S2) shorted.',
};

export const ex3_2: ExperimentDef = {
  id: 'ex3.2',
  title: 'Open-circuit and short-circuit tests of single-phase transformer',
  object: [
    'Perform open-circuit and short-circuit tests on a single-phase transformer.',
    'Determine (a) equivalent circuit parameters referred to either side.',
    'Determine (b) voltage regulation at 0.8 lagging and 0.8 leading power factors.',
    'Determine (c) efficiency at unity power factor and plot efficiency versus load.',
  ],
  components: [
    {
      id: 'sup',
      type: 'acSupply',
      label: '230 V AC supply with MCB',
      position: [-4.1, 0, -0.15],
      params: { V: 230, f: 50 },
    },
    {
      id: 'va',
      type: 'variac1ph',
      label: 'Autotransformer',
      position: [-2.35, 0, -0.15],
      params: { Vin: 230, VoutMax: 270, kVA: 3 },
    },
    {
      id: 'wm',
      type: 'wattmeter',
      label: 'Wattmeter',
      position: [-0.55, 0, 0.75],
      params: { vRange: 150, iRange: 1, divisions: 150, pf: 0.2 },
    },
    {
      id: 'vm',
      type: 'voltmeter',
      label: 'Voltmeter',
      position: [-0.55, 0.36, -1.2],
      params: { range: 150 },
    },
    {
      id: 'am',
      type: 'ammeter',
      label: 'Ammeter',
      position: [1.25, 0, 0.75],
      params: { range: 1 },
    },
    {
      id: 'tx',
      type: 'transformer1ph',
      label: 'Transformer 2 kVA 230/115 V',
      position: [3.15, 0, -0.15],
      params: {
        kVA: 2,
        V1: 230,
        V2: 115,
        I1rated: 8.7,
        I2rated: 17.39,
        pPlate: 'HV 230 V',
        sPlate: 'LV 115 V',
      },
    },
  ],
  stages: [ocStage, scStage],
  charts: [
    {
      id: 'oc-sc-efficiency-curve',
      title: 'Efficiency vs Load (Unity PF)',
      subtitle: 'S = 2000 VA',
      xColumn: 'x',
      series: [{ yColumn: 'eta', label: 'Efficiency (%)' }],
      xLabel: 'Per-unit load x (I / I_fl)',
      yLabel: 'Efficiency (%)',
      xMin: 0,
      xMax: 1,
      yMin: 80,
      yMax: 100,
      emptyText: 'Enter Pi and Pc above to plot efficiency curve',
      inputs: [
        {
          id: 'piInput',
          label: 'Iron loss Pi (from OC)',
          unit: 'W',
          placeholder: 'e.g. 20.0',
          step: '0.1',
        },
        {
          id: 'pcInput',
          label: 'Full-load Cu loss Pc',
          unit: 'W',
          placeholder: 'e.g. 45.4',
          step: '0.1',
        },
      ],
      computeSeries: (inputs, params) => {
        const pi = inputs.piInput;
        const pc = inputs.pcInput;
        if (!Number.isFinite(pi) || !Number.isFinite(pc) || pi <= 0 || pc <= 0) {
          return [[]];
        }
        const S = params.Srated ?? 2000;
        const pts: { x: number; y: number }[] = [];
        for (let k = 1; k <= 10; k++) {
          const x = Number((k * 0.1).toFixed(1));
          const pOut = S * x;
          const eta = (pOut / (pOut + pi + x * x * pc)) * 100;
          pts.push({ x, y: eta });
        }
        return [pts];
      },
    },
  ],
  answers: [
    {
      id: 'rc_lv',
      label: 'Core-loss resistance rc (referred to LV, Ω)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 660',
      step: '0.1',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).rc_lv,
      tolerance: { rel: 0.06 },
      failMessage: 'Core-loss resistance rc (LV) is outside tolerance.',
      failHint: () => 'Use Eq. (3.2.23): rc = Vo² / Po from your 115 V open-circuit reading.',
    },
    {
      id: 'xm_lv',
      label: 'Magnetising reactance xm (referred to LV, Ω)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 170',
      step: '0.1',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).xm_lv,
      tolerance: { rel: 0.06 },
      failMessage: 'Magnetising reactance xm (LV) is outside tolerance.',
      failHint: () =>
        'Use Eqs. (3.2.22) & (3.2.24): Zo = Vo / Io, xm = 1 / √(1/Zo² − 1/rc²).',
    },
    {
      id: 'R_hv',
      label: 'Equivalent resistance R (referred to HV, Ω)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 0.60',
      step: '0.001',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).R_hv,
      tolerance: { rel: 0.05 },
      failMessage: 'Equivalent resistance R (HV) is outside tolerance.',
      failHint: () => 'Average R = Psc / Isc² across your four short-circuit readings.',
    },
    {
      id: 'X_hv',
      label: 'Equivalent leakage reactance X (referred to HV, Ω)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 0.88',
      step: '0.001',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).X_hv,
      tolerance: { rel: 0.06 },
      failMessage: 'Equivalent reactance X (HV) is outside tolerance.',
      failHint: () => 'Use Z = Vsc / Isc and X = √(Z² − R²) across your SC readings.',
    },
    {
      id: 'Pc',
      label: 'Full-load copper loss Pc (W)',
      unit: 'W',
      kind: 'number',
      placeholder: 'e.g. 45.4',
      step: '0.1',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).Pc,
      tolerance: { rel: 0.05 },
      failMessage: 'Full-load copper loss Pc is outside tolerance.',
      failHint: () => 'Use Eq. (3.2.28): Pc = (8.70 / Isc)² × Psc (mean across SC steps).',
    },
    {
      id: 'VR_lag',
      label: 'Voltage regulation at 0.8 lagging PF (%)',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. 3.81',
      step: '0.01',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).VR_lag08,
      tolerance: { abs: 0.3 },
      failMessage: 'Voltage regulation (0.8 lagging) is outside tolerance.',
      failHint: () =>
        'Use Rpu = 8.70·R / 230, Xpu = 8.70·X / 230, and VR = (Rpu·0.8 + Xpu·0.6) × 100%.',
    },
    {
      id: 'VR_lead',
      label: 'Voltage regulation at 0.8 leading PF (%)',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. -0.18',
      step: '0.01',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).VR_lead08,
      tolerance: { abs: 0.3 },
      failMessage: 'Voltage regulation (0.8 leading) is outside tolerance.',
      failHint: () => 'Use VR = (Rpu·0.8 − Xpu·0.6) × 100% for leading power factor.',
    },
    {
      id: 'xMaxEff',
      label: 'Load fraction at max efficiency x (0 to 1)',
      unit: 'pu',
      kind: 'number',
      placeholder: 'e.g. 0.66',
      step: '0.01',
      truth: () => computeOcScMethodTruth(SHARED_PARAMS).xMaxEff,
      tolerance: { abs: 0.08 },
      failMessage: 'Load fraction for maximum efficiency is outside tolerance.',
      failHint: () => 'Maximum efficiency occurs where copper loss equals iron loss: x = √(Po / Pc).',
    },
  ],
  hints: ocStage.hints!,
  solutionNote: ocStage.solutionNote!,
};
