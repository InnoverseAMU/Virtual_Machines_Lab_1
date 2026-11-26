import { findMeterReading } from '../core/physics/evaluate';
import type {
  BaseConnectionState,
  ComponentInstance,
  ControlDef,
  PhysicsSolveOutput,
} from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { AcSupply } from './AcSupply';
import { AnalogMeter } from './AnalogMeter';
import { LampBank } from './LampBank';
import { Rheostat } from './Rheostat';
import { Transformer } from './Transformer';
import { Variac } from './Variac';
import { Wattmeter } from './Wattmeter';

interface ComponentRendererProps {
  instance: ComponentInstance;
  controlsDef: ControlDef[];
  labOutput?: PhysicsSolveOutput;
  connectionState?: BaseConnectionState;
  controlsLocked?: boolean;
}

export function ComponentRenderer({
  instance,
  controlsDef,
  labOutput,
  connectionState,
  controlsLocked = false,
}: ComponentRendererProps) {
  const values = useControlsStore((s) => s.values);
  const mcbTripped = useControlsStore((s) => s.mcbTripped);
  const lampStates = useControlsStore((s) => s.lampStates);

  switch (instance.type) {
    case 'acSupply': {
      const swDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'switch',
      );
      const swId = swDef?.id ?? 'sup.switch';
      const supplyOn = Boolean(values[swId]);
      return (
        <AcSupply
          instance={instance}
          controlId={swId}
          supplyOn={supplyOn}
          mcbTripped={mcbTripped}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'variac1ph': {
      const knobDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'knob',
      );
      const controlId = knobDef?.id ?? `${instance.id}.knob`;
      const minV = knobDef?.kind === 'knob' ? knobDef.min : 0;
      const maxV = knobDef?.kind === 'knob' ? knobDef.max : 270;
      const stepV = knobDef?.kind === 'knob' ? knobDef.step : 1;
      const fineStepV =
        knobDef?.kind === 'knob' ? (knobDef.fineStep ?? 0.1) : 0.1;
      const variacV = Number(values[controlId] ?? 0);
      return (
        <Variac
          instance={instance}
          controlId={controlId}
          variacV={variacV}
          minV={minV}
          maxV={maxV}
          stepV={stepV}
          fineStepV={fineStepV}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'wattmeter': {
      const vDef = controlsDef.find(
        (c) => c.id === `${instance.id}.vRange` && c.kind === 'selector',
      );
      const iDef = controlsDef.find(
        (c) => c.id === `${instance.id}.iRange` && c.kind === 'selector',
      );
      const revDef = controlsDef.find(
        (c) => c.id === `${instance.id}.reverse` && c.kind === 'switch',
      );

      const paramVRanges = Array.isArray(instance.params.vRanges)
        ? (instance.params.vRanges as number[])
        : [Number(instance.params.vRange ?? 300)];
      const paramIRanges = Array.isArray(instance.params.iRanges)
        ? (instance.params.iRanges as number[])
        : [Number(instance.params.iRange ?? 10)];

      const vOptions =
        vDef?.kind === 'selector'
          ? vDef.options.map(Number)
          : paramVRanges;
      const iOptions =
        iDef?.kind === 'selector'
          ? iDef.options.map(Number)
          : paramIRanges;
      const vRange = Number(
        values[`${instance.id}.vRange`] ??
          instance.params.vRange ??
          vOptions[0] ??
          300,
      );
      const iRange = Number(
        values[`${instance.id}.iRange`] ??
          instance.params.iRange ??
          iOptions[0] ??
          10,
      );
      const divisions = Number(instance.params.divisions ?? 150);
      const pf = Number(instance.params.pf ?? 1.0);
      const reverseOn = revDef ? Boolean(values[revDef.id]) : false;

      return (
        <Wattmeter
          instance={instance}
          reading={findMeterReading(labOutput, instance.id)}
          vRange={vRange}
          iRange={iRange}
          divisions={divisions}
          pf={pf}
          vOptions={vOptions}
          iOptions={iOptions}
          hasVSelector={Boolean(vDef)}
          hasISelector={Boolean(iDef)}
          hasReverseSwitch={Boolean(revDef)}
          reverseOn={reverseOn}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'transformer1ph':
      return <Transformer instance={instance} />;
    case 'voltmeter':
    case 'ammeter': {
      const rangeDef = controlsDef.find(
        (c) => c.id === `${instance.id}.range` && c.kind === 'selector',
      );
      const revDef = controlsDef.find(
        (c) => c.id === `${instance.id}.reverse` && c.kind === 'switch',
      );
      const rangeOptions =
        rangeDef?.kind === 'selector'
          ? rangeDef.options.map(Number)
          : Array.isArray(instance.params.ranges)
            ? (instance.params.ranges as number[])
            : undefined;
      const activeRange =
        rangeDef && values[rangeDef.id] !== undefined
          ? Number(values[rangeDef.id])
          : undefined;
      const reverseOn = revDef ? Boolean(values[revDef.id]) : false;
      return (
        <AnalogMeter
          instance={instance}
          reading={findMeterReading(labOutput, instance.id)}
          activeRange={activeRange}
          rangeOptions={rangeOptions}
          hasReverseSwitch={Boolean(revDef)}
          reverseOn={reverseOn}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'lampLoad': {
      const stepsDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'steps',
      );
      const swDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'switch',
      );
      const swSupply =
        Boolean(values['sup.switch']) && (swDef ? Boolean(values[swDef.id]) : true);
      return (
        <LampBank
          instance={instance}
          stepsControlId={stepsDef?.id ?? `${instance.id}.lamps`}
          lampStates={lampStates}
          supplyOn={swSupply}
          loadConnected={Boolean(connectionState?.loadConnected)}
          v2={labOutput?.outputs?.VL ?? labOutput?.outputs?.V2 ?? 0}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'rheostat': {
      const swDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'switch',
      );
      const rDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'knob',
      );
      const swId = swDef?.id ?? `${instance.id}.switch`;
      const rId = rDef?.id ?? `${instance.id}.R`;
      const minR = rDef?.kind === 'knob' ? rDef.min : 3;
      const maxR = rDef?.kind === 'knob' ? rDef.max : 100;
      const stepR = rDef?.kind === 'knob' ? rDef.step : 0.5;
      const defaultR = rDef?.kind === 'knob' ? rDef.defaultValue : 100;
      return (
        <Rheostat
          instance={instance}
          switchControlId={swId}
          resistanceControlId={rId}
          switchOn={Boolean(values[swId])}
          resistance={Number(values[rId] ?? defaultR)}
          minR={minR}
          maxR={maxR}
          stepR={stepR}
          controlsLocked={controlsLocked}
        />
      );
    }
  }
}
