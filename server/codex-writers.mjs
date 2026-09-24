import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { access } from "node:fs/promises";
const exec = promisify(execFile);
// Inspect open writer handles only. Never acquire, alter or remove Codex's locks.
export async function readLiveWriters(home, ids) {
  const files = (await Promise.all(ids.map(async id => {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return null;
    const file = path.join(home,"thread-writer-locks",`${id}.lock`);
    try { await access(file); return file; } catch { return null; }
  }))).filter(Boolean);
  if (!files.length) return new Map();
  let stdout;
  try { ({stdout} = await exec("/usr/sbin/lsof",["-nP","-Fpcn",...files],{timeout:2000,maxBuffer:262144})); }
  catch (error) {
    // lsof can return 1 when only some requested files still have open handles.
    if (error.code !== 1) return null;
    stdout = error.stdout || "";
  }
  const handles = []; let pid=null, command=null;
  for (const line of stdout.split("\n")) {
    if (line[0]==="p") { pid=Number(line.slice(1)); command=null; }
    else if (line[0]==="c") command=line.slice(1);
    else if (line[0]==="n" && command === "codex" && files.includes(line.slice(1)))
      handles.push({id:path.basename(line.slice(1),".lock"),pid});
  }
  if (!handles.length) return new Map();
  const pids=[...new Set(handles.map(h=>h.pid))].filter(Number.isInteger);
  try {
    const result=await exec("/bin/ps",["-p",pids.join(","),"-o","pid=,lstart="],{timeout:1000,maxBuffer:65536,env:{...process.env,LC_ALL:"C"}});
    const started = new Map(result.stdout.trim().split("\n").flatMap(line=> {
      const match=/^\s*(\d+)\s+(.+)$/.exec(line); const time=Date.parse(match?.[2] ?? "");
      return match && Number.isFinite(time) ? [[Number(match[1]),time]] : [];
    }));
    return new Map(handles.filter(h=>started.has(h.pid)).map(h=>[h.id,{startedAt:started.get(h.pid)}]));
  } catch { return null; }
}
