import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

interface LabelPlateProps {
  text: string;
  subtext?: string;
  width?: number;
  height?: number;
  bg?: string;
  fg?: string;
  border?: string;
  fontSize?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function LabelPlate({
  text,
  subtext,
  width = 0.85,
  height = 0.22,
  bg = '#0f172a',
  fg = '#f8fafc',
  border = '#475569',
  fontSize = 38,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: LabelPlateProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.max(96, Math.round((512 * height) / width));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = border;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (subtext) {
        ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(text, canvas.width / 2, canvas.height * 0.36);
        ctx.font = `500 ${Math.round(fontSize * 0.68)}px ui-monospace, monospace`;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(subtext, canvas.width / 2, canvas.height * 0.72);
      } else {
        ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [text, subtext, width, height, bg, fg, border, fontSize]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0.05} />
    </mesh>
  );
}

interface MeterDialProps {
  title: string;
  unit: string;
  maxScale: number;
  pointerRatio: number;
  readingText: string;
  showNumericReadout?: boolean;
  width?: number;
  height?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  allowNegative?: boolean;
  overrange?: boolean;
  damaged?: boolean;
  reversed?: boolean;
}

export function MeterDial({
  title,
  unit,
  maxScale,
  pointerRatio,
  readingText,
  showNumericReadout = true,
  width = 0.62,
  height = 0.42,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  allowNegative = false,
  overrange = false,
  damaged = false,
  reversed = false,
}: MeterDialProps) {
  const statusBadge = damaged
    ? 'DAMAGED'
    : reversed
      ? 'REVERSED'
      : overrange
        ? 'OVERRANGE'
        : '';
  const renderedText = showNumericReadout ? readingText : '';

  const faceTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const alertBorder = damaged || overrange || reversed;
      ctx.strokeStyle = alertBorder ? '#dc2626' : '#334155';
      ctx.lineWidth = alertBorder ? 12 : 8;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.78;
      const r = canvas.width * 0.36;
      const startAngle = -Math.PI * 0.82;
      const endAngle = -Math.PI * 0.18;

      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.stroke();

      const majorTicks = 5;
      for (let i = 0; i <= 25; i++) {
        const frac = i / 25;
        const ang = startAngle + frac * (endAngle - startAngle);
        const isMajor = i % 5 === 0;
        const rInner = r - (isMajor ? 22 : 11);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = isMajor ? 4 : 2;
        ctx.stroke();

        if (isMajor) {
          const val = Math.round((i / (majorTicks * 5)) * maxScale);
          const rLabel = r - 42;
          ctx.fillStyle = '#0f172a';
          ctx.font = '700 22px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            String(val),
            cx + Math.cos(ang) * rLabel,
            cy + Math.sin(ang) * rLabel,
          );
        }
      }

      if (allowNegative) {
        // -5% sub-zero arc for reversed reading
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle - 0.11, startAngle);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      ctx.fillStyle = '#1e293b';
      ctx.font = '700 24px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, cx, 44);

      ctx.fillStyle = '#475569';
      ctx.font = '700 22px ui-monospace, monospace';
      ctx.fillText(unit, cx, cy - 58);

      if (statusBadge) {
        const bw = 178;
        const bh = 34;
        ctx.fillStyle = reversed && !damaged ? '#d97706' : '#dc2626';
        ctx.fillRect(cx - bw / 2, cy - 102, bw, bh);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 20px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(statusBadge, cx, cy - 84);
      }

      // Numeric readout strip under dial (omitted when student disables numeric readouts)
      if (showNumericReadout) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(48, canvas.height - 58, canvas.width - 96, 44);
        ctx.fillStyle = damaged ? '#f87171' : '#38bdf8';
        ctx.font = '700 28px ui-monospace, monospace';
        ctx.fillText(renderedText, cx, canvas.height - 35);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [
    title,
    unit,
    maxScale,
    allowNegative,
    overrange,
    damaged,
    reversed,
    statusBadge,
    showNumericReadout,
    renderedText,
  ]);

  useEffect(() => {
    return () => {
      faceTexture.dispose();
    };
  }, [faceTexture]);

  // Arc spans -0.32*PI (right) to +0.32*PI (left) around +Y axis when looking at +Z
  const maxSweep = Math.PI * 0.32;
  const clampedTargetRatio = Math.max(
    allowNegative ? -0.05 : 0,
    Math.min(1.05, pointerRatio),
  );
  const targetAngle = maxSweep - clampedTargetRatio * (maxSweep * 2);

  const needleGroupRef = useRef<THREE.Group>(null);
  const angleRef = useRef(targetAngle);
  const velocityRef = useRef(0);
  const targetAngleRef = useRef(targetAngle);
  targetAngleRef.current = targetAngle;

  // Second-order underdamped spring: small overshoot, ~400 ms settle
  useFrame((_, delta) => {
    const group = needleGroupRef.current;
    if (!group) return;
    const dt = Math.min(delta, 0.05);
    const omega = 16;
    const zeta = 0.65;
    const accel =
      omega * omega * (targetAngleRef.current - angleRef.current) -
      2 * zeta * omega * velocityRef.current;
    velocityRef.current += accel * dt;
    angleRef.current += velocityRef.current * dt;
    group.rotation.z = angleRef.current;
  });

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={faceTexture} roughness={0.5} />
      </mesh>
      <group
        ref={needleGroupRef}
        position={[0, -height * 0.28, 0.008]}
        rotation={[0, 0, targetAngle]}
      >
        <mesh position={[0, height * 0.3, 0]}>
          <boxGeometry args={[0.012, height * 0.58, 0.006]} />
          <meshStandardMaterial color={damaged ? '#64748b' : '#dc2626'} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.014, 16]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
