import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.WORKSPACE_TEST_DATABASE_URL;
if (!url || !/^style_gen_test_[a-f0-9]{12}$/.test(new URL(url).pathname.slice(1))) throw new Error('Run only with disposable DB runner');
const suite = describe;
import {
  createTemplateWithReceipt,
  updateTemplateWithReceipt,
  duplicateTemplateWithReceipt,
  setRepresentativeResultWithReceipt,
  lookupMemoryReceipt,
} from '../template-repository';
import { createDirection, findEventByRequestKey } from '../workspace-repository';
import { generateId } from '@/lib/ulid';
import type { WorkspaceDraft } from '@/lib/workspace/contracts';

suite('Workspace template memory receipts (real DB)', () => {
  const pool = new Pool({ connectionString: url });
  afterAll(() => pool.end());
  const user = generateId(), isolated = generateId(), other = generateId();
  const draft: WorkspaceDraft = { control: null, params: { aspectRatio: '1:1', quality: 'standard' }, customPrompt: null, negativePromptText: '', constraints: [], aspectRatioSource: 'fallback' };
  const receiptFor = (directionId: string) => ({ directionId, requestKey: generateId(), requestHash: 'a'.repeat(64) });

  beforeAll(async () => {
    for (const id of [user, isolated, other]) await pool.query('INSERT INTO users(id,google_id,email,name) VALUES($1,$1,$1,$1)', [id]);
  });

  it('AC-17 AC-18 create commits template + memory event atomically; retry reuses; differing hash conflicts', async () => {
    const direction = await createDirection(user, { title: 'memory', creationRequestKey: generateId(), draft });
    const receipt = receiptFor(direction.id);
    const first = await createTemplateWithReceipt(user, { name: 'Amber', content: 'prompt' }, receipt);
    expect(first.reused).toBe(false);

    const again = await createTemplateWithReceipt(user, { name: 'Amber', content: 'prompt' }, receipt);
    expect(again.reused).toBe(true);
    expect(again.record.id).toBe(first.record.id);

    await expect(createTemplateWithReceipt(user, { name: 'Amber 2', content: 'prompt' }, { ...receipt, requestHash: 'b'.repeat(64) })).rejects.toThrow('request_key_conflict');

    const event = await findEventByRequestKey(user, 'memory:' + receipt.requestKey);
    expect(event?.kind).toBe('memory');
    expect(event?.memoryId).toBe(first.record.id);
    expect((await pool.query('SELECT count(*)::int c FROM templates WHERE user_id=$1', [user])).rows[0].c).toBe(1);

    // 目标删除后同键重试：404（workspace_not_found），不重建模板
    await pool.query('DELETE FROM templates WHERE id=$1', [first.record.id]);
    expect((await lookupMemoryReceipt(user, receipt)).status).toBe('gone');
    await expect(createTemplateWithReceipt(user, { name: 'Amber', content: 'prompt' }, receipt)).rejects.toThrow('workspace_not_found');
    expect((await pool.query('SELECT count(*)::int c FROM templates WHERE user_id=$1', [user])).rows[0].c).toBe(0);
  });

  it('AC-18 template insert rolls back when the receipt direction is not owned', async () => {
    const direction = await createDirection(isolated, { title: 'atomic', creationRequestKey: generateId(), draft });
    const receipt = { ...receiptFor(direction.id), directionId: generateId() };
    await expect(createTemplateWithReceipt(isolated, { name: 'Rollback', content: 'x' }, receipt)).rejects.toThrow('workspace_not_found');
    expect((await pool.query('SELECT count(*)::int c FROM templates WHERE user_id=$1', [isolated])).rows[0].c).toBe(0);
    expect((await pool.query('SELECT count(*)::int c FROM workspace_events WHERE user_id=$1', [isolated])).rows[0].c).toBe(1);
  });

  it('AC-17 representative confirmation and duplicate carry receipts; edits reuse receipts', async () => {
    const asset = generateId(), result = generateId(), analysis = generateId(), iteration = generateId();
    await pool.query("INSERT INTO assets(id,type,file_url,width,height,mime_type,user_id) VALUES($1,'reference','https://example.test/ref',1,1,'image/png',$2)", [asset, other]);
    await pool.query("INSERT INTO assets(id,type,file_url,width,height,mime_type,user_id) VALUES($1,'generated','https://example.test/out',1,1,'image/png',$2)", [result, other]);
    await pool.query('INSERT INTO analysis_tasks(id,source_asset_id,user_id) VALUES($1,$2,$3)', [analysis, asset, other]);
    await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,result_asset_id) VALUES($1,$2,$3,'completed','p','n','{}','m',$4)", [iteration, analysis, other, result]);

    const direction = await createDirection(other, { title: 'representative', creationRequestKey: generateId(), draft });
    const created = await createTemplateWithReceipt(other, { name: 'Base', content: 'base', sourceGenerationTaskId: iteration }, receiptFor(direction.id));
    expect(created.record.sourceGenerationTaskId).toBe(iteration);
    expect(created.record.verificationStatus).toBe('pending_verification');

    const represented = await setRepresentativeResultWithReceipt(created.record.id, other, iteration, receiptFor(direction.id));
    expect(represented.record.verificationStatus).toBe('user_verified');
    expect(represented.reused).toBe(false);

    const duplicated = await duplicateTemplateWithReceipt(created.record.id, other, receiptFor(direction.id));
    expect(duplicated.record.verificationStatus).toBe('pending_verification');
    expect(duplicated.record.name).toContain('(copy)');

    const edited = await updateTemplateWithReceipt(created.record.id, other, { description: 'edited' }, receiptFor(direction.id));
    expect(edited.record.description).toBe('edited');

    const events = await pool.query("SELECT memory_id FROM workspace_events WHERE user_id=$1 AND kind='memory' ORDER BY sequence", [other]);
    expect(events.rows.map((row) => row.memory_id)).toEqual([
      created.record.id,
      created.record.id,
      duplicated.record.id,
      created.record.id,
    ]);
  });
});
