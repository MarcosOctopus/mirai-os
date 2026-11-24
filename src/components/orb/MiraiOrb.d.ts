// Tipos do motor recebido do dono (`mirai-orb.zip`).
//
// POR QUE ESTE ARQUIVO EXISTE: o motor é `.jsx` verbatim do pacote — e não se
// mexe na peça do dono. Sem tipos, o TypeScript deduzia as props PELOS PADRÕES
// (`level = null` ⇒ "level: null | undefined") e o build quebrava com
// "Type 'number' is not assignable to type 'null | undefined'". Declarar os
// tipos aqui resolve sem tocar em uma linha do motor.

import type { CSSProperties } from "react";

export type EstadoMotor = "idle" | "listening" | "thinking" | "speaking";
export type ModoMotor = "normal" | "dark" | "darkMatter";
export type TemaMotor = "dark" | "light";
export type Cor = [number, number, number];

export interface OpcoesOrb {
  particles?: number;
  scale?: number;
  spread?: number;
  spin?: number;
  glow?: number;
  bloom?: number;
  gap?: number;
  darkStars?: number;
  darkDisk?: number;
  space?: Cor;
  spaceLight?: Cor;
  theme?: TemaMotor;
  palette?: { deep: Cor; main: Cor; light: Cor; hot: Cor };
  paletteLight?: { deep: Cor; main: Cor; light: Cor; hot: Cor };
  darkPalette?: { white: Cor; cool: Cor; warm: Cor };
  darkPaletteLight?: { white: Cor; cool: Cor; warm: Cor };
}

export interface PropsOrb {
  /** AnalyserNode do microfone ou da voz da Mirai. */
  analyser?: AnalyserNode | null;
  /** Nível 0..1, se o volume já vem calculado de fora. */
  level?: number | null;
  state?: EstadoMotor;
  mode?: ModoMotor;
  theme?: TemaMotor;
  /** Lado em px (aceita também className/style). */
  size?: number;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  options?: OpcoesOrb;
}

export interface InstanciaOrb {
  setAnalyser(a: AnalyserNode | null): void;
  setLevel(v: number | null): void;
  setState(s: EstadoMotor): void;
  setMode(m: ModoMotor): void;
  getMode(): "normal" | "dark";
  setTheme(t: TemaMotor): void;
  destroy(): void;
}

export default function MiraiOrb(props: PropsOrb): React.ReactElement;

export function createMiraiOrb(canvas: HTMLCanvasElement, options?: OpcoesOrb): InstanciaOrb;
/** "vamos rodar o Dark Matter" · "Protocolo Dark Matter" · "matéria escura" */
export function isDarkMatterCommand(text: string): boolean;
/** "sair do Dark Matter" · "protocolo normal" · "voltar ao normal" */
export function isNormalModeCommand(text: string): boolean;
