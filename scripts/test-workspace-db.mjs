import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile, unlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import net from 'node:net';
import pg from 'pg';

const name = `style_gen_test_${randomBytes(6).toString('hex')}`;
if (!/^style_gen_test_[a-f0-9]{12}$/.test(name)) throw new Error('Unsafe test database name');
const password = randomBytes(24).toString('hex');
const configPath = resolve(`.workspace-test-${name}.config.ts`);
const distDir = `.next-workspace-test-${name.slice(-12)}`;
let client;
const run = (cmd, args, env = process.env) => new Promise((resolveRun, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit', env });
  child.once('error', reject); child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${cmd} exited ${code}`)));
});
const freePort = () => new Promise((resolvePort, reject) => {
  const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => {
    const port = server.address().port; server.close(() => resolvePort(port));
  });
});
try {
  await run('docker', ['run', '--detach', '--rm', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${name}`, '-p', '127.0.0.1::5432', 'postgres:17-alpine']);
  const portResult = spawnSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' });
  if (portResult.status !== 0) throw new Error('Cannot inspect test container');
  const port = portResult.stdout.trim().split(':').at(-1);
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/${name}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    client = new pg.Client({ connectionString: databaseUrl });
    try { await client.connect(); break; } catch (error) { await client.end(); client = null; if (attempt === 59) throw error; await new Promise(r => setTimeout(r, 500)); }
  }
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
  for (const migration of journal.entries) {
    if (migration.idx === 7) {
      await client.query("INSERT INTO users(id,google_id,email,name) VALUES('legacy-workspace-test','legacy-workspace-test','test@example.test','test')");
      await client.query("INSERT INTO assets(id,type,file_url,width,height,mime_type,user_id) VALUES('legacy-workspace-asset','reference','https://example.test',1,1,'image/png','legacy-workspace-test')");
      await client.query("INSERT INTO analysis_tasks(id,source_asset_id,user_id) VALUES('legacy-workspace-analysis','legacy-workspace-asset','legacy-workspace-test')");
      await client.query("INSERT INTO generation_tasks(id,analysis_task_id,prompt_snapshot,negative_prompt_snapshot,params,model_name,user_id) VALUES('legacy-workspace-gen','legacy-workspace-analysis','original','negative','{}','original','legacy-workspace-test')");
    }
    const sql = await readFile(`drizzle/${migration.tag}.sql`, 'utf8');
    await client.query('BEGIN');
    try { await client.query(sql); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  if (journal.entries.some(m => m.idx === 7)) {
    const { rows } = await client.query("SELECT direction_id,request_key,dispatch_state,prompt_snapshot FROM generation_tasks WHERE id='legacy-workspace-gen'");
    if (rows[0]?.prompt_snapshot !== 'original' || rows[0].direction_id !== null || rows[0].request_key !== null || rows[0].dispatch_state !== null) throw new Error('Legacy upgrade changed stored facts');
    console.log('Legacy schema upgrade preserves original snapshot and nullable fields');
  }
  console.log(`Applied ${journal.entries.length} migrations to disposable test database`);
  const env = { ...process.env, REPLICATE_API_TOKEN: '', REPLICATE_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString('base64')}`, GEMINI_API_KEY: '', FAL_KEY: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_ACCOUNT_ID: '', R2_BUCKET_NAME: '', R2_PUBLIC_URL: 'https://media.example.test', DATABASE_URL: databaseUrl, WORKSPACE_TEST_DATABASE_URL: databaseUrl, AUTH_SECRET: randomBytes(32).toString('hex'), WORKSPACE_TEST_DIST_DIR: distDir };
  if (process.argv.includes('--e2e')) {
    const specs = process.argv.slice(process.argv.indexOf('--e2e') + 1);
    if (!specs.length || specs.some(s => !/^e2e\/[\w-]+\.spec\.ts$/.test(s))) throw new Error('Provide explicit e2e/*.spec.ts targets');
    const appPort = await freePort();
    await writeFile(`${distDir}.tsconfig.json`, await readFile('tsconfig.json')); 
    await writeFile(configPath, `import base from './playwright.config';\nimport { defineConfig } from '@playwright/test';\nexport default defineConfig({...base, projects: base.projects?.filter(p => p.name === 'workspace').map(p => ({...p,use:{...p.use,baseURL:'http://localhost:${appPort}'}})),webServer:{command:'pnpm dev --port ${appPort}',url:'http://localhost:${appPort}',reuseExistingServer:false,timeout:120000}});\n`);
    await run('pnpm', ['exec', 'playwright', 'test', '--config', configPath, ...specs, '--project=workspace'], env);
  } else {
    const files = [];
    async function scan(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = `${dir}/${entry.name}`; if (entry.isDirectory()) await scan(path); else if (/^(workspace|submission|reconciliation|analysis).*\.integration\.test\.ts$/.test(entry.name)) files.push(path); } }
    await scan('src/lib');
    if (!files.length) throw new Error('No delivered integration tests found');
    await run('pnpm', ['vitest', '--config', 'vitest.workspace-db.config.ts', '--run', ...files], env);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client?.end(); await unlink(configPath).catch(() => {}); await rm(distDir, { recursive: true, force: true }); await unlink(`${distDir}.tsconfig.json`).catch(() => {}); spawnSync('docker', ['rm', '--force', name], { stdio: 'ignore' }); }
