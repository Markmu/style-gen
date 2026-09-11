import sharp from 'sharp';
/** Provider output is untrusted. Only provider-owned HTTPS media and bounded image bytes are accepted. */
export const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
export function validateOutputUrl(value:string):URL {
 const url=new URL(value);
 const hosts=['replicate.delivery','fal.media'];
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!hosts.some(host=>url.hostname===host||url.hostname.endsWith(`.${host}`)))throw new Error('Unsafe output URL');
 return url;
}
export function imageMetadata(bytes:Buffer) {
 let width=0,height=0,mimeType='';
 if(bytes.length>MAX_OUTPUT_BYTES)throw new Error('Output too large');
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);mimeType='image/png';}
 else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  mimeType='image/webp';const format=bytes.toString('ascii',12,16);
  if(format==='VP8X'){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
  else if(format==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from([157,1,42]))){width=bytes.readUInt16LE(26)&0x3fff;height=bytes.readUInt16LE(28)&0x3fff;}
  else if(format==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
 }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
  mimeType='image/jpeg';let pos=2;
  while(pos+4<=bytes.length){if(bytes[pos]!==255)break;while(bytes[pos+1]===255)pos++;const marker=bytes[pos+1];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215)){pos+=2;continue;}if(pos+4>bytes.length)break;const size=bytes.readUInt16BE(pos+2);if(size<2||pos+2+size>bytes.length)break;if(marker>=192&&marker<=207&&![196,200,204].includes(marker)&&size>=8){height=bytes.readUInt16BE(pos+5);width=bytes.readUInt16BE(pos+7);break;}pos+=2+size;}
 }
 if(!width||!height||width*height>100_000_000)throw new Error('Invalid image metadata');
 return {width,height,mimeType};
}
export function inlineDescriptor(base64:string,mimeType:string):string {
 if(base64.length>Math.ceil(MAX_OUTPUT_BYTES/3)*4||!base64||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Invalid inline image');
 const metadata=imageMetadata(Buffer.from(base64,'base64'));if(metadata.mimeType!==mimeType)throw new Error('Inline MIME mismatch');
 return `data:${mimeType};base64,${base64}`;
}
export async function readOutput(descriptor:string,signal:AbortSignal,transport:typeof fetch=fetch):Promise<Buffer> {
 if(descriptor.startsWith('data:')){const match=/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/.exec(descriptor);if(!match)throw new Error('Invalid inline descriptor');inlineDescriptor(match[2],match[1]);return Buffer.from(match[2],'base64');}
 let url=validateOutputUrl(descriptor);
 for(let hop=0;hop<6;hop++){
  const response=await transport(url,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error('Missing redirect');url=validateOutputUrl(new URL(location,url).href);continue;}
  if(!response.ok||!response.body)throw new Error('Output download unavailable');
  if(Number(response.headers.get('content-length'))>MAX_OUTPUT_BYTES){await response.body.cancel();throw new Error('Output too large');}
  const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_OUTPUT_BYTES)throw new Error('Output too large');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel();throw error;}
  const bytes=Buffer.concat(chunks);imageMetadata(bytes);return bytes;
 }
 throw new Error('Too many output redirects');
}

export async function validateImageBytes(bytes:Buffer) {
 const metadata=imageMetadata(bytes);
 await sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning'}).resize(1,1).raw().toBuffer();
 return metadata;
}
