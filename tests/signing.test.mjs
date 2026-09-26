import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSigningIdentity,selectNamedIdentity,requireDistributionIdentity} from '../scripts/signing.mjs';
const dev='A'.repeat(40), local='B'.repeat(40),distribution='C'.repeat(40);
const listing=` 1) ${local} "Local test certificate"\n 2) ${dev} "Apple Development: Example (TEAM)"\n 2 valid identities found`;
test('packaging selects an Apple certificate and never silently falls back to an ad-hoc identity',()=>{
 assert.deepEqual(selectSigningIdentity(listing),{hash:dev,name:'Apple Development: Example (TEAM)'});
 assert.throws(()=>selectSigningIdentity('0 valid identities found'));
 assert.throws(()=>selectSigningIdentity(listing,'-'));
 assert.throws(()=>selectSigningIdentity(listing,local));
 assert.throws(()=>selectSigningIdentity(listing+'\n3) '+distribution+' "Developer ID Application: Example (TEAM)"'));
 assert.equal(selectSigningIdentity(listing,dev).hash,dev);
});
test('a listing that repeats the same identity in two sections still resolves',()=>{
 // `security find-identity -p codesigning` prints "Matching identities" and
 // "Valid identities only", so a trusted certificate appears twice.
 const repeated=` 1) ${local} "NuPhyLab Local Code Signing"\n 1 identities found\n\n 1) ${local} "NuPhyLab Local Code Signing"\n 1 valid identities found`;
 assert.equal(selectNamedIdentity(repeated,'NuPhyLab Local Code Signing').hash,local);
 const twoCerts=` 1) ${local} "One"\n 2) ${dev} "Apple Development: Example (TEAM)"`;
 assert.throws(()=>selectNamedIdentity(twoCerts,'Missing'));
});
test('an explicitly named certificate may be a local self-signed one, but never ad-hoc',()=>{
 const untrusted=` 1) ${local} "NuPhyLab Local Code Signing"\n 2) ${dev} "Apple Development: Example (TEAM)"\n 2 identities found`;
 // A stable self-signed identity is what keeps macOS permission grants valid
 // across rebuilds, so naming one is allowed; it is still reported as non-Apple.
 assert.deepEqual(selectNamedIdentity(untrusted,'NuPhyLab Local Code Signing'),
  {hash:local,name:'NuPhyLab Local Code Signing',adhoc:false,apple:false});
 assert.equal(selectNamedIdentity(untrusted,dev).apple,true);
 assert.throws(()=>selectNamedIdentity(untrusted,'Missing Certificate'));
 assert.throws(()=>selectNamedIdentity(untrusted,'-'));
});

test('distribution rejects development, ad-hoc and expired identities before packaging',()=>{
 const name='Developer ID Application: Example (TEAM)';
 const valid=` 1) ${distribution} "${name}"`;
 assert.doesNotThrow(()=>requireDistributionIdentity({hash:distribution,name},valid));
 assert.throws(()=>requireDistributionIdentity({hash:dev,name:'Apple Development: Example (TEAM)'},listing));
 assert.throws(()=>requireDistributionIdentity({hash:'-',name:'ad-hoc',adhoc:true},valid));
 assert.throws(()=>requireDistributionIdentity({hash:distribution,name},'0 valid identities found'));
});
