import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../circuit/faultFactories';
import { crossProduct } from '../circuit/nets';
import { computeParallelMethodTruth } from '../physics/models/transformerParallel';
import { getRowNumber } from '../physics/report';
import type { ExperimentDef, Net, StageDef } from '../types';

const POL_STAGE_ID = 'polarity-check';
const LOAD_STAGE_ID = 'load-sharing';

const SHARED_PARAMS: Record<string, number> = {
  V1rated: 230,
  V2rated: 115,
  SA: 2000,
  SB: 3000,
  IArated: 17.39,
  IBrated: 26.09,
  aA: 2.0,
  aB: 2.0023,
  RA: 0.15,
  XA: 0.22,
  RB: 0.0882,
  XB: 0.1322,
  I0A: 0.35,
  I0B: 0.52,
  Rs: 0.15,
  lampR: 66.125,
  vpRange: 300,
  vpolRange: 300,
  vLRange: 150,
  amARange: 25,
  amBRange: 40,
  amLRange: 60,
  wmDivisions: 150,
  wmPf: 1.0,
  wmDefaultVRange: 150,
  wmADefaultIRange: 20,
  wmBDefaultIRange: 40,
  txBPolarityFlipped: 1,
};

// Stage 1: Primary parallel + LV polarity check
const PRI_N1: Net = ['sup.P', 'va.IN_P'];
const PRI_N2: Net = ['sup.N', 'va.IN_N', 'va.OUT_N', 'vp.B', 'txA.P2', 'txB.P2'];
const PRI_N3: Net = ['va.OUT_P', 'vp.A', 'txA.P1', 'txB.P1'];

// Canonical Stage 1 joins txA.S1-txB.S2 (and mirror joins txA.S2-txB.S1) with vpol leads either way
const POL_VARIANTS: Net[][] = [
  [
    ['txA.S1', 'txB.S2'],
    ['txA.S2', 'vpol.A'],
    ['txB.S1', 'vpol.B'],
  ],
  [
    ['txA.S1', 'txB.S2'],
    ['txA.S2', 'vpol.B'],
    ['txB.S1', 'vpol.A'],
  ],
  [
    ['txA.S2', 'txB.S1'],
    ['txA.S1', 'vpol.A'],
    ['txB.S2', 'vpol.B'],
  ],
  [
    ['txA.S2', 'txB.S1'],
    ['txA.S1', 'vpol.B'],
    ['txB.S2', 'vpol.A'],
  ],
];

export const [POL_NET_A, POL_NET_B, POL_NET_C, POL_NET_D] = crossProduct([
  [[PRI_N1, PRI_N2, PRI_N3]],
  POL_VARIANTS,
]);

// Stage 2: Parallel load sharing (Fig. 3.4.2) with V1-on-L vs V1-on-M variants and mirror orientation
const LOAD_SEC_CANONICAL_A_V1_ON_L: Net[] = [
  PRI_N1,
  PRI_N2,
  PRI_N3,
  ['txA.S1', 'amA.IN'],
  ['amA.OUT', 'wmA.M'],
  ['txB.S2', 'amB.IN'],
  ['amB.OUT', 'wmB.M'],
  ['wmA.L', 'wmB.L', 'wmA.V1', 'wmB.V1', 'amL.IN', 'vL.A'],
  ['amL.OUT', 'lamps.A', 'rheostat.A'],
  ['vL.B', 'wmA.V2', 'wmB.V2', 'lamps.B', 'rheostat.B', 'txA.S2', 'txB.S1'],
];

const LOAD_SEC_CANONICAL_V1_ON_M: Net[] = [
  PRI_N1,
  PRI_N2,
  PRI_N3,
  ['txA.S1', 'amA.IN'],
  ['amA.OUT', 'wmA.M', 'wmA.V1'],
  ['txB.S2', 'amB.IN'],
  ['amB.OUT', 'wmB.M', 'wmB.V1'],
  ['wmA.L', 'wmB.L', 'amL.IN', 'vL.A'],
  ['amL.OUT', 'lamps.A', 'rheostat.A'],
  ['vL.B', 'wmA.V2', 'wmB.V2', 'lamps.B', 'rheostat.B', 'txA.S2', 'txB.S1'],
];

const LOAD_SEC_MIRROR_V1_ON_L: Net[] = [
  PRI_N1,
  PRI_N2,
  PRI_N3,
  ['txA.S2', 'amA.IN'],
  ['amA.OUT', 'wmA.M'],
  ['txB.S1', 'amB.IN'],
  ['amB.OUT', 'wmB.M'],
  ['wmA.L', 'wmB.L', 'wmA.V1', 'wmB.V1', 'amL.IN', 'vL.A'],
  ['amL.OUT', 'lamps.A', 'rheostat.A'],
  ['vL.B', 'wmA.V2', 'wmB.V2', 'lamps.B', 'rheostat.B', 'txA.S1', 'txB.S2'],
];

const LOAD_SEC_MIRROR_V1_ON_M: Net[] = [
  PRI_N1,
  PRI_N2,
  PRI_N3,
  ['txA.S2', 'amA.IN'],
  ['amA.OUT', 'wmA.M', 'wmA.V1'],
  ['txB.S1', 'amB.IN'],
  ['amB.OUT', 'wmB.M', 'wmB.V1'],
  ['wmA.L', 'wmB.L', 'amL.IN', 'vL.A'],
  ['amL.OUT', 'lamps.A', 'rheostat.A'],
  ['vL.B', 'wmA.V2', 'wmB.V2', 'lamps.B', 'rheostat.B', 'txA.S1', 'txB.S2'],
];

export const LOAD_NET_A = LOAD_SEC_CANONICAL_A_V1_ON_L;
export const LOAD_NET_B = LOAD_SEC_CANONICAL_V1_ON_M;
export const LOAD_NET_C = LOAD_SEC_MIRROR_V1_ON_L;
export const LOAD_NET_D = LOAD_SEC_MIRROR_V1_ON_M;

const SHARED_CAMERA_PRESETS = [
  {
    id: 'overview',
    label: 'Overview',
    pos: [-0.2, 10.0, 9.2] as [number, number, number],
    target: [-0.2, -1.1, -0.1] as [number, number, number],
  },
  {
    id: 'supply',
    label: 'Primary Supply',
    pos: [-4.2, 4.2, 4.4] as [number, number, number],
    target: [-4.2, -0.75, -0.1] as [number, number, number],
  },
  {
    id: 'transformers',
    label: 'Transformers',
    pos: [-1.8, 5.2, 5.0] as [number, number, number],
    target: [-1.8, -0.85, -0.15] as [number, number, number],
  },
  {
    id: 'meters',
    label: 'Meters',
    pos: [0.45, 6.4, 5.8] as [number, number, number],
    target: [0.45, -0.95, -0.15] as [number, number, number],
  },
  {
    id: 'load',
    label: 'Load Bank & Rheostat',
    pos: [3.7, 5.8, 5.6] as [number, number, number],
    target: [3.7, -0.9, -0.15] as [number, number, number],
  },
];

const polarityStage: StageDef = {
  id: POL_STAGE_ID,
  title: 'Polarity Check',
  summary:
    'Connect both 230 V primaries in parallel, join one LV terminal of txA to txB, and verify series-opposition (< 5 V) on vpol before parallel loading.',
  componentIds: ['sup', 'va', 'vp', 'txA', 'txB', 'vpol'],
  cameraPresets: SHARED_CAMERA_PRESETS.slice(0, 3),
  acceptedNetlists: [POL_NET_A, POL_NET_B, POL_NET_C, POL_NET_D],
  netLabels: [
    'Supply Live to Variac (P1)',
    'Common Primary Neutral (P2)',
    'Primary Parallel Feed (P3)',
    'Secondary Common Join (txA.S1–txB.S2)',
    'Polarity Voltmeter Lead A (txA.S2)',
    'Polarity Voltmeter Lead B (txB.S1)',
  ],
  netCategories: [
    'The supply connection to the variac is incomplete.',
    'The primary neutral return path is incomplete.',
    'The parallel HV primary feed to txA.P1 and txB.P1 is incomplete.',
    'The secondary common link between txA and txB is incomplete.',
    'Polarity voltmeter lead A to txA.S2 is incomplete.',
    'Polarity voltmeter lead B to txB.S1 is incomplete.',
  ],
  netCategoryKeys: [
    'supply',
    'primary',
    'primary',
    'secondary',
    'secondary',
    'secondary',
  ],
  netPurposes: {
    supply: 'Supply: feeds 230 V AC mains into the 5 kVA autotransformer.',
    primary:
      'Primary Parallel Feed: excites both 2 kVA (txA) and 3 kVA (txB) HV windings at rated 230 V.',
    secondary:
      'Polarity Check: joins dotted LV terminals (txA.S1–txB.S2) and checks vpol across the open ends (< 5 V confirms opposition; ~230 V means aiding).',
  },
  faultPatterns: [
    {
      id: 'secondary-series-aiding',
      description:
        'Polarity check failed: vpol reads ~230 V (series-aiding)! Shut off supply and swap one transformer’s secondary leads so txA.S1 joins txB.S2 (or txA.S2 joins txB.S1) and vpol reads ~0 V.',
      match: {
        anyGroup: [
          {
            connected: [['txA.S1', 'txB.S1']],
            notConnected: [['txA.S2', 'txB.S2']],
          },
          {
            connected: [['txA.S2', 'txB.S2']],
            notConnected: [['txA.S1', 'txB.S1']],
          },
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'vpol',
    },
    {
      id: 'secondary-aiding-short',
      description:
        'Both LV terminal pairs are shorted together in series-aiding polarity (~230 V).',
      match: {
        anyGroup: [
          {
            connected: [
              ['txA.S1', 'txB.S1'],
              ['txA.S2', 'txB.S2'],
            ],
          },
          {
            connected: [
              ['txA.S1', 'txB.S2'],
              ['txA.S2', 'txB.S1'],
            ],
          },
        ],
      },
      effect: 'short',
      effectTarget: 'txB',
    },
    liveNeutralShort([PRI_N1, PRI_N3], PRI_N2),
    voltmeterInSeries(
      'vp',
      [
        ['va.OUT_P', 'txA.P1'],
        ['va.OUT_P', 'txB.P1'],
      ],
      ['sup.N', 'va.OUT_N', 'txA.P2', 'txB.P2'],
      {
        id: 'vp-in-series',
        description: 'Primary voltmeter vp must be connected across the supply, not in series.',
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
      label: '5 kVA Autotransformer Knob',
      min: 0,
      max: 270,
      step: 1,
      fineStep: 0.1,
      unit: 'V',
      defaultValue: 0,
    },
  ],
  physicsModel: 'transformerParallel',
  physicsParams: { ...SHARED_PARAMS, stageMode: 1 },
  observationTable: [
    { id: 'sno', label: 'S.No', source: { kind: 'sno' } },
    {
      id: 'vp',
      label: 'V1 (V)',
      shortLabel: 'V1',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vp', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'vpol',
      label: 'Vpol (V)',
      shortLabel: 'Vpol',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vpol', field: 'shownValue' },
      decimals: 2,
    },
  ],
  rowRules: [
    {
      id: 'polarity-under-5v',
      label: 'V1 at 230 ± 3 V and Vpol < 5 V',
      amber: true,
      highlightColumnIds: ['vp', 'vpol'],
      message: (row) => {
        const vpol = getRowNumber(row, 'vpol');
        if (vpol >= 5) {
          return `Polarity voltage Vpol (${vpol.toFixed(1)} V) must be under 5 V.`;
        }
        return `Primary voltage V1 (${getRowNumber(row, 'vp').toFixed(1)} V) is outside 230 ± 3 V.`;
      },
      predicate: (row) =>
        Math.abs(getRowNumber(row, 'vp') - 230) <= 3 &&
        getRowNumber(row, 'vpol') < 5,
      minPassCount: 1,
      failMessage: () =>
        'No polarity check row recorded at V1 = 230 ± 3 V with Vpol < 5 V.',
      failHint: () =>
        'Verify txA.S1 joins txB.S2 (or txA.S2–txB.S1) so Vpol < 5 V at V1 = 230 V, and add a row.',
    },
  ],
  prerequisites: [
    {
      id: 'pol-check-ok',
      label: 'Recorded polarity reading under 5 V (at V1 = 230 ± 3 V)',
      predicate: (rows) =>
        rows.some(
          (r) =>
            Math.abs(getRowNumber(r, 'vp') - 230) <= 3 &&
            getRowNumber(r, 'vpol') < 5,
        ),
      failMessage: 'Missing Stage 1 polarity check reading under 5 V.',
      failHint: 'Join txA.S1 to txB.S2, raise va to 230 V, confirm Vpol < 5 V, and record a row.',
    },
  ],
  learnSteps: [
    {
      id: 'par-1-conditions',
      stageId: POL_STAGE_ID,
      camera: 'transformers',
      focus: ['txA', 'txB'],
      title: 'Conditions for Parallel Operation',
      why: 'For parallel operation, transformers need the same voltage ratio and polarity, and matching per-unit impedances for proportional kVA sharing. Here txA (2 kVA, 4.0%) and txB (3 kVA, 3.6%) have slightly unequal ratios (2.0000 vs 2.0023) and impedances.',
    },
    {
      id: 'par-1-primary',
      stageId: POL_STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'va', 'vp', 'txA', 'txB'],
      title: 'Connect Primaries in Parallel',
      why: 'Wire sup to the 5 kVA autotransformer va, connect vp across va output, and feed txA.P1/txB.P1 from va.OUT_P with all returns to neutral.',
      connectTerminals: [
        ['sup.P', 'va.IN_P'],
        ['sup.N', 'va.IN_N'],
        ['va.OUT_P', 'vp.A'],
        ['vp.B', 'va.OUT_N'],
        ['va.OUT_P', 'txA.P1'],
        ['va.OUT_P', 'txB.P1'],
        ['txA.P2', 'va.OUT_N'],
        ['txB.P2', 'va.OUT_N'],
      ],
    },
    {
      id: 'par-1-aiding-trap',
      stageId: POL_STAGE_ID,
      camera: 'transformers',
      focus: ['txA', 'txB', 'vpol'],
      title: 'Test Initial Secondary Polarity (Trap)',
      why: 'Before closing the secondary loop, join txA.S1 to txB.S1 and connect 0–300 V polarity voltmeter vpol across txA.S2 and txB.S2.',
      connectTerminals: [
        ['txA.S1', 'txB.S1'],
        ['txA.S2', 'vpol.A'],
        ['txB.S2', 'vpol.B'],
      ],
    },
    {
      id: 'par-1-aiding-check',
      stageId: POL_STAGE_ID,
      camera: 'transformers',
      focus: ['va', 'vpol'],
      title: 'Observe the ~230 V Aiding Polarity Reading',
      why: 'Energise at 230 V: because txB has inverted LV polarity (S1 is non-dotted), vpol reads ~230 V! Never close the parallel loop with aiding polarity or massive circulating current will trip the MCB.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 3,
        meterId: 'vp',
        controlId: 'va.knob',
        targetLabel: 'Primary Voltmeter V1',
      },
    },
    {
      id: 'par-1-opp-rewire',
      stageId: POL_STAGE_ID,
      camera: 'transformers',
      focus: ['txA', 'txB', 'vpol'],
      title: 'Swap Secondary Leads for Series-Opposition',
      why: 'Shut off the supply and swap txB’s secondary leads: join txA.S2 to txB.S1 (the shared bottom bus) and place vpol across txA.S1 and txB.S2.',
      disconnectTerminals: [
        ['txA.S1', 'txB.S1'],
        ['txA.S2', 'vpol.A'],
        ['txB.S2', 'vpol.B'],
      ],
      connectTerminals: [
        ['txA.S2', 'txB.S1'],
        ['txA.S1', 'vpol.A'],
        ['txB.S2', 'vpol.B'],
      ],
    },
    {
      id: 'par-1-opp-verify',
      stageId: POL_STAGE_ID,
      camera: 'transformers',
      focus: ['va', 'vpol'],
      title: 'Verify ~0 V on Polarity Voltmeter',
      why: 'Raise va to 230 V again: vpol now reads ~0.13 V (< 5 V), confirming the dotted terminals txA.S1 and txB.S2 are in phase opposition for safe paralleling.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 3,
        meterId: 'vp',
        controlId: 'va.knob',
        targetLabel: 'Primary Voltmeter V1',
      },
    },
  ],
  hints: [
    'Connect sup to va, then va.OUT_P to vp.A, txA.P1, and txB.P1; tie sup.N, va.IN_N/OUT_N, vp.B, txA.P2, and txB.P2 together.',
    'Because txB has inverted LV polarity, join txA.S1 to txB.S2 (or txA.S2 to txB.S1), NOT txA.S1 to txB.S1.',
    'Place polarity voltmeter vpol across the remaining two free LV terminals (~0 V at 230 V).',
    'Connect the incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: Parallel HV primaries with series-opposition join txA.S1–txB.S2 and vpol across txA.S2–txB.S1.',
};

const loadSharingStage: StageDef = {
  id: LOAD_STAGE_ID,
  title: 'Parallel Load Sharing',
  summary:
    'Remove vpol, wire Fig. 3.4.2 branch meters (amA, wmA, amB, wmB) and parallel loads (lamps + rheostat), record no-load circulating current and loaded points while holding V1 = 230 V.',
  componentIds: [
    'sup',
    'va',
    'vp',
    'txA',
    'txB',
    'amA',
    'wmA',
    'amB',
    'wmB',
    'amL',
    'vL',
    'lamps',
    'rheostat',
  ],
  cameraPresets: SHARED_CAMERA_PRESETS,
  acceptedNetlists: [LOAD_NET_A, LOAD_NET_B, LOAD_NET_C, LOAD_NET_D],
  netLabels: [
    'Supply Live to Variac (P1)',
    'Common Primary Neutral (P2)',
    'Primary Parallel Feed (P3)',
    'Branch A LV to Ammeter A (NA1)',
    'Ammeter A to Wattmeter A Mains (NA2)',
    'Branch B LV to Ammeter B (NB1)',
    'Ammeter B to Wattmeter B Mains (NB2)',
    'Common Load Top Bus (Ntop)',
    'Load Ammeter Output to Parallel Loads (Nload)',
    'Common Secondary Return Bus (Nbot)',
  ],
  netCategories: [
    'The supply connection to the variac is incomplete.',
    'The primary neutral return path is incomplete.',
    'The parallel HV primary feed is incomplete.',
    'Branch A from txA.S1 to amA.IN is incomplete.',
    'Branch A from amA.OUT to wmA.M is incomplete.',
    'Branch B from txB.S2 to amB.IN is incomplete.',
    'Branch B from amB.OUT to wmB.M is incomplete.',
    'The common secondary top bus (wmA.L, wmB.L, V1, amL.IN, vL.A) is incomplete.',
    'The load feed from amL.OUT to lamps.A and rheostat.A is incomplete.',
    'The common secondary bottom return bus (txA.S2, txB.S1, V2, vL.B, lamps.B, rheostat.B) is incomplete.',
  ],
  netCategoryKeys: [
    'supply',
    'primary',
    'primary',
    'secondary',
    'wattmeter',
    'secondary',
    'wattmeter',
    'secondary',
    'load',
    'secondary',
  ],
  netPurposes: {
    supply: 'Supply: feeds 230 V AC mains into the 5 kVA variac.',
    primary: 'Primary Feed: holds both HV primaries at rated 230 V under load sag.',
    wattmeter:
      'Branch Wattmeters: wmA (20 A, MF = 20 W/div) and wmB (40 A, MF = 40 W/div) measure real power shared by each transformer.',
    secondary:
      'Parallel Secondary Buses: combine dotted terminals (txA.S1, txB.S2) via branch meters onto the top bus and return non-dotted terminals (txA.S2, txB.S1) on the bottom bus.',
    load: 'Parallel Loads: feeds total current IL through amL (0–60 A) to the parallel 12-lamp bank and 3–100 Ω rheostat.',
  },
  carryOver: 'consistent-wires',
  faultPatterns: [
    ...wattmeterFaults('wmA', LOAD_NET_A),
    ...wattmeterFaults('wmB', LOAD_NET_A),
    {
      id: 'secondary-series-aiding',
      description:
        'Secondary terminals are joined in series-aiding polarity (~230 V loop EMF), driving heavy circulating short-circuit current!',
      match: {
        anyGroup: [
          { connected: [['txA.S1', 'txB.S1']] },
          { connected: [['txA.S2', 'txB.S2']] },
        ],
      },
      effect: 'short',
      effectTarget: 'txB',
    },
    ammeterAcrossSource('amA', ['vL.A', 'vL.B'], {
      id: 'amA-across-load',
      description: 'Ammeter A is wired across the load bus instead of in series with branch A.',
    }),
    ammeterAcrossSource('amB', ['vL.A', 'vL.B'], {
      id: 'amB-across-load',
      description: 'Ammeter B is wired across the load bus instead of in series with branch B.',
    }),
    ammeterAcrossSource('amL', ['vL.A', 'vL.B'], {
      id: 'amL-across-load',
      description: 'Load ammeter amL is wired across the load terminals instead of in series.',
    }),
    {
      id: 'ammeters-across-each-other',
      description:
        'Ammeters A and B are wired across each other, shorting the secondary branches.',
      match: {
        anyGroup: [
          {
            connected: [
              ['amA.IN', 'amB.IN'],
              ['amA.OUT', 'amB.OUT'],
            ],
          },
          {
            connected: [
              ['amA.IN', 'amB.OUT'],
              ['amA.OUT', 'amB.IN'],
            ],
          },
        ],
      },
      effect: 'short',
      effectTarget: 'amA',
    },
    liveNeutralShort([PRI_N1, PRI_N3], PRI_N2),
    liveNeutralShort(
      [
        ['wmA.L', 'wmB.L', 'wmA.V1', 'wmB.V1', 'amL.IN', 'vL.A'],
        ['amL.OUT', 'lamps.A', 'rheostat.A'],
      ],
      ['wmA.V2', 'wmB.V2', 'vL.B', 'lamps.B', 'rheostat.B'],
      {
        id: 'secondary-bus-short',
        description: 'The secondary top load bus is shorted directly to the bottom return bus.',
        effectTarget: 'txA',
      },
    ),
    voltmeterInSeries(
      'vL',
      [
        ['wmA.L', 'amL.IN'],
        ['wmB.L', 'amL.IN'],
        ['amL.OUT', 'lamps.A'],
        ['amL.OUT', 'rheostat.A'],
      ],
      ['vL.B', 'wmA.V2', 'wmB.V2', 'lamps.B', 'rheostat.B'],
      {
        id: 'vL-in-series',
        description: 'Load voltmeter vL must be connected across the load bus, not in series.',
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
      label: '5 kVA Autotransformer Knob',
      min: 0,
      max: 270,
      step: 1,
      fineStep: 0.1,
      unit: 'V',
      defaultValue: 0,
    },
    {
      id: 'wmA.iRange',
      componentId: 'wmA',
      kind: 'selector',
      label: 'wmA Current Range (CC)',
      options: [10, 20, 40],
      unit: 'A',
      defaultValue: 20,
    },
    {
      id: 'wmB.iRange',
      componentId: 'wmB',
      kind: 'selector',
      label: 'wmB Current Range (CC)',
      options: [10, 20, 40],
      unit: 'A',
      defaultValue: 40,
    },
    {
      id: 'lamps.switch',
      componentId: 'lamps',
      kind: 'switch',
      label: 'Lamp Bank Switch',
      defaultValue: false,
    },
    {
      id: 'lamps.lamps',
      componentId: 'lamps',
      kind: 'steps',
      label: 'Lamp Bank (200 W each)',
      min: 0,
      max: 12,
      defaultValue: 0,
    },
    {
      id: 'rheostat.switch',
      componentId: 'rheostat',
      kind: 'switch',
      label: 'Rheostat Switch',
      defaultValue: false,
    },
    {
      id: 'rheostat.R',
      componentId: 'rheostat',
      kind: 'knob',
      label: 'Rheostat Resistance',
      min: 3,
      max: 100,
      step: 0.5,
      fineStep: 0.1,
      unit: 'Ω',
      defaultValue: 100,
    },
  ],
  physicsModel: 'transformerParallel',
  physicsParams: { ...SHARED_PARAMS, stageMode: 2 },
  observationTable: [
    { id: 'sno', label: 'S.No', source: { kind: 'sno' } },
    {
      id: 'ia',
      label: 'IA (A)',
      shortLabel: 'IA',
      unit: 'A',
      source: { kind: 'meter', meterId: 'amA', field: 'shownValue' },
      decimals: 2,
    },
    {
      id: 'wa',
      label: 'WA (W)',
      shortLabel: 'WA',
      unit: 'W',
      source: { kind: 'meter', meterId: 'wmA', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'ib',
      label: 'IB (A)',
      shortLabel: 'IB',
      unit: 'A',
      source: { kind: 'meter', meterId: 'amB', field: 'shownValue' },
      decimals: 2,
    },
    {
      id: 'wb',
      label: 'WB (W)',
      shortLabel: 'WB',
      unit: 'W',
      source: { kind: 'meter', meterId: 'wmB', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'vl',
      label: 'VL (V)',
      shortLabel: 'VL',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vL', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'il',
      label: 'IL (A)',
      shortLabel: 'IL',
      unit: 'A',
      source: { kind: 'meter', meterId: 'amL', field: 'shownValue' },
      decimals: 2,
    },
    {
      id: 'po',
      label: 'Po (W)',
      shortLabel: 'Po',
      unit: 'W',
      source: {
        kind: 'derived',
        compute: (row) => {
          const vl = typeof row.vl === 'number' ? row.vl : 0;
          const il = typeof row.il === 'number' ? row.il : 0;
          return vl * il;
        },
      },
      decimals: 1,
    },
    {
      id: 'v1',
      label: 'V1 (V)',
      unit: 'V',
      hidden: true,
      source: { kind: 'meter', meterId: 'vp', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'iaProp',
      label: 'IA kVA Share (40%)',
      hidden: true,
      source: {
        kind: 'derived',
        compute: (row) => (typeof row.il === 'number' ? row.il * 0.4 : 0),
      },
      decimals: 2,
    },
    {
      id: 'ibProp',
      label: 'IB kVA Share (60%)',
      hidden: true,
      source: {
        kind: 'derived',
        compute: (row) => (typeof row.il === 'number' ? row.il * 0.6 : 0),
      },
      decimals: 2,
    },
    {
      id: 'waProp',
      label: 'WA kVA Share (40%)',
      hidden: true,
      source: {
        kind: 'derived',
        compute: (row) => (typeof row.po === 'number' ? row.po * 0.4 : 0),
      },
      decimals: 1,
    },
    {
      id: 'wbProp',
      label: 'WB kVA Share (60%)',
      hidden: true,
      source: {
        kind: 'derived',
        compute: (row) => (typeof row.po === 'number' ? row.po * 0.6 : 0),
      },
      decimals: 1,
    },
  ],
  rowRules: [
    {
      id: 'v1-hold-230',
      label: 'Primary voltage V1 within 230 ± 3 V',
      amber: true,
      highlightColumnIds: ['vl'],
      message: (row) =>
        `Primary voltage V1 (${getRowNumber(row, 'v1').toFixed(1)} V) was outside 230 ± 3 V.`,
      predicate: (row) => Math.abs(getRowNumber(row, 'v1') - 230) <= 3,
      minPassCount: 5,
      failMessage: (pass, total) =>
        `Primary voltage V1 was held within 230 ± 3 V in only ${pass} of ${total} rows (at least 5 required).`,
      failHint: () =>
        'Re-adjust the 5 kVA autotransformer knob as load increases to keep V1 at 230 ± 3 V before recording.',
    },
  ],
  prerequisites: [
    {
      id: 'par-min-rows',
      label: 'At least 6 observation rows',
      predicate: (rows) => rows.length >= 6,
      failMessage: 'Fewer than 6 parallel load-sharing rows recorded.',
      failHint: 'Record at least 6 load steps from no-load up to > 30 A.',
    },
    {
      id: 'par-no-load',
      label: 'No-load row (IL < 0.1 A) capturing circulating current',
      predicate: (rows) => rows.some((r) => getRowNumber(r, 'il') < 0.1),
      failMessage: 'Missing no-load row (IL < 0.1 A) for circulating current.',
      failHint: 'Turn both load switches OFF at V1 = 230 V and add a row to capture ~0.31 A.',
    },
    {
      id: 'par-high-load',
      label: 'Loaded row with IL > 30 A',
      predicate: (rows) => rows.some((r) => getRowNumber(r, 'il') > 30),
      failMessage: 'Missing a heavy-load row with IL > 30 A.',
      failHint: 'Switch on the rheostat (near 3–4 Ω) and/or lamps until IL > 30 A and record a row.',
    },
  ],
  charts: [
    {
      id: 'parallel-current-sharing',
      title: 'Branch Currents IA & IB vs Load Current IL',
      subtitle: 'Dashed lines = 40% / 60% kVA-proportional share',
      xColumn: 'il',
      series: [
        { yColumn: 'ia', label: 'IA (2 kVA, 4.0% Z)', color: '#00f2fe' },
        { yColumn: 'ib', label: 'IB (3 kVA, 3.6% Z)', color: '#f59e0b' },
        {
          yColumn: 'iaProp',
          label: 'IA prop (40%)',
          color: '#00f2fe',
          dashed: true,
          opacity: 0.4,
          showPoints: false,
        },
        {
          yColumn: 'ibProp',
          label: 'IB prop (60%)',
          color: '#f59e0b',
          dashed: true,
          opacity: 0.4,
          showPoints: false,
        },
      ],
      xLabel: 'Load current IL (A)',
      yLabel: 'Transformer current (A)',
      yMin: 0,
      emptyText: 'Record no-load and loaded rows to plot IA & IB vs IL',
    },
    {
      id: 'parallel-power-sharing',
      title: 'Transformer Powers WA & WB vs Output Power Po',
      subtitle: 'Dashed lines = 40% / 60% kVA-proportional share',
      xColumn: 'po',
      series: [
        { yColumn: 'wa', label: 'WA (2 kVA)', color: '#00f2fe' },
        { yColumn: 'wb', label: 'WB (3 kVA)', color: '#f59e0b' },
        {
          yColumn: 'waProp',
          label: 'WA prop (40%)',
          color: '#00f2fe',
          dashed: true,
          opacity: 0.4,
          showPoints: false,
        },
        {
          yColumn: 'wbProp',
          label: 'WB prop (60%)',
          color: '#f59e0b',
          dashed: true,
          opacity: 0.4,
          showPoints: false,
        },
      ],
      xLabel: 'Output power Po (W)',
      yLabel: 'Power shared (W)',
      emptyText: 'Record no-load and loaded rows to plot WA & WB vs Po',
    },
  ],
  learnSteps: [
    {
      id: 'par-2-circulating',
      stageId: LOAD_STAGE_ID,
      camera: 'transformers',
      focus: ['txA', 'txB'],
      title: 'Why Turn Ratios Must Match (Fig. 3.4.1)',
      why: 'Even with correct opposition polarity, a small turn-ratio mismatch (2.0000 vs 2.0023) leaves EA − EB ≈ 0.13 V around the secondary loop, driving ~0.31 A circulating current at no-load.',
    },
    {
      id: 'par-2-branch-a',
      stageId: LOAD_STAGE_ID,
      camera: 'meters',
      focus: ['txA', 'amA', 'wmA'],
      title: 'Wire Transformer A Secondary Branch',
      why: 'Connect txA.S1 through amA (0–25 A) into wmA.M (20 A range, MF = 20 W/div), tie wmA.V1 to wmA.L, and connect wmA.V2 to the shared bottom bus (txA.S2–txB.S1).',
      connectTerminals: [
        ['txA.S1', 'amA.IN'],
        ['amA.OUT', 'wmA.M'],
        ['wmA.V1', 'wmA.L'],
        ['wmA.V2', 'txA.S2'],
      ],
    },
    {
      id: 'par-2-branch-b',
      stageId: LOAD_STAGE_ID,
      camera: 'meters',
      focus: ['txB', 'amB', 'wmB'],
      title: 'Wire Transformer B Secondary Branch',
      why: 'Connect txB.S2 (dotted!) through amB (0–40 A) into wmB.M (40 A range, MF = 40 W/div), tie wmB.V1 to wmB.L, and connect wmB.V2 to the bottom bus.',
      connectTerminals: [
        ['txB.S2', 'amB.IN'],
        ['amB.OUT', 'wmB.M'],
        ['wmB.V1', 'wmB.L'],
        ['wmB.V2', 'txB.S1'],
      ],
    },
    {
      id: 'par-2-top-bus',
      stageId: LOAD_STAGE_ID,
      camera: 'meters',
      focus: ['wmA', 'wmB', 'amL', 'vL'],
      title: 'Combine Branches at Top Bus & Load Meters',
      why: 'Join wmA.L and wmB.L to amL.IN (0–60 A) and load voltmeter vL.A, and connect vL.B to the bottom return bus.',
      connectTerminals: [
        ['wmA.L', 'amL.IN'],
        ['wmB.L', 'amL.IN'],
        ['vL.A', 'amL.IN'],
        ['vL.B', 'txA.S2'],
      ],
    },
    {
      id: 'par-2-loads',
      stageId: LOAD_STAGE_ID,
      camera: 'load',
      focus: ['amL', 'lamps', 'rheostat'],
      title: 'Connect Parallel Lamp Bank & Rheostat Load',
      why: 'Wire amL.OUT to both lamps.A and rheostat.A in parallel, and return lamps.B and rheostat.B to the bottom bus vL.B.',
      connectTerminals: [
        ['amL.OUT', 'lamps.A'],
        ['amL.OUT', 'rheostat.A'],
        ['lamps.B', 'vL.B'],
        ['rheostat.B', 'vL.B'],
      ],
    },
    {
      id: 'par-2-no-load',
      stageId: LOAD_STAGE_ID,
      camera: 'meters',
      focus: ['va', 'vp', 'amA', 'amB'],
      title: 'Measure No-Load Circulating Current (~0.31 A)',
      why: 'With both load switches OFF, switch on the supply and set vp to 230 V: amA and amB each read ~0.31 A while amL reads 0.00 A.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 3,
        meterId: 'vp',
        controlId: 'va.knob',
        targetLabel: 'Primary Voltmeter V1',
      },
    },
    {
      id: 'par-2-pu-share',
      stageId: LOAD_STAGE_ID,
      camera: 'load',
      focus: ['amA', 'amB', 'amL', 'rheostat'],
      title: 'Per-Unit Impedance & Why B Takes More Load',
      why: 'Because txB has lower per-unit impedance (3.6% vs 4.0%), it takes more than its 60% kVA share. At ~42 A total load, IB hits its 26.09 A rating while IA is only ~15.8 A — keep V1 at 230 V under sag!',
    },
    {
      id: 'par-2-report',
      stageId: LOAD_STAGE_ID,
      camera: 'overview',
      focus: [],
      title: 'Plot Sharing Curves & Complete Report',
      why: 'Switch on the rheostat/lamps in steps up to > 30 A while compensating primary sag to 230 V. Plot IA, IB vs IL and WA, WB vs Po against the faint 40%/60% kVA lines.',
    },
  ],
  hints: [
    'Keep primary wires and txA.S2–txB.S1 (or txA.S1–txB.S2) from Stage 1.',
    'Wire Branch A: txA.S1 → amA → wmA.M, and Branch B: txB.S2 → amB → wmB.M.',
    'Join wmA.L, wmB.L, wmA.V1, wmB.V1, amL.IN, and vL.A on the top bus; feed lamps.A and rheostat.A from amL.OUT.',
    'Tie txA.S2, txB.S1, wmA.V2, wmB.V2, vL.B, lamps.B, and rheostat.B onto the common bottom return bus.',
    'Connect the incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: Fig. 3.4.2 parallel operation with txA.S1/txB.S2 feeding branches A/B, parallel lamps + rheostat, and wmA/wmB V1 on L.',
};

export const ex3_4: ExperimentDef = {
  id: 'ex3.4',
  title: 'Parallel operation of single-phase transformers',
  object: [
    'Connect and operate two single-phase transformers (2 kVA and 3 kVA, 230/115 V) in parallel.',
    'Plot (a) currents IA and IB shared by the transformers against total load current IL.',
    'Plot (b) powers WA and WB shared by the transformers against total output power Po.',
  ],
  components: [
    {
      id: 'sup',
      type: 'acSupply',
      label: '230 V AC supply with MCB',
      position: [-5.1, 0, -0.1],
      params: { V: 230, f: 50 },
    },
    {
      id: 'va',
      type: 'variac1ph',
      label: '5 kVA Autotransformer',
      position: [-3.65, 0, -0.1],
      params: { Vin: 230, VoutMax: 270, kVA: 5, plateLabel: '5 kVA VARIAC' },
    },
    {
      id: 'vp',
      type: 'voltmeter',
      label: 'Primary Voltmeter (vp)',
      position: [-3.65, 0.32, -1.45],
      params: { range: 300 },
    },
    {
      id: 'txA',
      type: 'transformer1ph',
      label: 'Transformer A (2 kVA · 4.0% Z)',
      position: [-2.1, 0, -1.25],
      params: {
        kVA: 2,
        V1: 230,
        V2: 115,
        I1rated: 8.7,
        I2rated: 17.39,
        pPlate: 'HV 230 V',
        sPlate: 'LV 115 V',
        titlePlate: 'TX A · 2 kVA',
      },
    },
    {
      id: 'txB',
      type: 'transformer1ph',
      label: 'Transformer B (3 kVA · 3.6% Z)',
      position: [-2.1, 0, 0.95],
      params: {
        kVA: 3,
        V1: 230,
        V2: 115,
        I1rated: 13.04,
        I2rated: 26.09,
        pPlate: 'HV 230 V',
        sPlate: 'LV 115 V',
        titlePlate: 'TX B · 3 kVA',
        polarityFlipped: true,
      },
    },
    {
      id: 'vpol',
      type: 'voltmeter',
      label: 'Polarity Voltmeter (vpol)',
      position: [-0.45, 0, -0.1],
      params: { range: 300 },
    },
    {
      id: 'amA',
      type: 'ammeter',
      label: 'Ammeter A (0–25 A)',
      position: [-0.55, 0, -1.25],
      params: { range: 25 },
    },
    {
      id: 'wmA',
      type: 'wattmeter',
      label: 'Wattmeter A (150 V · UPF)',
      position: [0.95, 0, -1.25],
      params: {
        vRange: 150,
        iRange: 20,
        iRanges: [10, 20, 40],
        divisions: 150,
        pf: 1.0,
      },
    },
    {
      id: 'amB',
      type: 'ammeter',
      label: 'Ammeter B (0–40 A)',
      position: [-0.55, 0, 0.95],
      params: { range: 40 },
    },
    {
      id: 'wmB',
      type: 'wattmeter',
      label: 'Wattmeter B (150 V · UPF)',
      position: [0.95, 0, 0.95],
      params: {
        vRange: 150,
        iRange: 40,
        iRanges: [10, 20, 40],
        divisions: 150,
        pf: 1.0,
      },
    },
    {
      id: 'vL',
      type: 'voltmeter',
      label: 'Load Voltmeter (vL)',
      position: [2.45, 0.32, -1.25],
      params: { range: 150 },
    },
    {
      id: 'amL',
      type: 'ammeter',
      label: 'Load Ammeter (0–60 A)',
      position: [2.45, 0, 0.95],
      params: { range: 60 },
    },
    {
      id: 'lamps',
      type: 'lampLoad',
      label: 'Lamp Bank Load (12 × 200 W)',
      position: [4.35, 0, -1.25],
      params: { count: 12, lampW: 200, Vrated: 115 },
    },
    {
      id: 'rheostat',
      type: 'rheostat',
      label: 'Rheostat Load (3–100 Ω · 40 A)',
      position: [4.35, 0, 0.95],
      params: { minR: 3, maxR: 100, maxI: 40 },
    },
  ],
  stages: [polarityStage, loadSharingStage],
  answers: [
    {
      id: 'circulatingCurrentA',
      label: 'No-load circulating current (A)',
      unit: 'A',
      kind: 'number',
      placeholder: 'e.g. 0.31',
      step: '0.01',
      truth: () => computeParallelMethodTruth(SHARED_PARAMS).circulatingCurrentA,
      tolerance: { abs: 0.1 },
      failMessage: 'No-load circulating current is outside tolerance.',
      failHint: () =>
        'Switch both load switches OFF at V1 = 230 V and read amA / amB (a slight turn-ratio difference drives circulating current).',
    },
    {
      id: 'firstRatedIL',
      label: 'Load current IL when first transformer reaches rated current (A)',
      unit: 'A',
      kind: 'number',
      placeholder: 'e.g. 42.0',
      step: '0.1',
      truth: () => computeParallelMethodTruth(SHARED_PARAMS).firstRatedIL,
      tolerance: { abs: 3 },
      failMessage:
        'Load current IL at first rated transformer current is outside tolerance.',
      failHint: () =>
        'Check your IA, IB vs IL plot: because per-unit impedances differ (3.6% vs 4.0%), read IL where the more heavily loaded transformer hits its rated current.',
    },
    {
      id: 'firstTransformer',
      label: 'Which transformer reaches its rated kVA/current first?',
      kind: 'choice',
      options: [
        { value: 'A', label: 'Transformer A (2 kVA, 4.0% Z)' },
        { value: 'B', label: 'Transformer B (3 kVA, 3.6% Z)' },
      ],
      truth: () => computeParallelMethodTruth(SHARED_PARAMS).firstTransformer,
      failMessage: 'Incorrect choice for which transformer reaches rated current first.',
      failHint: () =>
        'Load share is inversely proportional to per-unit impedance (Z_pu): the transformer with lower per-unit impedance carries more than its kVA share.',
    },
    {
      id: 'proportionalShare',
      label: 'Do the transformers share the load in proportion to their kVA ratings?',
      kind: 'choice',
      options: [
        { value: 'yes', label: 'Yes — exact 40% / 60% kVA share' },
        { value: 'no', label: 'No — lower per-unit impedance takes more' },
      ],
      truth: () => computeParallelMethodTruth(SHARED_PARAMS).proportionalShare,
      failMessage: 'Incorrect answer on proportional kVA sharing.',
      failHint: () =>
        'Compare your IA, IB curves against the dashed 40%/60% kVA-proportional lines: unequal per-unit impedances prevent proportional sharing.',
    },
  ],
  hints: polarityStage.hints!,
  solutionNote: polarityStage.solutionNote!,
};
