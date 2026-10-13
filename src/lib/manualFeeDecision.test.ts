import {describe,it,expect} from 'vitest';
import {prepareManualFeeDecision} from '../../supabase/functions/_shared/manual-fee/decision';
function database(socio:boolean,representative:boolean,failed=false,legacyWallet?:string) {
 const rows:any={socios_split:socio?[{id:'s',asaas_wallet_id_sandbox:'00000000-0000-0000-0000-000000000010'}]:legacyWallet?[{id:'s',asaas_wallet_id:legacyWallet}]:[],representative_company_links:[{representative_id:'r',company_id:'c'}],representatives:{id:'r',asaas_wallet_id_sandbox:representative?'00000000-0000-0000-0000-000000000011':null}};
 return {from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='representative_company_links'?rows[table][0]:rows[table],error:null}),then:(r:any)=>Promise.resolve({data:rows[table],error:failed&&table==='socios_split'?{message:'offline'}:null}).then(r)};return q;}};
}
const company={id:'c',name:'Company',email:'company@example.test',document_number:'12345678901',payment_gateway:'asaas',platform_fee_percent:6};
describe('common manual economic decision',()=>{
 it.each([[false,false,60,0,0],[true,false,30,30,0],[false,true,40,0,20],[true,true,20,20,20]])('preserves PRD distribution %s/%s',async(s,r,m,ss,rr)=>{
  const d=await prepareManualFeeDecision(database(s as boolean,r as boolean),company,'sandbox',Array(10).fill(100),r?'r':null,()=> 'issuer');
  expect(d.amount_cents).toBe(6000);expect(d.snapshot.distribution).toMatchObject({platformAmount:m,socioAmount:ss,representativeAmount:rr});expect((d.snapshot.allocations as {amount_cents:number}[]).reduce((n,a)=>n+a.amount_cents,0)).toBe(6000);
 });
 it('absence creates no obligation to absent receivers',async()=>{const d=await prepareManualFeeDecision(database(false,false),company,'sandbox',[100],null,()=> 'issuer');expect(d.snapshot.allocations).toHaveLength(1);expect(d.snapshot.allocations[0].kind).toBe('marketplace');});
 it('invalid legacy wallet is absence, not an eligible entitlement',async()=>{const d=await prepareManualFeeDecision(database(false,false,false,'invalid-legacy-value'),company,'sandbox',[100],null,()=> 'issuer');expect(d.snapshot.allocations).toHaveLength(1);expect(d.snapshot.allocations[0].amount_cents).toBe(600);});
 it('valid unscoped legacy wallet does not grant Sandbox eligibility or block the sale',async()=>{
  const d=await prepareManualFeeDecision(database(false,false,false,'00000000-0000-0000-0000-000000000010'),company,'sandbox',[100],null,()=> 'issuer');
  expect(d.snapshot.distribution).toMatchObject({platformAmount:6,socioAmount:0,representativeAmount:0});
  expect(d.snapshot.allocations).toHaveLength(1);
  expect(d.snapshot.allocations[0]).toMatchObject({kind:'marketplace',amount_cents:600});
 });
 it('query failure does not silently redistribute',async()=>{await expect(prepareManualFeeDecision(database(false,false,true),company,'sandbox',[100],null,()=> 'issuer')).rejects.toThrow('manual_beneficiaries_unresolved');});
 it('exemption does not apply minimum or require gateway secrets',async()=>{const d=await prepareManualFeeDecision(database(false,false),{...company,platform_fee_percent:0},'sandbox',[100],null,()=>undefined);expect(d.amount_cents).toBe(0);expect(d.snapshot.allocations).toEqual([]);});
 it('exemption has a backend-derived audit reason',async()=>{const d=await prepareManualFeeDecision(database(false,false),company,'sandbox',[0],null,()=>undefined);expect(d.snapshot.exemption_reason).toBe('zero_financial_base');});
 it('eligible wallet in same environment remains owed when chosen gateway cannot settle',async()=>{
  const d=await prepareManualFeeDecision(database(true,true),{...company,payment_gateway:'pagbank',manual_fee_pagbank_sandbox_enabled:true},'sandbox',[100],'r',()=> 'issuer');
  expect(d.snapshot.distribution).toMatchObject({platformAmount:2,socioAmount:2,representativeAmount:2});
  expect(d.snapshot.allocations.filter((a:any)=>a.kind!=='marketplace').every((a:any)=>a.destination==='')).toBe(true);
 });
 it('PagBank production remains blocked even for exempt company',async()=>{await expect(prepareManualFeeDecision(database(false,false),{...company,payment_gateway:'pagbank',platform_fee_percent:0,manual_fee_pagbank_sandbox_enabled:true},'production',[100],null,()=> 'issuer')).rejects.toThrow('manual_pagbank_not_enabled');});
});
