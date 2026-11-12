import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,alice,bob,productId,coverId,fileId} from './fixture.mjs';
import {handle} from '../work/test-runtime/server/router.mjs';
import {generateKeyPair,SignJWT,exportJWK} from 'jose';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BookCard} from '../work/client-test.mjs';
let f, savedFetch;
beforeEach(async()=>{f=await fixture();savedFetch=globalThis.fetch;});
afterEach(async()=>{globalThis.fetch=savedFetch;await f.mf.dispose();});
const user={...alice,email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},aud:'authenticated',created_at:new Date().toISOString()};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=()=>b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:alice.id,exp:Math.floor(Date.now()/1000)+3600,aal:'aal1'})+'.dGVzdA';
function auth(action,input={},headers={}){return handle(new Request(f.e.APP_ORIGIN+'/api/auth/'+action,{method:'POST',headers:{Origin:f.e.APP_ORIGIN,'Content-Type':'application/json',...headers},body:JSON.stringify(input)}),f.e);}
function rejectAuth(){globalThis.fetch=async()=>Response.json({msg:'Invalid login credentials',code:'invalid_credentials'},{status:400});}
test('login rate limit: tenth wrong password accepted for verification, eleventh blocked even with alternate forwarded headers',async()=>{
 rejectAuth();
 for(let n=0;n<10;n++)assert.equal((await auth('login',{email:alice.email,password:'wrong'},{'X-Forwarded-For':'192.0.2.'+n})).status,401);
 assert.equal((await auth('login',{email:alice.email.toUpperCase(),password:'wrong'},{'X-Forwarded-For':'198.51.100.9'})).status,429);
});
test('IP quota covers different account names: request 31 blocked',async()=>{
 rejectAuth();
 for(let n=0;n<30;n++)assert.equal((await auth('login',{email:`test${n}@example.test`,password:'wrong'})).status,401);
 assert.equal((await auth('login',{email:'another@example.test',password:'wrong'})).status,429);
});
test('logout clears cookies even after auth quota saturation',async()=>{
 rejectAuth();
 for(let n=0;n<30;n++)await auth('login',{email:`test${n}@example.test`,password:'wrong'});
 const r=await auth('logout',{}, {Cookie:'__Host-access=existing; __Host-refresh=existing'});
 assert.equal(r.status,202);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await r.json()).localSignedOut,true);
});
test('provider revocation failure returns partial logout and records alert',async()=>{
 let logoutCalls=0;
 globalThis.fetch=async url=>{
  if(String(url).includes('/logout')){logoutCalls++;return Response.json({msg:'Revocation rejected by upstream',code:'unexpected_failure'},{status:400});}
  return Response.json({user});
 };
 const r=await auth('logout',{}, {Cookie:`__Host-access=${token()}; __Host-refresh=test-refresh`});
 assert.equal(logoutCalls,1);assert.equal(r.status,202);const data=await r.json();assert.equal(data.remoteRevoked,false);assert.equal(data.warning,true);assert.equal((await f.DB.prepare('SELECT count(*) n FROM alerts WHERE kind=?').bind('logout_revocation_failed').first()).n,1);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('login rotates supplied cookie; production cookie flags and password length',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({access_token:token(),refresh_token:'new-refresh',expires_in:3600,token_type:'bearer',user});};
 assert.equal((await auth('signup',{email:alice.email,password:'short'})).status,400);assert.equal(calls,0);
 const r=await auth('login',{email:alice.email,password:'valid-password-123'},{Cookie:'__Host-access=attacker; __Host-refresh=attacker'});
 assert.equal(r.status,200);const c=r.headers.get('set-cookie');assert.match(c,/HttpOnly/);assert.match(c,/Secure/);assert.match(c,/SameSite=Strict/);assert.doesNotMatch(c,/attacker|Domain=/);assert.match(c,/__Host-refresh=new-refresh/);
});
test('password recovery returns same message for existing and absent account fixtures',async()=>{
 globalThis.fetch=async()=>Response.json({});
 const a=await auth('recover',{email:alice.email}),b=await auth('recover',{email:'missing@example.test'});
 assert.equal(a.status,b.status);assert.deepEqual(await a.json(),await b.json());
});
test('forged asymmetric JWT signature rejected by actual SDK verification',async()=>{
 const a=await generateKeyPair('RS256'),b=await generateKeyPair('RS256');
 const jwk={...await exportJWK(a.publicKey),kid:'audit',alg:'RS256',use:'sig'};
 const jwt=await new SignJWT({sub:alice.id,aal:'aal2'}).setProtectedHeader({alg:'RS256',kid:'audit'}).setExpirationTime('1h').sign(b.privateKey);
 globalThis.fetch=async url=>String(url).includes('jwks')?Response.json({keys:[jwk]}):Response.json({user});
 const r=await handle(new Request(f.e.APP_ORIGIN+'/api/me',{headers:{Cookie:'__Host-access='+jwt}}),f.e);
 assert.equal(r.status,401);
});
test('unsigned JWT is not accepted when provider rejects it',async()=>{
 globalThis.fetch=async()=>Response.json({msg:'invalid JWT',code:'bad_jwt'},{status:401});
 const jwt=b64({alg:'none'})+'.'+b64({sub:alice.id,aal:'aal2',exp:Math.floor(Date.now()/1000)+3600})+'.';
 const r=await handle(new Request(f.e.APP_ORIGIN+'/api/me',{headers:{Cookie:'__Host-access='+jwt}}),f.e);assert.equal(r.status,401);
});
test('SQL payloads in IDs, pagination, profile fields and headers do not change DB',async()=>{
 const payloads=["' OR '1'='1","' OR 1=1--","' UNION SELECT null,null--","1; DROP TABLE usuarios--"];
 await f.DB.prepare('INSERT INTO admins VALUES (?,?,?)').bind(alice.id,Date.now(),'audit').run();
 for(const p of payloads){
  for(const route of ['products/'+encodeURIComponent(p),'orders/'+encodeURIComponent(p),'orders?page='+encodeURIComponent(p)])assert.equal((await f.call(route)).status,400);
  const r=await f.call('admin/products',{id:productId,title:p.padEnd(4,'x'),description:p+' string literal de auditoria',price:2990,published:true,coverId,fileId},{...alice,aal:'aal2'});assert.equal(r.status,200);
  assert.equal((await f.DB.prepare('SELECT title FROM products WHERE id=?').bind(productId).first()).title,p.padEnd(4,'x'));
  assert.equal((await f.call('products',undefined,alice,'GET',{'User-Agent':p,Referer:p,'X-Forwarded-For':p})).status,200);
 }
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM products').first()).n,1);
});
test('login SQL payloads are rejected or forwarded as password text without local SQL evaluation',async()=>{
 rejectAuth();
 for(const p of ["' OR '1'='1","' OR 1=1--","' UNION SELECT null,null--","1; DROP TABLE usuarios--"]){
  assert.equal((await auth('login',{email:p,password:p})).status,400);
  assert.equal((await auth('login',{email:alice.email,password:p})).status,401);
 }
});
test('stored XSS payload is stored as data and escaped by real React product component',async()=>{
 await f.DB.prepare('INSERT INTO admins VALUES (?,?,?)').bind(alice.id,Date.now(),'audit').run();
 const payload="<script>alert('xss')</script>";
 assert.equal((await f.call('admin/products',{id:productId,title:payload,description:payload,price:2990,published:true,coverId,fileId},{...alice,aal:'aal2'})).status,200);
 const p=await (await f.call('products/'+productId)).json();
 const html=renderToStaticMarkup(createElement(BookCard,{p}));
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('deletion URL and HTTP method probes have no deletion behavior',async()=>{
 for(const path of ['usuario/'+bob.id,'admin/deletar?id='+bob.id,'deletar?id='+bob.id])for(const method of ['GET','DELETE','POST']){
  const r=await f.call(path,method==='GET'?undefined:{},alice,method);
  assert.ok([403,404].includes(r.status));
 }
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM products').first()).n,1);
});
test('cross-origin and absent origin reject all available auth mutations',async()=>{
 for(const action of ['login','signup','recover','verify','password','logout','refresh','mfa-enroll','mfa-verify']){
  assert.equal((await auth(action,{}, {Origin:'https://attacker.example'})).status,403);
  assert.equal((await auth(action,{}, {Origin:'null'})).status,403);
  const r=await handle(new Request(f.e.APP_ORIGIN+'/api/auth/'+action,{method:'POST',body:'{}'}),f.e);assert.equal(r.status,403);
 }
 assert.equal((await auth('logout',{}, {'Sec-Fetch-Site':'cross-site'})).status,403);
});
test('body and cookie role spoofing never grant admin permissions',async()=>{
 for(const route of ['products','orders','audit','readiness','upload','reconcile']){
  const r=await f.call('admin/'+route,{role:'admin',isAdmin:true},alice,'POST',{Cookie:'role=admin; isAdmin=true'});assert.equal(r.status,403);
 }
});
test('unexpected DB errors do not leak SQL or stack in response',async()=>{
 const broken={...f.e,DB:{prepare(){throw new Error('SELECT secret FROM private_table stacktrace');}}};
 const r=await handle(new Request(f.e.APP_ORIGIN+'/api/products'),broken);assert.equal(r.status,500);assert.doesNotMatch(await r.text(),/SELECT|private_table|stacktrace/);
});
test('logout without provider configuration still clears cookies', async()=>{
 f.e.SUPABASE_URL='';
 const r=await auth('logout',{}, {Cookie:`__Host-access=${token()}; __Host-refresh=test`});
 assert.equal(r.status,202);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await r.json()).remoteRevoked,false);
});
test('logout with failed rate storage and alert storage still clears cookies',async()=>{
 const broken={...f.e,DB:{prepare(){throw new Error('offline');}}};
 const r=await handle(new Request(f.e.APP_ORIGIN+'/api/auth/logout',{method:'POST',headers:{Origin:f.e.APP_ORIGIN,Cookie:'__Host-access=test'},body:'{}'}),broken);
 assert.equal(r.status,202);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('confirmed remote logout reports confirmation without exposing tokens',async()=>{
 globalThis.fetch=async url=>String(url).includes('/logout')?new Response(null,{status:204}):Response.json({user});
 const r=await auth('logout',{}, {Cookie:`__Host-access=${token()}; __Host-refresh=test`});
 assert.equal(r.status,200);const text=await r.text();assert.equal(JSON.parse(text).remoteRevoked,true);assert.doesNotMatch(text,/access_token|refresh_token/);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('password update reports failed global revocation and clears local session',async()=>{
 globalThis.fetch=async url=>String(url).includes('/logout')?Response.json({msg:'provider refused',code:'unexpected_failure'},{status:400}):Response.json({user});
 const r=await auth('password',{password:'New-valid-password-456'}, {Cookie:`__Host-access=${token()}; __Host-refresh=test`});
 assert.equal(r.status,202);const data=await r.json();assert.match(data.message,/Senha alterada/);assert.equal(data.remoteRevoked,false);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM alerts WHERE kind=?').bind('password_revocation_failed').first()).n,1);
});
test('logout remote quota saturation cannot prevent local cookie clearing',async()=>{
 const {rate}=await import('../work/test-runtime/server/security.mjs');
 for(let n=0;n<10;n++)await rate(f.e,'logout:local',10,60000);
 const r=await auth('logout',{}, {Cookie:'__Host-access=test'});assert.equal(r.status,202);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
});
test('stalled auth provider cannot hold logout indefinitely',async()=>{
 globalThis.fetch=()=>new Promise(()=>{});
 const started=Date.now();
 const r=await auth('logout',{}, {Cookie:`__Host-access=${token()}; __Host-refresh=test`});
 assert.equal(r.status,202);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.ok(Date.now()-started<15000);
});
