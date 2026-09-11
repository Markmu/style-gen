import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.WORKSPACE_TEST_DATABASE_URL;
if (!url || !/^style_gen_test_[a-f0-9]{12}$/.test(new URL(url).pathname.slice(1))) throw new Error('Run only with disposable DB runner');
const suite = describe;
import { appendEvent, compareAndSwapDraft, createDirection, findDirection, listEvents, withWorkspaceTransaction } from '../workspace-repository';
import { generateId } from '@/lib/ulid';
import type { WorkspaceDraft } from '@/lib/workspace/contracts';

suite('Workspace persisted contracts', () => {
  const pool = new Pool({ connectionString: url });
  afterAll(() => pool.end());
  const user = generateId(), other = generateId();
  const draft: WorkspaceDraft = { control: null, params: { aspectRatio: '1:1', quality: 'standard' }, customPrompt: null, negativePromptText: '', constraints: [], aspectRatioSource: 'fallback' };
  beforeAll(async () => { for (const id of [user, other]) await pool.query('INSERT INTO users(id,google_id,email,name) VALUES($1,$1,$1,$1)', [id]); });
  const direction = () => createDirection(user, { title: '测试', creationRequestKey: generateId(), draft });
  it('AC-06 simultaneous CAS changes only one revision and successful receipt', async () => {
    const row = await direction();
    const result = await Promise.allSettled([1,2].map(n => compareAndSwapDraft(user, row.id, 0, { ...draft, customPrompt: `${n}` }, { requestKey: generateId(), requestHash: `${n}`, kind: 'draft_change' })));
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await findDirection(user, row.id))?.draftRevision).toBe(1);
    expect((await listEvents(user, row.id)).items.filter(e => e.kind === 'draft_change')).toHaveLength(1);
    await expect(compareAndSwapDraft(other, row.id, 1, draft, { requestKey: generateId(), requestHash: 'x', kind: 'draft_change' })).rejects.toThrow('workspace_not_found');
  });
  it('AC-09 duplicate CAS reuses receipt; differing request conflicts; rollback is atomic', async () => {
    const row = await direction(); const event = { requestKey: generateId(), requestHash: 'hash', kind: 'draft_change' as const };
    await compareAndSwapDraft(user, row.id, 0, draft, event);
    expect((await compareAndSwapDraft(user, row.id, 0, draft, event)).reused).toBe(true);
    await expect(compareAndSwapDraft(user, row.id, 1, draft, { ...event, requestHash: 'different' })).rejects.toThrow('request_key_conflict');
    await expect(withWorkspaceTransaction(user, row.id, async tx => { await appendEvent(tx,user,row.id,{ requestKey: 'rolled-back', requestHash: 'x', kind: 'memory' }); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect((await listEvents(user,row.id)).items).toHaveLength(2);
  });
  it('AC-09 creation receipt survives draft edits and detects changed original input', async () => {
    const input = { title: 'same', creationRequestKey: generateId(), draft };
    const row = await createDirection(user,input);
    await compareAndSwapDraft(user,row.id,0,{...draft,customPrompt:'edited'},{requestKey:generateId(),requestHash:'edit',kind:'draft_change'});
    expect((await createDirection(user,input)).id).toBe(row.id);
    await expect(createDirection(user,{...input,title:'different'})).rejects.toThrow('request_key_conflict');
  });
  it('AC-15 preserves complete early text and stable pages while new events arrive', async () => {
    const row = await direction();
    for (let n=0;n<6;n++) await withWorkspaceTransaction(user,row.id,tx => appendEvent(tx,user,row.id,{requestKey:generateId(),requestHash:`${n}`,kind:'turn',inputText:'早期原文'.repeat(1000),replyText:`回复${n}`}));
    const first = await listEvents(user,row.id,{pageSize:3});
    await withWorkspaceTransaction(user,row.id,tx => appendEvent(tx,user,row.id,{requestKey:generateId(),requestHash:'later',kind:'turn'}));
    const second = await listEvents(user,row.id,{page:2,pageSize:3,throughSequence:first.throughSequence});
    expect(first.items.map(e=>e.sequence)).toEqual([7,6,5]);
    expect(second.items.map(e=>e.sequence)).toEqual([4,3,2]);
    expect(second.items[0].inputText).toHaveLength(4000);
    expect(second.total).toBe(7);
    await expect(listEvents(other,row.id)).rejects.toThrow('workspace_not_found');
  });
  it('AC-09 actual unique constraints protect active tasks, request keys and asset origins; legacy nulls remain null', async () => {
    const row = await direction(); const asset=generateId(), analysis=generateId();
    await pool.query("INSERT INTO assets(id,type,file_url,width,height,mime_type,user_id) VALUES($1,'reference','https://example.test/ref',1,1,'image/png',$2)",[asset,user]);
    await pool.query("INSERT INTO analysis_tasks(id,source_asset_id,user_id) VALUES($1,$2,$3)",[analysis,asset,user]);
    const legacy=await pool.query('SELECT direction_id,request_key,reserved_cost_usd FROM analysis_tasks WHERE id=$1',[analysis]);
    expect(legacy.rows[0]).toEqual({direction_id:null,request_key:null,reserved_cost_usd:null});
    await pool.query('UPDATE analysis_tasks SET request_key=$1 WHERE id=$2',['analysis-key',analysis]);
    await expect(pool.query('INSERT INTO analysis_tasks(id,source_asset_id,user_id,request_key) VALUES($1,$2,$3,$4)',[generateId(),asset,user,'analysis-key'])).rejects.toMatchObject({code:'23505'});
    const insert = (id:string,key:string,dir:string|null) => pool.query("INSERT INTO generation_tasks(id,analysis_task_id,prompt_snapshot,negative_prompt_snapshot,params,model_name,user_id,direction_id,request_key,dispatch_state) VALUES($1,$2,'p','n','{}','model',$3,$4,$5,'unknown')",[id,analysis,user,dir,key]);
    await insert(generateId(),'one',row.id);
    await expect(insert(generateId(),'two',row.id)).rejects.toMatchObject({code:'23505'});
    await expect(insert(generateId(),'one',null)).rejects.toMatchObject({code:'23505'});
    await insert(generateId(),'three',(await direction()).id);
    const task=(await pool.query('SELECT id FROM generation_tasks WHERE request_key=$1',['one'])).rows[0].id;
    await pool.query('UPDATE assets SET source_generation_task_id=$1 WHERE id=$2',[task,asset]);
    await expect(pool.query("INSERT INTO assets(id,type,file_url,width,height,mime_type,user_id,source_generation_task_id) VALUES($1,'generated','x',1,1,'image/png',$2,$3)",[generateId(),user,task])).rejects.toMatchObject({code:'23505'});
  });
  it('AC-15 persists directions and complete event storage', async () => {
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('workspace_directions','workspace_events')");
    expect(result.rows.map(r => r.table_name).sort()).toEqual(['workspace_directions', 'workspace_events']);
  });
  it('AC-09 has database-enforced idempotency and active direction indexes', async () => {
    const result = await pool.query("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'workspace_%' OR indexname = 'generation_direction_active_unique'");
    expect(result.rows.map(r => r.indexname)).toEqual(expect.arrayContaining(['workspace_event_request_unique','workspace_event_sequence_unique','generation_direction_active_unique']));
  });
});
