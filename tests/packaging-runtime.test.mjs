import test from 'node:test';
import assert from 'node:assert/strict';
import {selfContained,runtimePath,RUNTIME_VERSION,isDirectRun} from '../scripts/fetch-node.mjs';
import {pathToFileURL} from 'node:url';

test('the runtime download command works from Unicode and spaced project paths without running on import',()=>{
 const entry='/tmp/项目/NuPhy Lab/scripts/fetch-node.mjs';
 assert.equal(isDirectRun(pathToFileURL(entry).href,entry),true);
 assert.equal(isDirectRun(pathToFileURL(entry).href,'/tmp/another-script.mjs'),false);
 assert.equal(isDirectRun(pathToFileURL(entry).href,''),false);
});

test('a runtime that only uses system libraries is accepted',()=>{
 assert.equal(selfContained(`/tmp/node:
\t/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (compatibility version 150.0.0)
\t/usr/lib/libc++.1.dylib (compatibility version 1.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)`),true);
});
test('a package-manager runtime that reaches outside the bundle is rejected',()=>{
 // Homebrew's node links against @rpath/libnode and /opt/homebrew libraries,
 // which do not exist on the machines this .app is handed to.
 assert.equal(selfContained(`/opt/homebrew/bin/node:
\t@rpath/libnode.147.dylib (compatibility version 0.0.0)
\t/usr/lib/libz.1.dylib (compatibility version 1.0.0)
\t/opt/homebrew/opt/libuv/lib/libuv.1.dylib (compatibility version 1.0.0)`),false);
 assert.equal(selfContained(`/x/node:\n\t/usr/local/lib/libfoo.dylib (compatibility version 1.0.0)`),false);
});
test('the bundled runtime is pinned and stored outside the source tree checkout',()=>{
 assert.match(RUNTIME_VERSION,/^v\d+\.\d+\.\d+$/);
 assert.match(runtimePath('arm64'),/vendor\/node-arm64\/node$/);
 assert.match(runtimePath('x64'),/vendor\/node-x64\/node$/);
});

import {fakeService} from './helpers/fake-service.mjs';
test('the running app reports how it was signed so a stale grant can be explained',async t=>{
 // Absent signing.json (source runs) must not claim an ad-hoc build.
 const service=await fakeService(t);
 const build=(await service.state()).build;
 assert.equal(build.adhoc,false);
 assert.equal(typeof build.identity,'string');
});
