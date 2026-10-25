import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';

const runtimeInputs = new Set();
for (const [entry,platform] of [['apps/web/src/main.tsx','browser'],['apps/server/src/index.ts','node']]) {
  const result=await build({entryPoints:[entry],bundle:true,platform,format:'esm',packages:'external',write:false,metafile:true,logLevel:'silent',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','process.env.NODE_ENV':'"production"'}});
  for(const input of Object.keys(result.metafile.inputs))runtimeInputs.add(input.replaceAll('\\','/'));
}
const forbiddenInputs=[...runtimeInputs].filter(path=>/(^|\/)(tests|tmp|docs|output)\/|\/scenarios\.ts$|\/simulate\.ts$/.test(path));
assert.deepEqual(forbiddenInputs,[],'Production dependency graph includes test-only modules');

const server=readFileSync('apps/server/src/index.ts','utf8');
const messages=[...server.matchAll(/this\.onMessage\('([^']+)'/g)].map(match=>match[1]).sort();
assert.deepEqual(messages,['command','lobby','manage','rematch','sync'],'Unexpected room message handler');
const routes=[...server.matchAll(/\.get\('([^']+)'/g)].map(match=>match[1]);
assert.deepEqual(routes,['/health'],'Unexpected HTTP endpoint');

assert(existsSync('dist/index.html'),'Build the production website first');
const assets=readdirSync('dist/assets');
assert(!assets.some(file=>file.endsWith('.map')),'Public build must not contain source maps');
for(const file of assets.filter(file=>/\.(js|css)$/.test(file))) {
  const code=readFileSync(`dist/assets/${file}`,'utf8');
  assert(!/placeForTest|finishScenario|legacyBotAction|debugDie|setDebug|\.debug-controls|\.debug-panel|试听符卡宣告|试听倒计时|试听投骰|试听移动|实验性/.test(code),`Development feature found in ${file}`);
}
for(const file of ['board.svg','board-mobile.svg'])assert(existsSync(`dist/maps/${file}`),`Missing ${file}`);

const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(file=>file&&existsSync(file));
const forbiddenFiles=files.filter(file=>/^(docs|output|tmp|reports|exports|dist|dist-server|node_modules)\/|(^|\/)\.env(?:\.|$)|存档.*\.json$/.test(file));
assert.deepEqual(forbiddenFiles,[],'Local-only data would be published');
for(const file of files.filter(file=>/\.(tsx?|m?js|json|css|html|ya?ml|md|svg)$/.test(file))) {
  const code=readFileSync(file,'utf8');
  assert(!/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(code),`Credential-like text in ${file}`);
}
console.log(JSON.stringify({productionModules:runtimeInputs.size,testModulesIncluded:0,roomMessages:messages,httpRoutes:routes,publicBuild:'clean',sourceFiles:files.length}));
