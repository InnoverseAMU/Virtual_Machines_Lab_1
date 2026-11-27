import { findMeterReading, isSupplySwitchOn } from '../physics/evaluate';
import { getRowNumber } from '../physics/report';
import type {
  ObserveReadyContext,
  ObserveReadyStatus,
  ObserveStep,
  StageDef,
} from '../types';

function readMeter(ctx: ObserveReadyContext, meterId: string): number {
  return findMeterReading(ctx.output, meterId)?.shownValue ?? 0;
}

function supplyCheck(ctx: ObserveReadyContext): ObserveReadyStatus | null {
  if (!isSupplySwitchOn(ctx.controls) || !ctx.energised) {
    return {
      ready: false,
      statusText: 'Switch the supply MCB ON to energise the circuit first.',
      recorded: false,
    };
  }
  return null;
}

function dualCaptureCheck(ctx: ObserveReadyContext): ObserveReadyStatus | null {
  if (!ctx.dualReady) {
    return {
      ready: false,
      statusText:
        'Capture both wattmeter readings (W1 on B, then switch to C for W2) in the Two-Reading Capture bar before adding the row.',
      recorded: false,
    };
  }
  return null;
}

function makeEx31Steps(): ObserveStep[] {
  const loadTargets: Array<{
    lamps: number;
    which: string;
    why: string;
    when: string;
    isNoLoad?: boolean;
    isRated?: boolean;
  }> = [
    {
      lamps: 0,
      isNoLoad: true,
      which: 'No-load observation (0 lamps, I2 = 0 A)',
      why: 'Measures no-load secondary voltage V20 (needed for voltage regulation) and no-load input power P0 (nearly all core/iron loss).',
      when: 'When the 230 V supply is ON, all lamps are OFF (0 lamps), and primary voltmeter Vp is set to 230 ± 2 V.',
    },
    {
      lamps: 2,
      which: 'Light-load observation (2 lamps)',
      why: 'Captures the first loaded operating point so you can see V2 begin to drop and efficiency rise rapidly from zero.',
      when: 'When 2 lamps are ON and the autotransformer knob is re-adjusted to hold Vp at 230 ± 2 V.',
    },
    {
      lamps: 4,
      which: 'Low-to-medium load observation (4 lamps)',
      why: 'Traces the rising efficiency curve as output power grows faster than the fixed core loss.',
      when: 'When 4 lamps are ON and Vp is re-adjusted to 230 ± 2 V.',
    },
    {
      lamps: 6,
      which: 'Half-load observation (6 lamps)',
      why: 'Near half-load, copper loss approaches iron loss and transformer efficiency nears its maximum.',
      when: 'When 6 lamps are ON and Vp is re-adjusted to 230 ± 2 V.',
    },
    {
      lamps: 8,
      which: 'Heavy-load observation (8 lamps)',
      why: 'Shows how increasing I^2R copper loss starts to flatten and turn the efficiency curve.',
      when: 'When 8 lamps are ON and Vp is re-adjusted to 230 ± 2 V.',
    },
    {
      lamps: 10,
      isRated: true,
      which: 'Near-rated load observation (10 lamps, I2 ≈ 15–19 A)',
      why: 'Gives full-load secondary voltage V2,FL (for voltage regulation) and completes the efficiency vs. load curve up to ~2000 VA.',
      when: 'When 9–11 lamps are ON (I2 between 15 and 19 A) and Vp is held at 230 ± 2 V.',
    },
  ];

  return loadTargets.map((item, idx) => ({
    id: `ex31-obs-${idx + 1}`,
    which: item.which,
    why: item.why,
    when: item.when,
    camera: item.isNoLoad ? 'meters' : 'load',
    steps: [
      idx === 0
        ? 'Switch the 230 V AC Supply MCB ON.'
        : `Set Lamp Bank Load to ${item.lamps} lamps.`,
      item.isNoLoad
        ? 'Ensure Lamp Bank Load is at 0 lamps.'
        : 'Re-adjust the Autotransformer Knob to compensate supply sag so Vp = 230 ± 2 V.',
      item.isNoLoad
        ? 'Adjust the Autotransformer Knob until Vp reads 230 ± 2 V.'
        : 'Wait for meters to settle, then click "+ Add row" to record this load step.',
      ...(item.isNoLoad
        ? ['Click "+ Add row" below to record the no-load observation.']
        : []),
    ],
    evaluateReady: (ctx) => {
      const recorded = item.isNoLoad
        ? ctx.rows.some((r) => getRowNumber(r, 'i2') <= 0.1)
        : item.isRated
          ? ctx.rows.some((r) => {
              const i2 = getRowNumber(r, 'i2');
              return (
                i2 >= 15 &&
                i2 <= 19 &&
                Math.abs(getRowNumber(r, 'v1') - 230) <= 2
              );
            })
          : ctx.rows.some(
              (r) =>
                Math.abs(getRowNumber(r, 'lamps') - item.lamps) <= 0.5 &&
                Math.abs(getRowNumber(r, 'v1') - 230) <= 2,
            );

      const sup = supplyCheck(ctx);
      if (sup) return { ...sup, recorded };

      const lamps = Number(ctx.controls['ld.lamps'] ?? 0);
      const vp = readMeter(ctx, 'vp');
      const i2 = readMeter(ctx, 'am');
      const lampsOk = item.isRated
        ? i2 >= 15 && i2 <= 19
        : lamps === item.lamps;
      const vOk = Math.abs(vp - 230) <= 2;

      if (!lampsOk) {
        return {
          ready: false,
          recorded,
          statusText: item.isRated
            ? `Increase lamps (around 9–11) so I2 is 15–19 A (currently ${i2.toFixed(2)} A).`
            : `Set Lamp Bank Load to ${item.lamps} lamps (currently ${lamps}).`,
        };
      }
      if (!vOk) {
        return {
          ready: false,
          recorded,
          statusText: `Adjust Autotransformer Knob until Vp = 230 ± 2 V (currently ${vp.toFixed(1)} V).`,
        };
      }
      return {
        ready: true,
        recorded,
        statusText: `Ready: Vp = ${vp.toFixed(1)} V at ${lamps} lamps (I2 = ${i2.toFixed(2)} A). Click "+ Add row" to record.`,
      };
    },
  }));
}

function makeEx32Steps(stageId: string): ObserveStep[] {
  if (stageId === 'oc-test') {
    return [
      {
        id: 'ex32-oc-1',
        which: 'Open-circuit observation at rated LV voltage (Vo = 115 V)',
        why: 'Measures no-load current I0 and core (iron) loss W0 at rated flux with the HV side open, used to compute shunt parameters R0 and X0.',
        when: 'When the 230 V Supply MCB is ON and the LV voltmeter Vo reads 115 ± 2 V.',
        camera: 'meters',
        steps: [
          'Switch the 230 V AC Supply MCB ON.',
          'Slowly raise the Autotransformer Knob until the LV voltmeter (Vo) reads 115 ± 2 V.',
          'Check I0 and W0 on the meters, then click "+ Add row" to record the OC reading.',
        ],
        evaluateReady: (ctx) => {
          const recorded = ctx.rows.some(
            (r) => Math.abs(getRowNumber(r, 'vo') - 115) <= 2,
          );
          const sup = supplyCheck(ctx);
          if (sup) return { ...sup, recorded };
          const vo = readMeter(ctx, 'vm');
          const vOk = Math.abs(vo - 115) <= 2;
          return {
            ready: vOk,
            recorded,
            statusText: vOk
              ? `Ready: Vo = ${vo.toFixed(1)} V. Click "+ Add row" to record the OC observation.`
              : `Adjust Autotransformer Knob until Vo = 115 ± 2 V (currently ${vo.toFixed(1)} V).`,
          };
        },
      },
    ];
  }

  // sc-test
  const fractions = [
    { pct: 25, targetA: 8.7 * 0.25 },
    { pct: 50, targetA: 8.7 * 0.5 },
    { pct: 75, targetA: 8.7 * 0.75 },
    { pct: 100, targetA: 8.7 },
  ];
  return fractions.map((f, idx) => ({
    id: `ex32-sc-${f.pct}`,
    which: `Short-circuit observation at ${f.pct}% rated current (~${f.targetA.toFixed(2)} A)`,
    why:
      f.pct === 100
        ? 'Measures full-load copper loss Wsc and equivalent impedance Zeq at rated HV current (8.70 A) with the LV winding shorted.'
        : `Records short-circuit voltage, current, and power at ${f.pct}% rated current to verify impedance linearity and copper-loss scaling (I^2R).`,
    when: `When the Supply MCB is ON and the HV ammeter Isc reads ${f.targetA.toFixed(2)} A (±8%).`,
    camera: 'meters',
    steps: [
      ...(idx === 0 ? ['Switch the 230 V AC Supply MCB ON.'] : []),
      `Gently adjust the Autotransformer Knob (use fine 0.1 V steps) until Isc reads ~${f.targetA.toFixed(2)} A.`,
      'Click "+ Add row" to record this short-circuit step.',
    ],
    evaluateReady: (ctx) => {
      const tol = f.targetA * 0.08;
      const recorded = ctx.rows.some(
        (r) => Math.abs(getRowNumber(r, 'isc') - f.targetA) <= tol,
      );
      const sup = supplyCheck(ctx);
      if (sup) return { ...sup, recorded };
      const isc = readMeter(ctx, 'am');
      const ok = Math.abs(isc - f.targetA) <= tol;
      return {
        ready: ok,
        recorded,
        statusText: ok
          ? `Ready: Isc = ${isc.toFixed(2)} A (${f.pct}% rated). Click "+ Add row" to record.`
          : `Adjust Autotransformer Knob until Isc ≈ ${f.targetA.toFixed(2)} ± ${tol.toFixed(2)} A (currently ${isc.toFixed(2)} A).`,
      };
    },
  }));
}

function makeEx33Steps(stageId: string): ObserveStep[] {
  if (stageId === 'primary-test') {
    return [
      {
        id: 'ex33-pri-1',
        which: 'Primary iron-loss & polarity observation (Vp = 230 V, Vpol < 5 V)',
        why: 'Verifies secondary series-opposition (Vpol < 5 V so no circulating current flows) and measures combined core loss (2·Pi) of both transformers.',
        when: 'When primary supply sup is ON, Vp = 230 ± 2 V, and polarity voltmeter Vpol < 5 V.',
        camera: 'meters',
        steps: [
          'Switch the Primary 230 V AC Supply MCB ON.',
          'Adjust Primary Autotransformer (vaP) until Vp reads 230 ± 2 V.',
          'Confirm Vpol < 5 V (opposition join), then click "+ Add row" to record the primary reading.',
        ],
        evaluateReady: (ctx) => {
          const recorded = ctx.rows.some(
            (r) =>
              Math.abs(getRowNumber(r, 'vp') - 230) <= 2 &&
              getRowNumber(r, 'vpol') < 5,
          );
          const sup = supplyCheck(ctx);
          if (sup) return { ...sup, recorded };
          const vp = readMeter(ctx, 'vp');
          const vpol = readMeter(ctx, 'vpol');
          const vOk = Math.abs(vp - 230) <= 2;
          const polOk = vpol < 5;
          return {
            ready: vOk && polOk,
            recorded,
            statusText: !vOk
              ? `Adjust vaP until Vp = 230 ± 2 V (currently ${vp.toFixed(1)} V).`
              : !polOk
                ? `Polarity check Vpol must be < 5 V (currently ${vpol.toFixed(1)} V).`
                : `Ready: Vp = ${vp.toFixed(1)} V, Vpol = ${vpol.toFixed(1)} V. Click "+ Add row".`,
          };
        },
      },
    ];
  }

  // secondary-test
  const fractions = [
    { pct: 25, targetA: 17.39 * 0.25 },
    { pct: 50, targetA: 17.39 * 0.5 },
    { pct: 75, targetA: 17.39 * 0.75 },
    { pct: 100, targetA: 17.39 },
  ];
  return fractions.map((f, idx) => ({
    id: `ex33-sec-${f.pct}`,
    which: `Secondary circulating-current observation at ${f.pct}% rated LV current (~${f.targetA.toFixed(2)} A)`,
    why:
      f.pct === 100
        ? 'Measures full-load combined copper loss (2·Pc) at rated 17.39 A without needing a real 4 kVA load.'
        : `Records secondary power and impedance at ${f.pct}% rated current while primaries remain energised at 230 V.`,
    when: `When both supplies are ON, primary Vp is held at 230 ± 2 V, and secondary ammeter Is reads ~${f.targetA.toFixed(2)} A (±8%).`,
    camera: 'meters',
    steps: [
      ...(idx === 0
        ? [
            'Ensure Primary Supply (sup) is ON with Vp = 230 V, and switch Secondary Supply (supS) ON.',
          ]
        : []),
      `Adjust Secondary Autotransformer (vaS) until Is reads ~${f.targetA.toFixed(2)} A.`,
      'Confirm primary Vp is still 230 ± 2 V, then click "+ Add row" to record.',
    ],
    evaluateReady: (ctx) => {
      const tol = f.targetA * 0.08;
      const recorded = ctx.rows.some(
        (r) =>
          Math.abs(getRowNumber(r, 'is') - f.targetA) <= tol &&
          Math.abs(getRowNumber(r, 'vp') - 230) <= 2,
      );
      const sup = supplyCheck(ctx);
      if (sup) return { ...sup, recorded };
      const secOn = Boolean(ctx.controls['supS.switch']);
      if (!secOn) {
        return {
          ready: false,
          recorded,
          statusText: 'Switch the Secondary Supply (supS) ON to inject circulating current.',
        };
      }
      const vp = readMeter(ctx, 'vp');
      const isVal = readMeter(ctx, 'as');
      const vOk = Math.abs(vp - 230) <= 2;
      const iOk = Math.abs(isVal - f.targetA) <= tol;
      return {
        ready: vOk && iOk,
        recorded,
        statusText: !vOk
          ? `Keep primary Vp at 230 ± 2 V using vaP (currently ${vp.toFixed(1)} V).`
          : !iOk
            ? `Adjust vaS until Is ≈ ${f.targetA.toFixed(2)} ± ${tol.toFixed(2)} A (currently ${isVal.toFixed(2)} A).`
            : `Ready: Vp = ${vp.toFixed(1)} V, Is = ${isVal.toFixed(2)} A. Click "+ Add row".`,
      };
    },
  }));
}

function makeEx34Steps(stageId: string): ObserveStep[] {
  if (stageId === 'polarity-test') {
    return [
      {
        id: 'ex34-pol-1',
        which: 'Polarity check observation (V1 = 230 V, Vpol < 5 V)',
        why: 'Verifies both transformers have identical polarity before paralleling their secondaries, preventing a dead short circuit.',
        when: 'When Supply MCB is ON, V1 = 230 ± 2 V, and Vpol < 5 V.',
        camera: 'meters',
        steps: [
          'Switch the 230 V AC Supply MCB ON.',
          'Adjust the Autotransformer Knob until V1 reads 230 ± 2 V.',
          'Verify Vpol < 5 V, then click "+ Add row" to record the polarity check.',
        ],
        evaluateReady: (ctx) => {
          const recorded = ctx.rows.some(
            (r) =>
              Math.abs(getRowNumber(r, 'v1') - 230) <= 2 &&
              getRowNumber(r, 'vpol') < 5,
          );
          const sup = supplyCheck(ctx);
          if (sup) return { ...sup, recorded };
          const vp = readMeter(ctx, 'vp');
          const vpol = readMeter(ctx, 'vpol');
          const ok = Math.abs(vp - 230) <= 2 && vpol < 5;
          return {
            ready: ok,
            recorded,
            statusText: ok
              ? `Ready: V1 = ${vp.toFixed(1)} V, Vpol = ${vpol.toFixed(1)} V. Click "+ Add row".`
              : `Set V1 = 230 ± 2 V (currently ${vp.toFixed(1)} V) and verify Vpol < 5 V.`,
          };
        },
      },
    ];
  }

  // parallel-load
  return [
    {
      id: 'ex34-load-0',
      which: 'No-load parallel observation (0 lamps)',
      why: 'Records any no-load circulating current between Transformer A and Transformer B when secondary load is zero.',
      when: 'When Supply MCB is ON, Lamps = 0, and V1 = 230 ± 2 V.',
      camera: 'meters',
      steps: [
        'Switch the 230 V AC Supply MCB ON with Lamps = 0.',
        'Set Autotransformer Knob so V1 reads 230 ± 2 V.',
        'Click "+ Add row" to record the no-load parallel reading.',
      ],
      evaluateReady: (ctx) => {
        const recorded = ctx.rows.some((r) => getRowNumber(r, 'iL') <= 0.2);
        const sup = supplyCheck(ctx);
        if (sup) return { ...sup, recorded };
        const lamps = Number(ctx.controls['ld.lamps'] ?? 0);
        const vp = readMeter(ctx, 'vp');
        const ok = lamps === 0 && Math.abs(vp - 230) <= 2;
        return {
          ready: ok,
          recorded,
          statusText: ok
            ? `Ready: No-load at V1 = ${vp.toFixed(1)} V. Click "+ Add row".`
            : lamps !== 0
              ? `Set Lamps to 0 for no-load (currently ${lamps}).`
              : `Adjust Variac so V1 = 230 ± 2 V (currently ${vp.toFixed(1)} V).`,
        };
      },
    },
    {
      id: 'ex34-load-1',
      which: 'Loaded parallel-sharing observations (increase load in steps)',
      why: 'Observes how total load current IL splits between IA and IB according to the transformers’ impedances.',
      when: 'When load is applied (lamps/rheostat) and V1 is re-adjusted to 230 ± 2 V.',
      camera: 'load',
      steps: [
        'Increase Lamp Load (e.g., 4, 8, 12 lamps) and optionally adjust the Rheostat.',
        'Re-adjust the Autotransformer Knob to hold V1 = 230 ± 2 V.',
        'Click "+ Add row" at each load step (record at least 4–5 loaded rows).',
      ],
      evaluateReady: (ctx) => {
        const loadedCount = ctx.rows.filter(
          (r) => getRowNumber(r, 'iL') > 0.2,
        ).length;
        const recorded = loadedCount >= 4;
        const sup = supplyCheck(ctx);
        if (sup) return { ...sup, recorded };
        const vp = readMeter(ctx, 'vp');
        const iL = readMeter(ctx, 'amL');
        const ok = iL > 0.2 && Math.abs(vp - 230) <= 2;
        return {
          ready: ok,
          recorded,
          statusText: ok
            ? `Ready: IL = ${iL.toFixed(2)} A at V1 = ${vp.toFixed(1)} V (${loadedCount} loaded rows recorded). Click "+ Add row".`
            : iL <= 0.2
              ? 'Switch on lamps (or adjust rheostat) to apply secondary load.'
              : `Re-adjust Variac so V1 = 230 ± 2 V (currently ${vp.toFixed(1)} V).`,
        };
      },
    },
  ];
}

function makeEx35Steps(stageId: string): ObserveStep[] {
  const map: Record<string, { which: string; why: string; step: string }> = {
    'identify-pairs': {
      which: 'Half-winding probe observation (~57.5 V at Vpri = 230 V)',
      why: 'Confirms each isolated secondary half-winding produces ~57.5 V so you can verify the 6 winding pairs.',
      step: 'Clip Red (+) and Black (-) probe leads across a winding pair reading ~57.5 V, then click "+ Add row".',
    },
    'group-phases': {
      which: 'Series-connected phase-group probe observation',
      why: 'Records the series voltage (~115 V aiding or 0 V opposing for same-phase; ~57.5 V or ~99.6 V for different phases).',
      step: 'Clip probe leads across the series combination, then click "+ Add row".',
    },
    'star-connection': {
      which: 'Star (Y) secondary phase & line voltage observation',
      why: 'Verifies the Star relation VL = √3 · Vph (~199.2 V line-to-line vs. ~115 V phase-to-neutral).',
      step: 'Probe a line-to-line or phase-to-neutral pair, then click "+ Add row".',
    },
    'delta-connection': {
      which: 'Delta (Δ) secondary voltage observation',
      why: 'Verifies that in Delta connection, line voltage equals phase voltage (VL = Vph ≈ 115 V) and loop residual ≈ 0 V.',
      step: 'Probe across a delta phase/line pair, then click "+ Add row".',
    },
    'zigzag-connection': {
      which: 'Zig-Zag (Interconnected Star) voltage observation',
      why: 'Verifies Zig-Zag vector addition where line-to-neutral is √3 · 57.5 ≈ 99.6 V and line-to-line is √3 · 99.6 ≈ 172.5 V.',
      step: 'Probe a Zig-Zag phase or line pair, then click "+ Add row".',
    },
  };
  const info = map[stageId] ?? map['star-connection'];
  return [
    {
      id: `ex35-${stageId}-1`,
      which: info.which,
      why: info.why,
      when: 'When the 3φ Supply MCB is ON and the 3φ Autotransformer is set to 230 ± 3 V.',
      camera: 'meters',
      steps: [
        'Switch the 3φ Supply MCB ON.',
        'Adjust the 3φ Autotransformer Knob until Vpri = 230 ± 3 V.',
        info.step,
      ],
      evaluateReady: (ctx) => {
        const recorded = ctx.rows.some((r) => {
          const v = getRowNumber(r, 'va3V');
          return v >= 227 && v <= 233;
        });
        const sup = supplyCheck(ctx);
        if (sup) return { ...sup, recorded };
        const va3 = Number(ctx.controls['va3.knob'] ?? 0);
        const ok = va3 >= 227 && va3 <= 233;
        return {
          ready: ok,
          recorded,
          statusText: ok
            ? `Ready: 3φ Variac at ${va3.toFixed(1)} V. Click "+ Add row" to record.`
            : `Set 3φ Autotransformer Knob to 230 ± 3 V (currently ${va3.toFixed(1)} V).`,
        };
      },
    },
  ];
}

function makeEx36Steps(stageId: string): ObserveStep[] {
  if (stageId === 'three-to-six') {
    return [
      {
        id: 'ex36-s1-1',
        which: '3φ → 6φ diametrical voltage observation (230 V primary)',
        why: 'Verifies six-phase 60° star/diametrical voltage relationships (Va1b1 ≈ 115 V, opposite pairs ≈ 230 V).',
        when: 'When 3φ Supply MCB is ON and 3φ Autotransformer is set to 230 ± 3 V.',
        camera: 'meters',
        steps: [
          'Switch the 3φ Supply MCB ON and set 3φ Variac to 230 ± 3 V.',
          'Optionally probe secondary terminal pairs to inspect 60°/120°/180° voltages.',
          'Click "+ Add row" to record the 3φ → 6φ observation.',
        ],
        evaluateReady: (ctx) => {
          const recorded = ctx.rows.some((r) => {
            const v = getRowNumber(r, 'va3V');
            return v >= 227 && v <= 233;
          });
          const sup = supplyCheck(ctx);
          if (sup) return { ...sup, recorded };
          const va3 = Number(ctx.controls['va3.knob'] ?? 0);
          const ok = va3 >= 227 && va3 <= 233;
          return {
            ready: ok,
            recorded,
            statusText: ok
              ? `Ready: Vpri = ${va3.toFixed(1)} V. Click "+ Add row" to record.`
              : `Set 3φ Variac to 230 ± 3 V (currently ${va3.toFixed(1)} V).`,
          };
        },
      },
    ];
  }

  if (stageId === 'three-to-one') {
    return [
      {
        id: 'ex36-s2-1',
        which: '3φ → 1φ open-delta probe observations (all 12 pairs at 230 V)',
        why: 'Measures all 12 terminal-pair voltages to verify the 3φ-to-1φ phasor polygon (resultant Va1c1 = 2·Vp ≈ 230 V).',
        when: 'When 3φ Supply MCB is ON, 3φ Variac is at 230 ± 3 V, and probe leads are clipped across a required pair.',
        camera: 'transformer',
        steps: [
          'Switch the 3φ Supply MCB ON and set 3φ Variac to 230 ± 3 V.',
          'Select Red (+) and Black (-) probe leads and click two secondary terminals.',
          'Click "+ Add row" for each pair until all 12 pairs are recorded.',
        ],
        evaluateReady: (ctx) => {
          const recorded = ctx.rows.length >= 12;
          const sup = supplyCheck(ctx);
          if (sup) return { ...sup, recorded };
          const va3 = Number(ctx.controls['va3.knob'] ?? 0);
          const pA = String(ctx.controls['probe.a'] ?? '');
          const pB = String(ctx.controls['probe.b'] ?? '');
          const vOk = va3 >= 227 && va3 <= 233;
          const probeOk = Boolean(pA && pB && pA !== pB);
          return {
            ready: vOk && probeOk,
            recorded,
            statusText: !vOk
              ? `Set 3φ Variac to 230 ± 3 V (currently ${va3.toFixed(1)} V).`
              : !probeOk
                ? 'Clip both Red (+) and Black (-) probe leads onto distinct terminals.'
                : `Ready (${ctx.rows.length}/12 rows recorded). Click "+ Add row" for this pair.`,
          };
        },
      },
    ];
  }

  // three-to-two-scott
  return [
    {
      id: 'ex36-s3-1',
      which: 'Scott (3φ → 2φ) voltage observation (Va1b1 ≈ 162.6 V at 230 V)',
      why: 'Confirms 90° two-phase quadrature output (Va1b1 = √2 × 115 ≈ 162.6 V) from the main and √3/2 teaser transformers.',
      when: 'When 3φ Supply MCB is ON and 3φ Autotransformer is set to 230 ± 3 V.',
      camera: 'meters',
      steps: [
        'Switch the 3φ Supply MCB ON and set 3φ Variac to 230 ± 3 V.',
        'Click "+ Add row" to record the Scott connection voltages (VA1A2 ≈ 199.2 V, Va1b1 ≈ 162.6 V).',
      ],
      evaluateReady: (ctx) => {
        const recorded = ctx.rows.some((r) => {
          const v = getRowNumber(r, 'va3V');
          return v >= 227 && v <= 233;
        });
        const sup = supplyCheck(ctx);
        if (sup) return { ...sup, recorded };
        const va3 = Number(ctx.controls['va3.knob'] ?? 0);
        const ok = va3 >= 227 && va3 <= 233;
        return {
          ready: ok,
          recorded,
          statusText: ok
            ? `Ready: Vpri = ${va3.toFixed(1)} V. Click "+ Add row" to record.`
            : `Set 3φ Variac to 230 ± 3 V (currently ${va3.toFixed(1)} V).`,
        };
      },
    },
  ];
}

function makeEx41Steps(): ObserveStep[] {
  const stepsConfig = [
    {
      id: 'ex41-rated',
      which: '1st observation: Rated full-load (~5.93 A at 230 V)',
      why: 'Establishes rated full-load torque, slip, power factor, and efficiency; the experiment requires starting at rated current.',
      when: 'When 3φ Supply ON, V = 230 ± 5 V, brake load adjusted so I ≈ 5.93 A (±4%), and both W1 (B) & W2 (C) are captured.',
      targetI: 5.93,
      isFirstRated: true,
    },
    {
      id: 'ex41-step-2',
      which: '2nd–5th observations: Decreasing brake load steps',
      why: 'Traces speed, slip, torque, power factor, and efficiency as mechanical brake load is reduced step by step.',
      when: 'At each reduced brake load with V = 230 ± 5 V and both W1 (on B) & W2 (on C) captured.',
      targetI: null,
    },
    {
      id: 'ex41-noload',
      which: 'Final observation: No-load (belt released, load = 0)',
      why: 'Measures no-load current, near-synchronous speed (~1500 rpm), and no-load losses to complete all ≥ 6 rows.',
      when: 'When brake load is 0 (belt released), V = 230 ± 5 V, and both W1 & W2 are captured.',
      targetI: 0,
      isNoLoad: true,
    },
  ];

  return stepsConfig.map((cfg) => ({
    id: cfg.id,
    which: cfg.which,
    why: cfg.why,
    when: cfg.when,
    camera: 'meters',
    steps: [
      'Ensure 3φ Supply MCB is ON and 3φ Autotransformer is at 230 ± 5 V.',
      cfg.isFirstRated
        ? 'Adjust Brake Load until line current I reads ~5.93 A (±4%).'
        : cfg.isNoLoad
          ? 'Release the Brake Load to 0 (no load).'
          : 'Reduce Brake Load by one step (repeat for 4 intermediate steps).',
      'In the Two-Reading Capture bar, click "Capture W1" on B, switch selector to C, and click "Capture W2".',
      'Click "+ Add row" to record the observation.',
    ],
    evaluateReady: (ctx) => {
      const recorded = cfg.isFirstRated
        ? ctx.rows.length > 0 &&
          Math.abs(getRowNumber(ctx.rows[0], 'I') - 5.93) <= 5.93 * 0.04
        : cfg.isNoLoad
          ? ctx.rows.length >= 6 &&
            ctx.rows.some((r) => getRowNumber(r, 'loadF') <= 0.05)
          : ctx.rows.length >= 5;

      const sup = supplyCheck(ctx);
      if (sup) return { ...sup, recorded };

      const vm = readMeter(ctx, 'vm');
      const am = readMeter(ctx, 'am');
      const loadF = Number(ctx.controls['motor.loadF'] ?? 0);
      if (Math.abs(vm - 230) > 5) {
        return {
          ready: false,
          recorded,
          statusText: `Set 3φ Autotransformer to 230 ± 5 V (currently ${vm.toFixed(1)} V).`,
        };
      }
      if (cfg.isFirstRated && Math.abs(am - 5.93) > 5.93 * 0.04) {
        return {
          ready: false,
          recorded,
          statusText: `Adjust Brake Load until I = 5.93 A ± 4% (currently ${am.toFixed(2)} A).`,
        };
      }
      if (cfg.isNoLoad && loadF > 0.05) {
        return {
          ready: false,
          recorded,
          statusText: `Release Brake Load to 0 for no-load (currently ${loadF.toFixed(2)}).`,
        };
      }
      const dual = dualCaptureCheck(ctx);
      if (dual) return { ...dual, recorded };

      return {
        ready: true,
        recorded,
        statusText: `Ready: V = ${vm.toFixed(1)} V, I = ${am.toFixed(2)} A, W1 & W2 captured. Click "+ Add row".`,
      };
    },
  }));
}

function makeEx42Steps(stageId: string): ObserveStep[] {
  if (stageId === 'dc-test') {
    return [
      {
        id: 'ex42-dc-1',
        which: 'DC stator resistance observation (2.0 A ≤ Idc ≤ 5.93 A)',
        why: 'Measures DC voltage and current across two stator terminals (Rdc = Vdc/Idc) to compute per-phase stator resistance R1 = Rdc/2.',
        when: 'When DC Supply MCB is ON and potential divider pot.p is adjusted so Idc is between 2.0 A and 5.93 A.',
        camera: 'meters',
        steps: [
          'Switch the 230 V DC Supply MCB ON.',
          'Adjust Potential Divider Slider (pot.p) until DC Ammeter reads between 2.0 A and 5.93 A.',
          'Click "+ Add row" to record the DC stator resistance reading.',
        ],
        evaluateReady: (ctx) => {
          const recorded = ctx.rows.some((r) => {
            const i = getRowNumber(r, 'Idc');
            return i >= 2.0 && i <= 5.98;
          });
          const sup = supplyCheck(ctx);
          if (sup) return { ...sup, recorded };
          const idc = readMeter(ctx, 'dcAmmeter');
          const ok = idc >= 2.0 && idc <= 5.98;
          return {
            ready: ok,
            recorded,
            statusText: ok
              ? `Ready: Idc = ${idc.toFixed(2)} A. Click "+ Add row" to record.`
              : `Adjust pot.p until 2.0 A ≤ Idc ≤ 5.93 A (currently ${idc.toFixed(2)} A).`,
          };
        },
      },
    ];
  }

  // noload-blocked
  return [
    {
      id: 'ex42-nl-1',
      which: 'No-load motor observation (Rotor Lock Pin OFF, V = 230 V)',
      why: 'Measures no-load current, power (core + friction/windage loss), and magnetising branch parameters (Rc, Xm).',
      when: 'When 3φ Supply ON, Rotor Lock Pin OFF, V = 230 ± 5 V, and both W1 (REV ON if negative) & W2 are captured.',
      camera: 'meters',
      steps: [
        'Ensure Rotor Lock Pin is OFF and switch 3φ Supply MCB ON.',
        'Raise 3φ Autotransformer Knob to 230 ± 5 V.',
        'Capture W1 (on B, toggle REV ON if negative) and W2 (on C) in Two-Reading Capture, then click "+ Add row".',
      ],
      evaluateReady: (ctx) => {
        const recorded = ctx.rows.some(
          (r) =>
            !r.values?.rotorBlocked &&
            Math.abs(getRowNumber(r, 'V') - 230) <= 5,
        );
        const sup = supplyCheck(ctx);
        if (sup) return { ...sup, recorded };
        if (ctx.controls['motor.rotorBlocked']) {
          return {
            ready: false,
            recorded,
            statusText: 'Turn Rotor Lock Pin OFF for the no-load test.',
          };
        }
        const vm = readMeter(ctx, 'vm');
        if (Math.abs(vm - 230) > 5) {
          return {
            ready: false,
            recorded,
            statusText: `Set 3φ Autotransformer to 230 ± 5 V (currently ${vm.toFixed(1)} V).`,
          };
        }
        const dual = dualCaptureCheck(ctx);
        if (dual) return { ...dual, recorded };
        return {
          ready: true,
          recorded,
          statusText: `Ready: No-load at ${vm.toFixed(1)} V with W1 & W2 captured. Click "+ Add row".`,
        };
      },
    },
    {
      id: 'ex42-br-1',
      which: 'Blocked-rotor observation (Rotor Lock Pin ON, up to ~5.93 A)',
      why: 'With rotor locked (slip s = 1), measures blocked-rotor impedance Zbr and equivalent resistance/reactance (Req, Xbr).',
      when: 'When Rotor Lock Pin is ON, va3 is raised gently so I is near rated current (e.g. 25–100% of 5.93 A), and both W1 & W2 are captured.',
      camera: 'meters',
      steps: [
        'Turn Rotor Lock Pin ON (lower va3 first if needed so current stays safe).',
        'Gently raise 3φ Autotransformer Knob until line current reaches ~4–6 A (do not exceed ~6 A).',
        'Capture W1 (on B) and W2 (on C) in Two-Reading Capture, then click "+ Add row".',
      ],
      evaluateReady: (ctx) => {
        const recorded = ctx.rows.some(
          (r) =>
            Boolean(r.values?.rotorBlocked) &&
            getRowNumber(r, 'I') >= 1.4,
        );
        const sup = supplyCheck(ctx);
        if (sup) return { ...sup, recorded };
        if (!ctx.controls['motor.rotorBlocked']) {
          return {
            ready: false,
            recorded,
            statusText: 'Turn Rotor Lock Pin ON for the blocked-rotor test.',
          };
        }
        const am = readMeter(ctx, 'am');
        if (am < 1.4) {
          return {
            ready: false,
            recorded,
            statusText: `Gently raise va3 until I ≥ 1.5 A (currently ${am.toFixed(2)} A).`,
          };
        }
        const dual = dualCaptureCheck(ctx);
        if (dual) return { ...dual, recorded };
        return {
          ready: true,
          recorded,
          statusText: `Ready: Blocked-rotor I = ${am.toFixed(2)} A with W1 & W2 captured. Click "+ Add row".`,
        };
      },
    },
  ];
}

export function getObserveSteps(
  experimentId: string,
  stage: StageDef,
): ObserveStep[] {
  switch (experimentId) {
    case 'ex3.1':
      return makeEx31Steps();
    case 'ex3.2':
      return makeEx32Steps(stage.id);
    case 'ex3.3':
      return makeEx33Steps(stage.id);
    case 'ex3.4':
      return makeEx34Steps(stage.id);
    case 'ex3.5':
      return makeEx35Steps(stage.id);
    case 'ex3.6':
      return makeEx36Steps(stage.id);
    case 'ex4.1':
      return makeEx41Steps();
    case 'ex4.2':
      return makeEx42Steps(stage.id);
    default:
      return [
        {
          id: `${experimentId}-${stage.id}-obs`,
          which: `${stage.title} observation`,
          why: stage.summary,
          when: 'When the supply is ON and the circuit is energised at the target operating point.',
          steps: [
            'Switch the supply ON and adjust the controls to the required operating point.',
            'Click "+ Add row" to record the observation.',
          ],
          evaluateReady: (ctx) => {
            const recorded = ctx.rows.length > 0;
            const sup = supplyCheck(ctx);
            if (sup) return { ...sup, recorded };
            const dual = dualCaptureCheck(ctx);
            if (dual) return { ...dual, recorded };
            return {
              ready: true,
              recorded,
              statusText: 'Ready: Circuit energised. Click "+ Add row" to record.',
            };
          },
        },
      ];
  }
}
