import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { uploadBuffer,getPublicUrl } from '@/lib/r2';
import { MAX_OUTPUT_BYTES,validateImageBytes } from '@/lib/generation/output';
import type { AgentContext } from './agent-prompt';
/** Only called with ownership-validated assets. No redirects, arbitrary hosts or full-resolution model inputs. */
export async function prepareAgentImages(images:AgentContext['images'],signal:AbortSignal) {
 const result:AgentContext['images']=[];
 for(const image of images){
  signal.throwIfAborted();
  const url=new URL(image.url),base=process.env.R2_PUBLIC_URL;
  if(!base||url.origin!==new URL(base).origin||url.protocol!=='https:'||url.username||url.password)throw new Error('Unsafe reference');
  const response=await fetch(url,{signal,redirect:'error'});
  if(!response.ok||!response.body)throw new Error('Reference unavailable');
  if(Number(response.headers.get('content-length'))>MAX_OUTPUT_BYTES){await response.body.cancel();throw new Error('Reference too large');}
  const reader=response.body.getReader(),chunks:Buffer[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_OUTPUT_BYTES)throw new Error('Reference too large');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel();throw error;}
  const bytes=Buffer.concat(chunks);await validateImageBytes(bytes);
  const resized=await sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width:384,height:384,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  signal.throwIfAborted();
  const key=`agent-references/${image.id}/${createHash('sha256').update(resized).digest('hex')}.png`;
  await uploadBuffer(key,resized,'image/png',{signal});signal.throwIfAborted();
  result.push({...image,url:getPublicUrl(key),mimeType:'image/png'});
 }
 return result;
}
