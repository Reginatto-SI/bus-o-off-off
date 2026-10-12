// @ts-nocheck — existing service-role resolvers.
import {computeProgressiveFeeForPassengers,distributePlatformFee} from '../platform-fee-engine.ts';
import {resolveAsaasSplitRecipients} from '../split-recipients-resolver.ts';
import {resolvePagbankSplitRecipients} from '../pagbank/split-recipients.ts';
import {getAsaasWalletSecretName} from '../runtime-env.ts';
import {ManualFeeError} from './auth.ts';
export async function prepareManualFeeDecision(db:any,company:any,environment:'sandbox'|'production',prices:number[],representativeId:string|null,getSecret:(name:string)=>string|undefined) {
 const engine=computeProgressiveFeeForPassengers(prices);
 const amountCents=Number(company.platform_fee_percent??0)>0?Math.round(engine.totalFee*100):0;
 const gateway=company.payment_gateway;
 if(!['asaas','pagbank'].includes(gateway))throw new ManualFeeError('manual_gateway_unsupported');
 if(gateway==='pagbank'&&(environment!=='sandbox'||!company.manual_fee_pagbank_sandbox_enabled))throw new ManualFeeError('manual_pagbank_not_enabled');
 if(!amountCents)return {gateway,environment,issuer_account_id:'exempt',amount_cents:0,snapshot:{engine,is_exempt:true,allocations:[],customer:{name:company.name,document:''}}};
 let socio=false,representative=false,socioDestination='',representativeDestination='';
 if(gateway==='asaas'){
  const r=await resolveAsaasSplitRecipients({supabaseAdmin:db,source:'create-platform-fee-checkout',saleId:'preparing_manual_sale',companyId:company.id,paymentEnvironment:environment,splitEnabled:true,representativeId});
  if(['query_failed','ambiguous'].includes(r.socio.reason)||['representative_lookup_failed','representative_not_found','representative_company_mismatch'].includes(r.representative.reason))throw new ManualFeeError('manual_beneficiaries_unresolved',503);
  socio=r.socio.included;representative=r.representative.eligible;socioDestination=r.socio.walletId??'';representativeDestination=r.representative.walletId??'';
 }else{
  const r=await resolvePagbankSplitRecipients({supabaseAdmin:db,source:'create-platform-fee-checkout',saleId:'preparing_manual_sale',companyId:company.id,environment,splitEnabled:true,representativeId});
  if(['query_failed','ambiguous'].includes(r.socio.reason)||['query_failed','representative_not_found','representative_company_mismatch'].includes(r.representative.reason))throw new ManualFeeError('manual_beneficiaries_unresolved',503);
  socio=r.socio.eligible;representative=r.representative.eligible;socioDestination=r.socio.accountId??'';representativeDestination=r.representative.accountId??'';
 }
 const issuer=gateway==='asaas'?getSecret(getAsaasWalletSecretName(environment)):getSecret(`PAGBANK_MARKETPLACE_ACCOUNT_ID_${environment.toUpperCase()}`);
 if(!issuer)throw new ManualFeeError('manual_platform_issuer_missing');
 const distribution=distributePlatformFee({totalFee:amountCents/100,socioEligible:socio,representativeEligible:representative});
 const allocations=[{kind:'marketplace',beneficiary_id:issuer,destination:issuer,amount_cents:Math.round(distribution.platformAmount*100)}];
 if(socio)allocations.push({kind:'socio',beneficiary_id:socioDestination,destination:socioDestination,amount_cents:Math.round(distribution.socioAmount*100)});
 if(representative)allocations.push({kind:'representative',beneficiary_id:representativeId,destination:representativeDestination,amount_cents:Math.round(distribution.representativeAmount*100)});
 const document=String(company.document_number||company.cnpj||'').replace(/\D/g,'');
 if(!/^\d{11}(\d{3})?$/.test(document))throw new ManualFeeError('company_document_invalid',400);
 return {gateway,environment,issuer_account_id:issuer,amount_cents:amountCents,snapshot:{engine,is_exempt:false,distribution,allocations,customer:{name:company.name,document,email:company.email??undefined}}};
}
