import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface AcSupplyProps {
  instance: ComponentInstance;
  supplyOn: boolean;
  mcbTripped: boolean;
}

export function AcSupply({ instance, supplyOn, mcbTripped }: AcSupplyProps) {
  const def = getComponentDef(instance.type);
  const toggleSupply = useControlsStore((s) => s.toggleSupply);
  const [hovered, setHovered] = useState(false);

  const subtext = mcbTripped
    ? 'MCB: TRIPPED'
    : supplyOn
      ? 'MCB: ON'
      : 'MCB: OFF';

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

      {/* MCB toggle housing + larger invisible hit area */}
      <group position={[-0.14, 0.5, 0.38]}>
        <mesh
          position={[0, 0, 0.04]}
          onClick={(e) => {
            e.stopPropagation();
            toggleSupply();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
            document.body.style.cursor = 'auto';
          }}
        >
          <boxGeometry args={[0.28, 0.32, 0.14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <mesh castShadow>
          <boxGeometry args={[0.18, 0.22, 0.05]} />
          <meshStandardMaterial
            color={hovered ? '#64748b' : '#475569'}
            roughness={0.5}
          />
        </mesh>
        <mesh
          position={[0, supplyOn ? 0.03 : -0.03, 0.04]}
          rotation={[supplyOn ? -0.42 : 0.42, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.075, 0.095, 0.055]} />
          <meshStandardMaterial
            color={mcbTripped ? '#f59e0b' : supplyOn ? '#ef4444' : '#0f172a'}
          />
        </mesh>
      </group>

      {/* Status pilot lamp */}
      <mesh position={[0.18, 0.5, 0.37]}>
        <sphereGeometry args={[0.048, 16, 16]} />
        <meshStandardMaterial
          color={mcbTripped ? '#ef4444' : supplyOn ? '#22c55e' : '#3f3f46'}
          emissive={
            mcbTripped ? '#dc2626' : supplyOn ? '#16a34a' : '#000000'
          }
          emissiveIntensity={mcbTripped || supplyOn ? 1.5 : 0}
        />
      </mesh>

      <LabelPlate
        text="230 V AC SUPPLY"
        subtext={subtext}
        width={0.76}
        height={0.16}
        fontSize={36}
        bg={mcbTripped ? '#450a0a' : '#0f172a'}
        border={mcbTripped ? '#ef4444' : '#475569'}
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
