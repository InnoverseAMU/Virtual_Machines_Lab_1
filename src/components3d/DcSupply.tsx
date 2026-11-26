import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface DcSupplyProps {
  instance: ComponentInstance;
  controlId?: string;
  supplyOn: boolean;
  mcbTripped: boolean;
  controlsLocked?: boolean;
}

export function DcSupply({
  instance,
  controlId = 'dcSupply.switch',
  supplyOn,
  mcbTripped,
  controlsLocked = false,
}: DcSupplyProps) {
  const def = getComponentDef(instance.type);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const [hovered, setHovered] = useState(false);

  const vRating = Number(instance.params.V ?? 230);
  const subtext = mcbTripped
    ? 'DC MCB: TRIPPED'
    : supplyOn
      ? 'DC MCB: ON'
      : 'DC MCB: OFF';

  return (
    <group position={instance.position}>
      {/* DC Rectifier / Bench Supply enclosure */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.76, 0.7]} />
        <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.3} />
      </mesh>

      <mesh position={[0, 0.42, 0.355]}>
        <boxGeometry args={[0.82, 0.58, 0.015]} />
        <meshStandardMaterial color="#0f172a" roughness={0.65} />
      </mesh>

      {/* MCB toggle switch */}
      <group position={[-0.14, 0.5, 0.38]}>
        <mesh
          position={[0, 0, 0.04]}
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            setControlValue(controlId, !supplyOn);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
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
          <meshStandardMaterial color={hovered ? '#64748b' : '#475569'} roughness={0.5} />
        </mesh>
        <mesh
          position={[0, supplyOn ? 0.03 : -0.03, 0.04]}
          rotation={[supplyOn ? -0.42 : 0.42, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.075, 0.095, 0.055]} />
          <meshStandardMaterial color={mcbTripped ? '#f59e0b' : supplyOn ? '#ef4444' : '#020617'} />
        </mesh>
      </group>

      {/* Status pilot lamp */}
      <mesh position={[0.18, 0.5, 0.37]}>
        <sphereGeometry args={[0.048, 16, 16]} />
        <meshStandardMaterial
          color={mcbTripped ? '#ef4444' : supplyOn ? '#38bdf8' : '#3f3f46'}
          emissive={mcbTripped ? '#dc2626' : supplyOn ? '#0284c7' : '#000000'}
          emissiveIntensity={supplyOn || mcbTripped ? 1.15 : 0}
        />
      </mesh>

      <LabelPlate
        text={`${vRating} V DC`}
        subtext={subtext}
        width={0.7}
        height={0.18}
        fontSize={34}
        bg="#0f172a"
        fg="#f8fafc"
        border={mcbTripped ? '#f59e0b' : supplyOn ? '#38bdf8' : '#334155'}
        position={[0, 0.67, 0.37]}
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
