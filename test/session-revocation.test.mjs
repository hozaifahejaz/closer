import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWorker } from './worker-loader.mjs';

// Every session belongs to `state`; other database calls succeed with nothing to return.
function fakeState(modules,state){
  const {Db}=modules.get(path.resolve('worker/db.js')).namespace;
  Db.prototype.rpc=async fn=>fn==='my_state'?state:null;
}

const user='11111111-1111-4111-8111-111111111111';
const pair=`${user}:22222222-2222-4222-8222-222222222222`;

test('logout revokes the socket in the server-derived couple room',async()=>{
  const calls=[];
  const {default:worker,modules}=await loadWorker();
  fakeState(modules,{id:user,couple_id:pair});
  const env={DB:{},ROOMS:{idFromName:x=>x,get:room=>({fetch:async(url,opts)=>{calls.push({room,url,body:JSON.parse(opts.body)});return Response.json({ok:true});}})}};
  const response=await worker.fetch(new Request('https://app.test/api/logout',{method:'POST',headers:{Authorization:'Bearer session-a'},body:'{}'}),env,{});
  assert.equal(response.status,200);
  assert.deepEqual(calls.map(x=>[x.room,new URL(x.url).pathname,x.body.token]),[[`couple:${pair}`,'/admin/revoke','session-a']]);
});

test('admin signout derives affected rooms even if caller omits couple id',async()=>{
  const calls=[];
  const {default:worker,modules}=await loadWorker();
  fakeState(modules,{id:'admin',is_admin:true});
  const env={DB:{},ROOMS:{idFromName:x=>x,get:room=>({fetch:async(url,opts)=>{
    if(room==='__stats')return Response.json([{room:`couple:${pair}`,couple:true}]);
    calls.push({room,body:JSON.parse(opts.body)});return Response.json({ok:true});
  }})}};
  const response=await worker.fetch(new Request('https://app.test/api/admin/action',{method:'POST',headers:{Authorization:'Bearer admin-session'},body:JSON.stringify({action:'signout',user})}),env,{});
  assert.equal(response.status,200);
  assert.equal(calls[0].room,`couple:${pair}`);
  assert.equal(calls[0].body.user,user);
});
