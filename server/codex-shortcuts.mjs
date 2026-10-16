import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import keys from '../shared/trigger-keys.json' with {type:'json'};

const commandIds={dictation:'composer.startDictation',voice:'composer.startVoiceMode',modelPicker:'composer.openModelPicker'};
const modifiers={cmd:'command',command:'command',cmdorctrl:'command',commandorcontrol:'command',super:'command',ctrl:'control',control:'control',alt:'option',option:'option',shift:'shift',fn:'fn'};
const modifierCodes={control:59,shift:56,option:58,command:55,fn:63};
export function parseMacShortcut(value,{allowBareModifiers=false}={}) {
  if(typeof value!=='string'||value.length>100) return null;
  const parts=value.split('+').map(x=>x.trim());
  if(allowBareModifiers&&parts.every(x=>modifiers[x.toLowerCase()])) {
    const flags=parts.map(x=>modifiers[x.toLowerCase()]);
    if(new Set(flags).size!==flags.length)return null;
    return {keyCode:modifierCodes[flags.at(-1)],modifiers:flags,code:'Modifiers',modifierOnly:true};
  }
  const key=parts.pop();
  const flags=parts.map(x=>modifiers[x.toLowerCase()]);
  if(flags.some(x=>!x)||new Set(flags).size!==flags.length) return null;
  const aliases={enter:'Enter',return:'Enter',escape:'Escape',esc:'Escape',space:'Space',backspace:'Backspace',delete:'Delete',up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
  const code=/^[a-z]$/i.test(key)?'Key'+key.toUpperCase():/^[0-9]$/.test(key)?'Digit'+key:aliases[key.toLowerCase()];
  const punctuation={'`':'Backquote',',':'Comma','.':'Period','/':'Slash',';':'Semicolon',"'":'Quote','[':'BracketLeft',']':'BracketRight','\\':'Backslash','-':'Minus','=':'Equal'};
  const entry=keys.find(x=>x.code===(code??punctuation[key]??key));
  return entry?{keyCode:entry.keyCode,modifiers:flags,code:entry.code}:null;
}

// Read only the documented, user-editable keymap. Never change Codex settings.
export async function resolveCodexShortcut(action,{codexHome=process.env.CODEX_HOME??path.join(homedir(),'.codex'),blockedCodes=[]}={}) {
  let entries=[];
  try {
    const text=await readFile(path.join(codexHome,'keybindings.json'),'utf8');
    if(text.length>262144) throw new Error('keymap too large');
    entries=JSON.parse(text);
    if(!Array.isArray(entries)||entries.some(x=>!x||typeof x.command!=='string'||!(x.key===null||typeof x.key==='string'))) throw new Error('invalid keymap');
  } catch(error) {
    if(error.code!=='ENOENT') throw new Error('无法读取 Codex 自定义快捷键，请检查 keybindings.json。');
  }
  // New Codex releases moved press-and-hold dictation from the composer to a
  // native global listener. Never fall back to the retired composer binding
  // when the user has configured (or explicitly disabled) the new command.
  const globalTap=action.id==='dictation'&&entries.some(x=>x.command==='globalDictationSingleTap'&&x.key!==null);
  const globalHold=!globalTap&&action.id==='dictation'&&entries.some(x=>x.command==='globalDictationHold');
  const overrides=entries.filter(x=>x.command===(globalTap?'globalDictationSingleTap':globalHold?'globalDictationHold':commandIds[action.id]??action.id));
  if(overrides.some(x=>x.key===null)) throw new Error('这个动作的快捷键已在 Codex 中停用。');
  const candidates=overrides.length?overrides.map(x=>x.key):[action.keys.join('+')];
  // Dictation's press/hold listener uses the primary accelerator only.
  for(const value of action.id==='dictation'?candidates.slice(0,1):candidates) {
    const shortcut=parseMacShortcut(value,{allowBareModifiers:globalHold||globalTap});
    if(shortcut && !(shortcut.modifiers.length===0&&blockedCodes.includes(shortcut.code))) return {...shortcut,accelerator:value,custom:overrides.length>0,...(globalTap?{delivery:'globalTap'}:globalHold?{delivery:'globalHold'}:{})};
  }
  throw new Error('Codex 快捷键无法转发，或与 NuPhyLab 的任务／命令键冲突。请更改其中一处绑定。');
}

export class CodexKeyGestures {
  constructor({send,resolve,now=Date.now}) {this.send=send;this.resolve=resolve;this.now=now;this.held=null;this.dictation={mode:'hold'};}
  async inspectDictation(action) {
    try {
      const shortcut=await this.resolve(action);
      this.dictation={mode:shortcut.delivery==='globalTap'?'toggle':'hold',accelerator:shortcut.accelerator};
    } catch(error) {this.dictation={...this.dictation,error:error.message};}
    return this.dictation;
  }
  async release(source=null) {
    if(!this.held||(source!==null&&this.held.source!==source)) return {released:false};
    clearTimeout(this.timer);
    try {return await this.send({phase:'up'});}
    finally {this.held=null;}
  }
  async execute(action,{phase='tap',source='button'}={}) {
    if(!['tap','down','up'].includes(phase)) throw new Error('按键阶段无效');
    if(phase==='up') return this.release(source);
    if(this.held?.source===source&&action.id==='dictation') return {held:true};
    await this.release();
    const shortcut=await this.resolve(action);
    const hold=action.id==='dictation'&&shortcut.delivery!=='globalTap';
    if(action.id==='dictation')this.dictation={mode:hold?'hold':'toggle',accelerator:shortcut.accelerator};
    if(hold&&phase!=='down') throw new Error('听写需要按住命令键，松开后结束。');
    const result=await this.send({...shortcut,phase:hold?'down':'tap',target:'com.openai.codex',activateTarget:true});
    if(hold) {
      this.held={source,action:'dictation',startedAt:this.now()};
      this.timer=setTimeout(()=>{void this.release().catch(()=>{});},120000);
      this.timer.unref?.();
    }
    return result;
  }
}

// Carbon and a local window listener can report the same gesture across focus
// transitions. Gate it at the shared boundary before a toggle reaches Codex.
export class PhysicalPressGate {
  constructor(now=Date.now){this.now=now;this.held=new Set();this.last=new Map();}
  down(code){
    if(this.held.has(code))return false;
    this.held.add(code);
    const now=this.now();
    if(now-(this.last.get(code)??-Infinity)<250)return false;
    this.last.set(code,now);return true;
  }
  up(code){this.held.delete(code);}
  reset(){this.held.clear();this.last.clear();}
}
