import type { ResolvedModelBinding } from './model-config';
import { WorkspaceServiceError } from '@/lib/workspace/validation';
export type PaidOperation='turn'|'analysis'|'generation';
export function costPolicy() {
 const number=(key:string,fallback:number)=>{const n=Number(process.env[key]??fallback);if(!Number.isFinite(n)||n<=0)throw new WorkspaceServiceError('COST_POLICY_INVALID',503);return n;};
 return {dailyUsd:number('AI_DAILY_BUDGET_USD',10),monthlyUsd:number('AI_MONTHLY_BUDGET_USD',100),reservation:{turn:number('AI_TURN_RESERVATION_USD',0.02),analysis:number('AI_ANALYSIS_RESERVATION_USD',0.05),generation:number('AI_IMAGE_RESERVATION_USD',0.20)}};
}
/** Explicit operator approval; catalog membership alone is not a spending approval. */
export function requireApprovedBinding(binding:ResolvedModelBinding) {
 const key=`${binding.provider}:${binding.providerModelId}`;
 const approved=(process.env.AI_APPROVED_MODEL_BINDINGS??'').split(',').map(v=>v.trim()).filter(Boolean);
 if(!approved.includes(key))throw new WorkspaceServiceError('MODEL_COST_UNAPPROVED',503);
 return key;
}
