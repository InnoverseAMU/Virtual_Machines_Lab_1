import type { ExperimentDef, Net } from '../types';

/**
 * Connection (a): wattmeter V1 tied to M (canonical solution shown to students).
 */
export const NET_A: Net[] = [
  ['sup.P', 'va.IN_P'],
  ['sup.N', 'va.IN_N', 'va.OUT_N', 'wm.V2', 'tx.P2', 'vp.B'],
  ['va.OUT_P', 'wm.M', 'wm.V1'],
  ['wm.L', 'tx.P1', 'vp.A'],
  ['tx.S1', 'vs.A', 'am.IN'],
  ['am.OUT', 'ld.A'],
  ['tx.S2', 'vs.B', 'ld.B'],
];

/**
 * Connection (b): wattmeter V1 tied to L.
 */
export const NET_B: Net[] = [
  ['sup.P', 'va.IN_P'],
  ['sup.N', 'va.IN_N', 'va.OUT_N', 'wm.V2', 'tx.P2', 'vp.B'],
  ['va.OUT_P', 'wm.M'],
  ['wm.L', 'wm.V1', 'tx.P1', 'vp.A'],
  ['tx.S1', 'vs.A', 'am.IN'],
  ['am.OUT', 'ld.A'],
  ['tx.S2', 'vs.B', 'ld.B'],
];

export const ex3_1: ExperimentDef = {
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
      params: { vRange: 300, iRange: 10, divisions: 150 },
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
  faultPatterns: [
    // Six core fault patterns (Spec Section 5)
    {
      id: 'wm-cc-reversed',
      description:
        'The wattmeter current coil is the wrong way round. M faces the mains, L faces the load.',
      match: {
        connected: [['wm.L', 'va.OUT_P']],
        notConnected: [['wm.M', 'va.OUT_P']],
      },
      effect: 'reversed-reading',
      effectTarget: 'wm',
    },
    {
      id: 'wm-pc-open',
      description:
        'The wattmeter pressure coil is not across the supply, so it senses no voltage.',
      match: {
        notConnected: [['wm.V2', 'sup.N']],
        anyConnected: [
          ['sup.N', 'va.IN_N'],
          ['wm.V1', 'va.OUT_P'],
          ['wm.V1', 'wm.M'],
          ['wm.V1', 'wm.L'],
        ],
      },
      effect: 'no-reading',
      effectTarget: 'wm',
    },
    {
      id: 'wm-pc-reversed',
      description:
        'The pressure coil ends are swapped. V1 goes to the live side, V2 to neutral.',
      match: {
        anyConnected: [
          ['wm.V1', 'sup.N'],
          ['wm.V1', 'va.IN_N'],
          ['wm.V1', 'va.OUT_N'],
        ],
        notConnected: [
          ['wm.V1', 'va.OUT_P'],
          ['wm.V1', 'wm.L'],
        ],
      },
      effect: 'reversed-reading',
      effectTarget: 'wm',
    },
    {
      id: 'ammeter-across-secondary',
      description:
        'The ammeter is across the secondary instead of in series with the load. An ammeter is almost a short circuit.',
      match: {
        anyGroup: [
          {
            connected: [
              ['am.IN', 'tx.S1'],
              ['am.OUT', 'tx.S2'],
            ],
          },
          {
            connected: [
              ['am.OUT', 'tx.S1'],
              ['am.IN', 'tx.S2'],
            ],
          },
        ],
      },
      effect: 'short',
      effectTarget: 'am',
    },
    {
      id: 'live-neutral-short',
      description: 'A live terminal is connected to neutral.',
      match: {
        anyConnected: [
          ['sup.P', 'sup.N'],
          ['va.IN_P', 'sup.N'],
          ['va.OUT_P', 'sup.N'],
          ['wm.M', 'sup.N'],
          ['wm.L', 'sup.N'],
          ['tx.P1', 'sup.N'],
          ['sup.P', 'va.IN_N'],
          ['va.OUT_P', 'va.IN_N'],
          ['wm.M', 'va.IN_N'],
          ['wm.L', 'va.IN_N'],
          ['tx.P1', 'va.IN_N'],
        ],
      },
      effect: 'short',
      effectTarget: 'sup',
    },
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
    // Two stretch fault patterns (Spec Section 5)
    {
      id: 'voltmeter-in-series-load',
      description:
        'A voltmeter must be connected across what it measures, not in series with the load.',
      match: {
        anyGroup: [
          {
            connected: [
              ['vs.A', 'tx.S1'],
              ['vs.B', 'ld.A'],
            ],
            notConnected: [
              ['vs.B', 'tx.S2'],
              ['vs.B', 'ld.B'],
            ],
          },
          {
            connected: [
              ['vs.B', 'tx.S1'],
              ['vs.A', 'ld.A'],
            ],
            notConnected: [
              ['vs.A', 'tx.S2'],
              ['vs.A', 'ld.B'],
            ],
          },
          {
            connected: [
              ['vs.A', 'tx.S1'],
              ['vs.B', 'am.IN'],
            ],
            notConnected: [
              ['vs.B', 'tx.S2'],
              ['vs.B', 'ld.B'],
            ],
          },
          {
            connected: [
              ['vs.A', 'am.OUT'],
              ['vs.B', 'ld.A'],
            ],
            notConnected: [
              ['vs.B', 'tx.S2'],
              ['vs.B', 'ld.B'],
            ],
          },
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'vs',
    },
    {
      id: 'voltmeter-in-series-primary',
      description:
        'The primary voltmeter is in series with the transformer. Connect it across the primary winding.',
      match: {
        anyGroup: [
          {
            connected: [
              ['vp.A', 'wm.L'],
              ['vp.B', 'tx.P1'],
            ],
            notConnected: [
              ['vp.B', 'sup.N'],
              ['vp.B', 'va.OUT_N'],
            ],
          },
          {
            connected: [
              ['vp.B', 'wm.L'],
              ['vp.A', 'tx.P1'],
            ],
            notConnected: [
              ['vp.A', 'sup.N'],
              ['vp.A', 'va.OUT_N'],
            ],
          },
        ],
      },
      effect: 'wrong-reading',
      effectTarget: 'vp',
    },
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
    { key: 'sno', label: 'S.No.' },
    { key: 'v1', label: 'Primary Voltage V1', unit: 'V' },
    { key: 'i2', label: 'Secondary Current I2', unit: 'A' },
    { key: 'v2', label: 'Secondary Voltage V2', unit: 'V' },
    { key: 'dial', label: 'Wattmeter Dial', unit: 'div' },
    { key: 'mf', label: 'MF', unit: 'W/div' },
    { key: 'p1', label: 'Input Power P1', unit: 'W' },
  ],
  learnSteps: [
    {
      id: 'step-1',
      camera: 'overview',
      focus: ['sup', 'va', 'wm', 'vp', 'tx', 'vs', 'am', 'ld'],
      title: 'Experiment Overview',
      why: 'In a load test the transformer is loaded for real, so voltage regulation and efficiency are measured directly instead of calculated from an equivalent circuit. You will record secondary voltage, secondary current and input power from no load up to full load.',
    },
    {
      id: 'step-2',
      camera: 'overview',
      focus: ['sup'],
      title: 'Safety & Ratings',
      why: 'Switch the supply off before touching any wire, and check instrument ratings: each meter should be rated at least 20 percent above the highest value it will see. Today that means a 300 V primary voltmeter, a 150 V secondary voltmeter and a 25 A ammeter.',
    },
    {
      id: 'step-3',
      camera: 'supply',
      focus: ['sup', 'va'],
      title: 'Autotransformer Purpose',
      why: 'The transformer must be tested at its rated primary voltage, 230 V, and that voltage must be held while the load changes. A variable autotransformer lets you set and re-adjust it. Its kVA rating must be at least that of the transformer under test.',
    },
    {
      id: 'step-4',
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
      camera: 'meters',
      focus: ['wm'],
      title: 'Wattmeter Coils',
      why: 'The wattmeter has two coils. The current coil (M, L) goes in series because it must carry the primary current. The pressure coil (V1, V2) goes across the supply because it senses voltage. M faces the mains.',
    },
    {
      id: 'step-6',
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
      camera: 'transformer',
      focus: ['tx'],
      title: 'Transformer Under Test',
      why: 'Transformer under test: 2 kVA, 230/115 V. Rated currents are about 8.7 A on the 230 V side and 17.4 A on the 115 V side. We energise the 230 V winding at rated voltage and load the 115 V winding.',
    },
    {
      id: 'step-8',
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
      camera: 'meters',
      focus: ['wm'],
      title: 'Wattmeter Multiplying Factor',
      why: 'The wattmeter dial is not in watts. True power = dial reading x multiplying factor, where MF = (voltage range x current range) / full-scale divisions. For 300 V, 10 A and 150 divisions, MF = 20 W per division.',
    },
    {
      id: 'step-16',
      camera: 'overview',
      focus: ['vs'],
      title: 'Voltage Regulation',
      why: 'Voltage regulation = (V2 no-load - V2 full-load) / V2 rated x 100. Use V2 at no load and V2 at rated secondary current, about 17.4 A.',
    },
    {
      id: 'step-17',
      camera: 'overview',
      focus: [],
      title: 'Efficiency Curve',
      why: 'Efficiency = V2 x I2 / P1 x 100 for a resistive load. Plotting efficiency against load shows a maximum where copper loss equals iron loss.',
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
};
