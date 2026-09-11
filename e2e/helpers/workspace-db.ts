import { Pool } from 'pg';
import { ulid } from 'ulid';

export function workspaceTestPool() {
  const url = process.env.WORKSPACE_TEST_DATABASE_URL;
  if (!url || !/^style_gen_test_[a-f0-9]{12}$/.test(new URL(url).pathname.slice(1))) throw new Error('Use scripts/test-workspace-db.mjs --e2e; development DB is forbidden');
  return new Pool({ connectionString: url });
}
export async function seedWorkspaceSources(pool: Pool) {
  const user = { id: ulid(), name: 'Workspace test', email: `${ulid()}@example.test` };
  const assetId=ulid(), resultId=ulid(), analysisId=ulid(), iterationId=ulid(), templateId=ulid();
  await pool.query('INSERT INTO users(id,google_id,email,name) VALUES($1,$1,$2,$3)',[user.id,user.email,user.name]);
  for (const [id,type] of [[assetId,'reference'],[resultId,'generated']]) await pool.query('INSERT INTO assets(id,type,file_url,width,height,mime_type,user_id) VALUES($1,$2,$3,100,100,$4,$5)',[id,type,`https://example.test/${id}`,'image/png',user.id]);
  await pool.query("INSERT INTO analysis_tasks(id,source_asset_id,user_id,status,prompt_text,negative_prompt_text) VALUES($1,$2,$3,'completed','a real source prompt','no text')",[analysisId,assetId,user.id]);
  await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,result_asset_id) VALUES($1,$2,$3,'completed','a fixed original prompt','no text',$4,'black-forest-labs/flux-2-dev',$5)",[iterationId,analysisId,user.id,JSON.stringify({aspectRatio:'1:1',quality:'standard',model:'flux-2-dev'}),resultId]);
  await pool.query('INSERT INTO templates(id,name,content,user_id,source_asset_id,source_generation_task_id) VALUES($1,$2,$3,$4,$5,$6)',[templateId,'source memory','memory prompt',user.id,assetId,iterationId]);
  return { user,assetId,resultId,analysisId,iterationId,templateId };
}
// The runner drops only its own container. Tests also clean their seeded namespace in FK order.
export async function cleanupWorkspaceUser(pool: Pool,userId: string) {
  await pool.query('DELETE FROM workspace_events WHERE user_id=$1',[userId]);
  await pool.query('UPDATE generation_tasks SET direction_id=NULL WHERE user_id=$1',[userId]);
  await pool.query('UPDATE analysis_tasks SET direction_id=NULL WHERE user_id=$1',[userId]);
  await pool.query('DELETE FROM workspace_directions WHERE user_id=$1',[userId]);
  await pool.query('DELETE FROM templates WHERE user_id=$1',[userId]);
  await pool.query('UPDATE assets SET source_generation_task_id=NULL WHERE user_id=$1',[userId]);
  await pool.query('DELETE FROM generation_tasks WHERE user_id=$1',[userId]);
  await pool.query('DELETE FROM analysis_tasks WHERE user_id=$1',[userId]);
  await pool.query('DELETE FROM assets WHERE user_id=$1',[userId]);
  await pool.query('DELETE FROM users WHERE id=$1',[userId]);
}
