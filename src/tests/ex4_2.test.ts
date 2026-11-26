import { beforeEach, describe, expect, it } from 'vitest';
import { wiresFromNetlist } from '../core/circuit/nets';
import { getStage } from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { ex4_2 } from '../core/experiments/ex4_2';
import { evaluateExperimentPhysics, findMeterReading } from '../core/physics/evaluate';
import { DEFAULT_IM3PH_PARAMS } from '../core/physics/motors/im3ph';
import { captureStageObservationRow, evaluateStagePrerequisites } from '../core/physics/report';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { referenceRun } from './helpers/referenceRun';

const STAGE_DC = getStage(ex4_2, 0);
const DC_WIRES = wiresFromNetlist(STAGE_DC.acceptedNetlists[0], []);

const STAGE_AC = getStage(ex4_2, 1);
const AC_WIRES = wiresFromNetlist(STAGE_AC.acceptedNetlists[0], []);

const ZERO_GAINS = {
  dcVoltmeter: 0,
  dcAmmeter: 0,
  wm: 0,
  vm: 0,
  am: 0,
  tacho: 0,
};

describe('Experiment 4.2: No-load, blocked-rotor & DC tests of 3-phase induction motor', () => {
  beforeEach(() => {
    useSessionStore.getState().selectExperiment('ex4.2');
  });

  it('Stage 1 DC test solves divider physics, flags overcurrent above 5.93 A, and trips/damages above 2x rated', () => {
    // At p = 0.50: Rm = (2/3)*(4.0/1.15) = 2.31884 ohm -> Vdc = 9.754 V, Idc = 4.206 A
    const midRes = evaluateExperimentPhysics(
      ex4_2,
      DC_WIRES,
      { 'dcSupply.switch': true, 'pot.p': 0.5 },
      ZERO_GAINS,
      { stageIndex: 0 },
    );
    expect(midRes.output.mcbTripped).toBe(false);
    const vdc = findMeterReading(midRes.output, 'dcVoltmeter')?.shownValue ?? 0;
    const idc = findMeterReading(midRes.output, 'dcAmmeter')?.shownValue ?? 0;
    expect(vdc).toBeCloseTo(9.75, 1);
    expect(idc).toBeCloseTo(4.21, 1);
    expect(1.15 * 1.5 * (vdc / idc)).toBeCloseTo(DEFAULT_IM3PH_PARAMS.r1, 1);

    // Overcurrent warning above rated 5.93 A (at p = 0.70, Idc ≈ 6.97 A)
    const warnRes = evaluateExperimentPhysics(
      ex4_2,
      DC_WIRES,
      { 'dcSupply.switch': true, 'pot.p': 0.7 },
      ZERO_GAINS,
      { stageIndex: 0 },
    );
    expect(warnRes.output.mcbTripped).toBe(false);
    expect(warnRes.output.events.some((e) => e.id === 'dc-overcurrent' && e.severity === 'warning')).toBe(true);

    // Severe overcurrent (> 2 * 5.93 = 11.86 A) damages divider and trips MCB (at p = 0.90)
    const tripRes = evaluateExperimentPhysics(
      ex4_2,
      DC_WIRES,
      { 'dcSupply.switch': true, 'pot.p': 0.9 },
      ZERO_GAINS,
      { stageIndex: 0 },
    );
    expect(tripRes.output.mcbTripped).toBe(true);
    expect(tripRes.output.outputs.potDamaged).toBe(1);
    expect(tripRes.output.events.some((e) => e.id === 'dc-pot-damaged' && e.severity === 'danger')).toBe(true);
  });

  it('Stage 1 detects DC fault patterns cleanly (ammeter across supply, voltmeter in series, short)', () => {
    const amAcrossSup = validateWiring(ex4_2, [
      { id: 'w1', a: 'dcSupply.+', b: 'dcAmmeter.IN' },
      { id: 'w2', a: 'dcSupply.-', b: 'dcAmmeter.OUT' },
    ], 0);
    expect(amAcrossSup.faults.some((f) => f.id === 'dc-am-across-sup')).toBe(true);

    const vmInSeries = validateWiring(ex4_2, [
      { id: 'w1', a: 'dcSupply.+', b: 'pot.IN+' },
      { id: 'w2', a: 'dcSupply.-', b: 'pot.IN-' },
      { id: 'w3', a: 'pot.IN-', b: 'motor.B' },
      { id: 'w4', a: 'pot.OUT', b: 'dcAmmeter.IN' },
      { id: 'w5', a: 'dcAmmeter.OUT', b: 'dcVoltmeter.A' },
      { id: 'w6', a: 'dcVoltmeter.B', b: 'motor.A' },
    ], 0);
    expect(vmInSeries.faults.some((f) => f.id === 'dc-vm-series')).toBe(true);
  });

  it('Stage 2 solves No-Load (230 V) and Blocked-Rotor (42.7 V / 5.93 A) plus overheating guard', () => {
    // No-load test at 230 V: W1 negative (needs REV ON), n ≈ 1498 rpm, Pin ≈ 204 W
    const nlBRevOff = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 230, 'sel.pos': 'B', 'wm.reverse': false, 'motor.rotorBlocked': false },
      ZERO_GAINS,
      { stageIndex: 1 },
    );
    expect(findMeterReading(nlBRevOff.output, 'wm')?.reversed).toBe(true);

    const nlB = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 230, 'sel.pos': 'B', 'wm.reverse': true, 'motor.rotorBlocked': false },
      ZERO_GAINS,
      { stageIndex: 1 },
    );
    const nlC = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 230, 'sel.pos': 'C', 'wm.reverse': false, 'motor.rotorBlocked': false },
      ZERO_GAINS,
      { stageIndex: 1 },
    );
    const wmNlB = findMeterReading(nlB.output, 'wm')!;
    const wmNlC = findMeterReading(nlC.output, 'wm')!;
    const poMeasured = (-(wmNlB.dial ?? 0) + (wmNlC.dial ?? 0)) * (wmNlC.mf ?? 10) * DEFAULT_IM3PH_PARAMS.ctRatio;
    expect(poMeasured).toBeCloseTo(nlC.output.outputs.PinTrue, 0);
    expect(findMeterReading(nlC.output, 'tacho')?.shownValue).toBeGreaterThan(1490);

    // Blocked-rotor at VBR = 42.7 V: IBR ≈ 5.93 A, rpm = 0, Pin = (W1 + W2)*MF*CT
    const brB = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 42.7, 'sel.pos': 'B', 'wm.reverse': false, 'motor.rotorBlocked': true },
      ZERO_GAINS,
      { stageIndex: 1 },
    );
    const brC = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 42.7, 'sel.pos': 'C', 'wm.reverse': false, 'motor.rotorBlocked': true },
      ZERO_GAINS,
      { stageIndex: 1 },
    );
    expect(findMeterReading(brC.output, 'am')?.shownValue).toBeCloseTo(5.93, 1);
    expect(findMeterReading(brC.output, 'tacho')?.shownValue).toBe(0);
    const wmBrB = findMeterReading(brB.output, 'wm')!;
    const wmBrC = findMeterReading(brC.output, 'wm')!;
    expect(wmBrB.reversed).toBe(false);
    const pbrMeasured = ((wmBrB.dial ?? 0) + (wmBrC.dial ?? 0)) * (wmBrC.mf ?? 10) * DEFAULT_IM3PH_PARAMS.ctRatio;
    expect(pbrMeasured).toBeCloseTo(brC.output.outputs.PinTrue, 0);

    // Overheating danger when rotorBlocked && I > 5.93 A (e.g. 60 V -> ~8.3 A)
    const brHeat = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 60, 'sel.pos': 'C', 'motor.rotorBlocked': true },
      ZERO_GAINS,
      { stageIndex: 1 },
    );
    expect(brHeat.output.mcbTripped).toBe(false);
    expect(
      brHeat.output.events.some((e) => e.id === 'blocked-rotor-overheat' && e.severity === 'danger'),
    ).toBe(true);
  });

  it('enforces rotor lock switch safety (refuses lock toggle while supply is ON)', () => {
    const sess = useSessionStore.getState();
    sess.switchSelfStage(1);
    const ctrl = useControlsStore.getState();

    ctrl.setControlValue('sup3.switch', true);
    expect(useControlsStore.getState().values['sup3.switch']).toBe(true);
    expect(useControlsStore.getState().values['motor.rotorBlocked']).toBe(false);

    // Attempt to toggle rotor lock while supply ON -> refused
    ctrl.setControlValue('motor.rotorBlocked', true);
    expect(useControlsStore.getState().values['motor.rotorBlocked']).toBe(false);
    expect(useSessionStore.getState().toasts.length).toBeGreaterThan(0);

    // Turn off supply -> now toggle succeeds
    ctrl.setControlValue('sup3.switch', false);
    ctrl.setControlValue('motor.rotorBlocked', true);
    expect(useControlsStore.getState().values['motor.rotorBlocked']).toBe(true);
  });

  it('captures sectioned No-Load and Blocked-Rotor rows and satisfies Stage 2 prerequisites', () => {
    const outNl = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 230, 'sel.pos': 'C', 'motor.rotorBlocked': false },
      ZERO_GAINS,
      { stageIndex: 1 },
    ).output;
    const rowNl = captureStageObservationRow(
      STAGE_AC,
      outNl,
      {
        'sup3.switch': true,
        'va3.knob': 230,
        'motor.rotorBlocked': false,
        'pending.w1Div': -4.0,
        'pending.w1Rev': true,
        'pending.w2Div': 14.2,
        'pending.w2Rev': false,
        'pending.wmMf': 10,
      },
      1,
      'nl1',
    );
    expect(rowNl.values.testType).toBe('No-Load');
    expect(rowNl.values.W1).toBe(-4.0);

    const outBr = evaluateExperimentPhysics(
      ex4_2,
      AC_WIRES,
      { 'sup3.switch': true, 'va3.knob': 42.7, 'sel.pos': 'C', 'motor.rotorBlocked': true },
      ZERO_GAINS,
      { stageIndex: 1 },
    ).output;
    const rowBr = captureStageObservationRow(
      STAGE_AC,
      outBr,
      {
        'sup3.switch': true,
        'va3.knob': 42.7,
        'motor.rotorBlocked': true,
        'pending.w1Div': 1.2,
        'pending.w1Rev': false,
        'pending.w2Div': 11.0,
        'pending.w2Rev': false,
        'pending.wmMf': 10,
      },
      2,
      'br1',
    );
    expect(rowBr.values.testType).toBe('Blocked-Rotor');

    const prereqs = evaluateStagePrerequisites(STAGE_AC, [rowNl, rowBr]);
    expect(prereqs.every((p) => p.met)).toBe(true);
  });

  it('passes referenceRun across 5 random seeds and extreme meter gain bounds', () => {
    for (const seed of [42, 101, 202, 303, 999]) {
      const res = referenceRun(ex4_2, seed);
      expect(res.passed, `seed ${seed} failed: ${res.result.failedCriteria.join('; ')}`).toBe(true);
    }

    const lowGains = referenceRun(ex4_2, 42, {
      dcVoltmeter: -0.005,
      dcAmmeter: 0.005,
      vm: -0.005,
      am: 0.005,
      wm: -0.005,
      tacho: 0,
    });
    expect(lowGains.passed, lowGains.result.failedCriteria.join('; ')).toBe(true);

    const highGains = referenceRun(ex4_2, 42, {
      dcVoltmeter: 0.005,
      dcAmmeter: -0.005,
      vm: 0.005,
      am: -0.005,
      wm: 0.005,
      tacho: 0,
    });
    expect(highGains.passed, highGains.result.failedCriteria.join('; ')).toBe(true);
  });
});
