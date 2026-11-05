import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function run(command,args,{capture=false,allowFailure=false}={}){
  const result=spawnSync(command,args,{encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(!allowFailure)assert.equal(result.status,0,result.stderr||result.stdout||`${command} failed`);
  return result;
}

const branch=run('git',['branch','--show-current'],{capture:true}).stdout.trim();
assert.equal(branch,'codex/johnny-rossato-special-events','Refusing to deploy a branch other than the PR #49 staging branch.');
assert.equal(run('git',['status','--porcelain'],{capture:true}).stdout.trim(),'','Refusing to deploy a dirty worktree.');
const head=run('git',['rev-parse','HEAD'],{capture:true}).stdout.trim();
const deployed=run('npx',['wrangler','pages','deploy','.',
  '--project-name','bootscootin-special-events-staging',
  '--branch','codex-johnny-rossato-special-events',
  '--commit-hash',head,
  '--commit-dirty=false'
],{capture:true});
process.stdout.write(deployed.stdout);
process.stderr.write(deployed.stderr);
const url=deployed.stdout.match(/https:\/\/[a-z0-9]+\.bootscootin-special-events-staging\.pages\.dev/)?.[0];
assert(url,'Wrangler did not return an isolated staging deployment URL.');
const smoke=run(process.execPath,['tools/staging-special-events-smoke.mjs',url],{allowFailure:true});
assert.equal(smoke.status,0,'Deployment created but is NOT owner-ready: complete the authenticated smoke check before reporting it.');
