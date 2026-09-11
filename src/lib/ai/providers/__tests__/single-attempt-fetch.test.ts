import {afterEach,expect,it,vi} from 'vitest';
import {ReplicateImageGenProvider} from '../replicate-image-gen';
import {FalImageGenProvider} from '../fal-image-gen';
import {GeminiImageGenProvider} from '../gemini-image-gen';
import {singleAttemptPostFetch} from '../single-attempt-fetch';
const params={prompt:'cup',negativePrompt:'',aspectRatio:'1:1',quality:'standard',webhookUrl:'https://example.test/webhook'};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
for(const provider of ['replicate','fal','gemini'])for(const failure of ['network',429,500])it(`actual ${provider} SDK ${failure} issues at most one network POST`,async()=>{
 vi.useFakeTimers();vi.stubEnv('REPLICATE_API_TOKEN','test');vi.stubEnv('FAL_KEY','test');vi.stubEnv('GEMINI_API_KEY','test');
 const transport=vi.fn(async()=>{if(failure==='network')throw new Error('network lost');return new Response('{"error":{"message":"rejected","code":500}}',{status:Number(failure),headers:{'content-type':'application/json'}});});vi.stubGlobal('fetch',transport);
 const client=provider==='replicate'?new ReplicateImageGenProvider():provider==='fal'?new FalImageGenProvider():new GeminiImageGenProvider();
 const outcome=client.generate(params).then(()=>false,()=>true);await vi.runAllTimersAsync();expect(await outcome).toBe(true);expect(transport).toHaveBeenCalledTimes(1);
});
it('caches synchronous transport throws too',async()=>{
 const transport=vi.fn(()=>{throw new Error('sync');});const once=singleAttemptPostFetch(transport);for(let i=0;i<3;i++)await expect(once('https://example.test',{method:'POST'})).rejects.toThrow('sync');expect(transport).toHaveBeenCalledTimes(1);
});

import {ReplicateVisionProvider} from '../replicate-vision';
import {ReplicateStructurerProvider} from '../replicate-structurer';
import {GeminiVisionProvider} from '../gemini-vision';
import {GeminiStructurerProvider} from '../gemini-structurer';
for(const provider of ['replicate-vision','replicate-structurer','gemini-vision','gemini-structurer'])for(const failure of ['network',429,500])it(`actual analysis ${provider} SDK ${failure} issues one network POST`,async()=>{
 vi.useFakeTimers();vi.stubEnv('REPLICATE_API_TOKEN','test');vi.stubEnv('GEMINI_API_KEY','test');
 const transport=vi.fn(async()=>{if(failure==='network')throw new Error('network lost');return new Response('{"error":{"message":"rejected","code":500}}',{status:Number(failure),headers:{'content-type':'application/json'}});});vi.stubGlobal('fetch',transport);
 const client=provider==='replicate-vision'?new ReplicateVisionProvider():provider==='replicate-structurer'?new ReplicateStructurerProvider():provider==='gemini-vision'?new GeminiVisionProvider():new GeminiStructurerProvider();
 const outcome=('analyze' in client?client.analyze({imageUrl:'https://media.example.test/image.png',mimeType:'image/png',webhookUrl:'https://app.example.test/api/webhooks/replicate?taskId=test&taskType=analysis'}):client.structure({rawAnalysis:'observed image'})).then(()=>false,()=>true);
 await vi.runAllTimersAsync();expect(await outcome).toBe(true);expect(transport).toHaveBeenCalledTimes(1);
});
