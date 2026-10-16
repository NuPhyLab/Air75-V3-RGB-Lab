export type Key = {
  index: number;
  code: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Direction = "left" | "right" | "up" | "down";
export type StudioMode = "paint" | "animation" | "trigger" | "game";
export const STUDIO_MODES: { id: StudioMode; label: string }[] = [
  { id: "paint", label: "绘制" },
  { id: "animation", label: "动画" },
  { id: "trigger", label: "按键触发" },
  { id: "game", label: "游戏" },
];
export type Animation = {
  effect: "static" | "move" | "pulse" | "wave" | "frames";
  direction: Direction;
  speed: number;
  loop: boolean;
  frames?: { colors: string[]; duration: number }[];
};
export type Scene = {
  id?: string;
  name: string;
  colors: string[];
  animation: Animation;
  trigger?: TriggerConfig;
  createdAt?: string;
  updatedAt?: string;
};
export type TriggerConfig = {
  code: string;
  count: number;
  intervalMs: number;
};
export type TriggerState = {
  armed: boolean;
  flashing: boolean;
  completed: number;
  config: TriggerConfig;
  monitor: "global" | "window" | "off";
  warning?: string | null;
};
export type Task = {
  id?: string;
  threadId?: string;
  title?: string;
  name?: string;
  status?: string;
  state?: string;
  project?: string | null;
  cwd?: string | null;
  evidence?: string;
  eventAt?: string | null;
  [key: string]: unknown;
};
export type Shortcut = {
  id?: string;
  action?: string;
  label: string;
  shortcut?: string;
  available?: boolean;
};
export type GameType = "snake" | "whack" | "memory" | "pong";
export type GameState = {
  lossFlashing?: boolean;
  recordWarning?: string | null;
  type?: GameType;
  status: "idle" | "running" | "paused" | "over" | "won";
  score: number;
  bestScore: number;
  speed: number;
  direction?: Direction;
  target?: number | null;
  targetCode?: string | null;
  remainingMs?: number;
  hits?: number;
  misses?: number;
  mistakes?: number;
  padIndices?: number[];
  padCodes?: string[];
  round?: number;
  inputIndex?: number;
  sequenceLength?: number;
  cueIndex?: number | null;
  phase?:
    | "watch"
    | "input"
    | "success"
    | "error"
    | "serve"
    | "rally"
    | "finished";
  leftScore?: number;
  rightScore?: number;
  winner?: "left" | "right" | null;
  paddles?: unknown;
  ball?: unknown;
  serveRemainingMs?: number;
};
export type AppState = {
  audio?: import("./AudioPanel").AudioState;
  bluetooth?: {connected:boolean;status:'connected'|'disconnected'|'ambiguous'|'unavailable';count:number;error:string|null};
  lightPower?: {sleeping:boolean;reason:"duration"|"idle"|null;remainingMs:number|null;idleMs:number;systemIdleAvailable:boolean|null};
  firmware?: {
    status: "disconnected" | "checking" | "unavailable" | "unknown" | "updateAvailable" | "newer" | "current";
    current: string | null;
    latest: string | null;
    checking: boolean;
    stale: boolean;
    checkedAt: number | null;
    error: string | null;
    updateUrl: string;
    compatible: boolean;
    verifiedVersion: string;
  };
  device: {
    connected: boolean;
    armed: boolean;
    firmware?: string;
    ledCount?: number;
    error?: string | null;
    [key: string]: unknown;
  };
  playback: {
    mode: string;
    playing: boolean;
    fps?: number;
    framesSent?: number;
    lastError?: string | null;
  };
  colors: string[];
  scenes: Scene[];
  settings: {
    brightness: number;
    codexEnabled: boolean;
    quotaSideEnabled: boolean;
    slotIds: string[];
    [key: string]: unknown;
  };
  claude?: {
    available: boolean;
    reason?: string | null;
    tasks: Task[];
    slots?: (Task | null)[];
    hooks?: unknown;
    lighting?: unknown;
    taskSource?: unknown;
    quota?: unknown;
    commands?: { id: string; label: string; available?: boolean; reason?: string }[];
    app?: unknown;
    keys?: unknown;
    active?: boolean;
    [key: string]: unknown;
  };
  codex: {
    available: boolean;
    reason?: string;
    tasks: Task[];
    slots?: (Task | string | null)[];
    quota?: unknown;
    updatedAt?: string | number;
    shortcuts?: Shortcut[];
    [key: string]: unknown;
  };
  build?: { version?: string; platform?: string; arch?: string; adhoc: boolean; identity: string; packagedAt: string };
  game: GameState;
  trigger?: TriggerState;
  native?: Record<string, unknown>;
  [key: string]: unknown;
};
export type Command = (body: Record<string, unknown>) => Promise<unknown>;
export type Notify = (message: string, kind?: "error" | "success") => void;
export const DEFAULT_ANIMATION: Animation = {
  effect: "static",
  direction: "right",
  speed: 4,
  loop: true,
};
export const blankColors = () => Array<string>(84).fill("#000000");
