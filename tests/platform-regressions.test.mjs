/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url).pathname;
const load=p=>import(pathToFileURL(`${root}/lib/platform/${p}.js`));
test('single-line validator rejects Unicode line separators',async()=>{
 const {checkField,text}=await load('validate');
 for(const sep of ['\u2028','\u2029','\n','\r']) assert.equal(checkField(text(100),'a'+sep+'b').error,'invalid');
});
test('serialization failure leaves every record and unique/index untouched',async()=>{
 const {createMemoryStore}=await load('store');const s=createMemoryStore();
 await assert.rejects(s.commit({writes:[{type:'t',id:'one',doc:{ok:true}},{type:'t',id:'two',doc:{n:1n}}],uniques:[{name:'email',value:'x',owner:'one'}],indexes:[{name:'all',member:'one',score:1}]}));
 assert.equal(await s.get('t','one'),null);assert.equal(await s.getUnique('email','x'),null);assert.equal(await s.indexSize('all'),0);
});
test('same-commit uniqueness collision is all-or-none',async()=>{
 const {createMemoryStore}=await load('store');const s=createMemoryStore();
 await assert.rejects(s.commit({writes:[{type:'t',id:'one',doc:{ok:true}}],uniques:[{name:'email',value:'x',owner:'one'},{name:'email',value:'x',owner:'two'}]}),{code:'unique_conflict'});
 assert.equal(await s.get('t','one'),null);assert.equal(await s.getUnique('email','x'),null);
});
for(const race of ['logout','rotation']) test(`idle touch cannot undo concurrent ${race}`,async()=>{
 const {createMemoryStore}=await load('store');const {createIdentity}=await load('identity');const {sha256}=await load('ids');
 const s=createMemoryStore();const at=Date.parse('2026-10-10T12:00:00Z');const raw='synthetic-session-for-regression';
 const doc={id:'s',userId:'u',platform:'web',tokenHash:sha256(raw),revokedAt:null,lastSeenAt:new Date(at-120000).toISOString(),idleExpiresAt:new Date(at+600000).toISOString(),absoluteExpiresAt:new Date(at+3600000).toISOString()};
 await s.commit({writes:[{type:'user',id:'u',doc:{id:'u',status:'active'}},{type:'session',id:'s',doc}],uniques:[{name:'session_token',value:sha256(raw),owner:'s'}]});
 const identity=createIdentity({store:s,mailer:{send:async()=>({ok:false})},now:()=>at});
 const original=s.commit.bind(s);let injected=false;
 s.commit=async c=>{
  if(!injected && c.writes?.some(w=>w.type==='session'&&w.doc.lastSeenAt===new Date(at).toISOString())){
   injected=true;const r=await s.get('session','s');
   await original({writes:[{type:'session',id:'s',expectedVersion:r.version,doc:{...r.doc,...(race==='logout'?{revokedAt:new Date(at).toISOString()}:{tokenHash:sha256('rotated-token')})}}]});
  }
  return original(c);
 };
 assert.equal(await identity.authenticate({sessionToken:raw}),null);
 const current=await s.get('session','s');assert.equal(current.version,2);
 if(race==='logout')assert.ok(current.doc.revokedAt);else assert.equal(current.doc.tokenHash,sha256('rotated-token'));
 assert.equal(await identity.authenticate({sessionToken:raw}),null);
});

test('malformed transaction is rejected before Upstash receives a request',async()=>{
 const {createUpstashStore}=await load('store');let calls=0;
 const s=createUpstashStore({url:'http://localhost:1',token:'synthetic',fetchImpl:async()=>{calls++;throw Error('network must not be used');}});
 const invalid=[
  {writes:[{type:'t',id:'one',doc:{ok:true}},{type:'t',id:'two',doc:{n:1n}}]},
  {writes:[{type:'t',id:'one',doc:undefined}]},
  {writes:[{type:'t',id:'one',doc:{},expectedVersion:NaN}]},
  {writes:[{type:'t',id:'one',doc:{}},{type:'t',id:'one',doc:{}}]},
  {uniques:[{name:'email',value:'x',owner:'one'},{name:'email',value:'x',owner:'two'}]},
  {indexes:[{name:'all',member:'one',score:Infinity}]},
 ];
 for(const c of invalid)await assert.rejects(s.commit(c));
 assert.equal(calls,0);
});

test('invalid index prevents otherwise valid memory writes',async()=>{
 const {createMemoryStore}=await load('store');const s=createMemoryStore();
 await assert.rejects(s.commit({writes:[{type:'t',id:'one',doc:{ok:true}}],indexes:[{name:'all',member:'one',score:NaN}]}),{code:'bad_index'});
 assert.equal(await s.get('t','one'),null);
});

test('successful commit preserves snapshots, indexes and optimistic concurrency',async()=>{
 const {createMemoryStore}=await load('store');const s=createMemoryStore();const doc={value:1};
 const result=await s.commit({writes:[{type:'t',id:'one',doc,expectedVersion:-1}],uniques:[{name:'email',value:'x',owner:'one'},{name:'email',value:'x',owner:'one'}],indexes:[{name:'all',member:'one',score:1}]});
 doc.value=99;assert.equal(result.versions['t:one'],1);assert.equal((await s.get('t','one')).doc.value,1);
 assert.equal(await s.getUnique('email','x'),'one');assert.deepEqual(await s.listIndex('all'),['one']);
 await assert.rejects(s.commit({writes:[{type:'t',id:'two',doc:{}},{type:'t',id:'one',doc:{value:2},expectedVersion:2}]}),{code:'version_conflict'});
 assert.equal(await s.get('t','two'),null);assert.equal((await s.get('t','one')).doc.value,1);
});

test('ordinary authentication returns the persisted touched version',async()=>{
 const {createMemoryStore}=await load('store');const {createIdentity}=await load('identity');const {sha256}=await load('ids');
 const s=createMemoryStore();const at=Date.parse('2026-10-10T12:00:00Z');const raw='synthetic-valid-session';
 const doc={id:'s',userId:'u',platform:'web',tokenHash:sha256(raw),revokedAt:null,lastSeenAt:new Date(at-120000).toISOString(),idleExpiresAt:new Date(at+600000).toISOString(),absoluteExpiresAt:new Date(at+3600000).toISOString()};
 await s.commit({writes:[{type:'user',id:'u',doc:{id:'u',status:'active'}},{type:'session',id:'s',doc}],uniques:[{name:'session_token',value:sha256(raw),owner:'s'}]});
 const identity=createIdentity({store:s,mailer:{send:async()=>({ok:false})},now:()=>at});
 const auth=await identity.authenticate({sessionToken:raw});assert.equal(auth.sessionVersion,2);assert.equal(auth.session.lastSeenAt,new Date(at).toISOString());
});
