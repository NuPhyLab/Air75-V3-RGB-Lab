import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent,orderEvents,reduceSession,applyLiveness,HOOK_EVENTS} from '../server/claude-events.mjs';

const at0=1_700_000_000_000;
const event=(e,extra={},index=0)=>normalizeEvent({e,s:'session-a',at:at0+(extra.offset??index*1000),q:String(index),...extra},index);
const reduce=(list,now=at0+10_000)=>reduceSession(list,{now});

test('a full turn moves running -> awaiting approval -> running -> awaiting input',t=>{
 const events=[
  event('SessionStart',{r:'startup',c:'/Users/x/proj',p:4242},0),
  event('UserPromptSubmit',{},1),
  event('PreToolUse',{t:'Bash'},2),
  event('PermissionRequest',{t:'Bash'},3),
  event('PostToolUse',{t:'Bash'},4),
  event('Stop',{},5),
 ];
 assert.equal(reduce(events.slice(0,1)).status,'awaitingInput');
 assert.equal(reduce(events.slice(0,3)).status,'running');
 const approval=reduce(events.slice(0,4));
 assert.equal(approval.status,'awaitingApproval');
 assert.equal(approval.pendingApproval.tool,'Bash');
 assert.equal(reduce(events.slice(0,5)).status,'running');
 const stopped=reduce(events);
 assert.equal(stopped.status,'awaitingInput');
 assert.equal(stopped.turnActive,false);
 assert.equal(stopped.cwd,'/Users/x/proj');
 assert.equal(stopped.pid,4242);
});
test('stopping a turn never reports the project as finished',t=>{
 const stopped=reduce([event('UserPromptSubmit',{},0),event('Stop',{},1)]);
 assert.equal(stopped.status,'awaitingInput');
 assert.notEqual(stopped.status,'completed');
 assert.match(stopped.evidence,/本轮响应结束/);
});
test('a single failed tool call keeps the turn running instead of failing the task',t=>{
 const state=reduce([event('UserPromptSubmit',{},0),event('PreToolUse',{t:'Bash'},1),event('PostToolUseFailure',{t:'Bash'},2)]);
 assert.equal(state.status,'running');
 assert.equal(state.toolFailures,1);
 const failed=reduce([event('UserPromptSubmit',{},0),event('StopFailure',{r:'rate_limit'},1)]);
 assert.equal(failed.status,'error');
 assert.equal(failed.errorType,'rate_limit');
});
test('duplicate and out-of-order lines produce the same state as the ordered stream',t=>{
 const ordered=[event('UserPromptSubmit',{},0),event('PreToolUse',{t:'Read'},1),event('Stop',{},2)];
 const shuffled=[ordered[2],ordered[0],ordered[1],ordered[2],ordered[1]];
 const a=reduce(ordered),b=reduce(shuffled);
 assert.equal(b.status,a.status);
 assert.equal(b.events,3);
 assert.equal(orderEvents(shuffled).map(x=>x.event).join(','),'UserPromptSubmit,PreToolUse,Stop');
});
test('a later event never loses to an earlier duplicate arriving afterwards',t=>{
 const approval=event('PermissionRequest',{t:'Bash'},1);
 const post=event('PostToolUse',{t:'Bash'},2);
 assert.equal(reduce([approval,post]).status,'running');
 assert.equal(reduce([post,approval,post]).status,'running');
});
test('sessions never mix: each session reduces independently',t=>{
 assert.equal(normalizeEvent({e:'Stop',s:'other',at:at0}).session,'other');
 const mine=reduce([event('UserPromptSubmit',{},0)]);
 const theirs=reduceSession([normalizeEvent({e:'SessionEnd',s:'other',at:at0+5000,r:'clear'},0)],{now:at0+10_000});
 assert.equal(mine.status,'running');
 assert.equal(theirs.status,'ended');
});
test('malformed, unknown and unsafe records are dropped without throwing',t=>{
 assert.equal(normalizeEvent(null),null);
 assert.equal(normalizeEvent({e:'DoesNotExist',s:'a',at:at0}),null);
 assert.equal(normalizeEvent({e:'Stop',s:'bad id!',at:at0}),null);
 assert.equal(normalizeEvent({e:'Stop',s:'a'}),null);
 assert.equal(normalizeEvent({e:'Stop',s:'a',at:-1}),null);
 assert.equal(normalizeEvent({e:'Stop',s:'a',at:at0,c:'relative/path'}).cwd,null);
 assert.equal(normalizeEvent({e:'Stop',s:'a',at:at0,t:'A B‮C'}).tool,'A B C');
 assert.equal(reduce([]).status,'unknown');
});
test('session end and a dead process both end the session, with distinguishable reasons',t=>{
 const ended=reduce([event('UserPromptSubmit',{},0),event('SessionEnd',{r:'logout'},1)]);
 assert.equal(ended.status,'ended');
 assert.equal(ended.endedReason,'logout');
 const dropped=applyLiveness(reduce([event('UserPromptSubmit',{},0)]),{alive:false});
 assert.equal(dropped.status,'ended');
 assert.equal(dropped.endedReason,'disconnected');
 assert.match(dropped.evidence,/进程已退出/);
});
test('a long running turn stays running while the process is alive',t=>{
 const now=at0+8*60*60*1000;
 const running=reduce([event('UserPromptSubmit',{},0),event('PreToolUse',{t:'Bash'},1)],now);
 assert.equal(applyLiveness(running,{alive:true,now}).status,'running');
 assert.equal(applyLiveness(running,{alive:null,now}).status,'unknown','no liveness evidence after the stale window');
 assert.equal(applyLiveness(running,{alive:null,now:at0+5000}).status,'running','recent events still count');
});
test('an already ended session is not revived by liveness checks',t=>{
 const ended=reduce([event('SessionEnd',{r:'clear'},0)]);
 assert.equal(applyLiveness(ended,{alive:true}).status,'ended');
});
test('permission notifications and idle notifications map to distinct states',t=>{
 assert.equal(reduce([event('Notification',{k:'permission_prompt'},0)]).status,'awaitingApproval');
 assert.equal(reduce([event('Notification',{k:'idle_prompt'},0)]).status,'awaitingInput');
 assert.equal(reduce([event('UserPromptSubmit',{},0),event('Notification',{k:'auth_success'},1)]).status,'running');
});
test('a denied permission continues the turn instead of ending it',t=>{
 const state=reduce([event('PermissionRequest',{t:'Bash'},0),event('PermissionDenied',{t:'Bash'},1)]);
 assert.equal(state.status,'running');
 assert.equal(state.pendingApproval,null);
});
test('the installed hook event list stays in sync with the reducer',t=>{
 for(const name of HOOK_EVENTS) assert.ok(normalizeEvent({e:name,s:'a',at:at0}),`${name} must be accepted`);
 assert.equal(HOOK_EVENTS.length,11);
});
