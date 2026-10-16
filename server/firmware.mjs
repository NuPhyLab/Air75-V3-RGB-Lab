export const FIRMWARE_URL = "https://drive.nuphy.io/?lang=zh-CN";
export const FIRMWARE_API = "https://drive.nuphy.io/prod-api/api/nuphyIo/getLastFirmwareVersionsByType?businessId=1930212869851615233&type=1";
// Hardware-tested version is distinct from protocol support and online latest.
export const VERIFIED_FIRMWARE = "1.0.16.6";
const BUSINESS_ID = "1930212869851615233";
const FRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

export function versionParts(value) {
  if (typeof value !== "string" || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,5}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.some((n, i) => n > (i === 3 ? 65535 : 255)) ? null : parts;
}
export function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  if (!left || !right) return null;
  for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
export function parseFirmwareManifest(value) {
  const entry = value?.data;
  if (value?.code !== 200 || !entry || entry.businessId !== BUSINESS_ID ||
      String(entry.type) !== "1" || entry.environment !== "prod" ||
      String(entry.status) !== "0" || !versionParts(entry.versionNumber))
    throw new Error("官方固件信息暂时无法确认");
  return { version: entry.versionNumber, releasedAt: entry.firstListTime || null };
}
export class FirmwareChecker {
  constructor({ fetchImpl = fetch, now = Date.now } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.latest = null;
    this.checkedAt = null;
    this.error = null;
    this.pending = null;
    this.retryAt = 0;
    this.abort = null;
  }
  refresh(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.now() < this.retryAt) return Promise.resolve();
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort?.abort(), 8000);
    this.pending = Promise.resolve().then(async () => {
      try {
        const response = await this.fetchImpl(FIRMWARE_API, {
          signal: this.abort.signal, redirect: "error", headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("官方服务暂时不可用");
        // Bound response size; never download firmware binaries or follow supplied URLs.
        const reader = response.body.getReader();
        let bytes = 0, chunks = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 128 * 1024) throw new Error("固件信息超出预期大小");
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        this.latest = parseFirmwareManifest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        this.checkedAt = this.now();
        this.error = null;
        this.retryAt = this.now() + FRESH_MS;
      } catch {
        this.error = "暂时无法检查官方最新固件，请稍后重试。";
        this.retryAt = this.now() + RETRY_MS;
      } finally {
        clearTimeout(timer);
        this.abort = null;
        this.pending = null;
      }
    });
    return this.pending;
  }
  snapshot(device) {
    const current = versionParts(device.firmware) ? device.firmware : null;
    const stale = this.checkedAt !== null && (Boolean(this.error) || this.now() - this.checkedAt >= FRESH_MS);
    const comparison = compareVersions(current, this.latest?.version);
    const status = !device.connected ? "disconnected"
      : this.pending && !this.latest ? "checking"
      : this.error || stale ? "unavailable"
      : !this.latest ? "checking"
      : comparison === null ? "unknown"
      : comparison < 0 ? "updateAvailable"
      : comparison > 0 ? "newer" : "current";
    return { status, current, latest: this.latest?.version ?? null,
      checkedAt: this.checkedAt, checking: Boolean(this.pending), stale,
      error: this.error, updateUrl: FIRMWARE_URL,
      compatible: Boolean(device.connected && device.capabilities?.perKey === true),
      protocol: device.capabilities?.protocol ?? null,
      stateBytes: device.capabilities?.stateBytes ?? null,
      verifiedVersion: VERIFIED_FIRMWARE };
  }
  close() { this.abort?.abort(); }
}
