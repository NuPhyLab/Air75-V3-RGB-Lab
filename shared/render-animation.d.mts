export type AnimationDefinition = {
  effect?: "static" | "move" | "pulse" | "wave" | "frames";
  direction?: "left" | "right" | "up" | "down";
  speed?: number;
  loop?: boolean;
  frames?: readonly { colors: readonly string[]; duration: number }[];
};

export function scaleColor(hex: string, scale: number): string;

export function renderAnimation(
  colors: readonly string[],
  animation: AnimationDefinition,
  elapsed: number,
): string[];

export function animationDuration(animation: AnimationDefinition): number;
