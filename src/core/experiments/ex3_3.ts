import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../circuit/faultFactories';
import { crossProduct } from '../circuit/nets';
import { computeSumpnerMethodTruth } from '../physics/models/sumpner';
import { getRowNumber } from '../physics/report';
import type { ExperimentDef, Net, StageDef } from '../types';

const PRI_STAGE_ID = 'primary-polarity';
const SEC_STAGE_ID = 'secondary-circuit';

const SHARED_PARAMS: Record<string, number> = {
  a: 2,
  Srated: 2000,
  V1rated: 230,
  V2rated: 115,
  I1rated: 8.7,
  I2rated: 17.39,
  R2eq: 0.15,
  X2eq: 0.22,
  rc_hv: 2645,
  xm_hv: 678.4,
  Pi_rated: 20,
  Io_single: 0.35,
  Rs_primary: 0.3,
  Rs_secondary: 0.02,
  vpRange: 300,
  apRange: 1,
  vpolRange: 300,
  vsRange: 15,
  asRange: 25,
  wpDivisions: 150,
  wpPf: 0.2,
  wpVRange: 300,
  wpIRange: 1,
  wsDivisions: 150,
  wsPf: 1.0,
  wsDefaultVRange: 15,
  wsDefaultIRange: 20,
  tx2PolarityFlipped: 1,
};

// Stage 1: Primary parallel connection + LV series-opposition polarity check
const PRI_N1: Net = ['sup.P', 'vaP.IN_P'];
const PRI_N2: Net = [
  'sup.N',
  'vaP.IN_N',
  'vaP.OUT_N',
  'vp.B',
  'wp.V2',
  'tx1.P2',
  'tx2.P2',
];
const PRI_WP_VARIANTS: Net[][] = [
  // Canonical (Fig. 3.3.1): wp.V1 tied to M side
  [
    ['vaP.OUT_P', 'vp.A', 'wp.M', 'wp.V1'],
    ['wp.L', 'ap.IN'],
  ],
  // Variant: wp.V1 tied to L side
  [
    ['vaP.OUT_P', 'vp.A', 'wp.M'],
    ['wp.L', 'wp.V1', 'ap.IN'],
  ],
];
const PRI_N5: Net = ['ap.OUT', 'tx1.P1', 'tx2.P1'];
const PRI_POL_JOIN: Net = ['tx1.S1', 'tx2.S2'];
const PRI_VPOL_VARIANTS: Net[][] = [
  [
    ['tx1.S2', 'vpol.A'],
    ['tx2.S1', 'vpol.B'],
  ],
  [
    ['tx1.S2', 'vpol.B'],
    ['tx2.S1', 'vpol.A'],
  ],
];

export const [PRI_NET_A, PRI_NET_B, PRI_NET_C, PRI_NET_D] = crossProduct([
  [[PRI_N1, PRI_N2]],
  PRI_WP_VARIANTS,
  [[PRI_N5, PRI_POL_JOIN]],
  PRI_VPOL_VARIANTS,
]);

// Stage 2: Secondary circulating loop via auxiliary variac vaS, as, ws, vs
const SEC_S0_LIVE: Net = ['sup.P', 'vaP.IN_P', 'vaS.IN_P'];
const SEC_N5: Net = ['ap.OUT', 'tx1.P1', 'tx2.P1'];
const SEC_S1: Net = ['vaS.OUT_P', 'as.IN'];
const SEC_S2: Net = ['as.OUT', 'ws.M'];

const SEC_LOOP_VARIANTS: Net[][] = [
  // Canonical: loop top on tx1.S2, neutral return on tx2.S1
  [
    ['ws.L', 'ws.V1', 'vs.A', 'tx1.S2'],
    ['tx1.S1', 'tx2.S2'],
    [
      'sup.N',
      'vaP.IN_N',
      'vaP.OUT_N',
      'vp.B',
      'wp.V2',
      'tx1.P2',
      'tx2.P2',
      'vaS.IN_N',
      'vaS.OUT_N',
      'tx2.S1',
      'ws.V2',
      'vs.B',
    ],
  ],
  // Mirror: loop top on tx2.S1, neutral return on tx1.S2
  [
    ['ws.L', 'ws.V1', 'vs.A', 'tx2.S1'],
    ['tx1.S1', 'tx2.S2'],
    [
      'sup.N',
      'vaP.IN_N',
      'vaP.OUT_N',
      'vp.B',
      'wp.V2',
      'tx1.P2',
      'tx2.P2',
      'vaS.IN_N',
      'vaS.OUT_N',
      'tx1.S2',
      'ws.V2',
      'vs.B',
    ],
  ],
];

export const [SEC_NET_A, SEC_NET_B, SEC_NET_C, SEC_NET_D] = crossProduct([
  [[SEC_S0_LIVE]],
  PRI_WP_VARIANTS,
  [[SEC_N5, SEC_S1, SEC_S2]],
  SEC_LOOP_VARIANTS,
]);

const SHARED_CAMERA_PRESETS = [
  {
    id: 'overview',
    label: 'Overview',
    pos: [0.1, 9.6, 8.8] as [number, number, number],
    target: [0.1, -1.1, -0.1] as [number, number, number],
  },
  {
    id: 'supply',
    label: 'Primary Supply',
    pos: [-3.9, 4.1, 4.4] as [number, number, number],
    target: [-3.9, -0.75, -0.2] as [number, number, number],
  },
  {
    id: 'primary-meters',
    label: 'Primary Meters',
    pos: [-1.1, 5.4, 5.2] as [number, number, number],
    target: [-1.1, -0.85, 0.2] as [number, number, number],
  },
  {
    id: 'transformers',
    label: 'Transformers',
    pos: [0.45, 4.8, 4.4] as [number, number, number],
    target: [0.45, -0.85, -0.2] as [number, number, number],
  },
  {
    id: 'secondary-meters',
    label: 'Secondary Meters',
    pos: [2.2, 5.6, 5.4] as [number, number, number],
    target: [2.2, -0.85, 0.1] as [number, number, number],
  },
  {
    id: 'secondary-supply',
    label: 'Aux Variac',
    pos: [4.2, 4.2, 4.5] as [number, number, number],
    target: [4.2, -0.75, -0.2] as [number, number, number],
  },
];

const primaryPolarityStage: StageDef = {
  id: PRI_STAGE_ID,
  title: 'Primary & Polarity Check',
  summary:
    'Wire both 230 V primaries in parallel, check LV series-opposition polarity (vpol < 5 V), and record no-load iron loss (Vp, Ip, Wp).',
  componentIds: ['sup', 'vaP', 'vp', 'wp', 'ap', 'tx1', 'tx2', 'vpol'],
  cameraPresets: SHARED_CAMERA_PRESETS.slice(0, 4),
  acceptedNetlists: [PRI_NET_A, PRI_NET_B, PRI_NET_C, PRI_NET_D],
  netLabels: [
    'Supply Live to Primary Variac (N1)',
    'Common Neutral Return (N2)',
    'Variac Output to Vp & Wattmeter M (N3)',
    'Wattmeter L to Primary Ammeter (N4)',
    'Parallel HV Primaries Feed (N5)',
    'LV Series-Opposition Join (tx1.S1–tx2.S2)',
    'Polarity Voltmeter Lead A (tx1.S2)',
    'Polarity Voltmeter Lead B (tx2.S1)',
  ],
  netCategories: [
    'The primary supply connection is incomplete.',
    'The common neutral return path is incomplete.',
    'The primary wattmeter / voltmeter input path is incomplete.',
    'The wattmeter to primary ammeter path is incomplete.',
    'The parallel HV primary feed to tx1.P1 and tx2.P1 is incomplete.',
    'The secondary series-opposition join (tx1.S1 to tx2.S2) is incomplete.',
    'The polarity voltmeter connection to tx1.S2 is incomplete.',
    'The polarity voltmeter connection to tx2.S1 is incomplete.',
  ],
  netCategoryKeys: [
    'supply',
    'primary',
    'wattmeter',
    'wattmeter',
    'primary',
    'secondary',
    'secondary',
    'secondary',
  ],
  netPurposes: {
    supply: 'Supply: feeds 230 V AC mains into primary autotransformer vaP.',
    primary:
      'Primary Parallel Feed: supplies rated 230 V in parallel to both tx1 and tx2 HV windings.',
    wattmeter:
      'Primary Meters: measures total no-load current (0–1 A) and core losses via the LPF wattmeter (0.2 PF, MF = 0.4 W/div).',
    secondary:
      'Polarity Check: joins tx1.S1 to tx2.S2 and checks vpol across tx1.S2 and tx2.S1 (~0 V confirms series-opposition; ~230 V means series-aiding).',
  },
  faultPatterns: [
    ...wattmeterFaults('wp', PRI_NET_A),
    {
      id: 'secondary-series-aiding',
      description:
        'Polarity check failed: secondary windings are wired in series-aiding and vpol reads ~230 V. Swap one transformer’s secondary terminals (join tx1.S1 to tx2.S2) so vpol reads ~0 V.',
      match: {
        anyGroup: [
          {
            connected: [['tx1.S1', 'tx2.S1']],
            notConnected: [['tx1.S2', 'tx2.S2']],
          },
          {
            connected: [['tx1.S2', 'tx2.S2']],
            notConnected: [['tx1.S1', 'tx2.S1']],
          },
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'vpol',
    },
    {
      id: 'secondary-aiding-short',
      description:
        'Both pairs of LV secondary terminals are shorted together in series-aiding polarity (~230 V).',
      match: {
        anyGroup: [
          {
            connected: [
              ['tx1.S1', 'tx2.S1'],
              ['tx1.S2', 'tx2.S2'],
            ],
          },
          {
            connected: [
              ['tx1.S1', 'tx2.S2'],
              ['tx1.S2', 'tx2.S1'],
            ],
          },
        ],
      },
      effect: 'short',
      effectTarget: 'tx2',
    },
    ammeterAcrossSource('ap', ['vaP.OUT_P', 'sup.N'], {
      id: 'ap-across-source',
      description:
        'The primary ammeter ap is wired across the source instead of in series with the primaries.',
    }),
    liveNeutralShort(
      [
        PRI_N1,
        ['vaP.OUT_P', 'vp.A', 'wp.M', 'wp.V1'],
        ['wp.L', 'ap.IN'],
        PRI_N5,
      ],
      PRI_N2,
    ),
    voltmeterInSeries(
      'vp',
      [
        ['vaP.OUT_P', 'wp.M'],
        ['wp.L', 'ap.IN'],
        ['ap.OUT', 'tx1.P1'],
        ['ap.OUT', 'tx2.P1'],
      ],
      ['sup.N', 'vaP.OUT_N', 'tx1.P2', 'tx2.P2'],
      {
        id: 'vp-in-series',
        description:
          'Primary voltmeter vp must be connected across the supply/primaries, not in series.',
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
      id: 'vaP.knob',
      componentId: 'vaP',
      kind: 'knob',
      label: 'Primary Autotransformer (vaP)',
      min: 0,
      max: 270,
      step: 1,
      fineStep: 0.1,
      unit: 'V',
      defaultValue: 0,
    },
  ],
  physicsModel: 'sumpner',
  physicsParams: { ...SHARED_PARAMS, stageMode: 1 },
  observationTable: [
    { id: 'sno', label: 'S.No', source: { kind: 'sno' } },
    {
      id: 'vp',
      label: 'Vp (V)',
      shortLabel: 'Vp',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vp', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'ip',
      label: 'Ip (A)',
      shortLabel: 'Ip',
      unit: 'A',
      source: { kind: 'meter', meterId: 'ap', field: 'shownValue' },
      decimals: 2,
    },
    {
      id: 'wpDial',
      label: 'Wp Dial',
      shortLabel: 'Dial',
      unit: 'div',
      source: { kind: 'meter', meterId: 'wp', field: 'dial' },
      decimals: 1,
    },
    {
      id: 'wpMf',
      label: 'MF',
      shortLabel: 'MF',
      unit: 'W/div',
      source: { kind: 'meter', meterId: 'wp', field: 'mf' },
      decimals: 2,
    },
    {
      id: 'wp',
      label: 'Wp (W)',
      shortLabel: 'Wp',
      unit: 'W',
      source: { kind: 'meter', meterId: 'wp', field: 'shownValue' },
      decimals: 1,
    },
    {
      id: 'vpol',
      label: 'Vpol (V)',
      shortLabel: 'Vpol',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vpol', field: 'shownValue' },
      decimals: 1,
    },
  ],
  rowRules: [
    {
      id: 'vp-hold-and-opposition',
      label: 'Vp at 230 ± 2 V with opposition join (Vpol < 5 V)',
      amber: true,
      highlightColumnIds: ['vp', 'vpol'],
      message: (row) => {
        const vp = getRowNumber(row, 'vp');
        const vpol = getRowNumber(row, 'vpol');
        if (vpol >= 5) {
          return `Polarity voltage Vpol (${vpol.toFixed(1)} V) is not near zero — check series-opposition join.`;
        }
        return `Primary voltage Vp (${vp.toFixed(1)} V) was outside 230 ± 2 V.`;
      },
      predicate: (row) =>
        Math.abs(getRowNumber(row, 'vp') - 230) <= 2 &&
        getRowNumber(row, 'vpol') < 5,
      minPassCount: 1,
      failMessage: () =>
        'No primary iron-loss reading recorded at Vp = 230 ± 2 V with polarity reading Vpol < 5 V.',
      failHint: () =>
        'With tx1.S1 joined to tx2.S2 (Vpol < 5 V), adjust vaP until Vp = 230 ± 2 V and add a row.',
    },
  ],
  prerequisites: [
    {
      id: 'pri-opposition-row',
      label: 'Primary iron-loss row at Vp = 230 ± 2 V with Vpol < 5 V',
      predicate: (rows) =>
        rows.some(
          (r) =>
            Math.abs(getRowNumber(r, 'vp') - 230) <= 2 &&
            getRowNumber(r, 'vpol') < 5,
        ),
      failMessage:
        'Missing a Stage 1 primary reading at Vp = 230 ± 2 V with polarity check < 5 V.',
      failHint:
        'Confirm Vpol < 5 V (opposition join), set Vp to 230 V on vaP, and record a primary row.',
    },
  ],
  learnSteps: [
    {
      id: 'sumpner-1-why-two',
      stageId: PRI_STAGE_ID,
      camera: 'transformers',
      focus: ['tx1', 'tx2'],
      title: 'Why Two Identical Transformers?',
      why: 'Sumpner’s back-to-back test connects two identical 2 kVA (230/115 V) transformers so both core and copper losses occur together while drawing only the total losses from the supply.',
    },
    {
      id: 'sumpner-1-pri-supply',
      stageId: PRI_STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'vaP', 'vp'],
      title: 'Connect Primary Supply, Variac & Voltmeter',
      why: 'Feed 230 V mains into primary autotransformer vaP, connect its output to 0–300 V voltmeter vp, and establish the common neutral bus.',
      connectTerminals: [
        ['sup.P', 'vaP.IN_P'],
        ['sup.N', 'vaP.IN_N'],
        ['vaP.OUT_P', 'vp.A'],
        ['vp.B', 'vaP.OUT_N'],
      ],
    },
    {
      id: 'sumpner-1-pri-meters',
      stageId: PRI_STAGE_ID,
      camera: 'primary-meters',
      focus: ['wp', 'ap'],
      title: 'Wire LPF Wattmeter & Primary Ammeter',
      why: 'Use the 0.2 power-factor wattmeter wp (300 V, 1 A, MF = 0.4 W/div) and 0–1 A ammeter ap in series because primary no-load current is only ~0.70 A at low power factor.',
      connectTerminals: [
        ['vaP.OUT_P', 'wp.M'],
        ['wp.V1', 'wp.M'],
        ['wp.V2', 'vaP.OUT_N'],
        ['wp.L', 'ap.IN'],
      ],
    },
    {
      id: 'sumpner-1-pri-parallel',
      stageId: PRI_STAGE_ID,
      camera: 'transformers',
      focus: ['ap', 'tx1', 'tx2'],
      title: 'Connect Both HV Primaries in Parallel',
      why: 'Connect both P1 terminals to ap.OUT and both P2 terminals to neutral so both transformers receive rated 230 V in parallel.',
      connectTerminals: [
        ['ap.OUT', 'tx1.P1'],
        ['ap.OUT', 'tx2.P1'],
        ['tx1.P2', 'vaP.OUT_N'],
        ['tx2.P2', 'vaP.OUT_N'],
      ],
    },
    {
      id: 'sumpner-1-aiding-wire',
      stageId: PRI_STAGE_ID,
      camera: 'transformers',
      focus: ['tx1', 'tx2', 'vpol'],
      title: 'Test Initial Secondary Join (Polarity Check)',
      why: 'Join tx1.S1 to tx2.S1 and connect polarity voltmeter vpol across tx1.S2 and tx2.S2 to test whether the two LV windings oppose or aid each other.',
      connectTerminals: [
        ['tx1.S1', 'tx2.S1'],
        ['tx1.S2', 'vpol.A'],
        ['tx2.S2', 'vpol.B'],
      ],
    },
    {
      id: 'sumpner-1-aiding-check',
      stageId: PRI_STAGE_ID,
      camera: 'transformers',
      focus: ['vaP', 'vpol'],
      title: 'Observe the Series-Aiding 230 V Trap',
      why: 'Switch on and raise vaP to 230 V: because tx2 has inverted LV polarity, vpol reads ~230 V (twice 115 V)! Never close the secondary loop like this or circulating current will trip the MCB.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 2,
        meterId: 'vp',
        controlId: 'vaP.knob',
        targetLabel: 'Primary Voltmeter Vp',
      },
    },
    {
      id: 'sumpner-1-opposition-rewire',
      stageId: PRI_STAGE_ID,
      camera: 'transformers',
      focus: ['tx1', 'tx2', 'vpol'],
      title: 'Re-Wire for Series-Opposition',
      why: 'Shut off the supply and swap tx2’s LV leads so tx1.S1 joins tx2.S2 and vpol measures across tx1.S2 and tx2.S1.',
      disconnectTerminals: [
        ['tx1.S1', 'tx2.S1'],
        ['tx2.S2', 'vpol.B'],
      ],
      connectTerminals: [
        ['tx1.S1', 'tx2.S2'],
        ['tx2.S1', 'vpol.B'],
      ],
    },
    {
      id: 'sumpner-1-opposition-check',
      stageId: PRI_STAGE_ID,
      camera: 'primary-meters',
      focus: ['vaP', 'vp', 'ap', 'wp', 'vpol'],
      title: 'Verify ~0 V Opposition & Read Iron Loss',
      why: 'Energise at 230 V: vpol now reads ~0 V, confirming series-opposition. Both primaries draw 0.35 A (Ip ≈ 0.70 A), and wp reads total iron loss Wp = 40 W (100 div × 0.4).',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 2,
        meterId: 'vp',
        controlId: 'vaP.knob',
        targetLabel: 'Primary Voltmeter Vp',
      },
    },
  ],
  hints: [
    'Keep the primary side identical to an open-circuit feed: sup → vaP → wp → ap → parallel tx1.P1 & tx2.P1, with all returns on neutral.',
    'Connect wp.V1 to wp.M (or wp.L) and wp.V2 to neutral, with vp across vaP.OUT_P and neutral.',
    'Because tx2 has inverted LV polarity, join tx1.S1 to tx2.S2 (NOT tx1.S1 to tx2.S1!) for series-opposition.',
    'Connect polarity voltmeter vpol across the remaining free LV terminals tx1.S2 and tx2.S1 (~0 V).',
    'Connect the incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: Primary parallel feed with wp.V1 on M, series-opposition link tx1.S1–tx2.S2, and vpol across tx1.S2–tx2.S1.',
};

const secondaryCircuitStage: StageDef = {
  id: SEC_STAGE_ID,
  title: 'Secondary Circuit',
  summary:
    'Carry over primary wiring and the opposition link, remove vpol, and wire auxiliary variac vaS, vs, as, and ws to circulate rated 17.39 A.',
  componentIds: [
    'sup',
    'vaP',
    'vp',
    'wp',
    'ap',
    'tx1',
    'tx2',
    'vaS',
    'vs',
    'as',
    'ws',
  ],
  cameraPresets: SHARED_CAMERA_PRESETS,
  acceptedNetlists: [SEC_NET_A, SEC_NET_B, SEC_NET_C, SEC_NET_D],
  netLabels: [
    'Supply Live to Both Variacs (S0)',
    'Primary Variac Output to Vp & wp (N3)',
    'Primary Wattmeter L to Primary Ammeter (N4)',
    'Parallel HV Primaries Feed (N5)',
    'Aux Variac Output to Secondary Ammeter (S1)',
    'Secondary Ammeter to Wattmeter M (S2)',
    'Secondary Wattmeter L, vs & Loop Top (S3)',
    'LV Series-Opposition Join (S4: tx1.S1–tx2.S2)',
    'Common Neutral & Secondary Loop Return (N2+S5)',
  ],
  netCategories: [
    'The supply live feed to vaP and vaS is incomplete.',
    'The primary wattmeter / voltmeter input path is incomplete.',
    'The primary wattmeter to ammeter path is incomplete.',
    'The parallel HV primary feed is incomplete.',
    'The auxiliary variac vaS to secondary ammeter as path is incomplete.',
    'The secondary ammeter to wattmeter M path is incomplete.',
    'The secondary wattmeter L / voltmeter vs feed to tx1.S2 is incomplete.',
    'The LV series-opposition join (tx1.S1–tx2.S2) is incomplete.',
    'The common neutral and secondary return path via vaS.OUT_N is incomplete.',
  ],
  netCategoryKeys: [
    'supply',
    'primary',
    'wattmeter',
    'primary',
    'secondary',
    'wattmeter',
    'secondary',
    'secondary',
    'supply',
  ],
  netPurposes: {
    supply:
      'Supply & Common Return: feeds 230 V AC to both vaP and vaS inputs, and shares the neutral return bus via vaS.OUT_N.',
    primary:
      'Primary Excitation: holds both HV primaries at 230 V so core flux and iron loss stay constant.',
    wattmeter:
      'Wattmeters: wp reads total iron loss (Wp ≈ 40 W) while ws (15 V / 20 A, MF = 2 W/div) reads total copper loss (Ws).',
    secondary:
      'Secondary Circulating Loop: drives reduced voltage from vaS through series-opposing LV windings (tx1.S2 → tx1.S1–tx2.S2 → tx2.S1) back to vaS.OUT_N.',
  },
  carryOver: 'consistent-wires',
  faultPatterns: [
    ...wattmeterFaults('wp', SEC_NET_A),
    ...wattmeterFaults('ws', SEC_NET_A),
    {
      id: 'secondary-series-aiding',
      description:
        'Secondary windings are joined in series-aiding polarity (~230 V net EMF), driving heavy circulating short-circuit current through vaS!',
      match: {
        anyGroup: [
          { connected: [['tx1.S1', 'tx2.S1']] },
          { connected: [['tx1.S2', 'tx2.S2']] },
        ],
      },
      effect: 'short',
      effectTarget: 'vaS',
    },
    ammeterAcrossSource('ap', ['vaP.OUT_P', 'sup.N'], {
      id: 'ap-across-source',
      description:
        'Primary ammeter ap is wired across the primary source instead of in series.',
    }),
    ammeterAcrossSource('as', ['vaS.OUT_P', 'sup.N'], {
      id: 'as-across-source',
      description:
        'Secondary ammeter as is wired across the auxiliary variac instead of in series with the secondary loop.',
    }),
    liveNeutralShort(
      [
        SEC_S0_LIVE,
        ['vaP.OUT_P', 'vp.A', 'wp.M', 'wp.V1'],
        ['wp.L', 'ap.IN'],
        SEC_N5,
        SEC_S1,
        SEC_S2,
        ['ws.L', 'ws.V1', 'vs.A'],
      ],
      [
        'sup.N',
        'vaP.IN_N',
        'vaP.OUT_N',
        'vp.B',
        'wp.V2',
        'tx1.P2',
        'tx2.P2',
        'vaS.IN_N',
        'vaS.OUT_N',
        'ws.V2',
        'vs.B',
      ],
    ),
    voltmeterInSeries(
      'vp',
      [
        ['vaP.OUT_P', 'wp.M'],
        ['wp.L', 'ap.IN'],
        ['ap.OUT', 'tx1.P1'],
        ['ap.OUT', 'tx2.P1'],
      ],
      ['sup.N', 'vaP.OUT_N', 'tx1.P2', 'tx2.P2'],
      {
        id: 'vp-in-series',
        description:
          'Primary voltmeter vp must be in parallel, not in series.',
      },
    ),
    voltmeterInSeries(
      'vs',
      [
        ['vaS.OUT_P', 'as.IN'],
        ['as.OUT', 'ws.M'],
        ['ws.L', 'tx1.S2'],
        ['ws.L', 'tx2.S1'],
      ],
      ['sup.N', 'vaS.OUT_N', 'tx2.S1', 'tx1.S2'],
      {
        id: 'vs-in-series',
        description:
          'Secondary voltmeter vs must be across the secondary loop, not in series.',
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
      id: 'vaP.knob',
      componentId: 'vaP',
      kind: 'knob',
      label: 'Primary Autotransformer (vaP)',
      min: 0,
      max: 270,
      step: 1,
      fineStep: 0.1,
      unit: 'V',
      defaultValue: 0,
    },
    {
      id: 'vaS.knob',
      componentId: 'vaS',
      kind: 'knob',
      label: 'Auxiliary Variac (vaS)',
      min: 0,
      max: 30,
      step: 0.1,
      fineStep: 0.1,
      unit: 'V',
      defaultValue: 0,
    },
    {
      id: 'ws.vRange',
      componentId: 'ws',
      kind: 'selector',
      label: 'ws Voltage Range (PC)',
      options: [15, 30],
      unit: 'V',
      defaultValue: 15,
    },
    {
      id: 'ws.iRange',
      componentId: 'ws',
      kind: 'selector',
      label: 'ws Current Range (CC)',
      options: [10, 20],
      unit: 'A',
      defaultValue: 20,
    },
  ],
  physicsModel: 'sumpner',
  physicsParams: { ...SHARED_PARAMS, stageMode: 2 },
  observationTable: [
    { id: 'sno', label: 'S.No', source: { kind: 'sno' } },
    {
      id: 'vs',
      label: 'Vs (V)',
      shortLabel: 'Vs',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vs', field: 'shownValue' },
      decimals: 2,
    },
    {
      id: 'is',
      label: 'Is (A)',
      shortLabel: 'Is',
      unit: 'A',
      source: { kind: 'meter', meterId: 'as', field: 'shownValue' },
      decimals: 2,
    },
    {
      id: 'wsDial',
      label: 'Ws Dial',
      shortLabel: 'Dial',
      unit: 'div',
      source: { kind: 'meter', meterId: 'ws', field: 'dial' },
      decimals: 1,
    },
    {
      id: 'wsMf',
      label: 'MF',
      shortLabel: 'MF',
      unit: 'W/div',
      source: { kind: 'meter', meterId: 'ws', field: 'mf' },
      decimals: 2,
    },
    {
      id: 'ws',
      label: 'Ws (W)',
      shortLabel: 'Ws',
      unit: 'W',
      source: { kind: 'meter', meterId: 'ws', field: 'shownValue' },
      decimals: 1,
    },
  ],
  rowRules: [
    {
      id: 'is-no-overload',
      label: 'Secondary current Is <= 110% of 17.39 A (19.13 A)',
      amber: true,
      highlightColumnIds: ['is'],
      message: (row, params) =>
        `Secondary current Is (${getRowNumber(row, 'is').toFixed(2)} A) exceeds 110% of rated ${(params.I2rated ?? 17.39).toFixed(2)} A.`,
      predicate: (row, params) =>
        getRowNumber(row, 'is') <= (params.I2rated ?? 17.39) * 1.1,
      minPassCount: 4,
      failMessage: (pass, total) =>
        `Secondary overload check passed in ${pass} of ${total} rows (at least 4 non-overloaded rows required).`,
      failHint: () =>
        'Keep circulating current Is at or below 110% of 17.39 A (<= 19.13 A) across your recorded steps.',
    },
  ],
  prerequisites: [
    {
      id: 'sec-25',
      label: 'Row near 25% rated LV current (~4.35 A ± 8%)',
      predicate: (rows, p) => {
        const target = (p.I2rated ?? 17.39) * 0.25;
        return rows.some(
          (r) => Math.abs(getRowNumber(r, 'is') - target) <= target * 0.08,
        );
      },
      failMessage: 'Missing secondary reading near 25% of 17.39 A (~4.35 A).',
      failHint: 'Adjust vaS to ~2.4 V so Is is near 4.35 A and record a row.',
    },
    {
      id: 'sec-50',
      label: 'Row near 50% rated LV current (~8.70 A ± 8%)',
      predicate: (rows, p) => {
        const target = (p.I2rated ?? 17.39) * 0.5;
        return rows.some(
          (r) => Math.abs(getRowNumber(r, 'is') - target) <= target * 0.08,
        );
      },
      failMessage: 'Missing secondary reading near 50% of 17.39 A (~8.70 A).',
      failHint: 'Adjust vaS to ~4.8 V so Is is near 8.70 A and record a row.',
    },
    {
      id: 'sec-75',
      label: 'Row near 75% rated LV current (~13.04 A ± 8%)',
      predicate: (rows, p) => {
        const target = (p.I2rated ?? 17.39) * 0.75;
        return rows.some(
          (r) => Math.abs(getRowNumber(r, 'is') - target) <= target * 0.08,
        );
      },
      failMessage: 'Missing secondary reading near 75% of 17.39 A (~13.04 A).',
      failHint: 'Adjust vaS to ~7.2 V so Is is near 13.04 A and record a row.',
    },
    {
      id: 'sec-100',
      label: 'Row near 100% rated LV current (~17.39 A ± 8%)',
      predicate: (rows, p) => {
        const target = p.I2rated ?? 17.39;
        return rows.some(
          (r) => Math.abs(getRowNumber(r, 'is') - target) <= target * 0.08,
        );
      },
      failMessage: 'Missing secondary reading near 100% of 17.39 A (~17.39 A).',
      failHint: 'Adjust vaS to ~9.6 V so Is is near 17.39 A and record a row.',
    },
    {
      id: 'sec-no-overload',
      label: 'No secondary reading above 110% of 17.39 A (<= 19.13 A)',
      predicate: (rows, p) =>
        rows.length > 0 &&
        rows.every(
          (r) => getRowNumber(r, 'is') <= (p.I2rated ?? 17.39) * 1.1,
        ),
      failMessage: 'One or more secondary rows exceed 110% rated current (19.13 A).',
      failHint: 'Delete overloaded rows above 19.13 A and keep Is within 25–100% rated current.',
    },
  ],
  learnSteps: [
    {
      id: 'sumpner-2-why-opposition',
      stageId: SEC_STAGE_ID,
      camera: 'transformers',
      focus: ['tx1', 'tx2'],
      title: 'Why Series-Opposition Enables Zero-Load Copper Loss',
      why: 'With secondary voltage at zero, the opposing 115 V secondaries cancel and draw no circulating current. Injecting a small voltage from vaS circulates up to rated 17.39 A without drawing load power from vaP.',
    },
    {
      id: 'sumpner-2-vas-feed',
      stageId: SEC_STAGE_ID,
      camera: 'secondary-supply',
      focus: ['sup', 'vaS', 'as'],
      title: 'Connect Auxiliary Variac vaS & 0–25 A Ammeter',
      why: 'Feed vaS.IN_P from sup.P and vaS.IN_N from neutral, then wire vaS.OUT_P into 0–25 A ammeter as.IN. Note: if a wattmeter’s current coil were rated below 17.39 A, a CT (Fig. 3.3.2) would be used.',
      connectTerminals: [
        ['sup.P', 'vaS.IN_P'],
        ['vaS.IN_N', 'sup.N'],
        ['vaS.OUT_P', 'as.IN'],
      ],
    },
    {
      id: 'sumpner-2-ws-vs',
      stageId: SEC_STAGE_ID,
      camera: 'secondary-meters',
      focus: ['as', 'ws', 'vs'],
      title: 'Wire Unity-PF Wattmeter ws & 0–15 V Voltmeter vs',
      why: 'Connect as.OUT to ws.M (15 V / 20 A, MF = 2 W/div), tie ws.V1 and vs.A to ws.L to exclude meter drops, and return ws.V2 and vs.B to vaS.OUT_N.',
      connectTerminals: [
        ['as.OUT', 'ws.M'],
        ['ws.V1', 'ws.L'],
        ['vs.A', 'ws.L'],
        ['ws.V2', 'vaS.OUT_N'],
        ['vs.B', 'vaS.OUT_N'],
      ],
    },
    {
      id: 'sumpner-2-sec-loop',
      stageId: SEC_STAGE_ID,
      camera: 'transformers',
      focus: ['tx1', 'tx2', 'ws'],
      title: 'Close the Series-Opposing Secondary Loop',
      why: 'Feed tx1.S2 from ws.L, keep tx1.S1 joined to tx2.S2, and return tx2.S1 to vaS.OUT_N on the common neutral rail.',
      connectTerminals: [
        ['ws.L', 'tx1.S2'],
        ['tx2.S1', 'vaS.OUT_N'],
      ],
    },
    {
      id: 'sumpner-2-set-vp',
      stageId: SEC_STAGE_ID,
      camera: 'primary-meters',
      focus: ['vaP', 'vp', 'ap', 'wp'],
      title: 'Energise Primary Excitation at 230 V',
      why: 'Switch on the supply and set primary variac vaP to 230 V so both cores operate at rated flux (Ip ≈ 0.70 A, Wp ≈ 40 W).',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 2,
        meterId: 'vp',
        controlId: 'vaP.knob',
        targetLabel: 'Primary Voltmeter Vp',
      },
    },
    {
      id: 'sumpner-2-circulate',
      stageId: SEC_STAGE_ID,
      camera: 'secondary-meters',
      focus: ['vaS', 'as', 'vs', 'ws'],
      title: 'Circulate Rated 17.39 A on Secondary',
      why: 'Slowly raise vaS in 0.1 V steps until as reads 17.39 A (Vs ≈ 9.26 V, ws ≈ 90.7 W = 2 × I²R2). Notice wp and ap on the primary side stay completely unaffected by secondary current!',
      completionCondition: {
        kind: 'v1-target',
        targetV: 17.39,
        toleranceV: 0.45,
        meterId: 'as',
        controlId: 'vaS.knob',
        unit: 'A',
        targetLabel: 'Secondary Ammeter Is',
      },
    },
    {
      id: 'sumpner-2-report-temp',
      stageId: SEC_STAGE_ID,
      camera: 'overview',
      focus: ['tx1', 'tx2'],
      title: 'Temperature Rise & Report Calculations',
      why: 'Unlike OC and SC tests run separately, Sumpner’s test applies rated iron and copper losses simultaneously to measure steady-state temperature rise, then yields Pi = Wp/2, R2 = (Ws/2)/Is², X2, Pc, regulation, and efficiency.',
    },
  ],
  hints: [
    'Feed vaS.IN_P from sup.P and vaS.IN_N from sup.N, then wire vaS.OUT_P → as.IN → as.OUT → ws.M.',
    'Connect ws.V1 and vs.A to ws.L, and feed tx1.S2 from ws.L.',
    'Keep the series-opposition link tx1.S1–tx2.S2, and return tx2.S1, ws.V2, and vs.B to vaS.OUT_N / sup.N.',
    'Make sure tx1.S1 is NOT joined to tx2.S1 (aiding polarity trips the supply).',
    'Connect the incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: Stage 2 secondary loop (sup.P → vaS → as → ws → tx1.S2 → tx1.S1–tx2.S2 → tx2.S1 → vaS.OUT_N / sup.N) with ws.V1 on L.',
};

export const ex3_3: ExperimentDef = {
  id: 'ex3.3',
  title: "Sumpner's test of single-phase transformer",
  object: [
    "Perform Sumpner's back-to-back test on two identical single-phase transformers.",
    'Determine (a) efficiency of the transformers at unity power factor and plot efficiency versus load.',
    'Determine (b) voltage regulation at 0.8 power-factor lagging and 0.8 power-factor leading loads.',
  ],
  components: [
    {
      id: 'sup',
      type: 'acSupply',
      label: '230 V AC supply with MCB',
      position: [-4.9, 0, -0.2],
      params: { V: 230, f: 50 },
    },
    {
      id: 'vaP',
      type: 'variac1ph',
      label: 'Primary Autotransformer (vaP)',
      position: [-3.3, 0, -0.2],
      params: { Vin: 230, VoutMax: 270, kVA: 3, plateLabel: 'PRIMARY VARIAC' },
    },
    {
      id: 'vp',
      type: 'voltmeter',
      label: 'Primary Voltmeter (vp)',
      position: [-1.85, 0.32, -1.35],
      params: { range: 300 },
    },
    {
      id: 'wp',
      type: 'wattmeter',
      label: 'Primary Wattmeter (wp · LPF)',
      position: [-1.85, 0, 0.85],
      params: { vRange: 300, iRange: 1, divisions: 150, pf: 0.2 },
    },
    {
      id: 'ap',
      type: 'ammeter',
      label: 'Primary Ammeter (ap)',
      position: [-0.35, 0, 0.85],
      params: { range: 1 },
    },
    {
      id: 'tx1',
      type: 'transformer1ph',
      label: 'Transformer 1 (2 kVA 230/115 V)',
      position: [-0.45, 0, -0.95],
      params: {
        kVA: 2,
        V1: 230,
        V2: 115,
        I1rated: 8.7,
        I2rated: 17.39,
        pPlate: 'HV 230 V',
        sPlate: 'LV 115 V',
        titlePlate: 'TX 1 · 2 kVA',
      },
    },
    {
      id: 'tx2',
      type: 'transformer1ph',
      label: 'Transformer 2 (2 kVA 230/115 V)',
      position: [1.3, 0, -0.95],
      params: {
        kVA: 2,
        V1: 230,
        V2: 115,
        I1rated: 8.7,
        I2rated: 17.39,
        pPlate: 'HV 230 V',
        sPlate: 'LV 115 V',
        titlePlate: 'TX 2 · 2 kVA',
        polarityFlipped: true,
      },
    },
    {
      id: 'vpol',
      type: 'voltmeter',
      label: 'Polarity Voltmeter (vpol)',
      position: [1.25, 0, 0.85],
      params: { range: 300 },
    },
    {
      id: 'as',
      type: 'ammeter',
      label: 'Secondary Ammeter (as)',
      position: [1.25, 0, 0.85],
      params: { range: 25 },
    },
    {
      id: 'ws',
      type: 'wattmeter',
      label: 'Secondary Wattmeter (ws · UPF)',
      position: [2.8, 0, 0.85],
      params: {
        vRange: 15,
        iRange: 20,
        vRanges: [15, 30],
        iRanges: [10, 20],
        divisions: 150,
        pf: 1.0,
      },
    },
    {
      id: 'vs',
      type: 'voltmeter',
      label: 'Secondary Voltmeter (vs)',
      position: [2.8, 0.32, -1.35],
      params: { range: 15 },
    },
    {
      id: 'vaS',
      type: 'variac1ph',
      label: 'Auxiliary Variac (vaS)',
      position: [4.55, 0, -0.2],
      params: {
        Vin: 230,
        VoutMax: 270,
        IoutMax: 20,
        Rs: 0.02,
        plateLabel: 'AUX VARIAC (vaS)',
      },
    },
  ],
  stages: [primaryPolarityStage, secondaryCircuitStage],
  charts: [
    {
      id: 'sumpner-efficiency-curve',
      title: 'Efficiency vs Load (Unity PF)',
      subtitle: 'S = 2000 VA per transformer',
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
          label: 'Iron loss Pi per transformer (Wp / 2)',
          unit: 'W',
          placeholder: 'e.g. 20.0',
          step: '0.1',
        },
        {
          id: 'pcInput',
          label: 'Full-load Cu loss Pc per transformer',
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
      id: 'Pi',
      label: 'Iron loss per transformer Pi (Wp / 2, W)',
      unit: 'W',
      kind: 'number',
      placeholder: 'e.g. 20.0',
      step: '0.1',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).Pi,
      tolerance: { rel: 0.05 },
      failMessage: 'Iron loss per transformer Pi is outside tolerance.',
      failHint: () =>
        'Use Eq. (3.3.1): Pi = Wp / 2 from your 230 V primary wattmeter reading.',
    },
    {
      id: 'R2',
      label: 'Equivalent resistance R2 referred to LV (Ω)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 0.15',
      step: '0.001',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).R2,
      tolerance: { rel: 0.05 },
      failMessage: 'Equivalent resistance R2 (LV) is outside tolerance.',
      failHint: () =>
        'Use Eq. (3.3.5): R2 = (Ws / 2) / Is² averaged across your secondary readings.',
    },
    {
      id: 'X2',
      label: 'Equivalent reactance X2 referred to LV (Ω)',
      unit: 'Ω',
      kind: 'number',
      placeholder: 'e.g. 0.22',
      step: '0.001',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).X2,
      tolerance: { rel: 0.06 },
      failMessage: 'Equivalent reactance X2 (LV) is outside tolerance.',
      failHint: () =>
        'Use Eqs. (3.3.4) & (3.3.6): Z2 = (Vs / 2) / Is, X2 = √(Z2² − R2²).',
    },
    {
      id: 'Pc',
      label: 'Full-load copper loss per transformer Pc (W)',
      unit: 'W',
      kind: 'number',
      placeholder: 'e.g. 45.4',
      step: '0.1',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).Pc,
      tolerance: { rel: 0.05 },
      failMessage: 'Full-load copper loss per transformer Pc is outside tolerance.',
      failHint: () =>
        'Use Eq. (3.3.2): Pc = (17.39 / Is)² × (Ws / 2) averaged across secondary steps.',
    },
    {
      id: 'VR_lag',
      label: 'Voltage regulation at 0.8 lagging PF (%)',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. 3.81',
      step: '0.01',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).VR_lag08,
      tolerance: { abs: 0.3 },
      failMessage: 'Voltage regulation (0.8 lagging) is outside tolerance.',
      failHint: () =>
        'Use Eq. (3.3.7): VR = (17.39 / 115) × (R2·0.8 + X2·0.6) × 100%.',
    },
    {
      id: 'VR_lead',
      label: 'Voltage regulation at 0.8 leading PF (%)',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. -0.18',
      step: '0.01',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).VR_lead08,
      tolerance: { abs: 0.3 },
      failMessage: 'Voltage regulation (0.8 leading) is outside tolerance.',
      failHint: () =>
        'Use Eq. (3.3.7): VR = (17.39 / 115) × (R2·0.8 − X2·0.6) × 100% for leading PF.',
    },
    {
      id: 'xMaxEff',
      label: 'Load fraction at max efficiency x (0 to 1)',
      unit: 'pu',
      kind: 'number',
      placeholder: 'e.g. 0.66',
      step: '0.01',
      truth: () => computeSumpnerMethodTruth(SHARED_PARAMS).xMaxEff,
      tolerance: { abs: 0.08 },
      failMessage: 'Load fraction at maximum efficiency is outside tolerance.',
      failHint: () =>
        'Maximum efficiency occurs when copper loss equals iron loss: x = √(Pi / Pc).',
    },
  ],
  hints: primaryPolarityStage.hints!,
  solutionNote: primaryPolarityStage.solutionNote!,
};
