import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface SelectorSwitchProps {
  instance: ComponentInstance;
  controlId?: string;
  positionVal: string;
  options: string[];
  controlsLocked?: boolean;
}

export function SelectorSwitch({
  instance,
  controlId = `${instance.id}.pos`,
  positionVal,
  options,
  controlsLocked = false,
}: SelectorSwitchProps) {
  const def = getComponentDef(instance.type);
  const cycleControlOption = useControlsStore((s) => s.cycleControlOption);
  const [hovered, setHovered] = useState(false);

  const isC = positionVal === 'C';

  return (
    <group position={instance.position}>
      {/* Bakelite base */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.24, 0.7]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Clickable rotary/bridge selector handle connecting COM to B or C */}
      <group
        position={[0, 0.27, -0.06]}
        rotation={[0, isC ? -0.48 : 0.48, 0]}
      >
        <mesh
          position={[0, 0.03, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (controlsLocked) return;
            cycleControlOption(controlId, options);
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
          <cylinderGeometry args={[0.16, 0.18, 0.09, 20]} />
          <meshStandardMaterial
            color={hovered ? '#38bdf8' : '#0f172a'}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, 0.085, -0.08]}>
          <boxGeometry args={[0.04, 0.025, 0.18]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>

      <LabelPlate
        text="V2 SELECTOR"
        subtext={`COM → ${positionVal}`}
        width={0.64}
        height={0.14}
        fontSize={28}
        bg="#0f172a"
        fg="#f8fafc"
        border={isC ? '#38bdf8' : '#f59e0b'}
        position={[0, 0.248, -0.22]}
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
