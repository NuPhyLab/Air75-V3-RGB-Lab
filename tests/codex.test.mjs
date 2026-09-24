import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  CodexAdapter,
  classifyEvents,
  normalizeQuota,
  describeAction,
  ReadOnlyAppServerClient,
} from "../server/codex.mjs";

const baseTime = Date.parse("2026-09-10T13:00:00.000Z");
const event = (type, at = baseTime, extra = {}, envelope = "event_msg") =>
  JSON.stringify({
    timestamp: new Date(at).toISOString(),
    type: envelope,
    payload: { type, ...extra },
  }) + "\n";
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function fixture(t, { version = 12, schema = "normal", rows = [] } = {}) {
  const home = await mkdtemp(path.join(tmpdir(), "air-studio-codex-test-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, "sessions"));
  const database = path.join(home, `state_${version}.sqlite`);
  const ddl =
    schema === "minimal"
      ? "CREATE TABLE threads (id TEXT, rollout_path TEXT);"
      : "CREATE TABLE threads (id TEXT, rollout_path TEXT, name TEXT, title TEXT, updated_at INTEGER, recency_at_ms INTEGER, archived INTEGER, thread_source TEXT);";
  execFileSync("/usr/bin/sqlite3", [database, ddl]);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const file = path.join(home, "sessions", `${row.id}.jsonl`);
    await writeFile(file, row.events || "");
    const values =
      schema === "minimal"
        ? [sqlString(row.id), sqlString(file)]
        : [
            sqlString(row.id),
            sqlString(file),
            sqlString(row.name ?? `任务 ${index + 1}`),
            sqlString("first prompt should not replace name"),
            String(baseTime / 1000),
            String(baseTime - index * 1000),
            String(row.archived ?? 0),
            sqlString(row.source ?? "user"),
          ];
    execFileSync("/usr/bin/sqlite3", [
      database,
      `INSERT INTO threads VALUES (${values.join(",")});`,
    ]);
  }
  return {
    home,
    database,
    file: (id) => path.join(home, "sessions", `${id}.jsonl`),
  };
}

test("quota keeps all buckets, both windows, and null values without inventing zero usage", () => {
  const result = normalizeQuota(
    {
      rateLimits: { limitId: "legacy", primary: { usedPercent: 99 } },
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          limitName: "Codex",
          primary: {
            usedPercent: 25,
            windowDurationMins: 300,
            resetsAt: 1789046100,
          },
          secondary: { usedPercent: 101, windowDurationMins: 10080 },
        },
        fast: {
          primary: { usedPercent: null, windowDurationMins: 60 },
          secondary: null,
        },
      },
    },
    baseTime,
  );
  assert.equal(result.available, true);
  assert.deepEqual(
    result.buckets.map((bucket) => bucket.id),
    ["codex", "fast"],
  );
  assert.deepEqual(
    result.buckets[0].windows.map((window) => window.remainingPercent),
    [75, 0],
  );
  assert.equal(result.buckets[1].windows[0].remainingPercent, null);
  assert.equal(result.buckets[1].windows[0].resetsAt, null);
  assert.equal(
    normalizeQuota({ rateLimits: { primary: { usedPercent: "25" } } })
      .available,
    false,
  );
  assert.deepEqual(normalizeQuota(null).buckets, []);
  assert.equal(
    normalizeQuota({
      rateLimitsByLimitId: {},
      rateLimits: { primary: { usedPercent: 30 } },
    }).buckets[0].windows[0].remainingPercent,
    70,
  );
});

test("historical start or activity alone never confirms running", () => {
  const input =
    event("task_started") +
    event("agent_message", baseTime + 100, {
      message: "DO NOT EXPOSE MESSAGE CONTENT",
    });
  const initial = classifyEvents(input, { now: baseTime + 200 });
  assert.equal(initial.status, "unknown");
  const confirmed = classifyEvents(input, {
    now: baseTime + 200,
    activityObservedAt: baseTime + 150,
  });
  assert.equal(confirmed.status, "running");
  assert.equal(JSON.stringify(confirmed).includes("DO NOT EXPOSE"), false);
  assert.equal(
    classifyEvents(input, {
      now: baseTime + 20_000,
      activityObservedAt: baseTime + 150,
    }).status,
    "unknown",
  );
  assert.equal(
    classifyEvents(input, {
      now: baseTime - 60_000,
      activityObservedAt: baseTime - 60_000,
    }).status,
    "unknown",
  );
});

test("explicit completion, error, interrupt, and pending input take precedence over unrelated telemetry", () => {
  assert.equal(
    classifyEvents(
      event("task_started") + event("task_complete") + event("token_count"),
      { now: baseTime },
    ).status,
    "completed",
  );
  assert.equal(
    classifyEvents(event("error"), { now: baseTime }).status,
    "error",
  );
  assert.equal(
    classifyEvents(event("turn_aborted"), { now: baseTime }).status,
    "idle",
  );
  assert.equal(
    classifyEvents(
      event("custom_tool_call", baseTime, {
        name: "functions.request_user_input",
      }),
      { now: baseTime },
    ).status,
    "needsInput",
  );
  assert.equal(
    classifyEvents(
      event("custom_tool_call_output", baseTime, {
        name: "functions.request_user_input",
      }),
      { now: baseTime },
    ).status,
    "unknown",
  );
  assert.equal(
    classifyEvents(event("approval_request"), { now: baseTime + 301_000 })
      .status,
    "unknown",
  );
  assert.equal(
    classifyEvents(
      'invalid\n{"type":"response_item","payload":{"type":"unknown"}}\n',
    ).status,
    "unknown",
  );
  assert.equal(
    classifyEvents(event("token_count"), { now: baseTime }).status,
    "unknown",
  );
});

test("database discovery, task filtering, stable IDs and six slots work with actual read-only SQLite", async (t) => {
  const f = await fixture(t, {
    version: 12,
    rows: [
      { id: "current", name: "真实任务名", events: event("task_started") },
      { id: "finished", events: event("task_complete") },
      { id: "archived", archived: 1, events: event("task_complete") },
      { id: "child", source: "subagent", events: event("task_started") },
    ],
  });
  execFileSync("/usr/bin/sqlite3", [
    path.join(f.home, "state_9.sqlite"),
    "CREATE TABLE unrelated (id TEXT);",
  ]);
  await writeFile(
    path.join(f.home, ".codex-global-state.json"),
    JSON.stringify({
      nested: { "unread-thread-ids-by-host-v1.local": ["finished"] },
      irrelevantSecret: "DO NOT EXPOSE THIS VALUE",
    }),
  );
  const adapter = new CodexAdapter({
    codexHome: f.home,
    enableQuota: false,
    now: () => baseTime + 10,
  });
  t.after(() => adapter.stop());
  const snapshot = await adapter.start();
  assert.equal(snapshot.taskSource.schema, "state_12.sqlite");
  assert.deepEqual(
    snapshot.tasks.map((task) => task.id),
    ["current", "finished"],
  );
  assert.deepEqual(
    snapshot.tasks.map((task) => task.status),
    ["unknown", "completed"],
  );
  assert.equal(snapshot.tasks[0].title, "真实任务名");
  assert.equal(snapshot.slots.length, 6);
  assert.equal(snapshot.slots[5].status, "unassigned");
  assert.equal(JSON.stringify(snapshot).includes("DO NOT EXPOSE"), false);
  const copy = adapter.snapshot();
  copy.tasks[0].title = "mutated";
  assert.equal(adapter.snapshot().tasks[0].title, "真实任务名");
});

test("only newly observed activity becomes blue and it expires without further evidence", async (t) => {
  let now = baseTime;
  const f = await fixture(t, {
    rows: [{ id: "active", events: event("task_started") }],
  });
  const adapter = new CodexAdapter({
    codexHome: f.home,
    enableQuota: false,
    now: () => now,
  });
  t.after(() => adapter.stop());
  await adapter.start();
  assert.equal(adapter.snapshot().tasks[0].status, "unknown");
  now += 1_000;
  await appendFile(f.file("active"), event("custom_tool_call", now));
  await adapter.pollTasks();
  assert.equal(adapter.snapshot().tasks[0].status, "running");
  now += 16_000;
  await adapter.pollTasks();
  assert.equal(adapter.snapshot().tasks[0].status, "unknown");
  await appendFile(f.file("active"), event("task_complete", now));
  await adapter.pollTasks();
  assert.equal(adapter.snapshot().tasks[0].status, "completed");
  await writeFile(
    path.join(f.home, ".codex-global-state.json"),
    JSON.stringify({ unreadThreadIdsByHostId: { local: [] } }),
  );
  await adapter.pollTasks();
  assert.equal(adapter.snapshot().tasks[0].status, "idle");
});

test("minimal schemas are readable and missing/foreign rollouts remain unknown", async (t) => {
  const f = await fixture(t, {
    schema: "minimal",
    rows: [{ id: "small", events: event("task_complete") }],
  });
  execFileSync("/usr/bin/sqlite3", [
    f.database,
    "INSERT INTO threads VALUES ('outside','/etc/passwd');",
  ]);
  const adapter = new CodexAdapter({
    codexHome: f.home,
    enableQuota: false,
    now: () => baseTime,
  });
  t.after(() => adapter.stop());
  await adapter.start();
  assert.equal(adapter.snapshot().taskSource.available, true);
  assert.equal(
    adapter.snapshot().tasks.find((task) => task.id === "outside").status,
    "unknown",
  );
});

test("a bounded tail discards old content but retains a complete terminal event", async (t) => {
  const f = await fixture(t, {
    rows: [
      {
        id: "large",
        events:
          event("task_started") +
          "x".repeat(20_000) +
          "\n" +
          event("task_complete"),
      },
    ],
  });
  const adapter = new CodexAdapter({
    codexHome: f.home,
    enableQuota: false,
    tailBytes: 4096,
    now: () => baseTime,
  });
  t.after(() => adapter.stop());
  await adapter.start();
  assert.equal(adapter.snapshot().tasks[0].status, "completed");
});

test("missing installation is unavailable rather than simulated tasks or quota", async (t) => {
  const f = await fixture(t);
  await rm(f.database);
  const adapter = new CodexAdapter({
    codexHome: f.home,
    cliPath: "/nonexistent/air-studio-test-cli",
  });
  t.after(() => adapter.stop());
  const snapshot = await adapter.start();
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.tasks.length, 0);
  assert.equal(snapshot.quota.available, false);
  assert.deepEqual(snapshot.quota.buckets, []);
});

test("quota failure retains last measurement explicitly stale, then recovers", async (t) => {
  const f = await fixture(t);
  let failure = false;
  const adapter = new CodexAdapter({
    codexHome: f.home,
    cliPath: process.execPath,
    clientFactory: () => ({
      async readQuota() {
        if (failure) throw new Error("SECRET from upstream");
        return { rateLimits: { primary: { usedPercent: 40 } } };
      },
      stop() {},
    }),
  });
  t.after(() => adapter.stop());
  await adapter.start();
  assert.equal(
    adapter.snapshot().quota.buckets[0].windows[0].remainingPercent,
    60,
  );
  failure = true;
  await adapter.pollQuota();
  const stale = adapter.snapshot().quota;
  assert.equal(stale.available, false);
  assert.equal(stale.stale, true);
  assert.equal(stale.buckets[0].windows[0].remainingPercent, 60);
  assert.equal(JSON.stringify(stale).includes("SECRET"), false);
  failure = false;
  await adapter.pollQuota();
  assert.equal(adapter.snapshot().quota.available, true);
  assert.equal(adapter.snapshot().quota.stale, false);
});

test("manual refresh is useful but rate-limits account requests to one per fifteen seconds", async (t) => {
  const f = await fixture(t);
  let now = baseTime,
    requests = 0;
  const adapter = new CodexAdapter({
    codexHome: f.home,
    cliPath: process.execPath,
    now: () => now,
    clientFactory: () => ({
      async readQuota() {
        requests++;
        return { rateLimits: { primary: { usedPercent: 10 } } };
      },
      stop() {},
    }),
  });
  t.after(() => adapter.stop());
  await adapter.start();
  await adapter.refresh();
  await adapter.refresh();
  assert.equal(requests, 1);
  now += 15_000;
  await adapter.refresh();
  assert.equal(requests, 2);
});

function fakeProcess(responder) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.emit("exit", 0);
    return true;
  };
  const messages = [];
  child.stdin.on("data", (buffer) => {
    for (const line of buffer.toString().trim().split("\n")) {
      const message = JSON.parse(line);
      messages.push(message);
      const response = responder(message);
      if (response)
        queueMicrotask(() =>
          child.stdout.write(`${JSON.stringify(response)}\n`),
        );
    }
  });
  return { child, messages };
}

test("RPC speaks initialize/initialized/quota only; requests for approvals receive no decision", async () => {
  const fake = fakeProcess((message) =>
    message.method === "initialize"
      ? { id: message.id, result: {} }
      : message.method === "account/rateLimits/read"
        ? {
            id: message.id,
            result: { rateLimits: { primary: { usedPercent: 12 } } },
          }
        : null,
  );
  const client = new ReadOnlyAppServerClient({
    executable: "/unused",
    codexHome: "/unused",
    spawnProcess: () => fake.child,
  });
  try {
    const result = await client.readQuota();
    assert.equal(result.rateLimits.primary.usedPercent, 12);
    await assert.rejects(client.request("turn/start", {}), /不允许/);
    fake.child.stdout.write(
      JSON.stringify({
        id: 99,
        method: "item/commandExecution/requestApproval",
        params: { command: "secret command" },
      }) + "\n",
    );
    assert.deepEqual(
      fake.messages
        .filter((message) => message.method)
        .map((message) => message.method),
      ["initialize", "initialized", "account/rateLimits/read"],
    );
    const rejected = fake.messages.find((message) => message.id === 99);
    assert.equal(rejected.error.code, -32601);
    assert.equal(Object.hasOwn(rejected, "result"), false);
  } finally {
    client.stop();
  }
});

test("RPC errors are sanitized and hanging connections time out", async () => {
  const fake = fakeProcess((message) =>
    message.method === "initialize"
      ? { id: message.id, result: {} }
      : { id: message.id, error: { message: "token=SECRET" } },
  );
  const client = new ReadOnlyAppServerClient({
    executable: "/unused",
    codexHome: "/unused",
    spawnProcess: () => fake.child,
  });
  try {
    await assert.rejects(
      client.readQuota(),
      (error) =>
        !error.message.includes("SECRET") && /额度/.test(error.message),
    );
  } finally {
    client.stop();
  }
  const never = fakeProcess(() => null);
  const timeout = new ReadOnlyAppServerClient({
    executable: "/unused",
    codexHome: "/unused",
    spawnProcess: () => never.child,
    timeoutMs: 20,
  });
  await assert.rejects(timeout.start(), /超时/);
  assert.equal(timeout.child, null);
});

test("RPC preserves UTF-8 characters split across data chunks", async () => {
  const fake = fakeProcess((message) =>
    message.method === "initialize" ? { id: message.id, result: {} } : null,
  );
  const client = new ReadOnlyAppServerClient({
    executable: "/unused",
    codexHome: "/unused",
    spawnProcess: () => fake.child,
  });
  try {
    await client.start();
    const read = client.readQuota();
    const request = fake.messages.find(
      (message) => message.method === "account/rateLimits/read",
    );
    const data = Buffer.from(
      JSON.stringify({
        id: request.id,
        result: {
          rateLimits: { limitName: "额度", primary: { usedPercent: 20 } },
        },
      }) + "\n",
    );
    const middle = data.indexOf(Buffer.from("额度")) + 1;
    fake.child.stdout.write(data.subarray(0, middle));
    fake.child.stdout.write(data.subarray(middle));
    assert.equal((await read).rateLimits.limitName, "额度");
  } finally {
    client.stop();
  }
});

test("actions are data only, exact-ID links are restricted, and approval needs explicit UI context", () => {
  assert.equal(
    describeAction("openTask", {
      threadId: "bad/id",
      tasks: [{ id: "bad/id" }],
    }).available,
    false,
  );
  assert.equal(
    describeAction("openTask", { threadId: "not-known" }).available,
    false,
  );
  const link = describeAction("agent1", {
    tasks: [{ id: "task-123" }],
    slots: [{ id: "task-123" }],
  });
  assert.equal(link.url, "codex://threads/task-123");
  const approve = describeAction("approve");
  assert.equal(approve.available, false);
  assert.equal(approve.requiresUserGesture, true);
  assert.equal(approve.requiresVerifiedApprovalContext, true);
  assert.equal(describeAction("toggleFastMode").available, false);
});

test('live writer keeps a silent current turn stable, but process exit cannot leave a false blue light',async t=>{
 let now=baseTime;let writers=new Map([['live',{startedAt:baseTime-1000}]]);
 const f=await fixture(t,{rows:[{id:'live',events:event('task_started')}]});
 const adapter=new CodexAdapter({codexHome:f.home,enableQuota:false,now:()=>now,liveWriters:async()=>writers});
 t.after(()=>adapter.stop());await adapter.start();assert.equal(adapter.snapshot().tasks[0].status,'running');
 now+=3600000;await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].status,'running');
 writers=new Map();await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].status,'unknown');
 writers=new Map([['live',{startedAt:now}]]);await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].status,'unknown','old activity from a previous process is not current execution');
 await appendFile(f.file('live'),event('task_complete',now));await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].status,'completed');
});
test('current unread identity format clears green after reading; ambiguous accounts do not invent a read state',async t=>{
 const f=await fixture(t,{rows:[{id:'done',events:event('task_complete')}]});
 const set=async identities=>writeFile(path.join(f.home,'.codex-global-state.json'),JSON.stringify({'electron-thread-read-state-v1':{version:1,unreadByIdentity:identities}}));
 await set({account:{'local:fingerprint':['done']}});
 const adapter=new CodexAdapter({codexHome:f.home,enableQuota:false,now:()=>baseTime});t.after(()=>adapter.stop());await adapter.start();
 assert.equal(adapter.snapshot().tasks[0].isUnread,true);assert.equal(adapter.snapshot().tasks[0].status,'completed');
 await set({account:{'local:fingerprint':[]}});await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].status,'idle');
 await set({one:{'local:a':[]},two:{'local:b':['done']}});await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].isUnread,null);
});
test('temporary index failure preserves slot identities and degrades stale status explicitly',async t=>{
 let now=baseTime;const f=await fixture(t,{rows:[{id:'kept',events:event('task_complete')}]});
 const adapter=new CodexAdapter({codexHome:f.home,enableQuota:false,now:()=>now});t.after(()=>adapter.stop());await adapter.start();
 adapter.sql=async()=>{throw new Error('busy');};await adapter.pollTasks();assert.equal(adapter.snapshot().slots[0].id,'kept');assert.equal(adapter.snapshot().taskSource.stale,true);
 now+=31000;await adapter.pollTasks();assert.equal(adapter.snapshot().tasks[0].status,'unknown');assert.equal(adapter.snapshot().slots[0].id,'kept');
});
test('unrelated tool output does not clear a pending question; its matching response does',()=>{
 const pending=event('custom_tool_call',baseTime,{name:'functions.request_user_input_async',call_id:'question'},'response_item');
 const other=event('custom_tool_call_output',baseTime+1,{call_id:'different'},'response_item');
 const wait=classifyEvents(pending+other,{now:baseTime+2});assert.equal(wait.status,'needsInput');assert.equal(wait.pendingKind,'response');
 const answered=classifyEvents(event('custom_tool_call_output',baseTime+3,{call_id:'question'},'response_item'),{now:baseTime+4,pendingRequests:wait.pendingRequests,activityObservedAt:baseTime+3});assert.equal(answered.status,'running');
});
