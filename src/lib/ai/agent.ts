import { prepareAgentImages } from './agent-images';
import { resolveStructurerModel } from './model-config';
import { ReplicateAgentProvider } from './providers/replicate-agent';
import { GeminiAgentProvider } from './providers/gemini-agent';
import type { AgentProvider } from './providers/types';
import { AGENT_OUTPUT_LIMIT, AGENT_SYSTEM_PROMPT, AGENT_TIMEOUT_MS, buildAgentInput, type AgentContext } from './agent-prompt';
import { AgentError, parseAgentReply } from './agent-schema';
export function getAgentProvider(binding=resolveStructurerModel()):AgentProvider {
 return binding.provider==='gemini'?new GeminiAgentProvider(binding.providerModelId):new ReplicateAgentProvider(binding.providerModelId);
}
export async function interpretAgent(context:AgentContext,provider:AgentProvider=getAgentProvider()) {
 if(context.images.length>2)throw new AgentError('AGENT_REFERENCES_INVALID');
 const prompt=buildAgentInput(context),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const raw=await Promise.race([prepareAgentImages(context.images,controller.signal).then(images=>{controller.signal.throwIfAborted();return provider.interpret({system:AGENT_SYSTEM_PROMPT,prompt,images,signal:controller.signal,maxOutputTokens:AGENT_OUTPUT_LIMIT});}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AgentError('AGENT_TIMEOUT'));},AGENT_TIMEOUT_MS);})]);
  return parseAgentReply(raw,context.evidenceIds);
 }finally{controller.abort();clearTimeout(timer);}
}
/** Conservative service gate: only standalone affirmative imperatives can spend. Ambiguous language goes to summary review. */
export function explicitlyAuthorizesCurrentRender(text:string):boolean {
 const normalized=text.trim().toLowerCase().replace(/[.!。！]+$/u,'');
 return /^(?:please\s+)?(?:generate|render|create)(?:\s+(?:(?:an?|the)\s+)?(?:image|picture|render))?(?:\s+(?:from|using|of)\s+(?:the\s+)?current\s+draft)?(?:\s+now)?(?:\s+please)?$/.test(normalized)||/^(?:请)?(?:现在|立即)?(?:生成|渲染)(?:(?:当前|这份)(?:草稿|图片))?$/.test(normalized);
}
