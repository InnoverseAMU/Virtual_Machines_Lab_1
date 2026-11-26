import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface AcSupplyProps {
  instance: ComponentInstance;
  supplyOn: boolean;
}

export function AcSupply({ instance, supplyOn }: AcSupplyProps) {
  const def = getComponentDef(instance.type);

  return (
    <group position={instance.position}>
      {/* Main benchtop supply enclosure */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.76, 0.7]} />
        <meshStandardMaterial color="#334155" roughness={0.55} metalness={0.3} />
      </mesh>

      {/* Recessed front panel */}
      <mesh position={[0, 0.42, 0.355]}>
        <boxGeometry args={[0.82, 0.58, 0.015]} />
        <meshStandardMaterial color="#1e293b" roughness={0.65} />
      </mesh>

      {/* MCB toggle housing + indicator LED */}
      <mesh position={[-0.14, 0.5, 0.38]} castShadow>
        <boxGeometry args={[0.18, 0.22, 0.05]} />
        <meshStandardMaterial color="#475569" roughness={0.5} />
      </mesh>
      <mesh
        position={[-0.14, supplyOn ? 0.53 : 0.47, 0.42]}
        rotation={[supplyOn ? -0.4 : 0.4, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.07, 0.09, 0.05]} />
        <meshStandardMaterial color={supplyOn ? '#ef4444' : '#0f172a'} />
      </mesh>

      {/* Status pilot lamp */}
      <mesh position={[0.18, 0.5, 0.37]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial
          color={supplyOn ? '#22c55e' : '#3f3f46'}
          emissive={supplyOn ? '#16a34a' : '#000000'}
          emissiveIntensity={supplyOn ? 1.4 : 0}
        />
      </mesh>

      <LabelPlate
        text="230 V AC SUPPLY"
        subtext={supplyOn ? 'MCB: ON' : 'MCB: OFF'}
        width={0.76}
        height={0.16}
        fontSize={36}
        position={[0, 0.8, 0]}
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
