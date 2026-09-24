export const CLAUDE_STATUS_COLORS: Readonly<Record<string,string>>;
export const CLAUDE_STATUS_NAMES: Readonly<Record<string,string>>;
export const CLAUDE_STATUS_IDS: readonly string[];
export const CLAUDE_ATTENTION_RANK: Readonly<Record<string,number>>;
export function validateClaudeStatusColors(input:unknown,previous?:Record<string,string>):Record<string,string>;
export function claudeStatusColor(task?:{status?:string}|null,settings?:Record<string,unknown>):string;
export function resolveClaudeSlots<T extends {id?:string;status?:string}>(tasks:T[],settings:Record<string,unknown>):(T|null)[];
export function resolveClaudeWholeTask<T extends {id?:string}>(tasks:T[],settings:Record<string,unknown>,selectedId?:string|null):T|null;
export class ClaudeLights {
  constructor(now?:()=>number);
  wake():void;
  select(id:string):void;
  render(input:string[],slots:({id?:string;status?:string}|null)[],settings:Record<string,unknown>,tasks?:{id?:string;status?:string}[]):string[];
  snapshot():{sleeping:boolean;selectedId:string|null;selectionSource:string};
}
