"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type OrbStatus = "idle" | "listening" | "thinking" | "speaking" | "executing" | "done";

interface Orb3DProps {
  status: OrbStatus;
  audioLevel?: number;
  awake?: boolean;
}

const PARTICLE_COUNT = 12000;
const MEMORY_TRAIL_COUNT = 800;
const ORBITAL_PARTICLE_COUNT = 400;
const RADIUS = 1.55;

const COLORS: Record<OrbStatus, string> = {
  idle: "#0aefff",
  listening: "#00ff87",
  thinking: "#b026ff",
  speaking: "#ff2d78",
  executing: "#ff6b35",
  done: "#ffffff",
};

// ─── Helpers ────────────────────────────────────────────────────

function fibonacciSphere(count: number, radius: number) {
  const pos = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pos[i * 3] = Math.cos(theta) * r * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return pos;
}

// ─── Core — respira como um coração ─────────────────────────────

function CoreEnergy({ color, status, awake }: { color: string; status: OrbStatus; awake?: boolean }) {
  const core = useRef<THREE.Mesh>(null!);
  const aura = useRef<THREE.Mesh>(null!);
  const innerGlow = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => new THREE.SphereGeometry(RADIUS * 0.42, 64, 64), []);
  const auraGeo = useMemo(() => new THREE.SphereGeometry(RADIUS * 0.8, 64, 64), []);
  const innerGeo = useMemo(() => new THREE.SphereGeometry(RADIUS * 0.2, 32, 32), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), [color]);
  const auraMat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }), [color]);
  const innerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), []);

  useEffect(() => { mat.color.set(color); auraMat.color.set(color); }, [color, mat, auraMat]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const isActive = status !== "idle" && awake;
    const stateBoost = status === "executing" ? 0.16 : status === "thinking" ? 0.1 : status === "speaking" ? 0.08 : 0;
    const breathe = 1 + Math.sin(t * 0.72) * (awake ? 0.055 : 0.032) + stateBoost;
    core.current.scale.setScalar(breathe);
    aura.current.scale.setScalar(1.05 + Math.sin(t * 0.42) * 0.06 + (awake ? 0.08 : 0));
    mat.opacity = 0.34 + Math.sin(t * 1.1) * 0.11 + (awake ? 0.05 : 0);
    auraMat.opacity = 0.055 + Math.sin(t * 0.8) * 0.025 + (status === "done" ? 0.26 : 0);
    // Inner white core pulse — like a heartbeat during thought/speech
    innerMat.opacity = isActive ? 0.4 + Math.sin(t * 4.2) * 0.25 : 0.15 + Math.sin(t * 1.3) * 0.08;
    innerGlow.current.scale.setScalar(1 + Math.sin(t * (isActive ? 4.2 : 1.3)) * 0.06);
  });

  return (
    <>
      <mesh ref={aura} geometry={auraGeo} material={auraMat} />
      <mesh ref={innerGlow} geometry={innerGeo} material={innerMat} />
      <mesh ref={core} geometry={geo} material={mat} />
    </>
  );
}

// ─── Neural Firing — neurônios que disparam com propagação ──────

function NeuralFiring({ color, status, audioLevel = 0 }: { color: string; status: OrbStatus; audioLevel?: number }) {
  const points = useRef<THREE.Points>(null!);
  const { positions, seeds } = useMemo(() => {
    const p = fibonacciSphere(PARTICLE_COUNT, RADIUS);
    return { positions: p, seeds: new Float32Array(p) };
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    // Per-particle firing state: 0 = resting, 1 = firing, then decays
    const firing = new Float32Array(PARTICLE_COUNT);
    const sizes = new Float32Array(PARTICLE_COUNT).fill(0.021);
    g.setAttribute("firing", new THREE.BufferAttribute(firing, 1));
    g.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [positions]);
  const material = useMemo(() => new THREE.PointsMaterial({
    color, size: 0.021, transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }), [color]);

  useEffect(() => { material.color.set(color); }, [color, material]);

  // Neural firing simulation
  const firingRef = useRef(new Float32Array(PARTICLE_COUNT));
  const nextFireRef = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const firing = firingRef.current;
    const sizeAttr = geometry.getAttribute("size") as THREE.BufferAttribute;
    const sizeArr = sizeAttr.array as Float32Array;

    const isThinking = status === "thinking";
    const isSpeaking = status === "speaking";
    const isListening = status === "listening";
    const converge = isListening ? 0.06 + audioLevel * 0.04 : isThinking ? -0.05 : status === "executing" ? -0.12 : 0;
    const waveSpeed = isThinking ? 4.2 : isSpeaking ? 5.5 : status === "executing" ? 6.5 : 1.6;

    // Update particle positions (neural breathing)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const sx = seeds[ix], sy = seeds[ix + 1], sz = seeds[ix + 2];
      const phase = t * waveSpeed + i * 0.006;
      const noise = Math.sin(phase + sy * 2.1) * 0.018 + Math.cos(phase * 0.47 + sx * 3.2) * 0.012;
      const voiceJitter = isSpeaking ? Math.sin(t * 9 + i * 0.02) * 0.018 : 0;
      const scale = 1 + noise + converge + voiceJitter;
      arr[ix] = sx * scale;
      arr[ix + 1] = sy * scale;
      arr[ix + 2] = sz * scale;
    }
    pos.needsUpdate = true;

    // Neural firing simulation
    const firingRate = isThinking ? 0.008 : isSpeaking ? 0.005 : isListening ? 0.003 : 0.001;
    const decayRate = isThinking ? 0.92 : isSpeaking ? 0.94 : 0.96;

    // Randomly trigger new firings
    for (let i = 0; i < 3; i++) {
      if (Math.random() < firingRate * (isThinking ? 4 : isSpeaking ? 2 : 1)) {
        const idx = Math.floor(Math.random() * PARTICLE_COUNT);
        firing[idx] = 1.0;
        // Propagate to neighbors (by Fibonacci sphere indexing, neighbors are nearby indices)
        for (let d = -3; d <= 3; d++) {
          if (d !== 0) {
            const n = (idx + d + PARTICLE_COUNT) % PARTICLE_COUNT;
            if (Math.random() < 0.3) firing[n] = Math.max(firing[n], 0.7);
          }
        }
      }
    }

    // Update sizes based on firing state
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      firing[i] *= decayRate;
      // Keep minimum glow
      if (firing[i] < 0.01) firing[i] = 0;
      const baseSize = isThinking ? 0.024 : isSpeaking ? 0.022 : 0.021;
      const audioBoost = isListening ? audioLevel * 0.012 : isSpeaking ? audioLevel * 0.008 : 0;
      const fireBoost = firing[i] * 0.04;
      sizeArr[i] = baseSize + audioBoost + fireBoost;
    }
    sizeAttr.needsUpdate = true;

    // Rotation
    const speed = isThinking ? 0.22 : isSpeaking ? 0.15 : status === "executing" ? 0.32 : 0.055;
    points.current.rotation.y = t * speed;
    points.current.rotation.x = Math.sin(t * 0.19) * 0.08;
    points.current.rotation.z = Math.cos(t * 0.13) * 0.05;

    // Opacity glow = firing activity
    let totalFire = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) totalFire += firing[i];
    const fireGlow = totalFire / PARTICLE_COUNT * 0.3;
    material.opacity = 0.55 + Math.sin(t * 0.8) * 0.1 + (isListening ? audioLevel * 0.28 : 0) + fireGlow;
    // Make particles larger when firing for a brighter flash effect
    (material as any).size = 0.021 + fireGlow * 0.025;

    // Color intensity from firing
    const intensity = 1 + fireGlow * 2;
    material.color.setHSL(
      new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).h,
      1,
      0.5 + fireGlow * 0.3
    );
  });

  return <points ref={points} geometry={geometry} material={material} />;
}

// ─── Memory Traces — rastros fantasma de interações passadas ────

function MemoryTraces({ color, status, awake }: { color: string; status: OrbStatus; awake?: boolean }) {
  const points = useRef<THREE.Points>(null!);
  const data = useMemo(() => {
    const p = new Float32Array(MEMORY_TRAIL_COUNT * 3);
    for (let i = 0; i < MEMORY_TRAIL_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = RADIUS * (0.6 + Math.random() * 0.9);
      p[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      p[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      p[i * 3 + 2] = Math.cos(phi) * r;
    }
    return p;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data, 3));
    const opacity = new Float32Array(MEMORY_TRAIL_COUNT).fill(0);
    g.setAttribute("opacity", new THREE.BufferAttribute(opacity, 1));
    return g;
  }, [data]);
  const material = useMemo(() => new THREE.PointsMaterial({
    color, size: 0.012, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }), [color]);

  useEffect(() => { material.color.set(color); }, [color, material]);

  const memoryRef = useRef(0); // accumulates "memory intensity" from past interactions

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const opacityAttr = geometry.getAttribute("opacity") as THREE.BufferAttribute;
    const opArr = opacityAttr.array as Float32Array;

    // When active, build memory
    if (awake && (status === "speaking" || status === "thinking")) {
      memoryRef.current = Math.min(memoryRef.current + 0.002, 0.25);
    } else if (status === "idle" || !awake) {
      memoryRef.current *= 0.998; // Slowly fade
    }

    // Particles drift and fade
    for (let i = 0; i < MEMORY_TRAIL_COUNT; i++) {
      const ix = i * 3;
      const drift = Math.sin(t * 0.1 + i * 0.05) * 0.002;
      const drift2 = Math.cos(t * 0.08 + i * 0.07) * 0.002;
      arr[ix] += drift;
      arr[ix + 1] += drift2;
      arr[ix + 2] += Math.sin(t * 0.06 + i * 0.03) * 0.002;
      // Keep within bounds
      const d = Math.sqrt(arr[ix] ** 2 + arr[ix + 1] ** 2 + arr[ix + 2] ** 2);
      if (d > RADIUS * 3) {
        arr[ix] *= 0.99;
        arr[ix + 1] *= 0.99;
        arr[ix + 2] *= 0.99;
      }
      // Opacity = memory intensity with individual variation
      const individual = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.5 + i * 0.1));
      opArr[i] = memoryRef.current * individual;
    }
    pos.needsUpdate = true;
    opacityAttr.needsUpdate = true;
    material.opacity = Math.min(memoryRef.current * 1.5, 0.35);
  });

  return <points ref={points} geometry={geometry} material={material} />;
}

// ─── Energy Flow — campo de energia fluindo ─────────────────────

function EnergyFlow({ color, status, awake }: { color: string; status: OrbStatus; awake?: boolean }) {
  const points = useRef<THREE.Points>(null!);
  const count = 2600;
  const data = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = (Math.random() - 0.5) * 3.8;
      const r = RADIUS * (1.1 + Math.random() * 1.05);
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = h;
      p[i * 3 + 2] = Math.sin(a) * r;
    }
    return p;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data, 3));
    return g;
  }, [data]);
  const material = useMemo(() => new THREE.PointsMaterial({
    color, size: 0.025, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }), [color]);

  useEffect(() => { material.color.set(color); }, [color, material]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const intensity = status === "executing" ? 4.5 : status === "thinking" ? 3.2 : status === "speaking" ? 2 : status === "listening" ? 1.4 : 1;
    points.current.rotation.y = t * 0.14 * intensity;
    points.current.rotation.x = Math.sin(t * 0.36) * 0.22;
    points.current.rotation.z = t * 0.025 * (awake ? 2 : 1);
    material.opacity = 0.12 + Math.sin(t * intensity) * 0.05 + (awake ? 0.08 : 0);
  });

  return <points ref={points} geometry={geometry} material={material} />;
}

// ─── Orbital Rings com partículas orbitando ─────────────────────

function OrbitalRings({ color, status, awake }: { color: string; status: OrbStatus; awake?: boolean }) {
  const refs = useRef<THREE.Mesh[]>([]);
  // More rings with varied properties
  const specs = useMemo(() => [
    { r: 1.82, tube: 0.006, rot: [0.42, 0.1, 0.0], speed: 0.52, opacity: 0.32 },
    { r: 2.12, tube: 0.004, rot: [1.05, 0.28, 0.65], speed: -0.37, opacity: 0.22 },
    { r: 2.42, tube: 0.003, rot: [0.22, 1.18, 0.36], speed: 0.29, opacity: 0.15 },
    { r: 1.58, tube: 0.003, rot: [1.46, 0.0, 0.9], speed: -0.64, opacity: 0.18 },
    { r: 2.75, tube: 0.002, rot: [0.8, 0.5, 1.2], speed: 0.19, opacity: 0.10 },
    { r: 2.95, tube: 0.002, rot: [1.8, 0.1, 0.3], speed: -0.15, opacity: 0.07 },
  ], []);
  const geos = useMemo(() => specs.map((s) => new THREE.TorusGeometry(s.r, s.tube, 12, 180)), [specs]);
  const mats = useMemo(() => specs.map((s) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: s.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })), [color, specs]);

  useEffect(() => { mats.forEach((m) => m.color.set(color)); }, [color, mats]);

  useFrame(({ clock }) => {
    const boost = status === "thinking" ? 3.4 : status === "executing" ? 4.4 : status === "speaking" ? 1.8 : 1;
    refs.current.forEach((mesh, i) => {
      const t = clock.getElapsedTime();
      mesh.rotation.x = specs[i].rot[0] + t * 0.035 * specs[i].speed * boost;
      mesh.rotation.y = specs[i].rot[1] + t * 0.05 * specs[i].speed * boost;
      mesh.rotation.z = specs[i].rot[2] + t * 0.08 * specs[i].speed * boost;
      mats[i].opacity = specs[i].opacity * (awake ? 1.45 : 1) * (status === "thinking" || status === "executing" ? 1.8 : 1);
    });
  });

  return <>{specs.map((s, i) => <mesh key={i} ref={(el) => { if (el) refs.current[i] = el; }} geometry={geos[i]} material={mats[i]} />)}</>;
}

// ─── Orbital Particles — partículas fluindo pelos anéis ─────────

function OrbitalParticles({ color, status }: { color: string; status: OrbStatus }) {
  const points = useRef<THREE.Points>(null!);
  const count = ORBITAL_PARTICLE_COUNT;
  const data = useMemo(() => {
    const p = new Float32Array(count * 3);
    const orbits = new Float32Array(count); // orbit radius for each particle
    const angles = new Float32Array(count); // initial angle
    const speeds = new Float32Array(count); // orbital speed
    for (let i = 0; i < count; i++) {
      orbits[i] = 1.7 + Math.random() * 1.4;
      angles[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.2 + Math.random() * 0.5;
      const a = angles[i];
      p[i * 3] = Math.cos(a) * orbits[i];
      p[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      p[i * 3 + 2] = Math.sin(a) * orbits[i];
    }
    return { positions: p, orbits, angles, speeds };
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    return g;
  }, [data]);
  const material = useMemo(() => new THREE.PointsMaterial({
    color, size: 0.018, transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }), [color]);

  useEffect(() => { material.color.set(color); }, [color, material]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const speedMult = status === "thinking" ? 2.5 : status === "executing" ? 3 : status === "speaking" ? 1.8 : 1;

    for (let i = 0; i < count; i++) {
      const angle = data.angles[i] + t * data.speeds[i] * 0.3 * speedMult;
      const r = data.orbits[i] + Math.sin(t * 0.5 + i) * 0.05;
      arr[i * 3] = Math.cos(angle) * r;
      arr[i * 3 + 1] = Math.sin(t * 0.8 + i * 0.1) * 0.2;
      arr[i * 3 + 2] = Math.sin(angle) * r;
    }
    pos.needsUpdate = true;
    material.opacity = 0.08 + Math.sin(t * 0.5) * 0.04 + (status === "thinking" || status === "executing" ? 0.1 : 0);
  });

  return <points ref={points} geometry={geometry} material={material} />;
}

// ─── Neural Connections ─────────────────────────────────────────

function NeuralConnections({ color, visible }: { color: string; visible: boolean }) {
  const lines = useRef<THREE.LineSegments>(null!);
  const count = 760;
  const geometry = useMemo(() => {
    const base = fibonacciSphere(count, RADIUS * 0.98);
    const segments: number[] = [];
    for (let i = 0; i < count; i += 3) {
      const j = (i * 17 + 41) % count;
      segments.push(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], base[j * 3], base[j * 3 + 1], base[j * 3 + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    return g;
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [color]);

  useEffect(() => { material.color.set(color); }, [color, material]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    lines.current.rotation.y = t * 0.07;
    lines.current.rotation.x = Math.sin(t * 0.2) * 0.06;
    material.opacity += ((visible ? 0.12 : 0.018) - material.opacity) * 0.055;
  });

  return <lineSegments ref={lines} geometry={geometry} material={material} />;
}

// ─── State Waves ────────────────────────────────────────────────

function StateWaves({ color, status, audioLevel }: { color: string; status: OrbStatus; audioLevel: number }) {
  const refs = useRef<THREE.Mesh[]>([]);
  const geo = useMemo(() => new THREE.RingGeometry(RADIUS * 0.95, RADIUS * 0.97, 128), []);

  if (status !== "speaking" && status !== "listening" && status !== "done") return null;

  return (
    <>
      {[0, 1, 2, 3, 4].map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el; }} geometry={geo} rotation={[Math.PI / 2, 0, i * 0.64]}>
          <meshBasicMaterial color={color} transparent opacity={0.18 + audioLevel * 0.18} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <WaveAnimator refs={refs} status={status} audioLevel={audioLevel} />
    </>
  );
}

function WaveAnimator({ refs, status, audioLevel }: { refs: React.MutableRefObject<THREE.Mesh[]>; status: OrbStatus; audioLevel: number }) {
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      const phase = ((t * (status === "done" ? 1.6 : 0.8 + audioLevel * 0.5) - i * 0.24) % 1 + 1) % 1;
      const scale = 1 + phase * (status === "done" ? 1.6 : 0.8 + audioLevel * 0.3);
      mesh.scale.setScalar(scale);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (status === "done" ? 0.42 : 0.22 + audioLevel * 0.15) * (1 - phase);
    });
  });
  return null;
}

// ─── Holographic Shell ──────────────────────────────────────────

function HolographicShell({ color, status }: { color: string; status: OrbStatus }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(RADIUS * 1.26, 2), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.045,
    blending: THREE.AdditiveBlending, wireframe: true, depthWrite: false,
  }), [color]);

  useEffect(() => { mat.color.set(color); }, [color, mat]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    mesh.current.rotation.y = -t * 0.035;
    mesh.current.rotation.x = t * 0.02;
    mat.opacity = 0.035 + Math.sin(t * 0.7) * 0.015 + (status === "thinking" ? 0.04 : 0);
  });

  return <mesh ref={mesh} geometry={geo} material={mat} />;
}

// ─── Atmospheric Fog ────────────────────────────────────────────

function AtmosphericDepth({ color, status }: { color: string; status: OrbStatus }) {
  const { scene } = useThree();

  useEffect(() => {
    const fogColor = new THREE.Color(color);
    fogColor.multiplyScalar(0.08);
    scene.fog = new THREE.FogExp2(fogColor, 0.035 + (status !== "idle" ? 0.015 : 0));
    return () => { scene.fog = null; };
  }, [color, scene, status]);

  return null;
}

// ─── Orb Scene ──────────────────────────────────────────────────

function OrbScene(props: Orb3DProps) {
  const color = COLORS[props.status];
  const showConnections = props.status === "thinking" || props.status === "executing" || Boolean(props.awake);
  return (
    <group>
      <ambientLight intensity={0.18} />
      <AtmosphericDepth color={color} status={props.status} />
      <HolographicShell color={color} status={props.status} />
      <StateWaves color={color} status={props.status} audioLevel={props.audioLevel ?? 0} />
      <OrbitalParticles color={color} status={props.status} />
      <EnergyFlow color={color} status={props.status} awake={props.awake} />
      <OrbitalRings color={color} status={props.status} awake={props.awake} />
      <NeuralConnections color={color} visible={showConnections} />
      <MemoryTraces color={color} status={props.status} awake={props.awake} />
      <NeuralFiring color={color} status={props.status} audioLevel={props.audioLevel} />
      <CoreEnergy color={color} status={props.status} awake={props.awake} />
    </group>
  );
}

// ─── Exported Component ─────────────────────────────────────────

export default function MiraiOrb3D(props: Orb3DProps) {
  const [size, setSize] = useState(320);

  useEffect(() => {
    const update = () => {
      const min = Math.min(window.innerWidth, window.innerHeight);
      setSize(Math.max(240, Math.min(520, min * (props.awake ? 0.35 : 0.32))));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [props.awake]);

  return (
    <div className="mirai-orb-shell" style={{ width: size, height: size }}>
      <Canvas camera={{ position: [0, 0, 5.8], fov: 52 }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} style={{ pointerEvents: "none" }}>
        <OrbScene {...props} />
      </Canvas>
    </div>
  );
}
