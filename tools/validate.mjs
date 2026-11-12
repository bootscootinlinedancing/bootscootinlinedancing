import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {extname,join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const rootPath=root.pathname;
const ignored=new Set(['.git','node_modules','work']);

function filesUnder(directory){
  const output=[];
  for(const name of readdirSync(directory)){
    if(ignored.has(name))continue;
    const path=join(directory,name),stat=statSync(path);
    if(stat.isDirectory())output.push(...filesUnder(path));
    else output.push(path);
  }
  return output;
}

const files=filesUnder(rootPath);
const scripts=files.filter(path=>['.js','.mjs'].includes(extname(path)));
for(const path of scripts){
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(result.status,0,`${relative(rootPath,path)} syntax failed:\n${result.stderr||result.stdout}`);
}

for(const path of files.filter(path=>extname(path)==='.html')){
  const source=readFileSync(path,'utf8'),seen=new Set();
  for(const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)){
    assert(!seen.has(match[1]),`${relative(rootPath,path)} contains duplicate id="${match[1]}"`);
    seen.add(match[1]);
  }
}

for(const path of files.filter(path=>extname(path)==='.css')){
  const source=readFileSync(path,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  let depth=0,quote='';
  for(let index=0;index<source.length;index+=1){
    const char=source[index];
    if(quote){if(char==='\\')index+=1;else if(char===quote)quote='';continue;}
    if(char==='"'||char==="'"){quote=char;continue;}
    if(char==='{')depth+=1;
    if(char==='}')depth-=1;
    assert(depth>=0,`${relative(rootPath,path)} has an unexpected closing brace`);
  }
  assert.equal(depth,0,`${relative(rootPath,path)} has unbalanced braces`);
}

const standaloneTests=[
  'payment-reconciliation-regression.mjs',
  'payment-scheduler-regression.mjs',
  'read-only-payment-verification.mjs',
  'admission-rewards-regression.mjs',
  'attendee-loyalty-regression.mjs',
  'halloween-promo-regression.mjs',
  'hq-lifecycle-ui-regression.mjs',
  'integration-polish-regression.mjs',
  'marketing-suppression-regression.mjs',
  'pr41-navigation-recovery-regression.mjs',
  'pr41-owner-corrections-regression.mjs',
  'special-events-e2e.mjs',
  'special-events-regression.mjs',
  'sunday-sessions-regression.mjs',
  'welcome-offer-regression.mjs'
];
for(const test of standaloneTests){
  const result=spawnSync(process.execPath,[join(rootPath,'tests',test)],{encoding:'utf8'});
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status,0,`${test} failed`);
}

console.log(`Validation passed: ${scripts.length} scripts, HTML duplicate IDs, CSS structure and ${standaloneTests.length} self-contained regression suites.`);
