import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
export function hardwareErrorMessage(code, detail) {
  const messages = {
    LIGHTING_DISABLED: "请先在键盘上按 Fn＋↑ 开启灯光，再点击播放。",
    STATE_VERIFY_FAILED: "键盘未确认灯光设置，请点击重新连接后重试。",
    COLOR_VERIFY_FAILED: "灯光输出校验未通过，播放已停止。",
    ROUTE_MISMATCH: "键盘连接被其他软件改变，请关闭其他灯效软件后重新连接。",
    RESTORE_REQUIRED: "灯光控制已停止，原有灯效尚未恢复。请重新连接键盘后点击「恢复原有灯效」。",
    RECOVERY_REQUIRED: "上次灯光尚未恢复，请重新连接键盘后重试。",
  };
  const message = messages[code];
  if (!message) return detail;
  if (code === "LIGHTING_DISABLED") return message;
  return message + (detail.includes("Original lighting was restored and verified.") ? "已恢复原有灯效。" : "");
}
export class Hardware extends EventEmitter {
  constructor(binary, backup) {
    super();
    this.binary = binary;
    this.backup = backup;
    this.requests = new Map();
    this.serial = 0;
    this.tail = Promise.resolve();
    this.state = {
      connected: false,
      armed: false,
      firmware: null,
      ledCount: 0,
      error: null,
      errorCode: null,
    };
    this.child = null;
  }
  start() {
    if (this.child) return;
    this.restoreFailure = null;
    this.keyRestoreFailure = null;
    this.shutdownResult = null;
    this.diagnostics = "";
    const child = spawn(this.binary, ["--backup", this.backup], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.event) {
        if (msg.event === "disconnected") {
          this.state = {
            ...this.state,
            connected: false,
            armed: false,
            recoveryPending: msg.needsRestore ?? this.state.recoveryPending ?? false,
            needsRestore: msg.needsRestore ?? this.state.needsRestore ?? false,
            error: null,
            errorCode: "DEVICE_NOT_FOUND",
            firmware: null,
            ledCount: 0,
          };
        }
        if (msg.event === "restoreFailed") {
          this.restoreFailure = msg.error;
          this.state.error = msg.error;
        }
        if (msg.event === "keyRestoreFailed") this.keyRestoreFailure = msg.error;
        if (msg.event === "shutdownComplete") this.shutdownResult = msg;
        this.emit(msg.event, msg);
        return;
      }
      const req = this.requests.get(msg.id);
      if (!req) return;
      this.requests.delete(msg.id);
      clearTimeout(req.timer);
      if (msg.ok) req.resolve(msg.result);
      else {
        const detail = typeof msg.error === "string" ? msg.error : (msg.error?.message ?? "键盘请求失败");
        const error = new Error(hardwareErrorMessage(msg.error?.code, detail));
        error.protocolDetail = detail;
        if (typeof msg.error?.code === "string") error.code = msg.error.code;
        req.reject(error);
      }
    });
    child.stderr.on("data", (data) => {
      const detail = data.toString();
      this.diagnostics = (this.diagnostics + detail).slice(-4096);
      this.emit("diagnostic", detail);
    });
    child.on("error", (e) => {
      if (this.child === child) this.child = null;
      this.failed(e);
    });
    // 'close' runs after stdout/stderr drain; 'exit' can precede the final
    // restore result and used to discard the only useful failure diagnostic.
    child.on("close", () => {
      if (this.child === child) this.child = null;
      this.failed(new Error("键盘控制进程已退出"));
      this.emit("disconnect");
    });
  }
  failed(error) {
    this.state = {
      ...this.state,
      connected: false,
      armed: false,
      error: error.message,
    };
    for (const req of this.requests.values()) {
      clearTimeout(req.timer);
      req.reject(error);
    }
    this.requests.clear();
  }
  request(op, args = {}) {
    const run = async () => {
      if (!this.child) this.start();
      return new Promise((resolve, reject) => {
        const id = ++this.serial;
        const timer = setTimeout(() => {
          this.requests.delete(id);
          reject(new Error("键盘响应超时，请重新连接"));
        }, 12000);
        this.requests.set(id, { resolve, reject, timer });
        this.child.stdin.write(
          JSON.stringify({ id, op, ...args }) + "\n",
          (e) => {
            if (e) {
              clearTimeout(timer);
              this.requests.delete(id);
              reject(e);
            }
          },
        );
      });
    };
    const promise = this.tail.then(run, run);
    this.tail = promise.catch(() => {});
    return promise;
  }
  async connect() {
    let identified = false;
    try {
      let result = await this.request("connect");
      this.updateState(result);
      identified = true;
      if (result.recoveryPending && !result.armed) {
        await this.restore();
        result = {
          ...result,
          ...(await this.request("status")),
        };
      }
      this.updateState({
        ...result,
        connected: true,
        error: null,
        errorCode: null,
      });
      return this.state;
    } catch (e) {
      // A restore failure does not invalidate a successful USB identification.
      // Keep the device available for recovery instead of reconnecting in a loop.
      this.state = {
        ...this.state,
        ...(!identified ? { connected: false, firmware: null, ledCount: 0, capabilities: null } : {}),
        armed: false,
        error: e.code === "DEVICE_NOT_FOUND" ? null : e.message,
        errorCode: e.code ?? "CONNECT_FAILED",
      };
      throw e;
    }
  }
  async status() {
    const result = await this.request("status");
    const pendingError = result.recoveryPending && this.state.errorCode && this.state.errorCode !== "DEVICE_NOT_FOUND";
    this.updateState({ ...result, ...(pendingError ? { error: this.state.error, errorCode: this.state.errorCode } : result.recoveryPending === false ? { errorCode: null } : {}) });
    return this.state;
  }
  updateState(result) {
    const bytes = Array.isArray(result.firmware) ? result.firmware : this.state.firmwareBytes;
    const version = result.firmwareVersion ?? (bytes?.length === 8 && bytes[3] === 0xaa ? `${bytes[2]}.${bytes[1]}.${bytes[0]}.${bytes[4] + bytes[5] * 256}` : this.state.firmware);
    this.state = {
      ...this.state,
      ...result,
      ...(typeof result.recoveryPending === "boolean" ? { needsRestore: result.recoveryPending } : {}),
      firmware: result.connected === false ? null : version,
      firmwareBytes: bytes,
    };
  }
  async arm() {
    if (!this.state.connected) throw new Error("请先连接 Air75 V3");
    if (this.state.armed) return;
    // A reconnect may identify USB successfully before recovery completes, or
    // the user may change Mac/Win while it remains connected. Retry recovery
    // for the current profile before opening a new lighting session.
    await this.status();
    if (this.state.armed) return;
    if (this.state.recoveryPending || this.state.needsRestore) await this.restore();
    const result = await this.request("arm");
    this.updateState({ ...result, armed: true, error: null, errorCode: null });
  }
  async paint(colors) {
    await this.request("paint", { colors });
  }
  async restore() {
    if (!this.state.connected && !this.state.recoveryPending && !this.state.needsRestore) return;
    try {
      const result = await this.request("restore");
      if (result.verified !== true) throw new Error("键盘灯效恢复尚未通过校验");
      this.restoreFailure = null;
      this.updateState({ ...result, armed: false, needsRestore: false, recoveryPending: false, error: null, errorCode: null });
      if (!this.state.connected) await this.status();
      return result;
    } catch (error) {
      this.state = { ...this.state, armed: false, error: error.message, errorCode: error.code ?? "RESTORE_REQUIRED" };
      throw error;
    }
  }
  async disconnect() {
    const result = await this.request("disconnect");
    const pending = result.recoveryPending === true || result.keyRestoreErrors?.length > 0;
    this.updateState({ ...result, connected: false, armed: false,
      error: pending ? "键盘已断开，原设置备份已保留，下次连接时自动恢复。" : null,
      errorCode: pending ? "RESTORE_DEFERRED" : null });
    if (!pending) this.restoreFailure = this.keyRestoreFailure = null;
    return this.state;
  }
  async close() {
    let failure;
    try {
      await this.tail;
      if (this.child) {
        try { await this.request("restoreKeys"); }
        catch (e) { failure = e; }
      }
      if (this.state.connected) await this.restore();
    } catch (e) {
      // The helper verifies its durable journal before accepting a deferred
      // quit with no USB device. Real restore/verification failures still fail.
      if (this.state.connected || !["DEVICE_NOT_FOUND", "NOT_CONNECTED", "DISCONNECTED"].includes(e.code)) failure = e;
    } finally {
      if (this.child) {
        const child = this.child;
        const exited = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error("恢复进程尚未退出，磁盘备份仍保留"));
          }, 25000);
          child.once("close", (code, signal) => {
            clearTimeout(timeout);
            if (code === 0 && !this.restoreFailure && !this.keyRestoreFailure) resolve();
            else
              reject(
                new Error(
                  this.restoreFailure ?? this.keyRestoreFailure ??
                    `键盘控制进程退出异常（code=${code}, signal=${signal ?? "none"}）${this.diagnostics ? ": " + this.diagnostics.trim() : ""}`,
                ),
              );
          });
        });
        exited.catch(() => {});
        try {
          await this.request("quit");
        } catch {}
        child.stdin.end();
        await exited;
      }
    }
    if (failure) throw failure;
  }
}
