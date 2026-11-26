import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance, MeterReading } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { LabelPlate, MeterDial } from './LabelPlate';
import { Terminal } from './Terminal';

interface AnalogMeterProps {
  instance: ComponentInstance;
  reading?: MeterReading;
  activeRange?: number;
  rangeOptions?: number[];
  hasReverseSwitch?: boolean;
  reverseOn?: boolean;
  controlsLocked?: boolean;
}

export function AnalogMeter({
  instance,
  reading,
  activeRange,
  rangeOptions,
  hasReverseSwitch = false,
  reverseOn = false,
  controlsLocked = false,
}: AnalogMeterProps) {
  const def = getComponentDef(instance.type);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const cycleControlOption = useControlsStore((s) => s.cycleControlOption);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const [hoveredRange, setHoveredRange] = useState(false);

  const isAmmeter = instance.type === 'ammeter';
  const modeTag = String(instance.params.currentMode ?? 'AC').toUpperCase();
  const defaultRange = Number(
    activeRange ??
      reading?.range ??
      instance.params.range ??
      (rangeOptions?.[0] ?? (isAmmeter ? 25 : 300)),
  );
  const unit = isAmmeter ? `A (${modeTag})` : `V (${modeTag})`;
  const shortUnit = isAmmeter ? 'A' : 'V';
  const accentColor = isAmmeter ? '#1e3a5f' : '#3b2f2f';
  const decimals = reading?.decimals ?? (isAmmeter ? 2 : 1);

  const val = reading?.shownValue ?? 0;
  const readingText = reading?.damaged
    ? 'DAMAGED'
    : `${val.toFixed(decimals)} ${shortUnit}`;

  const canCycleRange =
    Boolean(rangeOptions && rangeOptions.length > 1) && !controlsLocked;

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
        maxScale={defaultRange}
        pointerRatio={reading?.pointerRatio ?? 0}
        readingText={readingText}
        showNumericReadout={showNumericReadouts}
        width={0.64}
        height={0.44}
        position={[0, 0.44, -0.01]}
        rotation={[-Math.PI / 2 + 0.45, 0, 0]}
        allowNegative={hasReverseSwitch || Boolean(reading?.reversed)}
        overrange={reading?.overrange}
        damaged={reading?.damaged}
        reversed={reading?.reversed}
      />

      {canCycleRange ? (
        <group position={[0, 0.285, 0.28]}>
          <mesh
            position={[0, 0.03, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (controlsLocked || !rangeOptions) return;
              cycleControlOption(`${instance.id}.range`, rangeOptions);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredRange(true);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredRange(false);
              document.body.style.cursor = 'auto';
            }}
          >
            <boxGeometry args={[0.72, 0.12, 0.16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <LabelPlate
            text={instance.label}
            subtext={`0 - ${defaultRange} ${shortUnit}`}
            width={0.68}
            height={0.12}
            fontSize={32}
            bg={hoveredRange ? '#0284c7' : '#0f172a'}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        </group>
      ) : (
        <LabelPlate
          text={instance.label}
          subtext={`0 - ${defaultRange} ${shortUnit}`}
          width={0.68}
          height={0.12}
          fontSize={32}
          position={[0, 0.285, 0.28]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}

      {hasReverseSwitch && (
        <group position={[0.31, 0.295, 0.15]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              if (controlsLocked) return;
              setControlValue(`${instance.id}.reverse`, !reverseOn);
            }}
          >
            <boxGeometry args={[0.14, 0.08, 0.14]} />
            <meshStandardMaterial color={reverseOn ? '#d97706' : '#334155'} />
          </mesh>
        </group>
      )}

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
