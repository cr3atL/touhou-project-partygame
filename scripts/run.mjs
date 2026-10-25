import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { networkInterfaces } from 'node:os';
const bundled = join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe');
const runtime = Number(process.versions.node.split('.')[0]) >= 22 ? process.execPath : existsSync(bundled) ? bundled : null;
if (!runtime) { console.error('需要 Node.js 22 或更新版本。'); process.exit(1); }
const env = { ...process.env, PATH: `${dirname(runtime)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}` };
const children = [];
function run(entry, args = []) {
  const child = spawn(runtime, [entry, ...args], { stdio: 'inherit', env, windowsHide: true }); children.push(child); return child;
}
const task = process.argv[2];
if (task === 'dev') {
  const listening = port => new Promise(resolve => {
    const socket = createConnection({port,host:'127.0.0.1'});
    const finish=value=>{socket.destroy();resolve(value);};
    socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(false));
  });
  const [web,server] = await Promise.all([listening(5173),listening(2567)]);
  if (!web) run('node_modules/vite/bin/vite.js', ['--host', '0.0.0.0']);
  else console.log('5173 已有服务，保留现有网页服务。');
  if (!server) run('node_modules/tsx/dist/cli.mjs', ['apps/server/src/index.ts']);
  else console.log('2567 已有服务，保留现有房间服务。');
  console.log('本机入口 http://localhost:5173');
  for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
    if(address.family==='IPv4'&&!address.internal&&/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(address.address)) console.log(`局域网入口 http://${address.address}:5173`);
  }
} else {
  const jobs = {
    web: ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'],
    server: ['node_modules/tsx/dist/cli.mjs', 'apps/server/src/index.ts'],
    test: ['node_modules/vitest/vitest.mjs', 'run'],
    'decision-network': ['node_modules/tsx/dist/cli.mjs','tests/decision-network.ts'],
    network: ['node_modules/tsx/dist/cli.mjs', 'tests/network.ts'],
    rooms: ['node_modules/tsx/dist/cli.mjs', 'tests/rooms.ts'],
    management: ['node_modules/tsx/dist/cli.mjs', 'tests/room-management.ts'],
    'build-server': ['scripts/build-server.mjs'],
    check: ['node_modules/typescript/bin/tsc', '--noEmit'],
    build: ['node_modules/vite/bin/vite.js', 'build'],
    preview: ['node_modules/vite/bin/vite.js', 'preview', '--host', '0.0.0.0']
  };
  const job = jobs[task]; if (!job) throw new Error(`Unknown task ${task}`);
  run(job[0], [...job.slice(1), ...process.argv.slice(3)]).on('exit', code => { process.exitCode = code ?? 1; });
}
function stop() { for (const child of children) child.kill(); }
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
