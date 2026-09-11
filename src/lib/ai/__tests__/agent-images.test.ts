import sharp from 'sharp';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareAgentImages} from '../agent-images';
const {upload}=vi.hoisted(()=>({upload:vi.fn(async()=>{})}));
vi.mock('@/lib/r2',()=>({uploadBuffer:upload,getPublicUrl:(key:string)=>`https://media.example.test/${key}`}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('bounded owned reference images',()=>{
 it('resizes a real 2048px image to <=384 before either SDK sees its file URL',async()=>{
  vi.stubEnv('R2_PUBLIC_URL','https://media.example.test');const bytes=await sharp({create:{width:2048,height:1024,channels:3,background:'blue'}}).png().toBuffer();const transport=vi.fn(async()=>new Response(bytes,{status:200}));vi.stubGlobal('fetch',transport);
  const result=await prepareAgentImages([{id:'owned',url:'https://media.example.test/original.png',mimeType:'image/png'}],new AbortController().signal);expect(result[0].url).toMatch(/agent-references\/owned\/[a-f0-9]{64}\.png$/);const metadata=await sharp(upload.mock.calls[0][1]).metadata();expect(metadata.width).toBe(384);expect(metadata.height).toBe(192);expect(transport.mock.calls[0][1]).toMatchObject({redirect:'error'});
 });
 it('rejects unsafe host and oversized bytes before storing derived media',async()=>{
  vi.stubEnv('R2_PUBLIC_URL','https://media.example.test');const transport=vi.fn(async()=>new Response('bad',{headers:{'content-length':String(30*1024*1024)}}));vi.stubGlobal('fetch',transport);
  await expect(prepareAgentImages([{id:'owned',url:'http://localhost/private',mimeType:'image/png'}],new AbortController().signal)).rejects.toThrow('Unsafe');expect(transport).not.toHaveBeenCalled();
  await expect(prepareAgentImages([{id:'owned',url:'https://media.example.test/x',mimeType:'image/png'}],new AbortController().signal)).rejects.toThrow('too large');expect(upload).not.toHaveBeenCalled();
 });
 it('rejects invalid bytes and an aborted image read without a paid inference',async()=>{
  vi.stubEnv('R2_PUBLIC_URL','https://media.example.test');vi.stubGlobal('fetch',vi.fn(async()=>new Response('not an image')));await expect(prepareAgentImages([{id:'owned',url:'https://media.example.test/x',mimeType:'image/png'}],new AbortController().signal)).rejects.toThrow();expect(upload).not.toHaveBeenCalled();
 });
});
