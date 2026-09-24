import keys from './trigger-keys.json' with {type:'json'};
import {layout} from './layout.mjs';

// The recorder catalogue is shared with Codex mode and key triggers: single
// ordinary keys only. Fn and modifier-only bindings stay unavailable because the
// native host registers zero-modifier Carbon hotkeys.
export const CLAUDE_KEYS = keys;
export const DEFAULT_CLAUDE_TASK_KEYS = Object.freeze(Array.from({length:6},(_,i)=>`F${i+1}`));
export const DEFAULT_CLAUDE_COMMAND_KEYS = Object.freeze(Array.from({length:6},(_,i)=>`F${i+7}`));
export function claudeBindings(settings={}) {
  return [...(settings.claudeTaskKeys ?? DEFAULT_CLAUDE_TASK_KEYS), ...(settings.claudeCommandKeys ?? DEFAULT_CLAUDE_COMMAND_KEYS)]
    .map((code,index)=>({index, ...CLAUDE_KEYS.find(key=>key.code===code), ledIndex:layout.find(key=>key.code===code)?.index ?? null}));
}
export function validateClaudeKeys(settings) {
  const groups=[settings.claudeTaskKeys === undefined ? DEFAULT_CLAUDE_TASK_KEYS : settings.claudeTaskKeys,
    settings.claudeCommandKeys === undefined ? DEFAULT_CLAUDE_COMMAND_KEYS : settings.claudeCommandKeys];
  if(groups.some(keys=>!Array.isArray(keys)||keys.length!==6||keys.some(code=>!CLAUDE_KEYS.some(key=>key.code===code))))
    throw new Error('请选择键盘上的单个普通按键；Fn 和修饰键不能单独绑定。');
  if(new Set(groups.flat()).size!==12) throw new Error('任务键和命令键不能重复。');
}
export function rebindClaudeKey(settings,group,index,code) {
  if(!['task','command'].includes(group)||!Number.isInteger(index)||index<0||index>5) throw new Error('按键位置无效');
  const all=claudeBindings(settings).map(key=>key.code);
  const position=index+(group==='command'?6:0), duplicate=all.indexOf(code);
  if(duplicate>=0) all[duplicate]=all[position];
  all[position]=code;
  const patch={claudeTaskKeys:all.slice(0,6),claudeCommandKeys:all.slice(6)};
  validateClaudeKeys(patch);
  return patch;
}
