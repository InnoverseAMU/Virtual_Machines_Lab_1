import {
  ammeterAcrossSource,
  liveNeutralShort,
  voltmeterInSeries,
  wattmeterFaults,
} from '../circuit/faultFactories';
import { crossProduct } from '../circuit/nets';
import {
  computeRunTruth,
  getRowNumber,
  MAX_EFF_LOAD_TOLERANCE_PP,
  REGULATION_TOLERANCE_PP,
  V1_HOLD_TOLERANCE_V,
} from '../physics/report';
import type { ExperimentDef, LearnStep, Net, StageDef } from '../types';

const N1: Net = ['sup.P', 'va.IN_P'];
const N2: Net = ['sup.N', 'va.IN_N', 'va.OUT_N', 'wm.V2', 'tx.P2', 'vp.B'];
const N5: Net = ['tx.S1', 'vs.A', 'am.IN'];
const N6: Net = ['am.OUT', 'ld.A'];
const N7: Net = ['tx.S2', 'vs.B', 'ld.B'];

const WM_V1_VARIANTS: Net[][] = [
  // Connection (a): wattmeter V1 tied to M (canonical solution)
  [
    ['va.OUT_P', 'wm.M', 'wm.V1'],
    ['wm.L', 'tx.P1', 'vp.A'],
  ],
  // Connection (b): wattmeter V1 tied to L
  [
    ['va.OUT_P', 'wm.M'],
    ['wm.L', 'wm.V1', 'tx.P1', 'vp.A'],
  ],
];

export const [NET_A, NET_B] = crossProduct([
  [[N1, N2]],
  WM_V1_VARIANTS,
  [[N5, N6, N7]],
]);

const STAGE_ID = 'load-test';

const ex3_1Stage: StageDef = {
  id: STAGE_ID,
  title: 'Load test (230 / 115 V)',
  summary:
    'Wire the single-phase transformer load test, hold primary voltage at 230 V, and record readings from no-load to full load.',
  componentIds: ['sup', 'va', 'wm', 'vp', 'tx', 'vs', 'am', 'ld'],
  cameraPresets: [
    {
      id: 'overview',
      label: 'Overview',
      pos: [0.25, 9.2, 8.4],
      target: [0.25, -1.15, 0.05],
    },
    {
      id: 'supply',
      label: 'Supply',
      pos: [-3.45, 3.8, 4.3],
      target: [-3.45, -0.75, -0.15],
    },
    {
      id: 'meters',
      label: 'Meters',
      pos: [0.05, 6.2, 6.0],
      target: [0.05, -1.1, -0.15],
    },
    {
      id: 'transformer',
      label: 'Transformer',
      pos: [0.15, 4.4, 4.8],
      target: [0.15, -0.75, 0.15],
    },
    {
      id: 'load',
      label: 'Load',
      pos: [2.0, 6.6, 6.3],
      target: [2.0, -1.2, -0.15],
    },
  ],
  acceptedNetlists: [NET_A, NET_B],
  netLabels: [
    'Supply Live (N1)',
    'Neutral Return (N2)',
    'Variac Output to Mains (N3)',
    'Primary Winding Feed (N4)',
    'Secondary Live to Ammeter (N5)',
    'Ammeter to Lamp Bank (N6)',
    'Secondary Return (N7)',
  ],
  netCategories: [
    'The supply connection is incomplete.',
    'The primary side is incomplete.',
    'The wattmeter connection is incomplete.',
    'The primary side is incomplete.',
    'The secondary side is incomplete.',
    'The load connection is incomplete.',
    'The secondary side is incomplete.',
  ],
  netCategoryKeys: [
    'supply',
    'primary',
    'wattmeter',
    'primary',
    'secondary',
    'load',
    'secondary',
  ],
  netPurposes: {
    supply: 'Supply: feeds 230 V AC mains into the autotransformer input.',
    primary:
      'Primary: links the common neutral return and feeds the 230 V primary winding and primary voltmeter.',
    wattmeter:
      'Wattmeter: connects the autotransformer output to M and ties V1 to M to measure input power.',
    secondary:
      'Secondary: brings the 115 V winding across the secondary voltmeter and into the ammeter.',
    load: 'Load: connects the ammeter output in series with the 12-lamp resistive load bank.',
  },
  faultPatterns: [
    ...wattmeterFaults('wm', NET_A),
    ammeterAcrossSource('am', ['tx.S1', 'tx.S2'], {
      id: 'ammeter-across-secondary',
      description:
        'The ammeter is across the secondary instead of in series with the load. An ammeter is almost a short circuit.',
    }),
    liveNeutralShort(
      [['sup.P', 'va.IN_P', 'va.OUT_P', 'wm.M', 'wm.L', 'tx.P1']],
      ['sup.N', 'va.IN_N'],
    ),
    {
      id: 'variac-bypassed',
      description:
        'The autotransformer is bypassed, so you cannot set or hold the primary voltage.',
      match: {
        anyConnected: [
          ['sup.P', 'va.OUT_P'],
          ['sup.P', 'wm.M'],
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'va',
    },
    voltmeterInSeries(
      'vs',
      [
        ['tx.S1', 'ld.A'],
        ['tx.S1', 'am.IN'],
        ['am.OUT', 'ld.A'],
      ],
      ['tx.S2', 'ld.B'],
      {
        id: 'voltmeter-in-series-load',
        description:
          'A voltmeter must be connected across what it measures, not in series with the load.',
      },
    ),
    voltmeterInSeries('vp', [['wm.L', 'tx.P1']], ['sup.N', 'va.OUT_N'], {
      id: 'voltmeter-in-series-primary',
      description:
        'The primary voltmeter is in series with the transformer. Connect it across the primary winding.',
    }),
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
      label: 'Wattmeter V Range',
      options: [150, 300],
      unit: 'V',
      defaultValue: 300,
    },
    {
      id: 'wm.iRange',
      componentId: 'wm',
      kind: 'selector',
      label: 'Wattmeter I Range',
      options: [2.5, 5, 10],
      unit: 'A',
      defaultValue: 10,
    },
    {
      id: 'ld.lamps',
      componentId: 'ld',
      kind: 'steps',
      label: 'Lamp Bank Load',
      min: 0,
      max: 12,
      defaultValue: 0,
    },
  ],
  physicsModel: 'transformerLoad',
  physicsParams: {
    a: 2,
    R2eq: 0.15,
    X2eq: 0.22,
    Pi: 20,
    Io: 0.35,
    Rs: 0.3,
    lampR: 66.125,
    V1rated: 230,
    V2rated: 115,
    I2rated: 17.39,
    vpRange: 300,
    vsRange: 150,
    amRange: 25,
    wmDivisions: 150,
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
      id: 'v1',
      label: 'Primary Voltage V1',
      shortLabel: 'V1',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vp' },
      decimals: 1,
      displayDecimals: 1,
    },
    {
      id: 'i2',
      label: 'Secondary Current I2',
      shortLabel: 'I2',
      unit: 'A',
      source: { kind: 'meter', meterId: 'am' },
      decimals: 2,
      displayDecimals: 2,
    },
    {
      id: 'v2',
      label: 'Secondary Voltage V2',
      shortLabel: 'V2',
      unit: 'V',
      source: { kind: 'meter', meterId: 'vs' },
      decimals: 1,
      displayDecimals: 1,
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
      id: 'p1',
      label: 'Input Power P1',
      shortLabel: 'P1',
      unit: 'W',
      source: { kind: 'meter', meterId: 'wm', field: 'shownValue' },
      decimals: 1,
      displayDecimals: 0,
    },
    {
      id: 'eff',
      label: 'Efficiency η',
      shortLabel: 'η%',
      unit: '%',
      source: {
        kind: 'derived',
        compute: (row) => {
          const p1 = Number(row.p1 ?? 0);
          const i2 = Number(row.i2 ?? 0);
          const v2 = Number(row.v2 ?? 0);
          if (p1 <= 0 || i2 <= 0) return null;
          return ((v2 * i2) / p1) * 100;
        },
      },
      decimals: 1,
      displayDecimals: 1,
      placeholder: '—',
    },
    {
      id: 'loadVA',
      label: 'Load VA',
      unit: 'VA',
      hidden: true,
      source: {
        kind: 'derived',
        compute: (row) => Number(row.v2 ?? 0) * Number(row.i2 ?? 0),
      },
      decimals: 1,
    },
    {
      id: 'lamps',
      label: 'Lamps',
      hidden: true,
      source: { kind: 'control', controlId: 'ld.lamps' },
      decimals: 0,
    },
  ],
  rowRules: [
    {
      id: 'v1-hold',
      label: 'Hold V1 within 230 ± 2 V',
      amber: true,
      highlightColumnIds: ['v1'],
      predicate: (row, params) =>
        Math.abs(getRowNumber(row, 'v1') - (params.V1rated ?? 230)) <=
        V1_HOLD_TOLERANCE_V,
      message: (row) =>
        `Row ${row.sno} recorded with V1 = ${getRowNumber(row, 'v1').toFixed(1)} V (outside 230 ± 2 V).`,
      minPassCount: 5,
      failMessage: (passCount, totalCount) =>
        `Primary voltage V1 was within 230 ± ${V1_HOLD_TOLERANCE_V} V in only ${passCount} of ${totalCount} rows (at least 5 required).`,
      failHint: (badRows) =>
        `The primary voltage was not held at 230 ± ${V1_HOLD_TOLERANCE_V} V in ${
          badRows.length === 1 ? 'row' : 'rows'
        } ${badRows.map((r) => r.sno).join(', ')}.`,
      crossRowHint: (rows) => {
        const noLoadRow = rows.find((r) => getRowNumber(r, 'i2') <= 0.1);
        const ratedRow = rows.find((r) => {
          const i2 = getRowNumber(r, 'i2');
          return i2 >= 15 && i2 <= 19;
        });
        if (
          noLoadRow !== undefined &&
          ratedRow !== undefined &&
          Math.abs(
            getRowNumber(noLoadRow, 'v1') - getRowNumber(ratedRow, 'v1'),
          ) > V1_HOLD_TOLERANCE_V
        ) {
          return `Primary voltage V1 differed between your no-load row (${getRowNumber(
            noLoadRow,
            'v1',
          ).toFixed(1)} V) and your near-rated row (${getRowNumber(
            ratedRow,
            'v1',
          ).toFixed(1)} V); hold V1 steady at 230 V under load before recording.`;
        }
        return null;
      },
    },
  ],
  prerequisites: [
    {
      id: 'no-load-row',
      label: 'No-load row (I2 = 0 A)',
      predicate: (rows) => rows.some((r) => getRowNumber(r, 'i2') <= 0.1),
      failMessage: 'Missing a no-load observation row (I2 = 0 A).',
      failHint: 'Switch all lamps OFF at 230 V and add a no-load row.',
    },
    {
      id: 'rated-row',
      label: 'Near-rated row (I2 between 15 and 19 A)',
      predicate: (rows) =>
        rows.some((r) => {
          const i2 = getRowNumber(r, 'i2');
          return i2 >= 15 && i2 <= 19;
        }),
      failMessage:
        'Missing an observation row near rated current (I2 between 15 and 19 A).',
      failHint:
        'Turn on 9 to 11 lamps (around 15 to 19 A) and record a near-full-load row.',
    },
    {
      id: 'min-rows',
      label: (rows) => `At least 6 rows (${rows.length}/6)`,
      predicate: (rows) => rows.length >= 6,
      failMessage: 'Fewer than 6 observation rows recorded.',
      failHint:
        'Record at least 6 load steps from no-load up to near rated current.',
    },
  ],
  charts: [
    {
      id: 'efficiency-vs-load',
      title: 'Efficiency vs Load VA',
      subtitle: 'Rated: 2000 VA',
      xColumn: 'loadVA',
      series: [{ yColumn: 'eff', label: 'Efficiency (%)' }],
      xLabel: 'Load (VA)',
      yLabel: 'Efficiency (%)',
      xMin: 0,
      xMax: 2400,
      yMin: 80,
      yMax: 100,
      referenceLines: [
        { axis: 'x', value: 2000, label: '2000 VA', color: '#f59e0b' },
      ],
      emptyText: 'Record loaded rows to plot curve',
    },
  ],
  learnSteps: [
    {
      id: 'step-1',
      stageId: STAGE_ID,
      camera: 'overview',
      focus: ['sup', 'va', 'wm', 'vp', 'tx', 'vs', 'am', 'ld'],
      title: 'Experiment Overview',
      why: 'In a load test the transformer is loaded for real, so voltage regulation and efficiency are measured directly instead of calculated from an equivalent circuit. You will record secondary voltage, secondary current and input power from no load up to full load.',
    },
    {
      id: 'step-2',
      stageId: STAGE_ID,
      camera: 'overview',
      focus: ['sup'],
      title: 'Safety & Ratings',
      why: 'Switch the supply off before touching any wire, and check instrument ratings: each meter should be rated at least 20 percent above the highest value it will see. Today that means a 300 V primary voltmeter, a 150 V secondary voltmeter and a 25 A ammeter.',
    },
    {
      id: 'step-3',
      stageId: STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'va'],
      title: 'Autotransformer Purpose',
      why: 'The transformer must be tested at its rated primary voltage, 230 V, and that voltage must be held while the load changes. A variable autotransformer lets you set and re-adjust it. Its kVA rating must be at least that of the transformer under test.',
    },
    {
      id: 'step-4',
      stageId: STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'va'],
      title: 'Wire Supply to Autotransformer',
      why: 'Supply phase goes to the autotransformer input, and neutral to its common terminal. The common is shared between input and output.',
      connectTerminals: [
        ['sup.P', 'va.IN_P'],
        ['sup.N', 'va.IN_N'],
      ],
    },
    {
      id: 'step-5',
      stageId: STAGE_ID,
      camera: 'meters',
      focus: ['wm'],
      title: 'Wattmeter Coils',
      why: 'The wattmeter has two coils. The current coil (M, L) goes in series because it must carry the primary current. The pressure coil (V1, V2) goes across the supply because it senses voltage. M faces the mains.',
    },
    {
      id: 'step-6',
      stageId: STAGE_ID,
      camera: 'meters',
      focus: ['wm', 'va'],
      title: 'Connect Wattmeter Input & Pressure Coil',
      why: 'The variac output feeds M. V1 is tied to M and V2 returns to neutral, so the pressure coil sees the same voltage as the transformer primary. This is connection (a) from the manual, preferred when the circuit voltage is high relative to the current.',
      connectTerminals: [
        ['va.OUT_P', 'wm.M'],
        ['wm.V1', 'wm.M'],
        ['wm.V2', 'va.OUT_N'],
      ],
    },
    {
      id: 'step-7',
      stageId: STAGE_ID,
      camera: 'transformer',
      focus: ['tx'],
      title: 'Transformer Under Test',
      why: 'Transformer under test: 2 kVA, 230/115 V. Rated currents are about 8.7 A on the 230 V side and 17.4 A on the 115 V side. We energise the 230 V winding at rated voltage and load the 115 V winding.',
    },
    {
      id: 'step-8',
      stageId: STAGE_ID,
      camera: 'transformer',
      focus: ['wm', 'tx'],
      title: 'Connect Primary Winding',
      why: 'The wattmeter current coil feeds the primary, and the primary returns to neutral. The coil is now in series with the primary current.',
      connectTerminals: [
        ['wm.L', 'tx.P1'],
        ['tx.P2', 'va.OUT_N'],
      ],
    },
    {
      id: 'step-9',
      stageId: STAGE_ID,
      camera: 'meters',
      focus: ['vp'],
      title: 'Primary Voltmeter',
      why: 'A voltmeter always goes across what it measures. This one reads the primary voltage so you can set 230 V and keep it there.',
      connectTerminals: [
        ['vp.A', 'wm.L'],
        ['vp.B', 'va.OUT_N'],
      ],
    },
    {
      id: 'step-10',
      stageId: STAGE_ID,
      camera: 'load',
      focus: ['am', 'vs'],
      title: 'Secondary Meters',
      why: 'On the secondary the ammeter goes in series with the load and the voltmeter across the secondary terminals ahead of the ammeter, so the voltmeter does not include the ammeter drop.',
      connectTerminals: [
        ['tx.S1', 'vs.A'],
        ['tx.S1', 'am.IN'],
        ['tx.S2', 'vs.B'],
      ],
    },
    {
      id: 'step-11',
      stageId: STAGE_ID,
      camera: 'load',
      focus: ['ld'],
      title: 'Lamp Bank Load',
      why: 'The load is a bank of lamps: a resistive load at unity power factor. Its total rating is a little above the transformer kVA so full load can be reached. Lamps are switched in step by step.',
      connectTerminals: [
        ['am.OUT', 'ld.A'],
        ['ld.B', 'tx.S2'],
      ],
    },
    {
      id: 'step-12',
      stageId: STAGE_ID,
      camera: 'supply',
      focus: ['sup', 'va'],
      title: 'Energise From Zero',
      why: 'Start from zero: knob at 0 V and all lamps off, then switch the supply on. Raise the knob until the primary voltmeter reads 230 V.',
      completionCondition: {
        kind: 'v1-target',
        targetV: 230,
        toleranceV: 3,
      },
    },
    {
      id: 'step-13',
      stageId: STAGE_ID,
      camera: 'meters',
      focus: ['wm', 'vs'],
      title: 'No-Load Reading',
      why: 'No load: read V2 and the wattmeter. The transformer draws only magnetising current, so the input power is almost entirely iron loss. This power is small, so switch the wattmeter to its lowest current range or the pointer barely moves.',
      completionCondition: {
        kind: 'no-load-ack',
        targetV: 230,
        toleranceV: 3,
        lamps: 0,
      },
    },
    {
      id: 'step-14',
      stageId: STAGE_ID,
      camera: 'load',
      focus: ['ld', 'vp'],
      title: 'Load Steps & Holding V1',
      why: 'Add load in steps. Each time the primary voltage dips because of the drop in the supply and autotransformer, so re-adjust the knob to hold 230 V before reading V2, I2 and the wattmeter.',
      completionCondition: {
        kind: 'loaded-v1-target',
        minLamps: 5,
        targetV: 230,
        toleranceV: 3,
      },
    },
    {
      id: 'step-15',
      stageId: STAGE_ID,
      camera: 'meters',
      focus: ['wm'],
      title: 'Wattmeter Multiplying Factor',
      why: 'The wattmeter dial is not in watts. True power = dial reading x multiplying factor, where MF = (voltage range x current range) / full-scale divisions. For 300 V, 10 A and 150 divisions, MF = 20 W per division.',
    },
    {
      id: 'step-16',
      stageId: STAGE_ID,
      camera: 'overview',
      focus: ['vs'],
      title: 'Voltage Regulation',
      why: 'Voltage regulation = (V2 no-load - V2 full-load) / V2 rated x 100. Use V2 at no load and V2 at rated secondary current, about 17.4 A.',
    },
    {
      id: 'step-17',
      stageId: STAGE_ID,
      camera: 'overview',
      focus: [],
      title: 'Efficiency Curve',
      why: 'Efficiency = V2 x I2 / P1 x 100 for a resistive load. Plotting efficiency against load shows a maximum where copper loss equals iron loss.',
    },
  ],
};

export const ex3_1: ExperimentDef & {
  readonly learnSteps: LearnStep[];
  readonly faultPatterns: StageDef['faultPatterns'];
} = {
  id: 'ex3.1',
  title: 'Load test of single-phase transformer',
  object: [
    'Perform a load test on a single-phase transformer.',
    'Determine (a) voltage regulation and (b) efficiency.',
    'Plot efficiency versus load.',
  ],
  components: [
    {
      id: 'sup',
      type: 'acSupply',
      label: '230 V AC supply with MCB',
      position: [-4.3, 0, -0.2],
      params: { V: 230, f: 50 },
    },
    {
      id: 'va',
      type: 'variac1ph',
      label: 'Autotransformer',
      position: [-2.6, 0, -0.15],
      params: { Vin: 230, VoutMax: 270, kVA: 3 },
    },
    {
      id: 'wm',
      type: 'wattmeter',
      label: 'Wattmeter',
      position: [-0.8, 0, 0.8],
      params: {
        vRange: 300,
        iRange: 10,
        vRanges: [150, 300],
        iRanges: [2.5, 5, 10],
        divisions: 150,
        pf: 1.0,
      },
    },
    {
      id: 'vp',
      type: 'voltmeter',
      label: 'V primary',
      position: [-0.8, 0.36, -1.2],
      params: { range: 300 },
    },
    {
      id: 'tx',
      type: 'transformer1ph',
      label: 'Transformer 2 kVA 230/115 V',
      position: [1.0, 0, -0.15],
      params: { kVA: 2, V1: 230, V2: 115, I1rated: 8.7, I2rated: 17.39 },
    },
    {
      id: 'vs',
      type: 'voltmeter',
      label: 'V secondary',
      position: [2.75, 0.36, -1.2],
      params: { range: 150 },
    },
    {
      id: 'am',
      type: 'ammeter',
      label: 'A secondary',
      position: [2.75, 0, 0.8],
      params: { range: 25 },
    },
    {
      id: 'ld',
      type: 'lampLoad',
      label: 'Lamp bank (12 x 200 W)',
      position: [4.55, 0, -0.15],
      params: { lamps: 12, wattsPerLamp: 200, Vrated: 115 },
    },
  ],
  stages: [ex3_1Stage],
  answers: [
    {
      id: 'regulationPct',
      label: 'Voltage regulation (%)',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. 2.32',
      step: '0.01',
      truth: (_rows, _model, params) => computeRunTruth(params).regulationPct,
      tolerance: { abs: REGULATION_TOLERANCE_PP },
      failMessage: 'Voltage regulation (%) is outside the acceptable tolerance.',
      failHint: () =>
        'Check Eq. 3.1.1: Regulation = (V2 no-load − V2 full-load) / 115 × 100 using rows held at V1 = 230 V.',
    },
    {
      id: 'maxEffLoadPct',
      label: 'Load at max efficiency (% of rated 2 kVA)',
      unit: '%',
      kind: 'number',
      placeholder: 'e.g. 66',
      step: '0.1',
      truth: (_rows, _model, params) => computeRunTruth(params).maxEffLoadPct,
      tolerance: { abs: MAX_EFF_LOAD_TOLERANCE_PP },
      failMessage:
        'Load at maximum efficiency (% of 2 kVA) is outside the acceptable tolerance.',
      failHint: () =>
        'Read the VA load at the peak of the efficiency curve and divide by 2000 VA × 100%.',
    },
  ],
  hints: [
    'Trace the power path: supply, autotransformer, wattmeter current coil, transformer primary.',
    'The wattmeter has two coils. Which one goes in series and which across the supply?',
    'Voltmeters go across what they measure. Where does the ammeter go?',
    'Everything on the neutral side (supply N, variac common, wattmeter V2, primary second end, primary voltmeter) shares one line.',
    'Check the wattmeter M and L: M faces the mains, L faces the load.',
    'Connect the first incomplete net pair shown below.',
  ],
  solutionNote:
    'Shown: canonical connection (a) with wattmeter V1 tied to M. Connection (b) with V1 tied to L is also valid.',
  get learnSteps() {
    return ex3_1Stage.learnSteps;
  },
  get faultPatterns() {
    return ex3_1Stage.faultPatterns;
  },
};
