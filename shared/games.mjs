export const GAME_TYPES = Object.freeze(["snake", "whack", "memory", "pong"]);
export function validateGameType(type) {
  if (!GAME_TYPES.includes(type)) throw new Error("不支持这个游戏");
  return type;
}
