// Disposable PostgreSQL only; no application database URLs are accepted.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const container=process.env.TICKET_TEST_CONTAINER;
if(!container?.startsWith('smartbus-ticket-test-'))throw Error('Dedicated test container required');
const args=['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const parallel=s=>new Promise((resolve,reject)=>{const p=spawn('docker',args);let o='',e='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>e+=d);p.on('close',c=>c?reject(Error(e)):resolve(o.trim()));p.stdin.end(s);});
const c='00000000-0000-0000-0000-000000000001',sale='00000000-0000-0000-0000-000000000002',op='00000000-0000-0000-0000-000000000003',trip='00000000-0000-0000-0000-000000000004';
sql(`CREATE TYPE public.sale_status AS ENUM ('reservado','pago','pendente_pagamento','cancelado','bloqueado');
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION user_belongs_to_company(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
CREATE TABLE companies(id uuid PRIMARY KEY,payment_gateway text DEFAULT 'asaas',payment_environment text DEFAULT 'sandbox',manual_reservation_ttl_minutes integer DEFAULT 60,platform_fee_percent numeric DEFAULT 6);
CREATE TABLE sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,status text,payment_gateway text,payment_environment text,sale_origin text,expected_ticket_count integer,platform_fee_status text,platform_fee_amount numeric,platform_fee_total numeric,platform_net_amount numeric,split_snapshot_platform_fee_total numeric,split_snapshot_socio_fee_amount numeric,split_snapshot_platform_net_amount numeric,split_snapshot_source text,split_snapshot_captured_at timestamptz,platform_fee_paid_at timestamptz,payment_confirmed_at timestamptz,reservation_expires_at timestamptz,event_id uuid,trip_id uuid,boarding_location_id uuid,customer_name text,customer_cpf text,customer_phone text,quantity integer,unit_price numeric,gross_amount numeric,representative_id uuid,seller_id uuid,benefit_total_discount numeric);
CREATE TABLE representatives(id uuid PRIMARY KEY);
CREATE TABLE user_roles(user_id uuid,role text,company_id uuid);
CREATE TABLE representative_commissions(company_id uuid,representative_id uuid,sale_id uuid UNIQUE,payment_environment text,base_amount numeric,commission_percent numeric(5,2) CHECK(commission_percent>=0 AND commission_percent<=100),commission_amount numeric,status text,blocked_reason text);
CREATE TABLE payment_attempts(sale_id uuid,gateway text,last_queried_at timestamptz);
INSERT INTO companies(id) VALUES('${c}');
INSERT INTO sales(id,company_id,status,payment_gateway,payment_environment,sale_origin) VALUES('${sale}','${c}','reservado','asaas','sandbox','admin_manual');`);
sql(readFileSync('drizzle/migrations/0003_manual_fee_operations.sql','utf8'));
sql(`INSERT INTO platform_fee_operations(id,sale_id,company_id,gateway,environment,issuer_account_id,amount_cents,reference,idempotency_key,snapshot) VALUES('${op}','${sale}','${c}','asaas','sandbox','issuer',6000,'platform_fee_${sale}','key','{}');`);
let n=0;const test=(name,f)=>{f();n++;console.log('PASS',name);};
test('private operations denied to anon',()=>assert.throws(()=>sql('SET ROLE anon; SELECT * FROM platform_fee_operations;')));
test('authenticated cannot create or edit operations',()=>assert.throws(()=>sql("SET ROLE authenticated; UPDATE platform_fee_operations SET amount_cents=1;")));
test('context and amount immutable',()=>assert.throws(()=>sql('UPDATE platform_fee_operations SET amount_cents=100000;')));
const claims=await Promise.all([parallel(`SELECT claim_manual_fee_creation('${op}');`),parallel(`SELECT claim_manual_fee_creation('${op}');`)]);assert.deepEqual(claims.sort(),['f','t']);n++;console.log('PASS one creation owner across real connections');
test('crashed creator cannot claim another POST',()=>assert.equal(sql(`SELECT claim_manual_fee_creation('${op}');`),'f'));
test('wrong company rejected',()=>assert.throws(()=>sql(`INSERT INTO platform_fee_operations(sale_id,company_id,gateway,environment,issuer_account_id,amount_cents,reference,idempotency_key,snapshot) VALUES('${sale}','${sale}','asaas','sandbox','issuer',6000,'other','other','{}');`)));

if(existsSync('drizzle/migrations/0004_atomic_manual_sales.sql')) {
 sql(`CREATE TABLE sale_passengers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sale_id uuid REFERENCES sales(id),company_id uuid,trip_id uuid,seat_id uuid,seat_label text,passenger_name text,passenger_cpf text,passenger_phone text,sort_order integer DEFAULT 0,ticket_type_id uuid,ticket_type_name text,ticket_type_price numeric,benefit_program_id uuid,benefit_program_name text,benefit_type text,benefit_value numeric,original_price numeric,discount_amount numeric,final_price numeric,benefit_applied boolean,pricing_rule_version text);
 CREATE TABLE tickets(LIKE sale_passengers INCLUDING DEFAULTS); ALTER TABLE tickets ADD PRIMARY KEY(id); ALTER TABLE tickets ADD UNIQUE(trip_id,seat_id);`);
 sql(`CREATE TABLE events(id uuid PRIMARY KEY,status text); CREATE TABLE trips(id uuid PRIMARY KEY,company_id uuid,vehicle_id uuid); CREATE TABLE seats(id uuid PRIMARY KEY,company_id uuid,vehicle_id uuid,label text); CREATE TABLE seat_locks(trip_id uuid,company_id uuid,seat_id uuid,expires_at timestamptz,sale_id uuid);
 CREATE TABLE representative_company_links(company_id uuid,representative_id uuid,linked_at timestamptz DEFAULT now());
 INSERT INTO events VALUES('${trip}','a_venda'); INSERT INTO trips VALUES('${trip}','${c}','${c}');
 INSERT INTO seats VALUES('00000000-0000-0000-0000-000000000098','${c}','${c}','53'),('00000000-0000-0000-0000-000000000099','${c}','${c}','54');`);
 const repSql=readFileSync('supabase/migrations/20261106090000_create_representatives_phase1_base.sql','utf8');
 sql(repSql.slice(repSql.indexOf('CREATE OR REPLACE FUNCTION public.set_sale_representative_snapshot'),repSql.indexOf('CREATE OR REPLACE FUNCTION public.upsert_representative_commission_for_sale')));
 const physical=readFileSync('supabase/migrations/20260521001243_efe8ea20-14c3-416d-83e5-e499f072d44d.sql','utf8');
 sql(physical.slice(physical.indexOf('CREATE OR REPLACE FUNCTION public.resolve_trip_physical_seat_id'),physical.indexOf('CREATE OR REPLACE FUNCTION public.get_trip_seat_occupancy')));
 sql(physical.slice(physical.indexOf('CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_ticket'),physical.indexOf('CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_lock')));
 sql(physical.slice(physical.indexOf('CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_sale_passenger')));
 sql(`CREATE TRIGGER trg_assert_physical_seat_available_for_ticket BEFORE INSERT OR UPDATE OF trip_id,seat_id,sale_id,company_id ON tickets FOR EACH ROW EXECUTE FUNCTION assert_physical_seat_available_for_ticket();`);
 sql(readFileSync('drizzle/migrations/0002_recover_partial_ticket_issuance.sql','utf8'));
 sql(readFileSync('drizzle/migrations/0004_atomic_manual_sales.sql','utf8'));
 if(existsSync('drizzle/migrations/0005_manual_fee_ledger_and_recovery.sql'))sql(readFileSync('drizzle/migrations/0005_manual_fee_ledger_and_recovery.sql','utf8'));
 if(existsSync('drizzle/migrations/0006_manual_fee_pilot_guards.sql'))sql(readFileSync('drizzle/migrations/0006_manual_fee_pilot_guards.sql','utf8'));
 sql(`UPDATE companies SET manual_fee_flow_enabled=true;`);
 const saleBody={company_id:c,event_id:trip,trip_id:trip,boarding_location_id:trip,customer_name:'Test',customer_cpf:'12345678901',quantity:2,unit_price:100,gross_amount:200,benefit_total_discount:0,payment_gateway:'asaas',payment_environment:'sandbox',reservation_expires_at:'2030-01-01T00:00:00Z'};
 const item=(id,label)=>({id,sale_id:sale,company_id:c,trip_id:trip,seat_id:null,seat_label:label,passenger_name:'Test',passenger_cpf:'12345678901',passenger_phone:'',sort_order:0,ticket_type_id:null,ticket_type_name:null,ticket_type_price:null,benefit_program_id:null,benefit_program_name:null,benefit_type:null,benefit_value:null,original_price:100,discount_amount:0,final_price:100,benefit_applied:false,pricing_rule_version:'beneficio_checkout_v1'});
 const items=[item('00000000-0000-0000-0000-000000000010','A'),item('00000000-0000-0000-0000-000000000011','B')];
 const operation={gateway:'asaas',environment:'sandbox',issuer_account_id:'issuer',amount_cents:1200,snapshot:{allocations:[{kind:'marketplace',beneficiary_id:'issuer',destination:'issuer',amount_cents:1200}]}};
 const key='00000000-0000-0000-0000-000000000020';
 const register=(ps=items,k=key)=>`SELECT register_manual_sale('${k}','hash','${c}','${JSON.stringify(saleBody)}','${JSON.stringify(ps)}','${JSON.stringify(operation)}');`;
 const registered=sql(register());
 test('registration retry keeps sale and complete staging',()=>{assert.equal(sql(register()),registered);assert.equal(sql(`SELECT count(*) FROM sale_passengers WHERE sale_id='${registered}'`),'2');});
 test('invalid second item rolls back sale and first item',()=>{const broken=[{...items[0],id:'00000000-0000-0000-0000-000000000012'},{...items[1],id:'not-a-uuid'}];assert.throws(()=>sql(register(broken,'00000000-0000-0000-0000-000000000021')));assert.equal(sql('SELECT count(*) FROM manual_sale_requests'),'1');});
 const registeredOp=sql(`SELECT id FROM platform_fee_operations WHERE sale_id='${registered}'`);
 test('unpaid sale cannot issue',()=>assert.throws(()=>sql(`SELECT finalize_manual_sale('${registeredOp}');`)));
 sql(`UPDATE platform_fee_operations SET state='confirmed',external_id='fee_1',confirmed_at=now() WHERE id='${registeredOp}';`);
 test('staging tamper fails closed and paid proof remains',()=>{if(existsSync('drizzle/migrations/0005_manual_fee_ledger_and_recovery.sql'))sql(`SELECT record_manual_fee_allocations('${registeredOp}');`);sql(`UPDATE sale_passengers SET final_price=999 WHERE sale_id='${registered}' AND seat_label='A';`);assert.throws(()=>sql(`SELECT finalize_manual_sale('${registeredOp}');`));assert.equal(sql(`SELECT status FROM sales WHERE id='${registered}'`),'reservado');assert.equal(sql(`SELECT state FROM platform_fee_operations WHERE id='${registeredOp}'`),'confirmed');sql(`UPDATE sale_passengers SET final_price=100 WHERE sale_id='${registered}' AND seat_label='A';`);});
 const results=await Promise.all([parallel(`SELECT finalize_manual_sale('${registeredOp}');`),parallel(`SELECT finalize_manual_sale('${registeredOp}');`)]);
 assert.deepEqual(results.sort(),['created','skipped_existing']);n++;console.log('PASS atomic concurrent release: exactly two tickets');
 assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${registered}'`),'2');
 assert.equal(sql(`SELECT status FROM sales WHERE id='${registered}'`),'pago');
 if(existsSync('drizzle/migrations/0005_manual_fee_ledger_and_recovery.sql')){
  test('replayed confirmation does not duplicate financial allocations',()=>{sql(`SELECT finalize_manual_sale('${registeredOp}');`);assert.equal(sql(`SELECT count(*) FROM platform_fee_allocations WHERE operation_id='${registeredOp}'`),'1');});
  test('uncertain expired reservation retains seats and evidence',()=>{sql(`UPDATE sales SET reservation_expires_at='2000-01-01' WHERE id='${sale}';`);assert.equal(sql(`SELECT expire_unpaid_manual_sale('${sale}');`),'f');assert.equal(sql(`SELECT status FROM sales WHERE id='${sale}'`),'reservado');});
  test('pending/uncertain cancellation rejected even by a backend writer',()=>assert.throws(()=>sql(`UPDATE sales SET status='cancelado' WHERE id='${sale}';`)));
  test('confirmed complete sales do not starve the recovery queue',()=>assert.equal(sql(`SELECT count(*) FROM manual_fee_recovery_candidates(20) WHERE sale_id='${registered}'`),'0'));
 }

 if(existsSync('drizzle/migrations/0006_manual_fee_pilot_guards.sql')) {
  sql(`GRANT SELECT,INSERT,UPDATE,DELETE ON companies,sales,sale_passengers,tickets TO authenticated,anon;`);
  test('manager company grants cannot activate pilot flags',()=>assert.throws(()=>sql('SET ROLE authenticated; UPDATE companies SET manual_fee_flow_enabled=false;'),/manual_fee_pilot_backend_only/));
  test('private financial RLS is limited to company managers and developer',()=>{
   const manager=randomUUID(),driver=randomUUID();sql(`INSERT INTO user_roles VALUES('${manager}','gerente','${c}'),('${driver}','motorista','${c}');`);
   assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${driver}'; SELECT count(*) FROM platform_fee_operations;`).split('\n').at(-1),'0');
   assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${manager}'; SELECT count(*)>0 FROM platform_fee_operations;`).split('\n').at(-1),'t');
   assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${manager}'; SELECT can_read_manual_fee_company('${randomUUID()}');`).split('\n').at(-1),'f');
  });
  test('clients cannot mark a managed sale paid',()=>assert.throws(()=>sql(`SET ROLE authenticated; UPDATE sales SET status='pago' WHERE id='${sale}';`),/manual_fee_not_confirmed|manual_financial_state_backend_only/));
  test('backend cannot bypass unpaid fee through shared finalization',()=>assert.throws(()=>sql(`UPDATE sales SET status='pago' WHERE id='${sale}';`),/manual_fee_not_confirmed/));
  test('client cannot delete or modify completed managed tickets',()=>{assert.throws(()=>sql(`SET ROLE authenticated; DELETE FROM tickets WHERE sale_id='${registered}';`),/manual_ticket_backend_only/);assert.throws(()=>sql(`SET ROLE authenticated; UPDATE tickets SET passenger_name='Changed' WHERE sale_id='${registered}';`),/manual_ticket_backend_only/);});
  const createScenario=(ps,fee=operation,extra={})=>{
   const id=sql(`SELECT register_manual_sale('${randomUUID()}','hash','${c}','${JSON.stringify({...saleBody,...extra,quantity:ps.length})}','${JSON.stringify(ps)}','${JSON.stringify(fee)}');`);
   const oid=sql(`SELECT id FROM platform_fee_operations WHERE sale_id='${id}'`);return {id,oid};
  };
  const confirm=oid=>sql(`UPDATE platform_fee_operations SET state='confirmed',confirmed_at=now(),external_id='synthetic_${oid}' WHERE id='${oid}';`);
  const makeItem=label=>item(randomUUID(),label);
  test('ten expected tickets produce exactly ten tickets and a 60-real fee',()=>{
   const ps=Array.from({length:10},()=>makeItem('SEM-POLTRONA'));
   const row=createScenario(ps,{...operation,amount_cents:6000,snapshot:{allocations:[{kind:'marketplace',beneficiary_id:'issuer',destination:'issuer',amount_cents:6000}]}},{gross_amount:1000});confirm(row.oid);
   assert.equal(sql(`SELECT finalize_manual_sale('${row.oid}');`),'created');
   assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${row.id}'`),'10');
   assert.deepEqual(sql(`SELECT platform_fee_total||','||platform_net_amount FROM sales WHERE id='${row.id}'`).split(',').map(Number),[60,60]);
  });
  test('backend-approved exemption issues all items without a provider charge',()=>{
   const row=createScenario([{...makeItem('EXEMPT'),final_price:0,discount_amount:100,benefit_applied:true}],{...operation,amount_cents:0,snapshot:{allocations:[],exemption_reason:'zero_financial_base'}});
   assert.equal(sql(`SELECT finalize_manual_sale('${row.oid}');`),'created');assert.equal(sql(`SELECT state FROM platform_fee_operations WHERE id='${row.oid}'`),'exempt');assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${row.id}'`),'1');assert.equal(sql(`SELECT count(*) FROM platform_fee_allocations WHERE operation_id='${row.oid}'`),'0');
  });
  const physicalItems=[{...makeItem('53'),seat_id:'00000000-0000-0000-0000-000000000098'},{...makeItem('54'),seat_id:'00000000-0000-0000-0000-000000000099'}];
  const partial=createScenario(physicalItems);confirm(partial.oid);
  // Simulate a paid legacy/interrupted writer with one identified item persisted.
  sql(`UPDATE sales SET status='pago' WHERE id='${partial.id}';`);
  test('client cannot delete recovery staging',()=>assert.throws(()=>sql(`SET ROLE authenticated; DELETE FROM sale_passengers WHERE sale_id='${partial.id}';`),/manual_staging_backend_only/));
  test('backend cannot discard incomplete recovery staging',()=>assert.throws(()=>sql(`DELETE FROM sale_passengers WHERE sale_id='${partial.id}';`),/manual_staging_retention_required/));
  sql(`INSERT INTO tickets(id,sale_passenger_id,sale_id,company_id,trip_id,seat_id,seat_label,passenger_name,passenger_cpf,passenger_phone,sort_order,ticket_type_id,ticket_type_name,ticket_type_price,benefit_program_id,benefit_program_name,benefit_type,benefit_value,original_price,discount_amount,final_price,benefit_applied,pricing_rule_version) SELECT id,id,sale_id,company_id,trip_id,seat_id,seat_label,passenger_name,passenger_cpf,passenger_phone,sort_order,ticket_type_id,ticket_type_name,ticket_type_price,benefit_program_id,benefit_program_name,benefit_type,benefit_value,original_price,discount_amount,final_price,benefit_applied,pricing_rule_version FROM sale_passengers WHERE sale_id='${partial.id}' AND seat_label='53';`);
  const recovered=await Promise.all([parallel(`SELECT finalize_manual_sale('${partial.oid}');`),parallel(`SELECT finalize_manual_sale('${partial.oid}');`)]);
  assert.deepEqual(recovered.sort(),['created','skipped_existing']);assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${partial.id}'`),'2');assert.equal(sql(`SELECT count(*) FROM sale_passengers WHERE sale_id='${partial.id}'`),'0');n++;console.log('PASS real physical BEFORE INSERT trigger and concurrent partial 1/2 -> 2/2');
  test('physical staging reservation conflicts roll back entire registration',()=>{
   assert.throws(()=>createScenario(physicalItems.map(p=>({...p,id:randomUUID()}))),/Assento já ocupado/);
   assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${partial.id}'`),'2');
  });
  test('pending expired physical reservation retains occupation',()=>{
   // A separate trip allows us to test an unpaid reservation independently.
   const otherTrip=randomUUID();sql(`INSERT INTO trips VALUES('${otherTrip}','${c}','${c}');`);
   const row=createScenario([{...makeItem('53'),trip_id:otherTrip,seat_id:'00000000-0000-0000-0000-000000000098'}],operation,{trip_id:otherTrip,reservation_expires_at:'2000-01-01'});
   sql(`SELECT claim_manual_fee_creation('${row.oid}');`);assert.equal(sql(`SELECT expire_unpaid_manual_sale('${row.id}');`),'f');
   assert.throws(()=>createScenario([{...makeItem('53'),trip_id:otherTrip,seat_id:'00000000-0000-0000-0000-000000000098'}],operation,{trip_id:otherTrip}),/Assento já reservado/);
  });
  test('round trip keeps both legitimate items',()=>{
   const ps=[makeItem('VOLTA'),{...makeItem('VOLTA'),trip_id:randomUUID(),final_price:0,original_price:0}];const row=createScenario(ps);confirm(row.oid);sql(`SELECT finalize_manual_sale('${row.oid}');`);assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${row.id}'`),'2');
  });
  test('safely unpaid expiry preserves manifest; late payment never emits',()=>{
   const row=createScenario([makeItem('UNPAID')],operation,{reservation_expires_at:'2000-01-01'});
   assert.equal(sql(`SELECT expire_unpaid_manual_sale('${row.id}');`),'t');assert.equal(sql(`SELECT count(*) FROM sale_passengers WHERE sale_id='${row.id}'`),'1');
   confirm(row.oid);assert.equal(sql(`SELECT finalize_manual_sale('${row.oid}');`),'late_payment_review');assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${row.id}'`),'0');
  });
  test('disabled pilot stops new claims while preserving recovery data',()=>{
   const row=createScenario([makeItem('PAUSED')]);sql('UPDATE companies SET manual_fee_flow_enabled=false;');assert.equal(sql(`SELECT claim_manual_fee_creation('${row.oid}');`),'f');sql('UPDATE companies SET manual_fee_flow_enabled=true;');
  });
  test('financial rights and exact commission survive lack of native settlement',()=>{
   const rep=randomUUID();sql(`INSERT INTO representatives VALUES('${rep}');INSERT INTO representative_company_links(company_id,representative_id) VALUES('${c}','${rep}');`);
   const row=createScenario([makeItem('LEDGER')],{...operation,amount_cents:501,snapshot:{representative_id:rep,allocations:[{kind:'marketplace',beneficiary_id:'issuer',destination:'issuer',amount_cents:335},{kind:'representative',beneficiary_id:rep,destination:'',amount_cents:166}]}});
   confirm(row.oid);sql(`SELECT record_manual_fee_allocations('${row.oid}');SELECT finalize_manual_sale('${row.oid}');SELECT finalize_manual_sale('${row.oid}');`);
   assert.equal(sql(`SELECT amount_cents||','||state FROM platform_fee_allocations WHERE operation_id='${row.oid}' AND kind='representative'`),'166,pending_reconciliation');assert.equal(Number(sql(`SELECT commission_amount FROM representative_commissions WHERE sale_id='${row.id}'`)),1.66);assert.equal(sql(`SELECT status FROM representative_commissions WHERE sale_id='${row.id}'`),'bloqueada');
   assert.equal(sql(`SELECT count(*) FROM representative_commissions WHERE sale_id='${row.id}'`),'1');
   sql('DELETE FROM representative_company_links;');
  });
  test('representative configuration race rolls registration back',()=>{
   const rep=randomUUID();sql(`INSERT INTO representative_company_links(company_id,representative_id) VALUES('${c}','${rep}');`);
   assert.throws(()=>createScenario([makeItem('RACE')]),/manual_sale_decision_changed/);sql('DELETE FROM representative_company_links;');
  });
  test('fee minimum preserves exact commission even above the legacy percentage range',()=>{
   const rep=randomUUID();sql(`INSERT INTO representatives VALUES('${rep}');INSERT INTO representative_company_links(company_id,representative_id) VALUES('${c}','${rep}');`);
   const row=createScenario([{...makeItem('MINIMUM'),original_price:0.01,final_price:0.01}],{...operation,amount_cents:500,snapshot:{representative_id:rep,allocations:[{kind:'marketplace',beneficiary_id:'issuer',destination:'issuer',amount_cents:334},{kind:'representative',beneficiary_id:rep,destination:'',amount_cents:166}]}},{gross_amount:0.01});
   confirm(row.oid);sql(`SELECT finalize_manual_sale('${row.oid}');`);
   assert.equal(Number(sql(`SELECT commission_amount FROM representative_commissions WHERE sale_id='${row.id}'`)),1.66);assert.equal(Number(sql(`SELECT commission_percent FROM representative_commissions WHERE sale_id='${row.id}'`)),100);
   assert.equal(sql(`SELECT evidence->>'percent_field_capped' FROM platform_fee_allocations WHERE operation_id='${row.oid}' AND kind='representative'`),'true');sql('DELETE FROM representative_company_links;');
  });
 }

}
console.log(`${n} database cases passed.`);
