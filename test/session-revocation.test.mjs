import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './worker-loader.mjs';

const user='11111111-1111-4111-8111-111111111111';
const pair=`${user}:22222222-2222-4222-8222-222222222222`;

test('logout revokes the socket in the server-derived couple room',async()=>{
  const calls=[];
  const {default:worker}=await loadWorker({fetch:async url=>Response.json(url.endsWith('/my_state')?{id:user,couple_id:pair}:null)});
  const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',CLOSER_DB_KEY:'server',ROOMS:{idFromName:x=>x,get:room=>({fetch:async(url,opts)=>{calls.push({room,url,body:JSON.parse(opts.body)});return Response.json({ok:true});}})}};
  const response=await worker.fetch(new Request('https://app.test/api/logout',{method:'POST',headers:{Authorization:'Bearer session-a'},body:'{}'}),env,{});
  assert.equal(response.status,200);
  assert.deepEqual(calls.map(x=>[x.room,new URL(x.url).pathname,x.body.token]),[[`couple:${pair}`,'/admin/revoke','session-a']]);
});

test('admin signout derives affected rooms even if caller omits couple id',async()=>{
  const calls=[];
  const {default:worker}=await loadWorker({fetch:async url=>Response.json(url.endsWith('/my_state')?{id:'admin',is_admin:true}:null)});
  const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',CLOSER_DB_KEY:'server',ROOMS:{idFromName:x=>x,get:room=>({fetch:async(url,opts)=>{
    if(room==='__stats')return Response.json([{room:`couple:${pair}`,couple:true}]);
    calls.push({room,body:JSON.parse(opts.body)});return Response.json({ok:true});
  }})}};
  const response=await worker.fetch(new Request('https://app.test/api/admin/action',{method:'POST',headers:{Authorization:'Bearer admin-session'},body:JSON.stringify({action:'signout',user})}),env,{});
  assert.equal(response.status,200);
  assert.equal(calls[0].room,`couple:${pair}`);
  assert.equal(calls[0].body.user,user);
});
