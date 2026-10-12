// @ts-nocheck — existing service-role resolvers.
import {computeProgressiveFeeForPassengers,distributePlatformFee} from '../platform-fee-engine.ts';
import {resolveManualBeneficiaries} from './beneficiaries.ts';
import {getAsaasWalletSecretName} from '../runtime-env.ts';
import {isValidCustomerEmail} from '../customer-email.ts';
import {ManualFeeError} from './auth.ts';
export async function prepareManualFeeDecision(db:any,company:any,environment:'sandbox'|'production',prices:number[],representativeId:string|null,getSecret:(name:string)=>string|undefined) {
 const engine=computeProgressiveFeeForPassengers(prices);
 const amountCents=Number(company.platform_fee_percent??0)>0?Math.round(engine.totalFee*100):0;
 const gateway=company.payment_gateway;
 if(!['asaas','pagbank'].includes(gateway))throw new ManualFeeError('manual_gateway_unsupported');
 if(gateway==='pagbank'&&(environment!=='sandbox'||!company.manual_fee_pagbank_sandbox_enabled))throw new ManualFeeError('manual_pagbank_not_enabled');
 if(!amountCents)return {gateway,environment,issuer_account_id:'exempt',amount_cents:0,snapshot:{engine,is_exempt:true,exemption_reason:Number(company.platform_fee_percent??0)>0?'zero_financial_base':'company_platform_fee_disabled',allocations:[],customer:{name:company.name,document:''}}};
 const parties=await resolveManualBeneficiaries(db,company.id,environment,gateway,representativeId);
 const issuer=gateway==='asaas'?getSecret(getAsaasWalletSecretName(environment)):getSecret(`PAGBANK_MARKETPLACE_ACCOUNT_ID_${environment.toUpperCase()}`);
 if(!issuer)throw new ManualFeeError('manual_platform_issuer_missing');
 const distribution=distributePlatformFee({totalFee:amountCents/100,socioEligible:Boolean(parties.socio),representativeEligible:Boolean(parties.representative)});
 const allocations=[{kind:'marketplace',beneficiary_id:issuer,destination:issuer,amount_cents:Math.round(distribution.platformAmount*100)}];
 if(parties.socio)allocations.push({kind:'socio',beneficiary_id:parties.socio.id,destination:parties.socio.destination,amount_cents:Math.round(distribution.socioAmount*100)});
 if(parties.representative)allocations.push({kind:'representative',beneficiary_id:parties.representative.id,destination:parties.representative.destination,amount_cents:Math.round(distribution.representativeAmount*100)});
 if(gateway==='pagbank'&&!isValidCustomerEmail(company.email))throw new ManualFeeError('company_email_invalid',400);
 const document=String(company.document_number||company.cnpj||'').replace(/\D/g,'');
 if(!/^\d{11}(\d{3})?$/.test(document))throw new ManualFeeError('company_document_invalid',400);
 return {gateway,environment,issuer_account_id:issuer,amount_cents:amountCents,snapshot:{engine,is_exempt:false,distribution,allocations,customer:{name:company.name,document,email:company.email??undefined}}};
}
