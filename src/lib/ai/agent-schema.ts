import type { AgentReply } from '@/lib/workspace/contracts';
import { record, stringField, validatePatches } from '@/lib/workspace/validation';

export const AGENT_RESPONSE_JSON_SCHEMA = {
 type:'object',additionalProperties:false,required:['kind','text','changes','evidenceIds','choices'],properties:{
 kind:{type:'string',enum:['answer','clarify','proposal','render_request','unsupported']},text:{type:'string',minLength:1,maxLength:6000},
 changes:{type:'array',maxItems:32,items:{type:'object',additionalProperties:false,required:['target','key','action','before','after'],properties:{target:{type:'string',enum:['variable','invariant','constraint','intent','detail','customPrompt','negativePrompt','model','aspectRatio','quality']},key:{type:'string'},action:{type:'string',enum:['set','strengthen','relax','disable','replace']},before:{type:['string','null']},after:{type:['string','null']}}}},
 evidenceIds:{type:'array',maxItems:32,items:{type:'string'}},choices:{type:'array',maxItems:6,items:{type:'string',maxLength:500}}
 }};
export class AgentError extends Error { constructor(public code:string){super(code);} }
export function parseAgentReply(raw:string,allowedEvidence:readonly string[]):AgentReply {
 try {
  if(Buffer.byteLength(raw,'utf8')>16000)throw new Error();
  const value=record(JSON.parse(raw),['kind','text','changes','evidenceIds','choices']);
  if(!['answer','clarify','proposal','render_request','unsupported'].includes(String(value.kind)))throw new Error();
  const text=stringField(value.text,6000),changes=validatePatches(value.changes);
  if(!Array.isArray(value.choices)||value.choices.length>6||!Array.isArray(value.evidenceIds)||value.evidenceIds.length>32)throw new Error();
  const choices=value.choices.map(v=>stringField(v,500)),evidenceIds=value.evidenceIds.map(v=>stringField(v,200));
  if(evidenceIds.some(id=>!allowedEvidence.includes(id)))throw new Error();
  if(value.kind==='proposal' ? !changes.length||choices.length : changes.length||value.kind!=='clarify'&&choices.length)throw new Error();
  return {kind:value.kind as AgentReply['kind'],text,changes,evidenceIds,choices};
 }catch{throw new AgentError('AGENT_OUTPUT_INVALID');}
}
