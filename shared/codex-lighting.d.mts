export const STATUS_COLORS: Readonly<Record<string,string>>;
export const STATUS_NAMES: Readonly<Record<string,string>>;
export const CUSTOM_STATUS_IDS:readonly string[];
export function validateStatusColors(input:unknown,previous?:Record<string,string>):Record<string,string>;
export function statusColor(task?: {status?:string} | null,settings?:Record<string,unknown>): string;
export function resolveSlots<T extends {id?:string;status?:string;pinned?:boolean;pinOrder?:number}>(tasks:T[], settings:Record<string,unknown>): (T|null)[];
export function resolveWholeTask<T extends {id?:string}>(tasks:T[], settings:Record<string,unknown>, selectedId?:string|null):T|null;
export class CodexLights {
  constructor(now?:()=>number);
  wake():void;
  select(id:string):void;
  render(input:string[],slots:({id?:string;status?:string}|null)[],settings:Record<string,unknown>,tasks?:{id?:string;status?:string}[]):string[];
  snapshot():{sleeping:boolean;selectedId:string|null;selectionSource:string};
}
