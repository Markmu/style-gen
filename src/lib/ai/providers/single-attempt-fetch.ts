/** One paid POST per provider invocation. SDK retry loops may read the cached outcome, never issue another network request. */
export function singleAttemptPostFetch(transport:typeof fetch=globalThis.fetch):typeof fetch {
 let first:Promise<Response>|undefined;
 return async(input,init)=>{
  const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  if(method!=='POST')return transport(input,init);
  first??=Promise.resolve().then(()=>transport(input,init));
  return (await first).clone();
 };
}
