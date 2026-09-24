export interface HSV {
  h: number;
  s: number;
  v: number;
}

export function hexToHsv(
  hex: string,
  fallbackHue?: number,
  fallbackSaturation?: number,
): HSV;

export function hsvToHex(color: HSV): string;

export function pointToHueSaturation(
  dx: number,
  dy: number,
  radius: number,
  previousHue?: number,
): Pick<HSV, "h" | "s">;
