import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rename,
  readFile,
  chmod,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mainURL = new URL("../../server/main.mjs", import.meta.url);
const codexURL = new URL("../../server/codex.mjs", import.meta.url).href;
const firmwareURL = new URL("../../server/firmware.mjs", import.meta.url).href;
const claudeActionsURL = new URL("../../server/claude-actions.mjs", import.meta.url).href;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(read, predicate, message, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(20);
  }
  assert.fail(message);
}

// Run the real HTTP service and Hardware adapter, but replace all external
// integrations. The helper below is only a JSONL state machine; the import
// loader replaces CodexAdapter so no desktop tasks, credentials, or quota are read.
export async function fakeService(t, initialControl = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "air-studio-main-recovery-"));
  const dataDir = path.join(dir, "data");
  await mkdir(dataDir);
  if(initialControl.codexKeybindings) {
    await mkdir(path.join(dir,'codex-home'));
    await writeFile(path.join(dir,'codex-home/keybindings.json'),JSON.stringify(initialControl.codexKeybindings));
  }
  const helper = path.join(dir, "fake-hid.mjs");
  const controlFile = path.join(dir, "control.json");
  const logFile = path.join(dir, "operations.jsonl");
  let control = { ...initialControl };
  await writeFile(controlFile, JSON.stringify(control));
  await writeFile(logFile, "");
  await writeFile(
    helper,
    `#!${process.execPath}
import {createInterface} from 'node:readline';
import {readFileSync,appendFileSync} from 'node:fs';
const controlFile=${JSON.stringify(controlFile)}, logFile=${JSON.stringify(logFile)};
let connected=false,armed=false,pending=false,failedGeneration=0,disconnectGeneration=0,triggerGeneration=0,triggerCode=null;
const original=[1,100,0,0,0,0,0,0,0,2,65,0,0,0,19,51,68];
let lighting=[...original];let functionKeyLease=false;
let lightingProfile=0;const pendingProfiles=new Set();
let colors=Array(104).fill('#000000');
const configuration=()=>{try{return JSON.parse(readFileSync(controlFile,'utf8'));}catch{return {};}};
const log=(entry)=>appendFileSync(logFile,JSON.stringify(entry)+'\\n');
const send=(entry)=>process.stdout.write(JSON.stringify(entry)+'\\n');
const permissions=()=>({inputMonitoring:false,accessibility:false,canPostEvents:false,...configuration().permissions,promptsRequested:false});
const selectProfile=()=>{const next=configuration().lightingProfile??0;if(next!==lightingProfile){lightingProfile=next;armed=false;pending=pendingProfiles.has(next);lighting=[...original];}};
const state=()=>({connected,armed,recoveryPending:pending,needsRestore:pending,deferredProfiles:[...pendingProfiles].filter(p=>p!==lightingProfile),lightingProfile,state:[...lighting],firmwareVersion:configuration().firmwareVersion??'1.0.16.6',capabilities:{perKey:configuration().compatible??true},permissions:permissions()});
const answer=(request,result)=>send({id:request.id,ok:true,result});
const reject=(request,message,code)=>send({id:request.id,ok:false,error:{message,code}});
const restore=()=>{log({event:'simulatedRestore',lightingProfile});armed=false;pending=false;pendingProfiles.delete(lightingProfile);lighting=[...original];};
setInterval(()=>{
 const generation=configuration().disconnect??0;
 if(generation>disconnectGeneration){disconnectGeneration=generation;connected=false;armed=false;log({event:'simulatedDisconnect'});send({event:'disconnected',needsRestore:pending});}
 const trigger=configuration().trigger??0;
 if(trigger>triggerGeneration){triggerGeneration=trigger;if(triggerCode!==null)send({event:'triggerKey',keyCode:configuration().triggerKeyCode??triggerCode});}
},10);
const input=createInterface({input:process.stdin});
input.on('close',()=>process.exit(0));
input.on('line',line=>{
 const request=JSON.parse(line);log(request);
 if(!connected&&!['connect','status','quit','disconnect','restore','restoreKeys','restoreFunctionKey','triggerMonitor','permissions','openPermissionSettings','bluetoothDevices','shortcut'].includes(request.op)&&!(['adaptKeys','keyMappingStatus'].includes(request.op)&&request.transport==='bluetooth'&&configuration().bluetoothDevices?.length===1)){reject(request,'simulated not connected');return;}
 switch(request.op){
  case 'connect':if(configuration().present===false){reject(request,'not present','DEVICE_NOT_FOUND');break;}selectProfile();connected=true;answer(request,state());break;
  case 'status':selectProfile();answer(request,state());break;
  case 'permissions':answer(request,permissions());break;
  case 'bluetoothDevices':answer(request,{devices:configuration().bluetoothDevices??[]});break;
  case 'restoreKeys':answer(request,{restored:true});break;
  case 'restoreFunctionKey':functionKeyLease=false;answer(request,{restored:true});break;
  case 'prepareFunctionKey':functionKeyLease=true;answer(request,{leased:true,verified:true});break;
  case 'adaptKeys':if(configuration().denyAdapt){reject(request,'mapping denied');break;}answer(request,{verified:true,applied:true});break;
  case 'keyMappingStatus':answer(request,{verified:!configuration().mappingLost});break;
  case 'readKeymap':{
   const standard=Array(98).fill(0);for(let i=1;i<=12;i++)standard[i]=57+i;
   const map=structuredClone(configuration().keymap??{mode:0,locationId:1,firmwareVersion:'1.0.16.6',active:standard,defaults:[standard,standard]});
   if(functionKeyLease){map.active[map.defaults[1].indexOf(61)]=61;map.functionKeyLease=true;}answer(request,map);break;
  }
  case 'systemIdle':answer(request,{idleMs:configuration().systemIdleMs??100000,recordsKeys:false});break;
  case 'shortcut':if(configuration().shortcutPermissionError&&request.action!=='task'){reject(request,'Enable Accessibility for the parent application to send shortcuts.','ACCESSIBILITY_REQUIRED');break;}answer(request,{sent:true});break;
  case 'readColors':answer(request,{customColorScale:configuration().customColorScale??255,colors:colors.map((color,index)=>configuration().mismatchIndex===index?'#010203':configuration().customColorScale===200?'#'+[1,3,5].map((start,c)=>{let v=Math.floor(parseInt(color.slice(start,start+2),16)*200/255);if(index===83&&c>0)v=Math.floor(v*150/255);return v.toString(16).padStart(2,'0')}).join(''):color)});break;
  case 'openPermissionSettings':
   if(!['inputMonitoring','accessibility'].includes(request.permission)){reject(request,'unsupported permission');break;}
   answer(request,{opened:true,permission:request.permission,permissions:permissions()});break;
  case 'triggerMonitor':
   triggerCode=null;
   if(request.enabled&&configuration().denyMonitor){reject(request,'macOS denied the key monitor','INPUT_MONITORING_REQUIRED');break;}
   if(request.enabled)triggerCode=request.keyCode;
   answer(request,{enabled:!!request.enabled,ordinaryTypingRecorded:false});break;
  case 'arm':if(pending&&!armed){reject(request,'A previous lighting backup exists.','RECOVERY_REQUIRED');break;}armed=true;pending=true;pendingProfiles.add(lightingProfile);lighting[0]=21;answer(request,state());break;
  case 'side':
   if(request.restore){lighting.splice(9,8,...original.slice(9));}
   else{pending=true;pendingProfiles.add(lightingProfile);lighting[9]=2;lighting[10]=request.brightness;lighting.splice(14,3,...[1,3,5].map(i=>parseInt(request.color.slice(i,i+2),16)));}
   answer(request,{state:[...lighting]});break;
  case 'paint':{
   if(!armed){reject(request,'simulated NOT_ARMED');break;}
   const generation=configuration().failPaint??0;
   if(generation>failedGeneration){failedGeneration=generation;restore();log({event:'simulatedRollback'});reject(request,'simulated paint failure; original lighting restored');}
   else {const commit=()=>{colors=[...request.colors,...Array(20).fill('#000000')];answer(request,{painted:84});};if(configuration().paintDelayMs)setTimeout(commit,configuration().paintDelayMs);else commit();}break;
  }
  case 'restore':if(!connected&&configuration().present===false){reject(request,'simulated not connected','DEVICE_NOT_FOUND');break;}connected=true;restore();answer(request,{...state(),restored:true,verified:true});break;
  case 'disconnect':if(!configuration().deferRestore)restore();connected=false;armed=false;answer(request,state());break;
  case 'quit':restore();answer(request,{quitting:true});setTimeout(()=>process.exit(0),10);break;
  default:reject(request,'unsupported fake operation');
 }
});
`,
  );
  await chmod(helper, 0o700);
  const fakeCodex = path.join(dir, "fake-codex.mjs");
  await writeFile(
    fakeCodex,
    `import {readFileSync} from 'node:fs';
    import {SHORTCUTS,describeAction} from ${JSON.stringify(codexURL+"?real")};
    export {describeAction};
    export class CodexAdapter {
    async start(){} async stop(){} async refresh(){return this.snapshot();}
    action(id,args){return describeAction(id,{...args,tasks:this.snapshot().tasks});}
    snapshot(){const c=JSON.parse(readFileSync(${JSON.stringify(controlFile)},'utf8'));return {available:true,tasks:c.tasks??[],slots:[],shortcuts:SHORTCUTS,taskSource:{available:true},quota:{available:true,stale:false,buckets:[{id:'codex',windows:[{remainingPercent:80}]}]}};}
  }`,
  );
  const loader = path.join(dir, "loader.mjs");
  // Keep real action validation, but never open a fabricated Claude session,
  // launch an application, or change the developer's clipboard during tests.
  const fakeClaudeActions = path.join(dir, "fake-claude-actions.mjs");
  await writeFile(fakeClaudeActions, `
import {appendFileSync} from 'node:fs';
import {ClaudeActionRunner as RealRunner} from ${JSON.stringify(claudeActionsURL + "?real")};
export * from ${JSON.stringify(claudeActionsURL + "?real")};
export const claudeAppInstalled=async()=>true;
const log=entry=>appendFileSync(${JSON.stringify(logFile)},JSON.stringify(entry)+'\\n');
export class ClaudeActionRunner extends RealRunner {
 constructor(){super({exec:async(file,args)=>{log({op:'claudeExternalAction',file,args});return {stdout:'',stderr:''};}});}
 async execute(action){
  if(action?.available && action.type==='copyResume'){
   log({op:'claudeExternalAction',file:'/usr/bin/pbcopy',text:action.text});
   return {copied:true,text:action.text};
  }
  return super.execute(action);
 }
}
`);
  const fakeFirmware = path.join(dir, "fake-firmware.mjs");
  await writeFile(fakeFirmware, `
import {readFileSync} from 'node:fs';
import {FirmwareChecker as RealChecker} from ${JSON.stringify(firmwareURL + "?real")};
export * from ${JSON.stringify(firmwareURL + "?real")};
export class FirmwareChecker extends RealChecker {
 constructor(){super({fetchImpl:async(_url,{signal})=>{
  const c=JSON.parse(readFileSync(${JSON.stringify(controlFile)},'utf8'));
  if(c.firmwareDelay) await new Promise((resolve,reject)=>{
   const t=setTimeout(resolve,c.firmwareDelay);
   signal.addEventListener('abort',()=>{clearTimeout(t);reject(new Error('aborted'));},{once:true});
  });
  if(c.firmwareOffline) throw new Error('offline');
  return new Response(JSON.stringify({code:200,data:{businessId:'1930212869851615233',environment:'prod',type:'1',status:'0',versionNumber:c.latestFirmware??'1.0.16.6'}}));
 }});}
}
`);
  await writeFile(
    loader,
    `export async function resolve(specifier,context,nextResolve){
    const resolved=await nextResolve(specifier,context);
    if(resolved.url===${JSON.stringify(codexURL)}) return {url:${JSON.stringify(pathToFileURL(fakeCodex).href)},shortCircuit:true};
    if(resolved.url===${JSON.stringify(firmwareURL)}) return {url:${JSON.stringify(pathToFileURL(fakeFirmware).href)},shortCircuit:true};
    if(resolved.url===${JSON.stringify(claudeActionsURL)}) return {url:${JSON.stringify(pathToFileURL(fakeClaudeActions).href)},shortCircuit:true};
    return resolved;
  }`,
  );
  const preload = path.join(dir, "preload.mjs");
  await writeFile(
    preload,
    `import {register} from 'node:module'; register(${JSON.stringify(pathToFileURL(loader).href)});`,
  );
  const token = "isolated-main-recovery-test";
  const child = spawn(
    process.execPath,
    ["--import", preload, fileURLToPath(mainURL)],
    {
      cwd: dir,
      env: {
        ...process.env,
        AIR_STUDIO_HID: helper,
        AIR_STUDIO_DATA: dataDir,
        AIR_STUDIO_TOKEN: token,
        CODEX_HOME: path.join(dir,'codex-home'),
        // Claude Code reads and writes are confined to the temporary directory;
        // tests must never touch the developer's real ~/.claude configuration.
        CLAUDE_CONFIG_DIR: path.join(dir,'claude-home'),
        CLAUDE_DESKTOP_SUPPORT: path.join(dir,'claude-support'),
        ...(initialControl.preferredPort ? {AIR_STUDIO_PREFERRED_PORT:String(initialControl.preferredPort),AIR_STUDIO_PORT:""} : {AIR_STUDIO_PORT:"0"}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (bytes) => {
    stderr = (stderr + bytes).slice(-8192);
  });
  const exited = once(child, "exit");
  exited.catch(() => {});
  t.after(async () => {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      }
      const [code, signal] = await exited;
      assert.equal(
        code,
        0,
        `fake service must restore and exit cleanly: ${stderr}`,
      );
      assert.equal(signal, null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Service did not start: ${stderr}`)),
      5000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`Service exited before ready: ${stderr}`));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.event === "ready") {
          clearTimeout(timer);
          resolve(message.url);
        }
      } catch {}
    });
  });
  const url = await ready;
  const command = async (body) => {
    const response = await fetch(new URL("/api/command", url), {
      method: "POST",
      headers: { "X-Air-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const state = async () => {
    const response = await fetch(new URL("/api/state", url), {
      headers: { "X-Air-Token": token },
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const operations = async () =>
    (await readFile(logFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const configure = async (changes) => {
    control = { ...control, ...changes };
    // The helper polls concurrently. Never expose a truncated configuration,
    // which would make a deliberately absent keyboard appear present.
    await writeFile(controlFile + '.next', JSON.stringify(control));
    await rename(controlFile + '.next', controlFile);
  };
  if (!initialControl.skipInitialConnect) {
    const connected = await command({ op: "connect" });
    assert.equal(connected.ok, true, JSON.stringify(connected));
  }
  return { command, state, operations, configure, child, exited, url, token, dataDir,
    claudeDir: path.join(dir, "claude-home"), claudeSpool: path.join(dataDir, "claude-sessions"),
    claudeHookDir: path.join(dataDir, "claude-hook"),
    claudeSupportDir: path.join(dir, "claude-support") };
}
