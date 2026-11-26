import type { ComponentInstance, TransformerLoadOutput } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { AcSupply } from './AcSupply';
import { AnalogMeter } from './AnalogMeter';
import { LampBank } from './LampBank';
import { Transformer } from './Transformer';
import { Variac } from './Variac';
import { Wattmeter } from './Wattmeter';

interface ComponentRendererProps {
  instance: ComponentInstance;
  labOutput?: TransformerLoadOutput;
}

export function ComponentRenderer({
  instance,
  labOutput,
}: ComponentRendererProps) {
  const supplyOn = useControlsStore((s) => s.supplyOn);
  const variacV = useControlsStore((s) => s.variacV);
  const wmVRange = useControlsStore((s) => s.wmVRange);
  const wmIRange = useControlsStore((s) => s.wmIRange);
  const lamps = useControlsStore((s) => s.lamps);

  switch (instance.type) {
    case 'acSupply':
      return <AcSupply instance={instance} supplyOn={supplyOn} />;
    case 'variac1ph':
      return <Variac instance={instance} variacV={variacV} />;
    case 'wattmeter':
      return (
        <Wattmeter
          instance={instance}
          reading={labOutput?.meters.wm}
          vRange={wmVRange}
          iRange={wmIRange}
        />
      );
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
          lampsLit={lamps}
          energised={(labOutput?.V2 ?? 0) > 10 && (labOutput?.I2 ?? 0) > 0.1}
        />
      );
  }
}
