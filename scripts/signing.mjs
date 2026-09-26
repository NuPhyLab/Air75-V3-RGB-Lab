import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function selectSigningIdentity(output, requested = process.env.AIR_STUDIO_SIGN_IDENTITY) {
  const identities = [...output.matchAll(/^\s*\d+\)\s+([A-F0-9]{40})\s+"([^"]+)"/gm)]
    .map(([,hash,name])=>({hash,name}))
    .filter(identity=>/^(Apple Development|Developer ID Application): /.test(identity.name));
  const matching = requested ? identities.filter(identity=>identity.hash===requested || identity.name===requested) : identities;
  if(matching.length!==1) throw new Error(requested
    ? '指定的 Apple 代码签名证书不存在或不唯一。'
    : '打包需要一个有效的 Apple 代码签名证书；存在多个证书时，请设置 AIR_STUDIO_SIGN_IDENTITY。不会回退到会使系统授权失效的 ad-hoc 签名。');
  return matching[0];
}
/**
 * Local ad-hoc signing for machines without an Apple certificate. It must be
 * requested explicitly with AIR_STUDIO_ALLOW_ADHOC=1: an ad-hoc signature has no
 * stable code identity, so macOS drops Input Monitoring and Accessibility grants
 * on every rebuild and other machines get a Gatekeeper warning.
 */
export const ADHOC_IDENTITY = Object.freeze({hash:'-',name:'ad-hoc（本机临时签名）',adhoc:true,apple:false});
const APPLE_IDENTITY = /^(Apple Development|Developer ID Application): /;
/**
 * Resolves an explicitly named certificate, including a locally created
 * self-signed one. Naming a certificate is deliberate, and a stable identity is
 * what keeps macOS permission grants valid across rebuilds, so this accepts a
 * non-Apple name. Automatic selection stays Apple-only, and ad-hoc still needs
 * its own opt-in rather than being spelled as a name here.
 */
export function selectNamedIdentity(output, requested) {
  // Without -v the listing repeats each identity under "Matching identities"
  // and again under "Valid identities only", so collapse duplicates first.
  const identities = [...new Map([...output.matchAll(/^\s*\d+\)\s+([A-F0-9]{40})\s+"([^"]+)"/gm)]
    .map(([,hash,name])=>[`${hash} ${name}`,{hash,name}])).values()];
  const matching = identities.filter(identity=>identity.hash===requested || identity.name===requested);
  if(matching.length!==1) throw new Error('指定的代码签名证书不存在或不唯一。');
  return {...matching[0],adhoc:false,apple:APPLE_IDENTITY.test(matching[0].name)};
}
export function signingIdentity({
  allowAdhoc = process.env.AIR_STUDIO_ALLOW_ADHOC === '1',
  requested = process.env.AIR_STUDIO_SIGN_IDENTITY,
} = {}) {
  if(requested) {
    if(requested==='-') throw new Error('ad-hoc 签名请使用 AIR_STUDIO_ALLOW_ADHOC=1，不要作为证书名指定。');
    // A self-signed certificate has no trust chain, so list every identity the
    // keychain holds rather than only the ones that validate.
    return selectNamedIdentity(execFileSync('/usr/bin/security',['find-identity','-p','codesigning'],{encoding:'utf8'}),requested);
  }
  const listing = execFileSync('/usr/bin/security',['find-identity','-v','-p','codesigning'],{encoding:'utf8'});
  try {
    return {...selectSigningIdentity(listing),adhoc:false,apple:true};
  } catch (error) {
    if(!allowAdhoc) throw error;
    return ADHOC_IDENTITY;
  }
}
// Keep the original identifier and stable signing certificate across updates:
// macOS ties Input Monitoring / Accessibility grants to this identity, not the
// display name. A different development machine's TCC workaround must not
// change the identity of existing installations.
export const BUNDLE_ID = 'local.airstudio.desktop';
export function requireDistributionIdentity(identity, validListing) {
  if (!identity.name.startsWith('Developer ID Application: ') || identity.adhoc)
    throw new Error('Distribution requires a valid Developer ID Application identity.');
  selectSigningIdentity(validListing, identity.hash);
}
export function signApp(app, identity) {
  const distribution = identity.name.startsWith('Developer ID Application: ');
  const entitlements = fileURLToPath(new URL('../native/entitlements/', import.meta.url));
  // Sign every executable with the same certificate, then seal the completed
  // bundle once. No weak custom requirement, permissions reset or TCC writes.
  for(const [file,id,permissions] of [
    ['Contents/Resources/runtime/node',`${BUNDLE_ID}.runtime`,'node.plist'],
    ['Contents/Resources/bin/HIDBridge',`${BUNDLE_ID}.hid`,null],
    ['', BUNDLE_ID,'app.plist'],
  ]) {
    const options = distribution ? ['--options','runtime','--timestamp',
      ...(permissions ? ['--entitlements',path.join(entitlements,permissions)] : [])] : ['--timestamp=none'];
    execFileSync('/usr/bin/codesign',['--force','--sign',identity.hash,'--identifier',id,...options,path.join(app,file)],{stdio:'pipe'});
  }
  // An ad-hoc bundle still has to verify; only its authority is missing.
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
}
