import { sql } from 'drizzle-orm';
import type { WorkspaceTransaction } from '@/lib/repositories/workspace-repository';
import { WorkspaceServiceError } from '@/lib/workspace/validation';
import { costPolicy, type PaidOperation } from './cost-policy';

export function evaluateCostAdmission(input:{day:number;month:number;hour:number;minute:number},operation:PaidOperation,policy=costPolicy()) {
 const cost=policy.reservation[operation];
 if(input.day+cost>policy.dailyUsd+1e-9||input.month+cost>policy.monthlyUsd+1e-9)throw new WorkspaceServiceError('BUDGET_BLOCKED',429);
 if((operation==='analysis'&&input.hour>=10)||(operation==='generation'&&input.hour>=20)||(operation==='turn'&&(input.minute>=10||input.hour>=60)))throw new WorkspaceServiceError('RATE_LIMITED',429);
 return {reservedCostUsd:cost.toFixed(6),warning:input.day<policy.dailyUsd*.8&&input.day+cost>=policy.dailyUsd*.8||input.month<policy.monthlyUsd*.8&&input.month+cost>=policy.monthlyUsd*.8};
}
/** Must execute inside global → user → direction transaction, together with the reservation insert. */
export async function reservePaidOperation(tx:WorkspaceTransaction,userId:string,operation:PaidOperation,now=new Date()) {
 const day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const hour=new Date(now.getTime()-3600_000),minute=new Date(now.getTime()-60_000);
 const result=await tx.execute(sql`WITH reservations AS (
 SELECT user_id,created_at,reserved_cost_usd,'generation' AS operation FROM generation_tasks
 UNION ALL SELECT user_id,created_at,reserved_cost_usd,'analysis' FROM analysis_tasks
 UNION ALL SELECT user_id,created_at,reserved_cost_usd,'turn' FROM workspace_events WHERE kind='turn'
 ) SELECT COALESCE(SUM(reserved_cost_usd) FILTER(WHERE created_at>=${day}),0) AS day,
 COALESCE(SUM(reserved_cost_usd) FILTER(WHERE created_at>=${month}),0) AS month,
 COUNT(*) FILTER(WHERE user_id=${userId} AND operation=${operation} AND created_at>=${hour}) AS hour,
 COUNT(*) FILTER(WHERE user_id=${userId} AND operation=${operation} AND created_at>=${minute}) AS minute
 FROM reservations WHERE created_at>=${new Date(Math.min(month.getTime(),hour.getTime()))}`);
 const row=result.rows[0];
 try{return evaluateCostAdmission({day:Number(row.day),month:Number(row.month),hour:Number(row.hour),minute:Number(row.minute)},operation);}
 catch(error){console.info(JSON.stringify({event:'budget_blocked',phase:operation,errorCode:error instanceof WorkspaceServiceError?error.code:'COST_POLICY_INVALID'}));throw error;}
}
