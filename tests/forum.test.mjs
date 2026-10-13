/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createForumService, publicApplication } from '../lib/forum/service.js';
import { createMemoryStore } from '../lib/platform/store.js';
import { createMemoryStore as intakeStore, createUpstashStore } from '../lib/intake/store.js';
import { createPortal } from '../lib/platform/portal.js';
import { validateRequest } from '../lib/intake/schema.js';
import { acceptRequest } from '../lib/intake/service.js';
import { ORGANIZATION } from '../lib/platform/access.js';

const customer = { userId:'test-owner', organizationId:ORGANIZATION, emailVerified:true, email:'forum@example.invalid' };
const another = { ...customer,userId:'test-other',email:'other@example.invalid' };
const payload = (over={}) => ({purpose:'forum',locale:'en',fields:{email:customer.email,role:'Club operator',country:'UAE',residenceCity:'Dubai',preferredMeetingCity:'Dubai',travelCities:'Abu Dhabi\nLondon',attendees:'2',forumInterests:['infrastructure','education'],hosting:['coorganise']},consent:true,idempotencyKey:crypto.randomUUID(),elapsedMs:5000,hp:'',...over});
function fixture() {
  const store=createMemoryStore(), leads=intakeStore(), sent=[];
  const intake={store:leads,notifier:{channel:'smtp',send:async record=>{sent.push(record);return {ok:true,messageId:'fixture-only'};}}};
  let now=Date.parse('2026-10-13T20:00:00Z');
  const service=createForumService({store,intake,now:()=>now});
  return {store,leads,sent,intake,service,advance:ms=>{now+=ms;}};
}
async function modify(f,id,fn) {
  const row=await f.store.get('forumApplication',id);
  await f.store.commit({writes:[{type:'forumApplication',id,expectedVersion:row.version,doc:fn(row.doc)}]});
}
async function issued(f,id) {
  await modify(f,id,doc=>({...doc,status:'invited',invitation:{id:'fixture-invitation',version:1,status:'issued',subject:'Fixture invitation',body:'Synthetic test only',issuedAt:doc.createdAt,expiresAt:'2026-12-01T00:00:00Z'}}));
}

test('forum fields validate residence, total attendees, finite interests and separate consent',()=>{
  const p=payload(); assert.ok(validateRequest(p).ok);
  for(const attendees of [0,-1,'2.5','1e3',10000]) assert.equal(validateRequest({...p,fields:{...p.fields,attendees}}).ok,false);
  for(const attendees of [1,9999]) assert.ok(validateRequest({...p,fields:{...p.fields,attendees}}).ok);
  for(const key of ['residenceCity','preferredMeetingCity','role','country','email','forumInterests']) assert.equal(validateRequest({...p,fields:{...p.fields,[key]:''}}).ok,false,key);
  assert.equal(validateRequest({...p,consent:false}).ok,false);
  assert.equal(validateRequest({...p,fields:{...p.fields,forumInterests:['payments']}}).ok,false);
});
test('public lead intake cannot create an accountless forum application',async()=>{
  const r=await acceptRequest(payload(),{config:{},ip:'127.0.0.1'});
  assert.equal(r.http,401); assert.equal(r.body.code,'account_required');
});
test('application, outbox, initial history and audit persist atomically; marketing and financial data never enrolled',async()=>{
  const f=fixture(),p=payload();
  p.ownerUserId='evil';p.organizationId='elsewhere';p.marketing=true;p.deposit=1000000;p.bonus=100000;
  const r=await f.service.create(customer,p),id=r.application.id;
  const row=await f.store.get('forumApplication',id);
  assert.equal(row.doc.ownerUserId,customer.userId);assert.equal(row.doc.organizationId,ORGANIZATION);
  assert.equal(row.doc.status,'submitted');assert.equal(row.doc.details.attendees,2);
  assert.deepEqual(row.doc.consent,{answer_request:true,marketing:false,text_version:'forum-2026-10-13'});
  assert.equal(row.doc.deposit,undefined);assert.equal(row.doc.bonus,undefined);assert.equal(r.application.invitation,null);
  assert.equal(await f.store.indexSize('forum:notify:pending'),1);assert.equal(await f.store.indexSize(`audit:forumApplication:${id}`),1);
  assert.equal(await f.leads.countLeads(),0);assert.equal(f.sent.length,0);
});
test('commit failure never claims saved application or leaves partial outbox/history',async()=>{
  const f=fixture();f.store.failNextCommit='store_unavailable';
  await assert.rejects(f.service.create(customer,payload()),{code:'store_unavailable'});
  assert.equal((await f.service.list(customer)).items.length,0);assert.equal(await f.store.indexSize('forum:notify:pending'),0);assert.equal(await f.store.indexSize('audit:all'),0);
});
test('duplicate retries, concurrent create and reused key with changed payload are handled safely',async()=>{
  const f=fixture(),p=payload(),rs=await Promise.all([f.service.create(customer,p),f.service.create(customer,p)]);
  assert.equal(rs[0].application.id,rs[1].application.id);assert.equal((await f.service.list(customer)).items.length,1);
  await assert.rejects(f.service.create(customer,{...p,fields:{...p.fields,attendees:'3'}}),{code:'idempotency_conflict'});
});
test('all participant reads and mutations reject foreign owner, tenant and forged index rows',async()=>{
  const f=fixture(),{application:a}=await f.service.create(customer,payload());
  for(const method of [()=>f.service.get(another,a.id),()=>f.service.message(another,a.id,{message:'x',idempotencyKey:crypto.randomUUID()}),()=>f.service.attendance(another,a.id,{idempotencyKey:crypto.randomUUID()})]) await assert.rejects(method(),{status:404});
  assert.equal((await f.service.list(another)).items.length,0);
  await f.store.commit({indexes:[{name:`forum:applications:${ORGANIZATION}:tennis:${another.userId}`,member:a.id,score:1}]});
  await assert.rejects(f.service.list(another),{code:'forum_index_invalid'});
  await modify(f,a.id,d=>({...d,projectId:'foreign'}));await assert.rejects(f.service.get(customer,a.id),{status:404});
});
test('email is bound to verified identity, forged client verification cannot help',async()=>{
  const f=fixture(),p=payload();
  await assert.rejects(f.service.create(customer,{...p,fields:{...p.fields,email:another.email}}),{code:'validation_failed'});
  await assert.rejects(f.service.create({...customer,emailVerified:false},{...p,emailVerified:true}),{code:'email_verification_required'});
});
test('private projection omits internal notes, staff assignments and invisible correspondence',()=>{
  const p=publicApplication({id:'x',contact:{email:customer.email},details:{},history:[{at:'a',kind:'status',status:'submitted',internal:'secret'}],messages:[{id:'1',author:'staff',body:'internal'},{id:'2',author:'coordinator',visibility:'participant',body:'visible',internal:'secret'}],decisionReason:'secret',assignedStaff:'secret'});
  assert.equal(p.messages.length,1);assert.equal(p.messages[0].body,'visible');assert.ok(!JSON.stringify(p).includes('secret'));
});
test('correspondence persists with an immutable notification snapshot and idempotent retries',async()=>{
  const f=fixture(),{application:a}=await f.service.create(customer,payload()),p={message:'My preferred city is London.',idempotencyKey:crypto.randomUUID()};
  const r=await f.service.message(customer,a.id,p);assert.equal(r.application.messages.length,1);
  await f.service.message(customer,a.id,p);assert.equal((await f.service.get(customer,a.id)).application.messages.length,1);
  assert.equal(await f.store.indexSize('forum:notify:pending'),2);
  await modify(f,a.id,d=>({...d,contact:{...d.contact,email:'changed@example.invalid'}}));
  await f.service.flushNotifications({limit:5,deliverNow:true});assert.equal(f.sent.length,2);assert.ok(f.sent.every(record=>record.contact.email===customer.email));
});
test('notification transfer failure after intake save recovers without re-sending or resetting notification state',async()=>{
  const f=fixture();await f.service.create(customer,payload());
  f.store.failNextCommit='store_unavailable';await assert.rejects(f.service.flushNotifications({limit:5,deliverNow:true}),{code:'store_unavailable'});
  assert.equal(await f.leads.countLeads(),1);f.advance(10*86400000);
  const result=await f.service.flushNotifications({limit:5,deliverNow:true});assert.equal(result.transferred,1);assert.equal(await f.leads.countLeads(),1);assert.equal(f.sent.length,1);
  await f.service.flushNotifications({limit:5,deliverNow:true});assert.equal(f.sent.length,1);
});
test('durable REST enqueue uses permanent forum-only deduplication; other leads retain seven days',async()=>{
  const calls=[];const store=createUpstashStore({url:'https://fixture.invalid',token:'fixture',fetchImpl:async(_url,opt)=>{const command=JSON.parse(opt.body);calls.push(command);return new Response(JSON.stringify({result:[1,'fixture-id']}),{status:200});}});
  await store.createLead({idemHash:'hash',requestId:'fixture-id',record:{purpose:'forum'},persistentIdempotency:true});
  assert.equal(calls[0].at(-1),'0');assert.equal(calls[0][3],'mx:idem:forum:hash');assert.match(calls[0][1],/ARGV\[4\] == '0'/);
  await store.createLead({idemHash:'hash',requestId:'fixture-id',record:{purpose:'general'}});assert.equal(calls[1].at(-1),'604800');
  await assert.rejects(store.createLead({record:{purpose:'general'},persistentIdempotency:true}),{code:'store_invalid_persistent_scope'});
});
test('missing transport preserves saved application and pending outbox without claiming delivery',async()=>{
  const f=fixture(),service=createForumService({store:f.store,intake:{store:f.leads,notifier:null}});
  const r=await service.create(customer,payload());assert.ok(r.application.id);
  assert.deepEqual(await service.flushNotifications(),{transferred:0,unavailable:true});assert.equal(await f.store.indexSize('forum:notify:pending'),1);assert.equal(f.sent.length,0);
});
test('attendance requires an actual active matching invitation; duplicate exact response succeeds',async()=>{
  const f=fixture(),{application:a}=await f.service.create(customer,payload());
  const p={invitationId:'fixture-invitation',invitationVersion:1,idempotencyKey:crypto.randomUUID()};
  await assert.rejects(f.service.attendance(customer,a.id,p),{code:'invitation_not_active'});
  await issued(f,a.id);await assert.rejects(f.service.attendance(customer,a.id,{...p,invitationVersion:2}),{code:'invitation_not_active'});
  const r=await f.service.attendance(customer,a.id,p);assert.equal(r.application.status,'attendance_confirmed');assert.equal(r.application.attendance.attendees,2);
  assert.equal((await f.service.attendance(customer,a.id,p)).duplicate,true);
});
test('revoked or expired invitation cannot be confirmed, and concurrent revision fails CAS',async()=>{
  const f=fixture(),{application:a}=await f.service.create(customer,payload());await issued(f,a.id);
  const p={invitationId:'fixture-invitation',invitationVersion:1,idempotencyKey:crypto.randomUUID()};
  await modify(f,a.id,d=>({...d,invitation:{...d.invitation,status:'revoked'}}));await assert.rejects(f.service.attendance(customer,a.id,p),{code:'invitation_not_active'});
  await issued(f,a.id);f.advance(60*86400000);await assert.rejects(f.service.attendance(customer,a.id,p),{code:'invitation_not_active'});
});
test('real portal sessions enforce CSRF, verified email, identity isolation, revocation and disabled state',async()=>{
  const store=createMemoryStore(),mail=[];
  const portal=createPortal({store,mailer:{send:async message=>{mail.push(message);}},env:{NODE_ENV:'test',FORUM_ENABLED:'true'}});
  const origin='https://maximus.tennis';
  const req=(path,body,headers={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const password='fixture-only-password-long';
  async function login(email){
    await portal.handle(req('/api/accounts/register',{email,password,displayName:'Fixture',roles:['player'],locale:'en',consents:{terms:true,privacy:true,marketing:false}}),'register');
    const token=new URL(mail.find(m=>m.to===email).params.link).searchParams.get('token');
    await portal.handle(req('/api/accounts/verify',{token}),'verify');
    const response=await portal.handle(req('/api/accounts/login',{email,password}),'login');return {cookie:response.headers.get('set-cookie').split(';')[0],...(await response.json())};
  }
  const one=await login(customer.email),two=await login(another.email);
  assert.equal((await portal.handle(req('/api/accounts/forum',payload()),'forum-create')).status,401);
  assert.equal((await portal.handle(req('/api/accounts/forum',payload(),{cookie:one.cookie}),'forum-create')).status,403);
  const created=await portal.handle(req('/api/accounts/forum',payload(),{cookie:one.cookie,'x-csrf-token':one.csrfToken}),'forum-create');assert.equal(created.status,201);
  const {application:a}=await created.json();
  assert.equal((await portal.handle(req(`/api/accounts/forum/${a.id}`,undefined,{cookie:two.cookie}),'forum-detail',{applicationId:a.id})).status,404);
  assert.equal((await portal.handle(req('/api/accounts/forum',undefined,{cookie:one.cookie,'sec-fetch-site':'cross-site'}),'forum-list')).status,403);
  await portal.handle(req('/api/accounts/logout',{}, {cookie:one.cookie,'x-csrf-token':one.csrfToken}),'logout');
  assert.equal((await portal.handle(req('/api/accounts/forum',undefined,{cookie:one.cookie}),'forum-list')).status,401);
  const disabled=createPortal({store,mailer:{send:async()=>{}},env:{NODE_ENV:'test'}});
  assert.equal((await disabled.handle(req('/api/accounts/forum',undefined,{cookie:two.cookie}),'forum-list')).status,503);
});

test('concurrent invitation revocation wins over stale confirmation without partial audit or outbox',async()=>{
  const f=fixture(),{application:a}=await f.service.create(customer,payload());await issued(f,a.id);
  const original=f.store.commit.bind(f.store);let race=true;
  f.store.commit=async changes=>{
    if(race && changes.writes?.some(w=>w.type==='forumApplication' && w.doc.status==='attendance_confirmed')){
      race=false;const row=await f.store.get('forumApplication',a.id);
      await original({writes:[{type:'forumApplication',id:a.id,expectedVersion:row.version,doc:{...row.doc,invitation:{...row.doc.invitation,status:'revoked'}}}]});
    }
    return original(changes);
  };
  await assert.rejects(f.service.attendance(customer,a.id,{invitationId:'fixture-invitation',invitationVersion:1,idempotencyKey:crypto.randomUUID()}),{code:'version_conflict'});
  const current=(await f.service.get(customer,a.id)).application;
  assert.equal(current.invitation.status,'revoked');assert.equal(current.attendance,null);assert.equal(await f.store.indexSize('forum:notify:pending'),1);
});
test('correspondence limits reject new writes without truncating saved history',async()=>{
  const f=fixture(),{application:a}=await f.service.create(customer,payload());
  await modify(f,a.id,d=>({...d,messages:Array.from({length:100},(_,i)=>({id:String(i),author:'participant',visibility:'participant',body:'Preserve',at:d.createdAt}))}));
  await assert.rejects(f.service.message(customer,a.id,{message:'More',idempotencyKey:crypto.randomUUID()}),{code:'correspondence_limit'});
  assert.equal((await f.service.get(customer,a.id)).application.messages.length,100);
});

test('scheduled forum drain only transfers one notification and never blocks old lead processing on SMTP',async()=>{
  const f=fixture();await f.service.create(customer,payload());await f.service.create(customer,payload());
  const result=await f.service.flushNotifications();assert.equal(result.transferred,1);assert.equal(f.sent.length,0);assert.equal(await f.store.indexSize('forum:notify:pending'),1);
  assert.equal(await f.leads.pendingCount(),1);
});

test('outbox transfers the oldest waiting notification before new arrivals',async()=>{
  const f=fixture();const first=await f.service.create(customer,payload());f.advance(1000);await f.service.create(customer,payload());f.advance(1000);await f.service.create(customer,payload());
  await f.service.flushNotifications();const [lead]=await f.leads.listLeads();assert.equal(lead.record.context.forumApplicationId,first.application.id);assert.equal(await f.store.indexSize('forum:notify:pending'),2);
});
