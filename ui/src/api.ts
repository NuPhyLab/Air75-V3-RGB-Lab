import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, Key, Notify } from "./types";
import {nativeCodexKeys} from './codexKeys';
declare global {
  interface Window {
    __AIR_TOKEN__?: string;
    __AIR_EXITING__?: boolean;
  }
}
async function request(path: string, body?: Record<string, unknown>) {
  if (window.__AIR_EXITING__) throw new Error("软件正在恢复键盘并退出");
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Air-Token": window.__AIR_TOKEN__ ?? "",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const value = await res.json();
  if (!res.ok || value.ok === false)
    throw new Error(value.error || `请求失败 (${res.status})`);
  return value;
}
export function useAirApi(notify: Notify) {
  const [state, setState] = useState<AppState | null>(null);
  const [layout, setLayout] = useState<Key[]>([]);
  const [serviceError, setServiceError] = useState("");
  const [exiting, setExiting] = useState(Boolean(window.__AIR_EXITING__));
  const mounted = useRef(true);
  const latestState = useRef<AppState | null>(null);
  const refreshId = useRef(0);
  const appliedRefresh = useRef(0);
  const refresh = useCallback(async () => {
    if (window.__AIR_EXITING__) return;
    const id = ++refreshId.current;
    try {
      const next = await request("/api/state");
      if (mounted.current && !window.__AIR_EXITING__ && id > appliedRefresh.current) {
        appliedRefresh.current = id;
        await nativeCodexKeys({kind:'config',value:next.codex?.keys}).catch(()=>{});
        if (!mounted.current || window.__AIR_EXITING__ || id !== appliedRefresh.current) return;
        latestState.current = next;
        setState(next);
        setServiceError("");
      }
    } catch (error) {
      if (mounted.current && !window.__AIR_EXITING__ && id > appliedRefresh.current)
        setServiceError(
          error instanceof Error ? error.message : "本地服务未响应",
        );
    }
  }, []);
  useEffect(() => {
    const changed = () => { setExiting(Boolean(window.__AIR_EXITING__)); setServiceError(""); };
    window.addEventListener("nuphylab:shutdown", changed);
    return () => window.removeEventListener("nuphylab:shutdown", changed);
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (exiting) return () => { mounted.current = false; };
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (mounted.current) {
        const gameRunning = latestState.current?.playback.mode === "game" &&
          latestState.current?.game.status === "running";
        const triggerArmed = latestState.current?.playback.mode === "trigger";
        timer = setTimeout(tick, gameRunning || triggerArmed || latestState.current?.audio?.active ? 50 : 500);
      }
    };
    void tick();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [refresh, notify, exiting]);
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const getLayout = async () => {
      try {
        const value = await request("/api/layout");
        if (active) setLayout(Array.isArray(value) ? value : value.keys || []);
      } catch {
        if (active && !window.__AIR_EXITING__) timer = setTimeout(getLayout, 2000);
      }
    };
    void getLayout();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const command = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const value = await request("/api/command", body);
        await refresh();
        return value.result;
      } catch (error) {
        if (!window.__AIR_EXITING__) notify(error instanceof Error ? error.message : "操作失败");
        throw error;
      }
    },
    [notify, refresh],
  );
  return { state, layout, serviceError, command, refresh, exiting };
}
export function exportScenes(scenes: unknown, name: string) {
  const blob = new Blob(
    [JSON.stringify({ format: "air-studio", version: 1, scenes }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
