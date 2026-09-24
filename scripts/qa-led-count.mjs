// Explicit real-device regression check; close Air Studio before running.
// Restores a pending backup, reconnects, verifies one dim frame, then restores.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Hardware } from "../server/hardware.mjs";

const [, , flag, backup] = process.argv;
if (flag !== "--run" || !backup?.startsWith("/"))
  throw new Error("Use --run /absolute/path/to/lighting-backup.json with Air Studio closed");
let pending;
try { pending = JSON.parse(await readFile(backup, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const hardware = new Hardware(fileURLToPath(new URL("../bin/HIDBridge", import.meta.url)), backup);
const result = { date: new Date().toISOString(), pendingBackupRestored: false, reconnects: 0 };
try {
  const connected = await hardware.connect();
  assert.equal(connected.connected, true);
  assert.equal(connected.ledCount, 104);
  const original = [...connected.state];
  if (pending) {
    assert.deepEqual(original, pending.state);
    assert.equal(connected.recoveryPending, false);
    result.pendingBackupRestored = true;
  }
  result.firmware = connected.firmware;
  result.originalState = original;
  for (let i = 0; i < 10; i++) {
    await hardware.disconnect();
    const state = await hardware.connect();
    assert.equal(state.ledCount, 104);
    assert.deepEqual(state.state, original);
    result.reconnects++;
  }
  await hardware.arm();
  const colors = Array.from({ length: 84 }, (_, i) => i === 83 ? "#000000" :
    "#" + [i * 7, i * 11, i * 13].map(v => (v % 24 + 1).toString(16).padStart(2, "0")).join(""));
  const painted = await hardware.request("paint", { colors, verify: true });
  assert.equal(painted.verification, "readback");
  const read = await hardware.request("readColors");
  assert.equal(read.colors.length, 104);
  assert.deepEqual(read.colors.slice(0, 84), colors);
  result.all84RGBEntriesVerified = true;
  const restored = await hardware.restore();
  assert.equal(restored.verified, true);
  assert.deepEqual((await hardware.status()).state, original);
  result.originalStateRestored = true;
} finally {
  await hardware.close();
}
result.helperExitedCleanly = true;
await writeFile(new URL("../docs/led-count-qa-results.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
