/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { startNodeSmtpSink } from './node-smtp-sink.mjs';
import { createMemoryCommerceStore } from '../lib/commerce/store.js';
import { acceptOrder } from '../lib/commerce/service.js';
import { customerMailer, deliverCustomer } from '../lib/commerce/mail.js';
const require = createRequire(import.meta.url);
let nodemailer;
try {
  const modulePath=process.env.NODEMAILER_TEST_MODULE || 'nodemailer';
  nodemailer=require(modulePath);
  // External reuse is test-only and must match this repository's exact lock version.
  const version=require(modulePath.replace(/\/$/,'')+'/package.json').version;
  if(version!=='10.0.10')throw Error('SMTP test requires locked nodemailer 10.0.10');
} catch (e) { if(process.env.REQUIRE_LOCAL_SMTP==='true')throw e; }
test('real loopback SMTP: concurrent customer receipt sends once and records delivery history', {skip:nodemailer?false:'locked nodemailer unavailable; supply NODEMAILER_TEST_MODULE'},async()=>{
  const sink=await startNodeSmtpSink();
  try {
    const now=Date.now(),store=createMemoryCommerceStore();
    const p={purpose:'config',locale:'en',fields:{name:'LOCAL MOCK',email:'local-mock@example.invalid',role:'player',country:'Mock country'},config:{series:'great',cls:'P1.5',mode:'listed',weight:272,grip:'L3',setType:'individual',sets:1,use:'play',ptype:'none'},consent:true,plan:'A',technical:{measurement_basis:'unstrung',balance:{choice:'request',requested:332,customer_confirmed:true},frame_stiffness:{choice:'request',requested:64,customer_confirmed:true}},paymentPreference:'payment_link',idempotencyKey:crypto.randomUUID(),elapsedMs:3000,hp:''};
    const accepted=await acceptOrder(p,{store,accessSecret:'LOCAL-MOCK-ONLY-test-secret-123456789',now});
    const mailer=customerMailer({ORDER_CUSTOMER_MAIL_MODE:'test',ORDER_SMTP_HOST:'127.0.0.1',ORDER_SMTP_PORT:String(sink.port)}, {transportFactory:()=>nodemailer.createTransport({host:'127.0.0.1',port:sink.port,secure:false,ignoreTLS:true,connectionTimeout:3000,greetingTimeout:3000,socketTimeout:3000})});
    await Promise.all(Array.from({length:6},()=>deliverCustomer(store,mailer,accepted.body.request_id,'confirmation',now)));
    assert.equal(sink.messages.length,1);assert.equal(sink.messages[0].to[0],'<local-mock@example.invalid>');
    assert.match(sink.messages[0].raw.replace(/\r\n[ \t]+/g,' '),/Message-ID: <MX-ORD-/);assert.equal((await store.get(accepted.body.request_id)).mail.confirmation.status,'sent');
    assert.equal((await store.get(accepted.body.request_id)).mail.confirmation.history.length,1);
  } finally {await sink.close();}
});
