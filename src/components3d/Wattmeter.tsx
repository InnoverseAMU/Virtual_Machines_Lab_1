import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance, WattmeterReading } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { LabelPlate, MeterDial } from './LabelPlate';
import { Terminal } from './Terminal';

interface WattmeterProps {
  instance: ComponentInstance;
  reading?: WattmeterReading;
  vRange: number;
  iRange: number;
  vOptions: number[];
  iOptions: number[];
  controlsLocked?: boolean;
}

export function Wattmeter({
  instance,
  reading,
  vRange,
  iRange,
  vOptions,
  iOptions,
  controlsLocked = false,
}: WattmeterProps) {
  const def = getComponentDef(instance.type);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const cycleWmVRange = useControlsStore((s) => s.cycleWmVRange);
  const cycleWmIRange = useControlsStore((s) => s.cycleWmIRange);
  const [hoveredSel, setHoveredSel] = useState<'v' | 'i' | null>(null);

  const mf = (vRange * iRange) / 150;
  const readingText = reading?.damaged
    ? 'DAMAGED'
    : `${(reading?.dial ?? 0).toFixed(1)} div`;

  return (
    <group position={instance.position}>
      {/* Desk meter wooden/slate base */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.02, 0.32, 0.9]} />
        <meshStandardMaterial color="#3f2e21" roughness={0.65} metalness={0.1} />
      </mesh>

      {/* Sloped upper dial housing */}
      <mesh
        position={[0, 0.36, -0.08]}
        rotation={[0.42, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.92, 0.22, 0.64]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.2} />
      </mesh>

      <MeterDial
        title="WATTMETER"
        unit={`DIV (${vRange}V / ${iRange}A)`}
        maxScale={150}
        pointerRatio={reading?.pointerRatio ?? 0}
        readingText={readingText}
        showNumericReadout={showNumericReadouts}
        width={0.78}
        height={0.48}
        position={[0, 0.49, -0.03]}
        rotation={[-Math.PI / 2 + 0.42, 0, 0]}
        allowNegative
        overrange={reading?.overrange}
        damaged={reading?.damaged}
        reversed={reading?.reversed}
      />

      {/* Clickable Voltage Range Selector */}
      <group position={[-0.24, 0.33, 0.33]}>
        <mesh
          position={[0, 0.03, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            cycleWmVRange(vOptions);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setHoveredSel('v');
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredSel(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <boxGeometry args={[0.38, 0.14, 0.22]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <LabelPlate
          text={`V: ${vRange} V`}
          width={0.34}
          height={0.11}
          fontSize={34}
          bg={hoveredSel === 'v' ? '#0284c7' : '#0f172a'}
          border="#64748b"
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>

      {/* Clickable Current Range Selector */}
      <group position={[0.24, 0.33, 0.33]}>
        <mesh
          position={[0, 0.03, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            cycleWmIRange(iOptions);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setHoveredSel('i');
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredSel(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <boxGeometry args={[0.38, 0.14, 0.22]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <LabelPlate
          text={`I: ${iRange} A`}
          subtext={`MF=${mf.toFixed(1)}`}
          width={0.34}
          height={0.11}
          fontSize={30}
          bg={hoveredSel === 'i' ? '#0284c7' : '#0f172a'}
          border="#64748b"
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>

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
