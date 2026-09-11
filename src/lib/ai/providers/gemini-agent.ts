import { GoogleGenAI } from '@google/genai';
import { AGENT_RESPONSE_JSON_SCHEMA } from '../agent-schema';
import type { AgentProvider } from './types';
export class GeminiAgentProvider implements AgentProvider {
 readonly name='gemini' as const;
 constructor(private readonly model:string){}
 async interpret(input:Parameters<AgentProvider['interpret']>[0]) {
  const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{retryOptions:{attempts:1}}});
  const response=await client.models.generateContent({model:this.model,contents:[{role:'user',parts:[{text:input.prompt},...input.images.map(image=>({fileData:{fileUri:image.url,mimeType:image.mimeType}}))]}],config:{systemInstruction:input.system,responseMimeType:'application/json',responseJsonSchema:AGENT_RESPONSE_JSON_SCHEMA,maxOutputTokens:input.maxOutputTokens,thinkingConfig:{thinkingBudget:0},abortSignal:input.signal}});
  if(!response.text)throw new Error('Empty agent response');return response.text;
 }
}
