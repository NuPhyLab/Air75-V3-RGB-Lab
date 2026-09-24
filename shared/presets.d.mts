export type PresetKey = {
  index: number;
  code: string;
  x: number;
  y: number;
  w: number;
  h?: number;
};
export type PresetAnimation = {
  effect: "static" | "move" | "pulse" | "wave" | "frames";
  direction: "left" | "right" | "up" | "down";
  speed: number;
  loop: boolean;
  frames: { colors: string[]; duration: number }[];
};
export type Preset = {
  id: string;
  name: string;
  category: "pattern" | "motion";
  description: string;
  colors: string[];
  animation: PresetAnimation;
};
export const DEFAULT_COLOR: string;
export function heartColors(keys: readonly PresetKey[], color?: string): string[];
export function createPresets(keys: readonly PresetKey[]): Preset[];
