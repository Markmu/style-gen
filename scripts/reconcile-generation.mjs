import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ulid } from 'ulid';

/** Read-only unless --apply. Known IDs are independently queried; other cases require exact operator-attested Provider support artifacts. No inference creation is supported. */
export async function reconcileManual({taskId,apply=false,evidence,operator,artifact},client,fetcher=fetch) {
 if(!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(taskId??''))throw new Error('A task ULID is required');
 const {rows:[task]}=await client.query('SELECT id,user_id,direction_id,provider,model_name,external_id,status,dispatch_state,output_url,request_key,attempted_at FROM generation_tasks WHERE id=$1',[taskId]);
 if(!task)throw new Error('Task not found');
 const summary={taskId:task.id,provider:task.provider,externalId:task.external_id,status:task.status,submissionState:task.dispatch_state,hasOutput:!!task.output_url};
 if(!apply)return summary;
 if(!evidence||evidence.taskId!==taskId||evidence.provider!==task.provider||evidence.model!==task.model_name||!operator||operator.length>100||evidence.operator!==operator||!['succeeded','failed','canceled','not_accepted'].includes(evidence.outcome)||!Number.isFinite(Date.parse(evidence.observedAt))||Math.abs(Date.now()-Date.parse(evidence.observedAt))>86400_000)throw new Error('Complete recent bound operator evidence is required');
 if(!task.direction_id||!['submitting','submitted','unknown'].includes(task.dispatch_state)||(task.external_id&&task.external_id!==evidence.externalId))throw new Error('This task cannot be resolved with this evidence');
 let proof;
 if(task.provider==='replicate'&&evidence.externalId&&evidence.outcome!=='not_accepted'){
  if(!/^[a-zA-Z0-9_-]{1,200}$/.test(evidence.externalId))throw new Error('Invalid external identity');
  const source=`https://api.replicate.com/v1/predictions/${evidence.externalId}`;
  if(evidence.source!==source||!process.env.REPLICATE_API_TOKEN)throw new Error('Exact Provider evidence source and configured read credentials required');
  const response=await fetcher(source,{headers:{Authorization:`Bearer ${process.env.REPLICATE_API_TOKEN}`},signal:AbortSignal.timeout(15_000),redirect:'error'});
  if(!response.ok)throw new Error('Provider evidence unavailable');proof=await response.json();
  if(proof.id!==evidence.externalId||proof.model!==task.model_name||proof.status!==evidence.outcome)throw new Error('Provider evidence does not match');
  if(!task.external_id){const callback=new URL(proof.webhook??'');if(callback.pathname!=='/api/webhooks/replicate'||callback.searchParams.getAll('taskId').length!==1||callback.searchParams.get('taskId')!==taskId||callback.searchParams.getAll('taskType').length!==1||callback.searchParams.get('taskType')!=='generation')throw new Error('Provider callback correlation differs');}
 }else{
  // No query capability: an operator must explicitly attest an exact Provider support record.
  // An absent row, elapsed time, matching prompt, or estimated outcome is never evidence.
  const exactAttempt=task.attempted_at?.toISOString();
  if(!artifact||artifact.length>1024*1024||evidence.attestation!=='I verified this provider record identifies this exact submission and confirms this outcome'||!evidence.ticketId||typeof evidence.ticketId!=='string'||evidence.ticketId.length>150||!evidence.requestKey||evidence.requestKey!==task.request_key||!exactAttempt||evidence.attemptedAt!==exactAttempt||evidence.externalId!==task.external_id||!['succeeded','failed','canceled','not_accepted'].includes(evidence.outcome)||evidence.artifactSha256!==createHash('sha256').update(artifact).digest('hex'))throw new Error('Exact Provider support artifact and explicit attestation required');
  const source=new URL(evidence.source),hosts={replicate:['replicate.com'],gemini:['support.google.com','issuetracker.google.com'],fal:['fal.ai']};
  if(source.protocol!=='https:'||source.username||source.password||source.search||source.hash||source.port||!hosts[task.provider]?.includes(source.hostname))throw new Error('Provider support evidence source required');
  const providerRecord=JSON.parse(artifact.toString('utf8'));
  for(const field of ['taskId','provider','model','requestKey','attemptedAt','externalId','outcome','ticketId','source'])if(providerRecord[field]!==evidence[field])throw new Error('Support artifact binding differs');
  if(providerRecord.confirmation!=='confirmed'||(evidence.outcome==='not_accepted'&&providerRecord.charged!==false))throw new Error('Provider did not confirm rejection and charge status');
  proof={id:task.external_id,model:task.model_name,status:evidence.outcome,output:providerRecord.outputUrl};
 }
 let output=null;
 if(proof.status==='succeeded'){
  output=typeof proof.output==='string'?proof.output:Array.isArray(proof.output)?proof.output[0]:null;
  if(typeof output!=='string')throw new Error('Provider output missing');const url=new URL(output);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!['replicate.delivery','fal.media'].some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`)))throw new Error('Invalid Provider output');
 }
 const audit={taskId,provider:task.provider,model:task.model_name,externalId:proof.id,requestKey:task.request_key,attemptedAt:task.attempted_at?.toISOString(),outcome:proof.status,operator,observedAt:evidence.observedAt,source:evidence.source,ticketId:evidence.ticketId??null,artifactSha256:evidence.artifactSha256??null,verifiedAt:new Date().toISOString()},hash=createHash('sha256').update(JSON.stringify(audit)).digest('hex');
 await client.query('BEGIN');
 try {
  await client.query('SELECT pg_advisory_xact_lock(166001)');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[task.user_id]);await client.query('SELECT id FROM workspace_directions WHERE id=$1 AND user_id=$2 FOR UPDATE',[task.direction_id,task.user_id]);
  const {rows:[current]}=await client.query('SELECT * FROM generation_tasks WHERE id=$1 FOR UPDATE',[taskId]);
  if(!['submitting','submitted','unknown'].includes(current.dispatch_state)||(current.external_id&&current.external_id!==proof.id))throw new Error('Task changed; inspect again');
  if(current.output_url&&proof.status!=='succeeded')throw new Error('Saved successful output cannot be overwritten by failure evidence');
  await client.query("UPDATE generation_tasks SET external_id=$2,dispatch_state=$3,status=$4,output_url=COALESCE(output_url,$5),error_message=$6,reserved_cost_usd=CASE WHEN $7 THEN 0 ELSE reserved_cost_usd END,updated_at=NOW() WHERE id=$1",[taskId,proof.id,proof.status==='succeeded'?'submitted':'terminal',proof.status==='succeeded'?'processing':'failed',output,proof.status==='succeeded'?null:'Provider confirmed generation failure',proof.status==='not_accepted']);
  await client.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,state,generation_task_id,input_text,reply_text) SELECT $1,$2::varchar,$3,COALESCE(MAX(sequence),0)+1,$4,$5,'generation','completed',$6,$7,'Provider evidence reconciled' FROM workspace_events WHERE direction_id=$2::varchar",[ulid(),task.direction_id,task.user_id,`reconcile-audit:${ulid()}`,hash,taskId,JSON.stringify(audit)]);
  await client.query('COMMIT');return {...summary,applied:true,externalId:proof.id,status:proof.status==='succeeded'?'processing':'failed',hasOutput:!!(task.output_url||output),submissionState:proof.status==='succeeded'?'submitted':'terminal'};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function main(){
 const args=process.argv.slice(2),allowed=['--task','--evidence','--operator','--artifact','--apply'];for(let i=0;i<args.length;i++){if(!allowed.includes(args[i]))throw new Error('Unknown argument');if(args[i]!=='--apply')i++;}
 const value=name=>args[args.indexOf(name)+1],apply=args.includes('--apply');
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{const evidence=apply&&args.includes('--evidence')?JSON.parse(await readFile(value('--evidence'),'utf8')):undefined;console.log(JSON.stringify(await reconcileManual({taskId:value('--task'),operator:args.includes('--operator')?value('--operator'):undefined,apply,evidence,artifact:apply&&args.includes('--artifact')?await readFile(value('--artifact')):undefined},client)));}finally{await client.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Reconciliation did not apply. Check task binding, evidence, credentials and database availability.');process.exitCode=1;});
