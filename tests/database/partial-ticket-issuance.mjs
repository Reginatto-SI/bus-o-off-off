// Isolated PostgreSQL only. Never point this harness at an application database.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const container = process.env.TICKET_TEST_CONTAINER;
if (!container || !container.startsWith('smartbus-ticket-test-')) throw Error('Use a dedicated smartbus-ticket-test-* container');
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync('docker', args, {input:text, encoding:'utf8'}).trim();
const asyncSql = text => new Promise((resolve,reject) => {
 const p=spawn('docker',args); let out='',err='';
 p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
 p.on('close',c=>c ? reject(Error(err)):resolve(out.trim())); p.stdin.end(text);
});
const sale='00000000-0000-0000-0000-000000000001', company='00000000-0000-0000-0000-000000000002';
sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE sales(id uuid PRIMARY KEY, company_id uuid, status text, payment_gateway text, payment_confirmed_at timestamptz,event_id uuid);
CREATE TABLE events(id uuid PRIMARY KEY,status text);
CREATE TABLE trips(id uuid PRIMARY KEY,company_id uuid,vehicle_id uuid);
CREATE TABLE seats(id uuid PRIMARY KEY,company_id uuid,vehicle_id uuid,label text);
CREATE TABLE seat_locks(trip_id uuid,company_id uuid,seat_id uuid,expires_at timestamptz,sale_id uuid);
CREATE TABLE payment_attempts(sale_id uuid,gateway text,last_queried_at timestamptz);
CREATE TABLE sale_passengers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sale_id uuid REFERENCES sales(id),company_id uuid,trip_id uuid,seat_id uuid,seat_label text,passenger_name text,passenger_cpf text,passenger_phone text,sort_order integer DEFAULT 0,ticket_type_id uuid,ticket_type_name text,ticket_type_price numeric,benefit_program_id uuid,benefit_program_name text,benefit_type text,benefit_value numeric,original_price numeric,discount_amount numeric,final_price numeric,benefit_applied boolean,pricing_rule_version text);
CREATE TABLE tickets(LIKE sale_passengers INCLUDING DEFAULTS);
ALTER TABLE tickets ADD PRIMARY KEY(id);
ALTER TABLE tickets ADD UNIQUE(trip_id,seat_id);
CREATE UNIQUE INDEX tickets_unique_sale_trip_passenger_label ON tickets(sale_id,trip_id,passenger_cpf,seat_label);
`);
sql(readFileSync('drizzle/migrations/0002_recover_partial_ticket_issuance.sql','utf8'));
// Use the exact physical resolver and trigger function from the repository migration.
const physical = readFileSync('supabase/migrations/20260521001243_efe8ea20-14c3-416d-83e5-e499f072d44d.sql','utf8');
sql(physical.slice(physical.indexOf('CREATE OR REPLACE FUNCTION public.resolve_trip_physical_seat_id'),physical.indexOf('CREATE OR REPLACE FUNCTION public.get_trip_seat_occupancy')));
sql(physical.slice(physical.indexOf('CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_ticket'),physical.indexOf('CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_lock')));
sql(`CREATE TRIGGER trg_assert_physical_seat_available_for_ticket
 BEFORE INSERT OR UPDATE OF trip_id,seat_id,sale_id,company_id ON tickets
 FOR EACH ROW EXECUTE FUNCTION assert_physical_seat_available_for_ticket();
 INSERT INTO trips VALUES('00000000-0000-0000-0000-000000000003','${company}','00000000-0000-0000-0000-000000000050');
 INSERT INTO seats VALUES('00000000-0000-0000-0000-000000000099','${company}','00000000-0000-0000-0000-000000000050','53'),
 ('00000000-0000-0000-0000-000000000098','${company}','00000000-0000-0000-0000-000000000050','54');`);

const basePolicies=readFileSync('supabase/migrations/20260210003929_ecaa7fae-bc1c-4dfe-8347-690b42328e3a.sql','utf8');
sql(`INSERT INTO events VALUES('00000000-0000-0000-0000-000000000060','a_venda');
 ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 GRANT SELECT ON sales,events,tickets,sale_passengers TO anon,authenticated;
 GRANT INSERT ON tickets TO anon,authenticated;`);
sql(basePolicies.slice(basePolicies.indexOf('CREATE POLICY "Public can create tickets"'),basePolicies.indexOf('CREATE POLICY "Public can view tickets"')));
const reset = () => sql(`TRUNCATE tickets,sale_passengers,sales; INSERT INTO sales(id,company_id,status,payment_gateway) VALUES('${sale}','${company}','pago','pagbank'); UPDATE sales SET event_id='00000000-0000-0000-0000-000000000060';`);
const item = (n,{trip=3,label='SEM-POLTRONA',cpf='synthetic',seat='NULL'}={}) => sql(`INSERT INTO sale_passengers(id,sale_id,company_id,trip_id,seat_id,seat_label,passenger_name,passenger_cpf,final_price,sort_order) VALUES('00000000-0000-0000-0000-${String(n).padStart(12,'0')}','${sale}','${company}','00000000-0000-0000-0000-${String(trip).padStart(12,'0')}',${seat},'${label}','Teste','${cpf}',100,${n});`);
const issue = `SELECT issue_sale_tickets_from_staging('${sale}','${company}');`;
const counts = () => sql(`SELECT (SELECT count(*) FROM tickets)||','||(SELECT count(*) FROM sale_passengers)||','||(SELECT expected_ticket_count FROM sales);`);
let cases=0;
function test(name,fn) {fn(); cases++; console.log('PASS',name);}
const physicalItems = () => {item(10,{label:'53',seat:"'00000000-0000-0000-0000-000000000099'"});item(11,{label:'54',seat:"'00000000-0000-0000-0000-000000000098'"});};
const legacyFirst = () => sql(`INSERT INTO tickets SELECT * FROM sale_passengers WHERE seat_label='53';`);
const before = execFileSync('git',['show','4f005ad8:drizzle/migrations/0002_recover_partial_ticket_issuance.sql'],{encoding:'utf8'});
sql(before.slice(before.indexOf('CREATE OR REPLACE FUNCTION public.issue_sale_tickets_from_staging'),before.indexOf('REVOKE ALL ON FUNCTION public.issue_sale_tickets_from_staging')).replace('public.issue_sale_tickets_from_staging','public.issue_sale_tickets_before_refinement'));
test('reproduces pre-refinement BEFORE INSERT physical collision',()=>{reset();physicalItems();legacyFirst();assert.throws(()=>sql(issue.replace('issue_sale_tickets_from_staging','issue_sale_tickets_before_refinement')),/Assento já ocupado neste trecho/);assert.equal(sql('SELECT count(*) FROM tickets'),'1');assert.equal(sql('SELECT count(*) FROM sale_passengers'),'2');assert.equal(sql('SELECT count(*) FROM tickets WHERE sale_passenger_id IS NOT NULL'),'0');});
test('physical partial recovery inserts only missing seat',()=>{assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');});
test('Asaas physical partial recovery',()=>{reset();physicalItems();legacyFirst();sql("UPDATE sales SET payment_gateway='asaas';");assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');});
test('alternative unlinked insertion cannot duplicate completed item',()=>{assert.throws(()=>sql(`INSERT INTO tickets(sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf) VALUES('${sale}','${company}','00000000-0000-0000-0000-000000000003','OUTRO','Teste','synthetic');`),/ticket_item_identity_required/);assert.equal(counts(),'2,0,2');});
test('legacy no-seat alternative retains old uniqueness',()=>{reset();item(10);sql('INSERT INTO tickets SELECT * FROM sale_passengers;');assert.throws(()=>sql('INSERT INTO tickets SELECT * FROM sale_passengers;'));assert.equal(sql('SELECT count(*) FROM tickets'),'1');});
test('invented linked identity cannot bypass uniqueness',()=>{reset();item(10);assert.throws(()=>sql(`INSERT INTO tickets(sale_passenger_id,sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf) VALUES('${company}','${sale}','${company}','00000000-0000-0000-0000-000000000003','SEM-POLTRONA','Teste','synthetic');`),/ticket_item_identity_mismatch/);assert.equal(sql('SELECT count(*) FROM tickets'),'0');});
test('public alternative insertion preserves duplicate protection under RLS',()=>{reset();item(10);const insert=`INSERT INTO tickets(sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf) VALUES('${sale}','${company}','00000000-0000-0000-0000-000000000003','SEM-POLTRONA','Teste','synthetic');`;sql('SET ROLE anon; '+insert);assert.throws(()=>sql('SET ROLE anon; '+insert),/duplicate key/);assert.equal(sql('SELECT count(*) FROM tickets'),'1');});
test('alternative linked insertion cannot duplicate an unlinked legacy item',()=>{reset();item(10);sql('INSERT INTO tickets SELECT * FROM sale_passengers;');assert.throws(()=>sql(`INSERT INTO tickets(sale_passenger_id,sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf) SELECT id,sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf FROM sale_passengers;`),/ticket_legacy_mapping_required/);assert.equal(sql('SELECT count(*) FROM tickets'),'1');assert.equal(sql('SELECT count(*) FROM sale_passengers'),'1');});
test('RPC permission denied to public roles',()=>{assert.throws(()=>sql('SET ROLE anon; '+issue),/permission denied/);assert.throws(()=>sql('SET ROLE authenticated; '+issue),/permission denied/);});
test('service_role can execute issuance without public table privileges',()=>{reset();item(10);assert.equal(sql('SET ROLE service_role; '+issue),'SET\ncreated');assert.equal(counts(),'1,0,1');});
test('physical divergence preserves partial ticket and rolls back identity binding',()=>{reset();sql(`INSERT INTO sales(id,company_id,status,payment_gateway) VALUES('00000000-0000-0000-0000-000000000070','${company}','pago','asaas'); INSERT INTO tickets(sale_id,company_id,trip_id,seat_id,seat_label,passenger_name,passenger_cpf) VALUES('00000000-0000-0000-0000-000000000070','${company}','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000098','54','Outro','other');`);physicalItems();legacyFirst();assert.throws(()=>sql(issue),/Assento já ocupado/);assert.equal(sql(`SELECT count(*) FROM tickets WHERE sale_id='${sale}'`),'1');assert.equal(sql('SELECT count(*) FROM sale_passengers'),'2');assert.equal(sql('SELECT count(*) FROM tickets WHERE sale_passenger_id IS NOT NULL'),'0');});
test('complete issuance and repeated legitimate no-seat items',()=>{reset();item(10);item(11); assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');});
test('shared issuance also preserves Asaas',()=>{reset();item(10);item(11);sql("UPDATE sales SET payment_gateway='asaas';");assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');});
test('repeat after complete issuance',()=>{assert.equal(sql(issue),'skipped_existing');assert.equal(counts(),'2,0,2');});
test('partial legacy 1/2 recovers only missing ticket',()=>{reset();item(10,{label:'A'});item(11,{label:'B'});sql(`INSERT INTO tickets SELECT * FROM sale_passengers WHERE seat_label='A';`);assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');assert.equal(sql('SELECT count(DISTINCT sale_passenger_id) FROM tickets'),'2');});
test('identified partial repeated items recover missing item only',()=>{reset();item(10);item(11);sql(`INSERT INTO tickets(id,sale_passenger_id,sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf,final_price) SELECT id,id,sale_id,company_id,trip_id,seat_label,passenger_name,passenger_cpf,final_price FROM sale_passengers LIMIT 1;`);assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');});
test('snapshot mismatch preserves recovery data',()=>{reset();item(10,{label:'A'});item(11,{label:'B'});sql(`INSERT INTO tickets SELECT * FROM sale_passengers WHERE seat_label='A'; UPDATE tickets SET final_price=90;`);assert.throws(()=>sql(issue),/ticket_legacy_mapping_ambiguous/);assert.equal(sql('SELECT count(*) FROM sale_passengers'),'2');});
test('round trip same passenger same label',()=>{reset();item(10);item(11,{trip:4});assert.equal(sql(issue),'created');assert.equal(counts(),'2,0,2');});
test('ambiguous historical mapping preserves staging and ticket',()=>{reset();item(10);item(11);sql(`INSERT INTO tickets SELECT * FROM sale_passengers LIMIT 1;`);assert.throws(()=>sql(issue),/ticket_legacy_mapping_ambiguous/);assert.equal(sql('SELECT count(*) FROM sale_passengers'),'2');assert.equal(sql('SELECT count(*) FROM tickets'),'1');});
test('seat conflict rolls back all insertion and retains staging',()=>{reset();item(10,{label:'53',seat:"'00000000-0000-0000-0000-000000000099'"});item(11,{label:'53',seat:"'00000000-0000-0000-0000-000000000099'"});assert.throws(()=>sql(issue));assert.equal(sql('SELECT count(*) FROM tickets'),'0');assert.equal(sql('SELECT count(*) FROM sale_passengers'),'2');});
test('wrong company rejected',()=>{assert.throws(()=>sql(issue.replace(company,sale)),/ticket_sale_not_paid_or_wrong_company/);});
test('unpaid sale rejected',()=>{reset();item(10);sql("UPDATE sales SET status='pendente_pagamento';");assert.throws(()=>sql(issue),/ticket_sale_not_paid_or_wrong_company/);});
test('known manifest without staging fails closed',()=>{reset();sql('UPDATE sales SET expected_ticket_count=2;');assert.throws(()=>sql(issue),/ticket_manifest_missing_or_incomplete/);});
test('paid recovery queue excludes unpaid and Asaas',()=>{reset();item(10);assert.equal(sql('SELECT count(*) FROM pagbank_paid_sales_needing_tickets(20)'),'1');sql("UPDATE sales SET payment_gateway='asaas';");assert.equal(sql('SELECT count(*) FROM pagbank_paid_sales_needing_tickets(20)'),'0');});
reset();physicalItems();legacyFirst();
// Hold the exact transaction lock before starting both real database connections.
const hold=asyncSql(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:${sale}',0)); SELECT pg_sleep(1); COMMIT;`);
await new Promise(r=>setTimeout(r,150));
const result=await Promise.all([asyncSql(issue),asyncSql(issue)]);await hold;
assert.deepEqual(result.sort(),['created','skipped_existing']);assert.equal(counts(),'2,0,2');cases++;
console.log('PASS concurrent real PostgreSQL connections:',result.join(', '));
console.log(`${cases} database scenarios passed; partial 1/2 became 2/2 without duplication.`);
