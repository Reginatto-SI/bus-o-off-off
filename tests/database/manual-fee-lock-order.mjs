// Run AFTER manual-fee.mjs in its disposable container. Never uses a project URL.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const container=process.env.TICKET_TEST_CONTAINER;
if(!container?.startsWith('smartbus-ticket-test-'))throw Error('Dedicated test container required');
const args=['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sessions=[];
function session(name){
 const child=spawn('docker',['exec','-e',`PGAPPNAME=${name}`,'-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At']);
 let out='',err='',closed=false;
 child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
 const done=new Promise(resolve=>child.on('close',code=>{closed=true;resolve({code,out,err});}));
 const s={name,done,send:body=>child.stdin.write(body+'\n'),end:body=>child.stdin.end(body+'\n'),stop:()=>{if(!closed)child.kill();},
  async ready(marker){const until=Date.now()+8000;while(Date.now()<until){if(out.includes(marker))return;if(closed)throw Error(err);await pause(25);}throw Error(`No barrier ${marker}: ${err}`);}};
 sessions.push(s);return s;
}
async function waiting(s){
 const until=Date.now()+8000;
 while(Date.now()<until){if(sql(`SELECT wait_event FROM pg_stat_activity WHERE application_name='${s.name}';`)==='advisory')return;await pause(25);}
 throw Error(`Session did not wait for advisory lock: ${s.name}`);
}
const company='00000000-0000-0000-0000-000000000001',trip='00000000-0000-0000-0000-000000000004';
const fn=source=>{
 const match=source.match(/CREATE OR REPLACE FUNCTION public\.guard_managed_manual_sale\(\)[\s\S]*?END \$\$;/);
 assert.ok(match,'Exact versioned guard function required');return match[0];
};
sql('ALTER TABLE sales ADD COLUMN IF NOT EXISTS asaas_payment_status text;');
const definitions=[['0005_manual_fee_ledger_and_recovery.sql','df346a69']];
if(existsSync('drizzle/migrations/0006_manual_fee_pilot_guards.sql'))definitions.push(['0006_manual_fee_pilot_guards.sql','6f667263']);
const item=(label)=>({id:randomUUID(),trip_id:trip,seat_id:null,seat_label:label,passenger_name:'Synthetic',passenger_cpf:'12345678901',passenger_phone:'',sort_order:0,ticket_type_id:null,ticket_type_name:null,ticket_type_price:null,benefit_program_id:null,benefit_program_name:null,benefit_type:null,benefit_value:null,original_price:100,discount_amount:0,final_price:100,benefit_applied:false,pricing_rule_version:'beneficio_checkout_v1'});
function publicSale(gateway,origin='online_checkout'){
 const id=randomUUID();sql(`INSERT INTO sales(id,company_id,status,payment_gateway,payment_environment,sale_origin) VALUES('${id}','${company}','pago','${gateway}','sandbox','${origin}');`);
 for(const label of ['CONCURRENT-A','CONCURRENT-B']){
  const p=item(label);sql(`INSERT INTO sale_passengers(id,sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf,passenger_phone,original_price,discount_amount,final_price,benefit_applied,pricing_rule_version) VALUES('${p.id}','${id}','${company}','${trip}','${label}','Synthetic','12345678901','',100,0,100,false,'beneficio_checkout_v1');`);
 }
 return id;
}
const issue=id=>`SELECT issue_sale_tickets_from_staging('${id}','${company}');`;
async function hold(id){
 const s=session(`guard_hold_${randomUUID()}`);s.send(`BEGIN; SET LOCAL deadlock_timeout='100ms'; SET LOCAL statement_timeout='8s'; SELECT pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:${id}',0));\n\\echo LOCK_HELD`);await s.ready('LOCK_HELD');return s;
}
let count=0;
function passed(label){count++;console.log('PASS',label);}
try{
 for(const [file,baseline] of definitions){
  const fixed=fn(readFileSync('drizzle/migrations/'+file,'utf8'));
  const previous=fn(execFileSync('git',['show',baseline+':drizzle/migrations/'+file],{encoding:'utf8'}));
  // Install only the old function in the test fixture, reproduce the actual
  // row/advisory cycle, then restore the exact corrected versioned definition.
  sql(previous);
  try{
   const id=publicSale('asaas'),a=await hold(id),b=session(`old_update_${randomUUID()}`);
   b.end(`SET deadlock_timeout='100ms'; SET statement_timeout='8s'; UPDATE sales SET asaas_payment_status='RECEIVED' WHERE id='${id}';`);
   await waiting(b);a.end(issue(id)+' COMMIT;');
   const results=await Promise.all([a.done,b.done]);
   assert.ok(results.some(r=>r.code!==0&&/deadlock detected/.test(r.err)),JSON.stringify(results));
   passed(`${file}: reproduces original public Asaas deadlock with real connections`);
  }finally{sql(fixed);}

  for(const [gateway,origin] of [['asaas','online_checkout'],['pagbank','online_checkout'],['asaas','admin_manual']]){
   const id=publicSale(gateway,origin),a=await hold(id),c=session(`reconcile_${randomUUID()}`);
   c.end(`SET statement_timeout='8s'; ${issue(id)}`);await waiting(c);
   const b=session(`public_update_${randomUUID()}`);
   b.end(`SET statement_timeout='4s'; UPDATE sales SET asaas_payment_status='RECEIVED' WHERE id='${id}';`);
   // The update must finish while issuance holds its advisory lock. Waiting on
   // that lock here would recreate the unwanted public/legacy dependency.
   const update=await b.done;assert.equal(update.code,0,update.err);
   a.end(issue(id)+' COMMIT;');
   const [emission,reconcile]=await Promise.all([a.done,c.done]);
   assert.equal(emission.code,0,emission.err);assert.equal(reconcile.code,0,reconcile.err);
   assert.match(emission.out,/created/);assert.match(reconcile.out,/skipped_existing/);
   assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${id}';`),'2');
   assert.equal(sql(`SELECT count(*) FROM sale_passengers WHERE sale_id='${id}';`),'0');
   passed(`${file}: ${gateway}/${origin} update + issuance + reconciliation, two tickets exactly`);
  }

  const ps=[item('MANAGED-A'),{...item('MANAGED-B'),sort_order:1}];
  const saleBody={company_id:company,event_id:trip,trip_id:trip,boarding_location_id:trip,customer_name:'Synthetic',customer_cpf:'12345678901',quantity:2,unit_price:100,gross_amount:200,benefit_total_discount:0,payment_gateway:'asaas',payment_environment:'sandbox',reservation_expires_at:'2030-01-01'};
  const op={gateway:'asaas',environment:'sandbox',issuer_account_id:'issuer',amount_cents:1200,snapshot:{representative_id:null,allocations:[{kind:'marketplace',beneficiary_id:'issuer',destination:'issuer',amount_cents:1200}]}};
  const id=sql(`SELECT register_manual_sale('${randomUUID()}','hash','${company}','${JSON.stringify(saleBody)}','${JSON.stringify(ps)}','${JSON.stringify(op)}');`);
  const oid=sql(`SELECT id FROM platform_fee_operations WHERE sale_id='${id}';`),a=await hold(id),b=session(`managed_cancel_${randomUUID()}`);
  b.end(`SET statement_timeout='8s'; UPDATE sales SET status='cancelado' WHERE id='${id}';`);
  await waiting(b);
  a.end(`UPDATE platform_fee_operations SET state='creating' WHERE id='${oid}'; COMMIT;`);
  assert.equal((await a.done).code,0);const cancel=await b.done;
  assert.notEqual(cancel.code,0);assert.match(cancel.err,/manual_fee_cancellation_unsafe/);
  assert.equal(sql(`SELECT status FROM sales WHERE id='${id}';`),'reservado');
  assert.equal(sql(`SELECT count(*) FROM sale_passengers WHERE sale_id='${id}';`),'2');
  passed(`${file}: managed guard retains lock and re-reads financial state after waiting`);

  sql(`UPDATE platform_fee_operations SET state='confirmed',external_id='synthetic_${oid}',confirmed_at=now() WHERE id='${oid}';`);
  const one=session(`managed_confirm_${randomUUID()}`),two=session(`managed_reconcile_${randomUUID()}`);
  for(const s of [one,two])s.end(`SET statement_timeout='8s'; SELECT finalize_manual_sale('${oid}');`);
  const confirmed=await Promise.all([one.done,two.done]);assert.ok(confirmed.every(r=>r.code===0),JSON.stringify(confirmed));
  assert.deepEqual(confirmed.map(r=>r.out.trim().split('\n').at(-1)).sort(),['created','skipped_existing']);
  assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${id}';`),'2');
  assert.equal(sql(`SELECT count(*) FROM platform_fee_allocations WHERE operation_id='${oid}';`),'1');
  assert.equal(sql(`SELECT count(*) FROM sale_passengers WHERE sale_id='${id}';`),'0');
  passed(`${file}: managed simultaneous confirmations retain integral issuance and unique ledger`);
 }
 console.log(`${count} targeted lock-order scenarios passed.`);
}finally{for(const s of sessions)s.stop();}
