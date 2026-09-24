import { createPresets, heartColors as createHeart, DEFAULT_COLOR } from "../../shared/presets.mjs";
import type { Key, Scene } from "./types";
export { DEFAULT_COLOR };
export const heartColors = (layout: Key[], color = DEFAULT_COLOR) => createHeart(layout, color);
export const presetCatalog = (layout: Key[]) => createPresets(layout);
export function presets(layout: Key[]): Scene[] {
  return presetCatalog(layout).map(({ name, colors, animation }) => ({ name, colors, animation }));
}
