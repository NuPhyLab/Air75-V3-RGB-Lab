export type CodexKey = {code:string;label:string;keyCode:number};
export type CodexBinding = CodexKey & {index:number;ledIndex:number|null};
export const CODEX_KEYS: CodexKey[];
export const DEFAULT_TASK_KEYS: readonly string[];
export const DEFAULT_COMMAND_KEYS: readonly string[];
export function codexBindings(settings?:Record<string,unknown>):CodexBinding[];
export function validateCodexKeys(settings:Record<string,unknown>):void;
export function rebindCodexKey(settings:Record<string,unknown>,group:string,index:number,code:string):{codexTaskKeys:string[];codexCommandKeys:string[]};
