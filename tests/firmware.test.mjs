import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, parseFirmwareManifest, FirmwareChecker, FIRMWARE_API } from "../server/firmware.mjs";
const manifest = (version = "1.0.16.6", changes = {}) => ({code:200,data:{businessId:"1930212869851615233",type:"1",environment:"prod",status:"0",versionNumber:version,...changes}});
const device = (firmware = "1.0.16.6") => ({connected:true,firmware,capabilities:{perKey:true}});

test("four-part firmware versions compare numerically and reject malformed values", () => {
  assert.equal(compareVersions("1.0.9.6", "1.0.16.6"), -1);
  assert.equal(compareVersions("1.0.16.6", "1.0.16.6"), 0);
  assert.equal(compareVersions("1.0.16.513", "1.0.16.99"), 1);
  assert.equal(compareVersions("0.0.10.6", "1.0.1.5"), -1);
  for (const value of [null,"unknown","1.0.16","1.0.16.6-beta","1.0.999.6","1.0.16.99999"])
    assert.equal(compareVersions(value,"1.0.16.6"), null);
});
test("only the exact ANSI model's enabled official production release is accepted", () => {
  assert.equal(parseFirmwareManifest(manifest()).version,"1.0.16.6");
  for (const changes of [{businessId:"1935604237029969922"},{type:"2"},{environment:"dev"},{status:"1"},{versionNumber:"invalid"}])
    assert.throws(()=>parseFirmwareManifest(manifest("1.0.16.6",changes)));
  assert.throws(()=>parseFirmwareManifest({code:500,data:manifest().data}));
});
test("current, old, future, unknown and unplugged devices have distinct states", async () => {
  const checker=new FirmwareChecker({fetchImpl:async(url,options)=>{
    assert.equal(url,FIRMWARE_API); assert.equal(options.redirect,"error");
    return new Response(JSON.stringify(manifest()));
  }});
  await checker.refresh();
  assert.equal(checker.snapshot(device()).status,"current");
  assert.equal(checker.snapshot(device("1.0.14.6")).status,"updateAvailable");
  assert.equal(checker.snapshot(device("1.0.17.6")).status,"newer");
  assert.equal(checker.snapshot(device("unknown")).status,"unknown");
  assert.equal(checker.snapshot({...device(),connected:false}).status,"disconnected");
});
test("requests are coalesced and cached for six hours with explicit recheck support", async () => {
  let now=1000,calls=0,resolve;
  const checker=new FirmwareChecker({now:()=>now,fetchImpl:()=>{calls++;return new Promise(r=>{resolve=r;});}});
  const first=checker.refresh(); assert.equal(checker.refresh(true),first);
  await Promise.resolve(); assert.equal(checker.snapshot(device()).status,"checking");
  resolve(new Response(JSON.stringify(manifest()))); await first;
  await checker.refresh(); assert.equal(calls,1);
  now+=6*60*60*1000+1; assert.equal(checker.snapshot(device()).status,"unavailable");
  const second=checker.refresh(); await Promise.resolve(); resolve(new Response(JSON.stringify(manifest()))); await second;
  assert.equal(calls,2);
  const third=checker.refresh(true); await Promise.resolve(); resolve(new Response(JSON.stringify(manifest()))); await third;
  assert.equal(calls,3);
});
test("offline and invalid responses never falsely say current, and retry recovers", async () => {
  let mode="ok",now=1000,calls=0;
  const checker=new FirmwareChecker({now:()=>now,fetchImpl:async()=>{
    calls++; if(mode==="offline") throw new Error("offline");
    return new Response(mode==="invalid"?"not json":JSON.stringify(manifest()));
  }});
  await checker.refresh(); mode="offline"; await checker.refresh(true);
  assert.equal(checker.snapshot(device()).status,"unavailable");
  assert.equal(checker.snapshot(device()).stale,true);
  assert.equal(checker.snapshot(device()).latest,"1.0.16.6");
  await checker.refresh(); assert.equal(calls,2);
  now+=5*60*1000+1; mode="invalid"; await checker.refresh(); assert.equal(calls,3);
  mode="ok"; await checker.refresh(true); assert.equal(checker.snapshot(device()).status,"current");
});
test("HTTP errors and oversized payloads remain unavailable", async () => {
  for (const response of [new Response("error",{status:503}),new Response("x".repeat(128*1024+1))]) {
    const checker=new FirmwareChecker({fetchImpl:async()=>response}); await checker.refresh();
    assert.equal(checker.snapshot(device()).status,"unavailable");
    assert.equal(checker.snapshot(device()).latest,null);
  }
});
test("closing aborts an in-flight check without an unhandled rejection", async () => {
  const checker=new FirmwareChecker({fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}))});
  const pending=checker.refresh(); await Promise.resolve(); checker.close(); await pending;
  assert.equal(checker.snapshot(device()).checking,false);
});

test('online latest version never grants missing device capabilities', async () => {
  const checker = new FirmwareChecker({fetchImpl: async () => new Response(JSON.stringify(manifest('1.0.23.6')))});
  await checker.refresh();
  for (const capabilities of [undefined, {}, {perKey:false}]) {
    const result = checker.snapshot({...device('1.0.23.6'), capabilities});
    assert.equal(result.status, 'current');
    assert.equal(result.compatible, false);
  }
  const next = checker.snapshot({...device('1.0.99.6'), capabilities:{perKey:true,protocol:'air75-s4',stateBytes:22}});
  assert.equal(next.status, 'newer');
  assert.equal(next.compatible, true);
  assert.equal(next.stateBytes, 22);
  assert.equal(next.verifiedVersion, '1.0.23.6', 'future protocol support must not claim future-firmware hardware testing');
});
