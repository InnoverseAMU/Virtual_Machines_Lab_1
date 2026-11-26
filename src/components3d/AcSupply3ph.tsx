import { useState } from 'react';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface AcSupply3phProps {
  instance: ComponentInstance;
  controlId?: string;
  supplyOn: boolean;
  mcbTripped: boolean;
  controlsLocked?: boolean;
}

export function AcSupply3ph({
  instance,
  controlId = 'sup3.switch',
  supplyOn,
  mcbTripped,
  controlsLocked = false,
}: AcSupply3phProps) {
  const def = getComponentDef(instance.type);
  const setControlValue = useControlsStore((s) => s.setControlValue);
  const [hovered, setHovered] = useState(false);

  const hideTerminals = Boolean(instance.params.hideTerminals);
  const vRating = Number(instance.params.V ?? 230);
  const subtext = mcbTripped
    ? '3φ MCB: TRIPPED'
    : supplyOn
      ? '3φ MCB: ON'
      : '3φ MCB: OFF';

  return (
    <group position={instance.position}>
      {/* Main benchtop 3-phase supply enclosure */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.06, 0.8, 0.74]} />
        <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.35} />
      </mesh>

      {/* Recessed front panel */}
      <mesh position={[0, 0.44, 0.375]}>
        <boxGeometry args={[0.94, 0.62, 0.015]} />
        <meshStandardMaterial color="#0f172a" roughness={0.65} />
      </mesh>

      {/* 3-pole MCB switch housing */}
      <group position={[-0.2, 0.52, 0.4]}>
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
          <boxGeometry args={[0.32, 0.34, 0.14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <mesh castShadow>
          <boxGeometry args={[0.24, 0.24, 0.05]} />
          <meshStandardMaterial
            color={hovered ? '#64748b' : '#475569'}
            roughness={0.5}
          />
        </mesh>
        {/* Linked 3-pole toggle bar */}
        <mesh
          position={[0, supplyOn ? 0.035 : -0.035, 0.04]}
          rotation={[supplyOn ? -0.42 : 0.42, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.16, 0.085, 0.055]} />
          <meshStandardMaterial
            color={mcbTripped ? '#f59e0b' : supplyOn ? '#ef4444' : '#020617'}
          />
        </mesh>
      </group>

      {/* R, Y, B phase status pilot lamps */}
      {[
        { x: 0.12, on: '#ef4444', em: '#dc2626' },
        { x: 0.24, on: '#eab308', em: '#ca8a04' },
        { x: 0.36, on: '#3b82f6', em: '#2563eb' },
      ].map((lamp, idx) => (
        <mesh key={idx} position={[lamp.x, 0.52, 0.39]}>
          <sphereGeometry args={[0.04, 14, 14]} />
          <meshStandardMaterial
            color={mcbTripped ? '#ef4444' : supplyOn ? lamp.on : '#3f3f46'}
            emissive={
              mcbTripped
                ? '#7f1d1d'
                : supplyOn
                  ? lamp.em
                  : '#000000'
            }
            emissiveIntensity={supplyOn || mcbTripped ? 1.15 : 0}
          />
        </mesh>
      ))}

      <LabelPlate
        text={`3φ AC ${vRating}V`}
        subtext={subtext}
        width={0.78}
        height={0.18}
        fontSize={32}
        bg="#0f172a"
        fg="#f8fafc"
        border={mcbTripped ? '#f59e0b' : supplyOn ? '#22c55e' : '#334155'}
        position={[0, 0.69, 0.39]}
      />

      {hideTerminals && (
        <LabelPlate
          text="INTERNAL FEED → 3φ VARIAC"
          width={0.82}
          height={0.13}
          fontSize={24}
          bg="#0f172a"
          fg="#94a3b8"
          border="#334155"
          position={[0, 0.23, 0.39]}
        />
      )}

      {!hideTerminals &&
        def.terminals.map((t) => (
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
