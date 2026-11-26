import { getComponentDef } from '../core/components';
import type { ComponentInstance, WattmeterReading } from '../core/types';
import { LabelPlate, MeterDial } from './LabelPlate';
import { Terminal } from './Terminal';

interface WattmeterProps {
  instance: ComponentInstance;
  reading?: WattmeterReading;
  vRange: number;
  iRange: number;
}

export function Wattmeter({
  instance,
  reading,
  vRange,
  iRange,
}: WattmeterProps) {
  const def = getComponentDef(instance.type);

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
        width={0.78}
        height={0.46}
        position={[0, 0.48, -0.03]}
        rotation={[-Math.PI / 2 + 0.42, 0, 0]}
        allowNegative
        overrange={reading?.overrange}
        damaged={reading?.damaged}
      />

      <LabelPlate
        text="WATTMETER"
        subtext={`MF = ${((vRange * iRange) / 150).toFixed(1)} W/div`}
        width={0.78}
        height={0.13}
        fontSize={32}
        position={[0, 0.325, 0.33]}
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
