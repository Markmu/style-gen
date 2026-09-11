import Replicate from 'replicate';
import { singleAttemptPostFetch } from './single-attempt-fetch';
import type { AgentProvider } from './types';
export class ReplicateAgentProvider implements AgentProvider {
 readonly name='replicate' as const;
 constructor(private readonly model:string){}
 async interpret(input:Parameters<AgentProvider['interpret']>[0]) {
  const client=new Replicate({auth:process.env.REPLICATE_API_TOKEN,fetch:singleAttemptPostFetch((url,init)=>fetch(url,{...init,signal:input.signal}))});
  const output=await client.run(this.model as `${string}/${string}`,{input:{prompt:input.prompt,system_instruction:input.system,images:input.images.map(image=>image.url),max_output_tokens:input.maxOutputTokens,temperature:0,thinking_budget:0},wait:{mode:'poll',interval:1000}},undefined);
  if(typeof output==='string')return output;
  if(Array.isArray(output)&&output.every(part=>typeof part==='string'))return output.join('');
  throw new Error('Invalid agent response');
 }
}
