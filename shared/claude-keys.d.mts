export const CLAUDE_KEYS: {code:string;label:string;keyCode:number}[];
export const DEFAULT_CLAUDE_TASK_KEYS: readonly string[];
export const DEFAULT_CLAUDE_COMMAND_KEYS: readonly string[];
export function claudeBindings(settings?:Record<string,unknown>): {index:number;code:string;label:string;keyCode:number;ledIndex:number|null}[];
export function validateClaudeKeys(settings:Record<string,unknown>): void;
export function rebindClaudeKey(settings:Record<string,unknown>,group:'task'|'command',index:number,code:string): Record<string,string[]>;
