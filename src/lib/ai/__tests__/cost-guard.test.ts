import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCostAdmission } from '../cost-guard';
import { costPolicy, requireApprovedBinding } from '../cost-policy';
afterEach(()=>vi.unstubAllEnvs());
describe('cost admission',()=>{
 it('blocks only new reservations and respects exact budget threshold',()=>{
  expect(evaluateCostAdmission({day:9.8,month:9.8,hour:0,minute:0},'generation').reservedCostUsd).toBe('0.200000');
  expect(()=>evaluateCostAdmission({day:9.9,month:9.9,hour:0,minute:0},'generation')).toThrow('BUDGET_BLOCKED');
  expect(()=>evaluateCostAdmission({day:0,month:99.9,hour:0,minute:0},'generation')).toThrow('BUDGET_BLOCKED');
 });
 it('turn minute/hour and generation hourly limits remain independent',()=>{
  for(const [operation,hour,minute] of [['turn',0,10],['turn',60,0],['generation',20,0]] as const)expect(()=>evaluateCostAdmission({day:0,month:0,hour,minute},operation)).toThrow('RATE_LIMITED');
 });
 it('warns on threshold crossing only',()=>{
  expect(evaluateCostAdmission({day:7.9,month:7.9,hour:0,minute:0},'generation').warning).toBe(true);
  expect(evaluateCostAdmission({day:8.1,month:8.1,hour:0,minute:0},'generation').warning).toBe(false);
 });
 it('requires explicit binding approval and rejects malformed policy',()=>{
  vi.stubEnv('AI_APPROVED_MODEL_BINDINGS','');expect(()=>requireApprovedBinding({modelId:'flux-2-dev',label:'Flux',provider:'replicate',providerModelId:'black-forest-labs/flux-2-dev'})).toThrow('MODEL_COST_UNAPPROVED');
  vi.stubEnv('AI_DAILY_BUDGET_USD','NaN');expect(()=>costPolicy()).toThrow('COST_POLICY_INVALID');
 });
});
