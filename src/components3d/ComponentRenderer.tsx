import type {
  ComponentInstance,
  ConnectionState,
  ControlDef,
  TransformerLoadOutput,
} from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { AcSupply } from './AcSupply';
import { AnalogMeter } from './AnalogMeter';
import { LampBank } from './LampBank';
import { Transformer } from './Transformer';
import { Variac } from './Variac';
import { Wattmeter } from './Wattmeter';

interface ComponentRendererProps {
  instance: ComponentInstance;
  controlsDef: ControlDef[];
  labOutput?: TransformerLoadOutput;
  connectionState?: ConnectionState;
  controlsLocked?: boolean;
}

export function ComponentRenderer({
  instance,
  controlsDef,
  labOutput,
  connectionState,
  controlsLocked = false,
}: ComponentRendererProps) {
  const supplyOn = useControlsStore((s) => s.supplyOn);
  const mcbTripped = useControlsStore((s) => s.mcbTripped);
  const variacV = useControlsStore((s) => s.variacV);
  const wmVRange = useControlsStore((s) => s.wmVRange);
  const wmIRange = useControlsStore((s) => s.wmIRange);
  const lampStates = useControlsStore((s) => s.lampStates);

  switch (instance.type) {
    case 'acSupply':
      return (
        <AcSupply
          instance={instance}
          supplyOn={supplyOn}
          mcbTripped={mcbTripped}
          controlsLocked={controlsLocked}
        />
      );
    case 'variac1ph': {
      const knobDef = controlsDef.find(
        (c) => c.componentId === instance.id && c.kind === 'knob',
      );
      const minV = knobDef?.kind === 'knob' ? knobDef.min : 0;
      const maxV = knobDef?.kind === 'knob' ? knobDef.max : 270;
      const stepV = knobDef?.kind === 'knob' ? knobDef.step : 1;
      return (
        <Variac
          instance={instance}
          variacV={variacV}
          minV={minV}
          maxV={maxV}
          stepV={stepV}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'wattmeter': {
      const vDef = controlsDef.find(
        (c) => c.id === 'wm.vRange' && c.kind === 'selector',
      );
      const iDef = controlsDef.find(
        (c) => c.id === 'wm.iRange' && c.kind === 'selector',
      );
      const vOptions = vDef?.kind === 'selector' ? vDef.options : [150, 300];
      const iOptions = iDef?.kind === 'selector' ? iDef.options : [2.5, 5, 10];
      return (
        <Wattmeter
          instance={instance}
          reading={labOutput?.meters.wm}
          vRange={wmVRange}
          iRange={wmIRange}
          vOptions={vOptions}
          iOptions={iOptions}
          controlsLocked={controlsLocked}
        />
      );
    }
    case 'transformer1ph':
      return <Transformer instance={instance} />;
    case 'voltmeter':
      return (
        <AnalogMeter
          instance={instance}
          reading={
            instance.id === 'vp'
              ? labOutput?.meters.vp
              : labOutput?.meters.vs
          }
        />
      );
    case 'ammeter':
      return <AnalogMeter instance={instance} reading={labOutput?.meters.am} />;
    case 'lampLoad':
      return (
        <LampBank
          instance={instance}
          lampStates={lampStates}
          supplyOn={supplyOn}
          loadConnected={connectionState?.loadConnected ?? false}
          v2={labOutput?.V2 ?? 0}
          controlsLocked={controlsLocked}
        />
      );
  }
}
