import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { Button, run } from "./primitives";
import type {
  AppState,
  Command,
  Direction,
  GameState,
  GameType,
} from "./types";

export const GAME_NAMES: Record<GameType, string> = {
  snake: "贪吃蛇",
  whack: "打地鼠",
  memory: "记忆灯序",
  pong: "双人乒乓球",
};
const MEMORY_CODES = [
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon",
];
const PONG_CODES = ["KeyW", "KeyS", "ArrowUp", "ArrowDown"];
const DIRECTIONS: [Direction, string, typeof ArrowUp][] = [
  ["left", "向左", ArrowLeft],
  ["right", "向右", ArrowRight],
  ["up", "向上", ArrowUp],
  ["down", "向下", ArrowDown],
];
const RULES: Record<GameType, string> = {
  snake: "方向键移动，吃掉食物。全键盘游走，只有蛇和食物亮起。",
  whack: "按下亮起的字母键，也可点击键盘图。30 秒内尽量多命中。",
  memory: "先看灯光顺序，再按 A S D F J K L ; 原样重复。共 20 轮。",
  pong: "左手 W / S，右手 ↑ / ↓，按住移动球拍。先得 7 分获胜。",
};
const keyLabel = (code: string) =>
  code === "Semicolon" ? ";" : code.replace(/^Key/, "");
const playing = (game?: GameState) => game?.status === "running";
const inProgress = (game?: GameState) =>
  playing(game) || game?.status === "paused";
const finished = (game?: GameState) => game?.status === "over" || game?.status === "won";
const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    Boolean(target.closest("input,select,textarea,[role='textbox']")));
export function canPressGameKey(game: GameState, code: string) {
  if (!playing(game)) return false;
  if (game.type === "whack") return /^Key[A-Z]$/.test(code);
  return (
    game.type === "memory" &&
    game.phase === "input" &&
    (game.padCodes || MEMORY_CODES).includes(code)
  );
}
function gameMessage(game: GameState | undefined, type: GameType) {
  if (game?.status === "paused") return "已暂停 · 按空格键或「继续」恢复";
  if (game?.status === "won")
    return type === "pong"
      ? `${tr(game.winner === "left" ? "左方" : "右方")}获胜，再来一局吧。`
      : type === "memory"
        ? "完成 20 轮，全部记住了！"
        : "填满键盘，通关了！";
  if (game?.status === "over")
    return type === "whack"
      ? "时间到！本局结束，再来一次吧。"
      : type === "memory"
        ? "顺序不对或时间已到，再试一次吧。"
        : type === "pong" && game.winner
          ? `${tr(game.winner === "left" ? "左方" : "右方")}获胜！`
          : "本局结束，再来一局吧。";
  if (!playing(game)) return "准备好后，开始一局。";
  if (type === "whack") return "寻找亮起的字母，准确按下。";
  if (type === "memory")
    return game?.phase === "watch"
      ? "先观察，记住闪烁顺序。"
      : game?.phase === "success"
        ? "答对了，准备下一轮。"
        : game?.phase === "error"
          ? "顺序不对。"
          : `轮到你 · 已输入 ${game?.inputIndex || 0} / ${game?.sequenceLength || 1}`;
  if (type === "pong")
    return game?.phase === "serve"
      ? `准备发球 · ${Math.max(1, Math.ceil((game.serveRemainingMs || 0) / 1000))}`
      : "接住来球，守住你的半场。";
  return "正在游戏，吃掉珊瑚色的食物。";
}

export function GamePanel({
  state,
  command,
}: {
  state: AppState | null;
  command: Command;
}) {
  const game = state?.game;
  const type = game?.type || "snake";
  const active = playing(game),
    paused = game?.status === "paused";
  const [speed, setSpeed] = useState(game?.speed || 3);
  const [busy, setBusy] = useState(false);
  const [heldCodes, setHeldCodes] = useState<string[]>([]);
  const canStart = Boolean(state?.device.connected && state?.firmware?.compatible !== false);
  const live = useRef({ game, command, speed, canStart });
  live.current = { game, command, speed, canStart };
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const held = useRef(new Map<string, Set<string>>());
  const busyRef = useRef(false);
  const pauseRequested = useRef(false);
  const restartHeld = useRef(new Set<string>());
  const send = (body: Record<string, unknown>) => {
    const result = queue.current.then(() => live.current.command(body));
    queue.current = result.catch(() => undefined);
    return result;
  };
  const hold = (code: string, source: string, pressed: boolean) => {
    const sources = held.current.get(code) || new Set<string>();
    const before = sources.size > 0;
    if (pressed) {
      if (live.current.game?.type !== "pong" || !playing(live.current.game))
        return;
      sources.add(source);
    } else sources.delete(source);
    if (sources.size) held.current.set(code, sources);
    else held.current.delete(code);
    const after = sources.size > 0;
    if (before !== after) {
      setHeldCodes([...held.current.keys()]);
      run(send({ op: "gameInput", code, pressed: after }));
    }
  };
  const releaseHeld = () => {
    const codes = [...held.current.keys()];
    held.current.clear();
    setHeldCodes([]);
    for (const code of codes)
      run(send({ op: "gameInput", code, pressed: false }));
  };
  const autoPause = () => {
    restartHeld.current.clear();
    releaseHeld();
    if (playing(live.current.game) && !pauseRequested.current) {
      pauseRequested.current = true;
      run(
        send({ op: "gamePause", paused: true }).catch((error) => {
          pauseRequested.current = false;
          throw error;
        }),
      );
    }
  };
  useEffect(() => {
    if (!active) {
      pauseRequested.current = false;
      releaseHeld();
    }
  }, [active]);
  useEffect(() => {
    if (game?.speed !== undefined) setSpeed(game.speed);
  }, [type, game?.speed]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const current = live.current.game;
      if (
        editable(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (["Enter", "NumpadEnter"].includes(event.code) &&
          (finished(current) || restartHeld.current.has(event.code))) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat || restartHeld.current.has(event.code)) return;
        restartHeld.current.add(event.code);
        if (finished(current) && live.current.canStart)
          run(action(() => send({ op: "gameRestart", speed: live.current.speed })));
        return;
      }
      if (!inProgress(current)) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat && !busyRef.current && !pauseRequested.current) {
          releaseHeld();
          if (playing(current)) pauseRequested.current = true;
          run(
            send({ op: "gamePause", paused: playing(current) }).catch(
              (error) => {
                pauseRequested.current = false;
                throw error;
              },
            ),
          );
        }
        return;
      }
      if (current?.type === "pong" && PONG_CODES.includes(event.code)) {
        event.preventDefault();
        if (!event.repeat) hold(event.code, "keyboard", true);
      } else if (
        (current?.type || "snake") === "snake" &&
        event.code.startsWith("Arrow")
      ) {
        event.preventDefault();
        if (playing(current) && !event.repeat) {
          const direction = event.code.slice(5).toLowerCase() as Direction;
          if (DIRECTIONS.some(([value]) => value === direction))
            run(send({ op: "gameInput", direction }));
        }
      } else if (current && canPressGameKey(current, event.code)) {
        event.preventDefault();
        if (!event.repeat)
          run(send({ op: "gameInput", code: event.code, pressed: true }));
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (restartHeld.current.delete(event.code)) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (held.current.get(event.code)?.has("keyboard")) {
        event.preventDefault();
        hold(event.code, "keyboard", false);
      }
    };
    const visibility = () => {
      if (document.hidden) autoPause();
    };
    const focus = (event: FocusEvent) => {
      if (editable(event.target)) releaseHeld();
    };
    // Capture Return before a focused game button can also activate on it.
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", autoPause);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("focusin", focus);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", autoPause);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("focusin", focus);
      autoPause();
    };
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      releaseHeld();
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const select = (gameType: GameType) =>
    action(async () => {
      if (inProgress(live.current.game)) await send({ op: "gameStop" });
      await send({ op: "gameSelect", gameType });
    });
  const pads = game?.padCodes || MEMORY_CODES;
  return (
    <aside className="inspector game-inspector arcade-inspector">
      <section className="game-description">
        <label className="game-picker">
          <span>{tr("选择游戏")}</span>
          <select
            aria-label={tr("游戏类型")}
            value={type}
            disabled={busy}
            onChange={(event) => run(select(event.target.value as GameType))}
          >
            {tr(Object.entries(GAME_NAMES).map(([value, name]) => (
              <option key={value} value={value}>
                {tr(name)}
              </option>
            )))}
          </select>
        </label>
        <p className="game-rules">{tr(RULES[type])}</p>
        <p
          className={`game-message ${paused ? "is-paused" : ""}`}
          role="status"
        >
          {tr(gameMessage(game, type))}
        </p>
        {finished(game) && <p className="game-details">{tr("按回车开始新的一局")}</p>}
        {tr(game?.recordWarning && (
          <p className="game-details" role="status">
            {tr(game.recordWarning)}
          </p>
        ))}
      </section>
      <section className="game-session">
        <div className={`game-scores ${type === "pong" ? "pong-score" : ""}`}>
          <div>
            <span>
              {tr(type === "pong"
                ? "左方 · W / S"
                : type === "memory"
                  ? "当前轮次"
                  : "得分")}
            </span>
            <strong>
              {tr(type === "pong"
                ? game?.leftScore || 0
                : type === "memory"
                  ? game?.round || 0
                  : game?.score || 0)}
              {tr(type === "memory" && <small> / 20</small>)}
            </strong>
          </div>
          <div>
            <span>
              {tr(type === "pong"
                ? "右方 · ↑ / ↓"
                : type === "whack"
                  ? "剩余时间"
                  : "最高纪录")}
            </span>
            <strong>
              {tr(type === "pong"
                ? game?.rightScore || 0
                : type === "whack"
                  ? Math.ceil(
                      (game?.status === "idle"
                        ? 30000
                        : (game?.remainingMs ?? 30000)) / 1000,
                    )
                  : game?.bestScore || 0)}
              {tr(type === "whack" && <small>{tr("秒")}</small>)}
            </strong>
          </div>
        </div>
        {tr(type === "whack" && (
          <p className="game-details">{tr("命中")}{tr(game?.hits || 0)}{tr("· 错按")}{tr(game?.mistakes || 0)}{tr("· 漏掉")}{tr(" ")}
            {tr(game?.misses || 0)}
          </p>
        ))}
        {tr(type === "memory" && game?.phase === "input" && inProgress(game) && (
          <p className="game-details">{tr(`下一键剩余 ${Math.ceil((game.remainingMs || 0) / 1000)} 秒`)}</p>
        ))}
        <label className="speed-field game-speed">{tr("游戏速度")}<span>{tr(speed)}</span>
          <input
            type="range"
            aria-label={tr("游戏速度")}
            min="1"
            max="10"
            value={speed}
            disabled={active || paused || busy}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </label>
        <div className="game-controls">
          <Button
            kind="primary"
            disabled={!state?.device.connected || state?.firmware?.compatible === false}
            busy={busy}
            icon={active ? <Pause size={15} /> : <Play size={15} />}
            onClick={() =>
              run(
                action(() =>
                  send(
                    inProgress(game)
                      ? { op: "gamePause", paused: active }
                      : { op: "gameStart", gameType: type, speed },
                  ),
                ),
              )
            }
          >
            {tr(active ? "暂停" : paused ? "继续" : finished(game) ? "再来一局" : "开始游戏")}
          </Button>
          <Button
            icon={<Square size={14} />}
            disabled={!game || game.status === "idle" || busy}
            onClick={() => run(action(() => send({ op: "gameStop" })))}
          >{tr("结束")}</Button>
        </div>
      </section>
      <section className="game-inputs">
        {tr(type === "snake" && (
          <div className="dpad">
            {tr(DIRECTIONS.map(([direction, label, Icon]) => (
              <button
                className={direction}
                key={direction}
                aria-label={tr(label)}
                disabled={!active}
                onClick={() => run(send({ op: "gameInput", direction }))}
              >
                <Icon size={22} />
              </button>
            )))}
          </div>
        ))}
        {tr(type === "whack" && (
          <div className="whack-guide">
            <span>{tr("当前目标")}</span>
            <strong>
              {tr((active || paused) && game?.targetCode
                ? keyLabel(game.targetCode)
                : "—")}
            </strong>
          </div>
        ))}
        {tr(type === "memory" && (
          <div className="memory-pads" aria-label={tr("记忆灯序按键")}>
            {tr(pads.map((code, index) => {
              const led = game?.padIndices?.[index];
              const lit = game?.cueIndex != null && game.cueIndex === led;
              return (
                <button
                  key={code}
                  className={lit ? "lit" : ""}
                  style={
                    lit && led !== undefined
                      ? {
                          backgroundColor: state?.colors[led],
                          borderColor: state?.colors[led],
                        }
                      : undefined
                  }
                  aria-label={tr(`记忆按键 ${keyLabel(code)}`)}
                  disabled={!active || game?.phase !== "input"}
                  onClick={() =>
                    run(send({ op: "gameInput", code, pressed: true }))
                  }
                >
                  {tr(keyLabel(code))}
                </button>
              );
            }))}
          </div>
        ))}
        {tr(type === "pong" && (
          <div className="pong-controls">
            {tr((
              [
                ["左方", ["KeyW", "KeyS"]],
                ["右方", ["ArrowUp", "ArrowDown"]],
              ] as const
            ).map(([player, codes]) => (
              <div key={player}>
                <span>{tr(player)}</span>
                {tr(codes.map((code, index) => (
                  <button
                    key={code}
                    className={heldCodes.includes(code) ? "held" : ""}
                    disabled={!active}
                    aria-label={tr(`${tr(player)} ${tr(index === 0 ? "上移" : "下移")}`)}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      hold(code, `pointer:${event.pointerId}`, true);
                    }}
                    onPointerUp={(event) =>
                      hold(code, `pointer:${event.pointerId}`, false)
                    }
                    onPointerCancel={(event) =>
                      hold(code, `pointer:${event.pointerId}`, false)
                    }
                    onLostPointerCapture={(event) =>
                      hold(code, `pointer:${event.pointerId}`, false)
                    }
                    onKeyDown={(event) => {
                      if (event.code === "Enter" && !event.repeat) {
                        event.preventDefault();
                        hold(code, `button:${code}`, true);
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.code === "Enter") {
                        event.preventDefault();
                        hold(code, `button:${code}`, false);
                      }
                    }}
                    onBlur={() => hold(code, `button:${code}`, false)}
                  >
                    {tr(index === 0 ? (
                      <ArrowUp size={15} />
                    ) : (
                      <ArrowDown size={15} />
                    ))}
                    <span>
                      {tr(code === "KeyW"
                        ? "W"
                        : code === "KeyS"
                          ? "S"
                          : index === 0
                            ? "↑"
                            : "↓")}
                    </span>
                  </button>
                )))}
              </div>
            )))}
          </div>
        ))}
        <p className="dpad-note">
          {tr(type === "pong" ? "按住移动 · " : "")}{tr("空格键暂停")}<br />{tr("离开窗口时自动暂停")}</p>
      </section>
    </aside>
  );
}
