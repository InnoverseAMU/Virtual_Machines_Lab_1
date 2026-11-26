import { getComponentDef } from '../core/components';
import type { AnalogMeterReading, ComponentInstance } from '../core/types';
import { LabelPlate, MeterDial } from './LabelPlate';
import { Terminal } from './Terminal';

interface AnalogMeterProps {
  instance: ComponentInstance;
  reading?: AnalogMeterReading;
}

export function AnalogMeter({ instance, reading }: AnalogMeterProps) {
  const def = getComponentDef(instance.type);
  const isAmmeter = instance.type === 'ammeter';
  const range = Number(instance.params.range ?? (isAmmeter ? 25 : 300));
  const unit = isAmmeter ? 'A (AC)' : 'V (AC)';
  const shortUnit = isAmmeter ? 'A' : 'V';
  const accentColor = isAmmeter ? '#1e3a5f' : '#3b2f2f';

  const val = reading?.shownValue ?? 0;
  const readingText = reading?.damaged
    ? 'DAMAGED'
    : `${val.toFixed(isAmmeter ? 2 : 1)} ${shortUnit}`;

  return (
    <group position={instance.position}>
      {/* Base */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.84, 0.28, 0.8]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Sloped upper face */}
      <mesh
        position={[0, 0.32, -0.06]}
        rotation={[0.45, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.76, 0.2, 0.56]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} />
      </mesh>

      <MeterDial
        title={instance.label.toUpperCase()}
        unit={unit}
        maxScale={range}
        pointerRatio={reading?.pointerRatio ?? 0}
        readingText={readingText}
        width={0.64}
        height={0.44}
        position={[0, 0.44, -0.01]}
        rotation={[-Math.PI / 2 + 0.45, 0, 0]}
        overrange={reading?.overrange}
        damaged={reading?.damaged}
      />

      <LabelPlate
        text={instance.label}
        subtext={`0 - ${range} ${shortUnit}`}
        width={0.68}
        height={0.12}
        fontSize={32}
        position={[0, 0.285, 0.28]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {def.terminals.map((t) => (
        <Terminal
          key={t.name}
          componentId={instance.id}
          componentLabel={instance.label}
          terminal={t}
        />
      ))}
    </group>
  );
}
