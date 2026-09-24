import keys from './trigger-keys.json' with {type:'json'};
import {layout} from './layout.mjs';

// Fn and modifier keys are not standalone Carbon shortcuts. Keep the catalogue
// explicit so the recorder never promises a binding the native host cannot use.
export const CODEX_KEYS = keys;
export const DEFAULT_TASK_KEYS = Object.freeze(Array.from({length:6},(_,i)=>`F${i+1}`));
export const DEFAULT_COMMAND_KEYS = Object.freeze(Array.from({length:6},(_,i)=>`F${i+7}`));
export function codexBindings(settings={}) {
  return [...(settings.codexTaskKeys ?? DEFAULT_TASK_KEYS), ...(settings.codexCommandKeys ?? DEFAULT_COMMAND_KEYS)]
    .map((code,index)=>({index, ...CODEX_KEYS.find(key=>key.code===code), ledIndex:layout.find(key=>key.code===code)?.index ?? null}));
}
export function validateCodexKeys(settings) {
  const groups=[settings.codexTaskKeys === undefined ? DEFAULT_TASK_KEYS : settings.codexTaskKeys,settings.codexCommandKeys === undefined ? DEFAULT_COMMAND_KEYS : settings.codexCommandKeys];
  if(groups.some(keys=>!Array.isArray(keys)||keys.length!==6||keys.some(code=>!CODEX_KEYS.some(key=>key.code===code))))
    throw new Error('请选择键盘上的单个普通按键；Fn 和修饰键不能单独绑定。');
  if(new Set(groups.flat()).size!==12) throw new Error('任务键和命令键不能重复。');
}
export function rebindCodexKey(settings,group,index,code) {
  if(!['task','command'].includes(group)||!Number.isInteger(index)||index<0||index>5) throw new Error('按键位置无效');
  const all=codexBindings(settings).map(key=>key.code);
  const position=index+(group==='command'?6:0), duplicate=all.indexOf(code);
  if(duplicate>=0) all[duplicate]=all[position];
  all[position]=code;
  const patch={codexTaskKeys:all.slice(0,6),codexCommandKeys:all.slice(6)};
  validateCodexKeys(patch);
  return patch;
}
