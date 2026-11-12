import {test} from 'node:test';
import assert from 'node:assert/strict';
const {api,safeReturnTo} = await import('../work/client-test.mjs');
test('login return path only accepts internal account and purchase routes', () => {
  assert.equal(safeReturnTo('/checkout/33333333-3333-4333-8333-333333333333'), '/checkout/33333333-3333-4333-8333-333333333333');
  for(const value of ['https://evil.example','//evil.example','/\\evil.example','/admin?next=https://evil.example','javascript:alert(1)',null]) assert.equal(safeReturnTo(value),'');
});
test('parallel expired requests share one refresh and replay their requests', async () => {
  const saved=globalThis.fetch;
  let refreshes=0, refreshed=false;
  globalThis.fetch=async url => {
    if(url === '/api/auth/refresh') { refreshes++; await new Promise(resolve=>setTimeout(resolve,20)); refreshed=true; return Response.json({ok:true}); }
    return refreshed ? Response.json({ok:true}) : Response.json({error:'Sessão expirada'}, {status:401});
  };
  try { assert.deepEqual(await Promise.all([api('me'),api('orders'),api('admin/products')]), [{ok:true},{ok:true},{ok:true}]); assert.equal(refreshes,1); }
  finally {globalThis.fetch=saved;}
});
test('HTML and network failures produce readable errors without internal response content', async () => {
  const saved=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('<html>internal stack</html>',{status:502});
    await assert.rejects(api('products'), /O serviço não respondeu/);
    globalThis.fetch=async()=>{throw new Error('internal network detail');};
    await assert.rejects(api('products'), /Confira sua conexão/);
  } finally {globalThis.fetch=saved;}
});
