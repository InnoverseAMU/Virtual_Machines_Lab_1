import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface InductionMotor3phProps {
  instance: ComponentInstance;
  rpm?: number;
  t1Kgf?: number;
  t2Kgf?: number;
  loadF?: number;
  rotorBlocked?: boolean;
}

export function InductionMotor3ph({
  instance,
  rpm = 0,
  t1Kgf = 1.0,
  t2Kgf = 1.0,
  loadF = 0,
  rotorBlocked = false,
}: InductionMotor3phProps) {
  const def = getComponentDef(instance.type);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);
  const rotorRef = useRef<Group>(null);
  const hideBrake = Boolean(instance.params.hideBrake);

  useFrame((_, delta) => {
    if (!rotorRef.current || rpm <= 0.5) return;
    // Scale angular visual speed smoothly with rotor rpm (avoids stroboscopic aliasing)
    const visualOmega = (rpm / 1500) * 18;
    rotorRef.current.rotation.z -= visualOmega * Math.min(delta, 0.05);
  });

  const beltTight = loadF > 0.05;

  return (
    <group position={instance.position}>
      {/* Cast-iron baseplate */}
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.64, 0.14, 1.08]} />
        <meshStandardMaterial color="#1e293b" roughness={0.65} metalness={0.3} />
      </mesh>

      {/* Squirrel-cage stator barrel (horizontal along Z/X) */}
      <mesh
        position={[-0.22, 0.42, -0.04]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.3, 0.3, 0.78, 28]} />
        <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.55} />
      </mesh>

      {/* Top terminal junction box holding A, B, C */}
      <mesh position={[0, 0.44, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.2, 0.3]} />
        <meshStandardMaterial color="#0f172a" roughness={0.55} />
      </mesh>

      {/* Spinning rotor shaft + Prony pulley on right side */}
      <group ref={rotorRef} position={[0.42, 0.42, -0.04]} rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.58, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.16]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.14, 24]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Index spokes so rotation is unmistakable */}
        <mesh position={[0, 0, 0.235]}>
          <boxGeometry args={[0.34, 0.035, 0.02]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
        <mesh position={[0, 0, 0.235]}>
          <boxGeometry args={[0.035, 0.34, 0.02]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>

      {/* Brake belt + upright spring balance stand (hidden in No-Load/Blocked-Rotor/DC tests) */}
      {!hideBrake && (
        <>
          <mesh position={[0.58, 0.56, -0.34]} castShadow>
            <boxGeometry args={[0.52, 0.9, 0.06]} />
            <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[0.42, 0.72, -0.22]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.36, 12]} />
            <meshStandardMaterial color={beltTight ? '#ef4444' : '#64748b'} roughness={0.4} />
          </mesh>
          <mesh position={[0.72, 0.72, -0.22]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.36, 12]} />
            <meshStandardMaterial color={beltTight ? '#38bdf8' : '#64748b'} roughness={0.4} />
          </mesh>
          <mesh position={[0.58, 0.42, -0.04]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
            <torusGeometry args={[0.215, 0.022, 10, 28, Math.PI * 1.4]} />
            <meshStandardMaterial color="#1f2937" roughness={0.9} />
          </mesh>
        </>
      )}

      {/* Shaft locking pin when rotorBlocked is engaged */}
      {rotorBlocked && (
        <mesh position={[0.58, 0.28, 0.1]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.34, 12]} />
          <meshStandardMaterial color="#ef4444" emissive="#991b1b" emissiveIntensity={0.4} />
        </mesh>
      )}

      <LabelPlate
        text="3φ INDUCTION MOTOR"
        subtext="1.5 kW · 230 V Δ · 4-Pole"
        width={0.94}
        height={0.18}
        fontSize={28}
        bg="#0f172a"
        fg="#f8fafc"
        border="#334155"
        position={[-0.22, 0.76, -0.04]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {showNumericReadouts && !hideBrake && (
        <LabelPlate
          text={`${Math.round(rpm)} RPM`}
          subtext={`S1 ${t1Kgf.toFixed(1)} · S2 ${t2Kgf.toFixed(1)} kgf`}
          width={0.62}
          height={0.18}
          fontSize={26}
          bg="#0f172a"
          fg={rpm > 5 ? '#34d399' : '#94a3b8'}
          border="#334155"
          position={[0.56, 1.04, -0.2]}
        />
      )}
      {showNumericReadouts && hideBrake && (
        <LabelPlate
          text={rotorBlocked ? 'LOCKED (0 RPM)' : `${Math.round(rpm)} RPM`}
          subtext={rotorBlocked ? 'Pin Engaged' : 'Free Shaft'}
          width={0.62}
          height={0.18}
          fontSize={24}
          bg="#0f172a"
          fg={rotorBlocked ? '#f87171' : rpm > 5 ? '#34d399' : '#94a3b8'}
          border={rotorBlocked ? '#ef4444' : '#334155'}
          position={[0.56, 0.88, -0.1]}
        />
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
