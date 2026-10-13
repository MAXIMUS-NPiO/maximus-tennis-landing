/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Local browser + real portal service with isolated in-memory test adapters only.
 * Browser requests never send real credentials, mail or participant data to an external service.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createPortal } from '../../lib/platform/portal.js';
import { createMemoryStore } from '../../lib/platform/store.js';
import { ORGANIZATION } from '../../lib/platform/access.js';
import { locales } from '../../lib/i18n.js';
import { forumCopy } from '../../content/forum-copy.js';
import { accountLabels } from '../../content/account.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const BASE=process.env.BASE_URL || 'http://127.0.0.1:3216',OUT=process.env.EVIDENCE || '/tmp/forum-browser';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const results=[],pageErrors=[];
const pass=value=>{results.push(value);console.log(`PASS ${results.length}: ${JSON.stringify(value)}`);};
async function fixture(){
  const store=createMemoryStore(),mail=[];
  const portal=createPortal({store,mailer:{send:async m=>{mail.push(m);return {ok:true};}},env:{NODE_ENV:'test',FORUM_ENABLED:'true',PUBLIC_BASE_URL:BASE}});
  const request=(path,body,headers={})=>new Request(BASE+path,{method:body===undefined?'GET':'POST',headers:{Origin:BASE,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  async function account(email){
    const password='Synthetic-fixture-password-only';
    await portal.handle(request('/api/accounts/register',{email,password,displayName:'Browser fixture',roles:['player'],locale:'en',consents:{terms:true,privacy:true,marketing:false}}),'register');
    const token=new URL(mail.find(m=>m.to===email).params.link).searchParams.get('token');
    await portal.handle(request('/api/accounts/verify',{token}),'verify');
    const response=await portal.handle(request('/api/accounts/login',{email,password}),'login');
    return {cookie:response.headers.get('set-cookie').split(';')[0],...(await response.json())};
  }
  return {store,portal,one:await account('one@example.invalid'),two:await account('two@example.invalid')};
}
async function cookie(context,account){await context.addCookies([{name:'mx_session',value:account.cookie.split('=')[1],url:BASE,httpOnly:true,sameSite:'Lax'}]);}
async function surface(f,{mobile=false,account=null,race=false}={}){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900}});
  context.setDefaultTimeout(12000);context.setDefaultNavigationTimeout(15000);
  if(account) await cookie(context,account);
  const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==BASE)return route.abort();
    if(!url.pathname.startsWith('/api/accounts/'))return route.continue();
    const path=url.pathname,method=req.method();let action,params={};
    if(path==='/api/accounts/session')action='session';
    else if(path==='/api/accounts/forum')action=method==='GET'?'forum-list':'forum-create';
    else {
      const match=path.match(/^\/api\/accounts\/forum\/([^/]+)(?:\/(messages|attendance))?$/);
      assert.ok(match,`unexpected intercepted path ${path}`);params.applicationId=match[1];action=match[2]==='messages'?'forum-message':match[2]==='attendance'?'forum-attendance':'forum-detail';
    }
    const headers=await req.allHeaders();
    if(race && action==='forum-list')headers.cookie=f.two.cookie;
    const response=await f.portal.handle(new Request(req.url(),{method,headers,...(method==='POST'?{body:req.postData()}: {})}),action,params);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  return {context,page};
}
const customer=account=>({userId:account.user.id,organizationId:ORGANIZATION,emailVerified:true,email:account.user.email});
const application=account=>({purpose:'forum',locale:'en',fields:{email:account.user.email,role:'Fixture role',country:'UAE',residenceCity:'City A',preferredMeetingCity:'Dubai',attendees:'2',forumInterests:['products']},consent:true,idempotencyKey:crypto.randomUUID(),elapsedMs:5000,hp:''});
try {
  if (process.env.FORUM_BROWSER_PHASE !== 'account-switch') {
  // The real unconfigured local route must fail closed; no test-only runtime bypass exists.
  const unavailable=await fetch(`${BASE}/api/accounts/forum`);assert.equal(unavailable.status,503);pass({runtime:'disabled returns503'});
  const guests=await fixture(),{context:guestContext,page:guestPage}=await surface(guests);
  for(const locale of locales){
    await guestPage.goto(`${BASE}/${locale}/forum`);await guestPage.waitForSelector('[data-forum-state="guest"]');
    assert.ok((await guestPage.locator('main').innerText()).includes(forumCopy(locale).proposal));
    assert.equal(await guestPage.locator('form[data-purpose="forum"]').count(),0);
    assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    pass({locale,guestGate:'PASS',overflow:false});
  }
  await guestContext.close();
  for(const locale of ['en','ru','ar']){
    const f=await fixture(),{context,page}=await surface(f,{mobile:locale==='ar',account:f.one}),F=forumCopy(locale);
    await page.goto(`${BASE}/${locale}/forum`);await page.waitForSelector('[data-forum-state="ready"]');
    const form=page.locator('form[data-purpose="forum"]');
    assert.equal(await form.locator('[name="email"]').inputValue(),f.one.user.email);assert.ok(await form.locator('[name="email"]').getAttribute('readonly')!==null);
    for(const [key,value] of Object.entries({residenceCity:'Dubai',preferredMeetingCity:'London',travelCities:'Dubai\nParis',attendees:'2',role:'Club organiser',country:'UAE',organisation:'Synthetic fixture'}))await form.locator(`[name="${key}"]`).fill(value);
    await form.locator('[name="forumInterests"][value="infrastructure"]').check();
    await form.locator('[name="hosting"][value="coorganise"]').check();await form.locator('input[type="checkbox"][required]').check();
    await page.waitForTimeout(1600);
    if(locale==='en'){
      f.store.failNextCommit='store_unavailable';await form.locator('button[type="submit"]').click();await form.locator('[data-state="failed"]').waitFor();
      assert.equal((await f.portal.forum.list(customer(f.one))).items.length,0);assert.equal(await page.locator('[data-forum-application]').count(),0);pass({failedCommit:'no simulated success'});
    }
    await form.locator('button[type="submit"]').click();await page.waitForSelector('[data-forum-application]');
    const saved=(await f.portal.forum.list(customer(f.one))).items[0];assert.equal(saved.details.attendees,2);assert.equal(saved.invitation,null);
    const article=page.locator(`[data-forum-application="${saved.id}"]`);
    assert.equal(await article.getByRole('button',{name:F.confirmAttendance,exact:true}).count(),0);
    await article.locator('textarea').fill('Synthetic correspondence; no real attendee.');await article.getByRole('button',{name:F.sendMessage,exact:true}).click();
    await article.getByText('Synthetic correspondence; no real attendee.',{exact:true}).waitFor();
    const record=await f.store.get('forumApplication',saved.id);assert.equal(record.doc.messages.length,1);assert.equal(record.doc.consent.marketing,false);
    const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.ok(!storage.includes('one@example')&&!storage.includes('Synthetic correspondence'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:`${OUT}/${locale}-participant.png`,fullPage:true});
    await f.store.commit({writes:[{type:'forumApplication',id:saved.id,expectedVersion:record.version,doc:{...record.doc,status:'invited',invitation:{id:'synthetic-invitation',version:1,status:'issued',subject:'Synthetic test invitation',body:'No real event or invitation.',issuedAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z'}}}]});
    await page.reload();await page.locator(`[data-forum-application="${saved.id}"]`).getByRole('button',{name:F.confirmAttendance,exact:true}).click();
    await page.getByText(F.attendanceConfirmed,{exact:true}).last().waitFor();assert.equal((await f.store.get('forumApplication',saved.id)).doc.attendance.invitationVersion,1);
    pass({locale,authenticatedApplication:'PASS',messagePersistence:'PASS',realRecordRequiredForAttendance:true,noPersonalBrowserStorage:true});await context.close();
  }
  }
  {
    const f=await fixture();
    for(let i=0;i<21;i++)await f.portal.forum.create(customer(f.one),application(f.one));
    await f.portal.forum.create(customer(f.two),{...application(f.two),fields:{...application(f.two).fields,residenceCity:'Private city B'}});
    const {context,page}=await surface(f,{account:f.one});await page.goto(`${BASE}/en/forum`);await page.waitForSelector('[data-forum-state="ready"]');assert.equal(await page.locator('[data-forum-application]').count(),20);
    await cookie(context,f.two);await page.getByRole('button',{name:accountLabels.en.more,exact:true}).click();await page.waitForSelector('[data-forum-state="guest"]');
    assert.equal(await page.locator('[data-forum-application]').count(),0);assert.ok(!(await page.locator('main').innerText()).includes('Private city B'));
    pass({sessionChange:'pagination clears all earlier/private rows'});await context.close();
    const race=await surface(f,{account:f.one,race:true});await race.page.goto(`${BASE}/en/forum`);await race.page.waitForSelector('[data-forum-state="guest"]');assert.equal(await race.page.locator('[data-forum-application]').count(),0);
    pass({sessionChange:'between session and list fails closed'});await race.context.close();
  }
  assert.deepEqual(pageErrors,[]);writeFileSync(`${OUT}/browser.json`,JSON.stringify({status:'PASS',scenarios:results.length,results,pageErrors,transport:'Local production build; real portal service with isolated synthetic memory and mail fixtures. No real account, notification or invitation.'},null,2));
  console.log(`PASS ${results.length} forum browser scenarios`);
} catch(error){writeFileSync(`${OUT}/browser.json`,JSON.stringify({status:'FAIL',completed:results,error:String(error),stack:error.stack,pageErrors},null,2));throw error;}
finally {await browser.close();}
