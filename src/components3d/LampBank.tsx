import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface LampBankProps {
  instance: ComponentInstance;
  stepsControlId?: string;
  lampStates: boolean[];
  supplyOn: boolean;
  loadConnected: boolean;
  v2: number;
  controlsLocked?: boolean;
}

export function LampBank({
  instance,
  stepsControlId = 'ld.lamps',
  lampStates,
  supplyOn,
  loadConnected,
  v2,
  controlsLocked = false,
}: LampBankProps) {
  const def = getComponentDef(instance.type);
  const toggleLampIndex = useControlsStore((s) => s.toggleLampIndex);
  const [hoveredLamp, setHoveredLamp] = useState<number | null>(null);

  const count = lampStates.length;
  const cols = Math.ceil(count / 2);
  const activeCount = lampStates.filter(Boolean).length;
  const vRated = Number(instance.params.Vrated ?? 115);
  const isEnergised = supplyOn && loadConnected && v2 > 0;
  // Glow intensity scales proportionally with (V2 / Vrated)^2
  const glowFactor = isEnergised
    ? Math.min(2.5, Math.max(0.15, (v2 / vRated) ** 2))
    : 0;

  return (
    <group position={instance.position}>
      {/* Lamp bank chassis */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.42, 0.32, 0.9]} />
        <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Upright lamp mounting board */}
      <mesh position={[0, 0.6, -0.14]} castShadow receiveShadow>
        <boxGeometry args={[1.34, 0.62, 0.14]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} />
      </mesh>

      {/* Individual lamps + clickable switches */}
      {lampStates.map((isSwitchOn, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = -0.5 + col * (1.0 / Math.max(1, cols - 1));
        const y = row === 0 ? 0.74 : 0.45;
        const glowing = isSwitchOn && isEnergised;

        return (
          <group key={idx} position={[x, y, -0.02]}>
            {/* Ceramic socket */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.036, 0.042, 0.07, 14]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
            </mesh>
            {/* Glass bulb */}
            <mesh position={[0, 0, 0.065]}>
              <sphereGeometry args={[0.052, 16, 16]} />
              <meshStandardMaterial
                color={
                  glowing ? '#fde047' : isSwitchOn ? '#fef3c7' : '#94a3b8'
                }
                emissive={glowing ? '#f59e0b' : '#000000'}
                emissiveIntensity={glowing ? 2.1 * glowFactor : 0}
                roughness={0.2}
                transparent
                opacity={glowing ? 1 : 0.72}
              />
            </mesh>

            {/* Individual toggle switch + larger invisible hit box */}
            <group position={[0, -0.1, 0.01]}>
              <mesh
                position={[0, 0, 0.03]}
                onClick={(e) => {
                  e.stopPropagation();
                  if (controlsLocked) return;
                  toggleLampIndex(idx, stepsControlId);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  if (controlsLocked) return;
                  setHoveredLamp(idx);
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  setHoveredLamp(null);
                  document.body.style.cursor = 'auto';
                }}
              >
                <boxGeometry args={[0.16, 0.16, 0.14]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <mesh
                rotation={[isSwitchOn ? -0.35 : 0.35, 0, 0]}
                castShadow
              >
                <boxGeometry args={[0.048, 0.055, 0.04]} />
                <meshStandardMaterial
                  color={
                    hoveredLamp === idx
                      ? '#38bdf8'
                      : isSwitchOn
                        ? '#22c55e'
                        : '#475569'
                  }
                />
              </mesh>
            </group>
          </group>
        );
      })}

      <LabelPlate
        text="LAMP BANK LOAD"
        subtext={`${count} x 200 W · ON: ${activeCount}/${count}`}
        width={1.1}
        height={0.14}
        fontSize={32}
        position={[0, 0.325, 0.25]}
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
