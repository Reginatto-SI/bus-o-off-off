// @ts-nocheck — economic eligibility is common, technical destinations are provider-specific.
import {ManualFeeError} from './auth.ts';
export async function resolveManualBeneficiaries(db:any,companyId:string,environment:string,gateway:string,representativeId:string|null) {
 const fields=[`asaas_wallet_id_${environment}`,`pagbank_account_id_${environment}`];
 const destination=(row:any)=>{const value=row?.[gateway==='asaas'?fields[0]:fields[1]];return (gateway==='asaas'?validAsaas(value):validPagbank(value))?String(value).trim():'';};
 const validAsaas=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
 const validPagbank=(v:unknown)=>typeof v==='string'&&/^ACCO_[0-9a-f-]{36}$/i.test(v.trim());
 const eligible=(row:any)=>validAsaas(row?.[fields[0]])||validPagbank(row?.[fields[1]]);
 const socios=await db.from('socios_split').select(`id,asaas_wallet_id,${fields.join(',')}`);
 if(socios.error)throw new ManualFeeError('manual_beneficiaries_unresolved',503);
 if((socios.data??[]).some((r:any)=>r.asaas_wallet_id&&!fields.some(f=>r[f])))throw new ManualFeeError('manual_beneficiaries_environment_unresolved');
 const active=(socios.data??[]).filter(eligible);
 if(active.length>1)throw new ManualFeeError('manual_beneficiaries_ambiguous');
 let representative=null;
 if(representativeId){
  const link=await db.from('representative_company_links').select('representative_id').eq('company_id',companyId).eq('representative_id',representativeId).maybeSingle();
  const person=await db.from('representatives').select(`id,${fields.join(',')}`).eq('id',representativeId).maybeSingle();
  if(link.error||person.error||!link.data||!person.data)throw new ManualFeeError('manual_beneficiaries_unresolved',503);
  if(eligible(person.data))representative=person.data;
 }
 return {socio:active[0]?{id:active[0].id,destination:destination(active[0])}:null,
  representative:representative?{id:representative.id,destination:destination(representative)}:null};
}
