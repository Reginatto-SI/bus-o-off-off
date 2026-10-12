// @ts-nocheck — Deno service-role orchestration; adapters have an injected transport.
import {ManualFeeError} from './auth.ts';
import {asaasFeeAdapter} from './asaas.ts';
import {pagbankFeeAdapter} from './pagbank.ts';
import {synchronizeManualFee} from './service.ts';
import {resolvePaymentContext} from '../payment-context-resolver.ts';
import {logSaleOperationalEvent} from '../payment-observability.ts';
export async function readManualFeeOperation(db:any,sale:any) {
 const found=await db.from('platform_fee_operations').select('*').eq('sale_id',sale.id).eq('company_id',sale.company_id).maybeSingle();
 if(found.error)throw new ManualFeeError('manual_fee_read_failed',503);
 return found.data;
}
export function adapterForManualFee(op:any,getSecret:(name:string)=>string|undefined) {
 if(op.gateway==='pagbank'){
  const issuer=getSecret('PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX'),token=getSecret('PAGBANK_SMARTBUS_TOKEN_SANDBOX');
  const base=getSecret('SUPABASE_URL');
  if(op.environment!=='sandbox'||issuer!==op.issuer_account_id||!token||!base)throw new ManualFeeError('manual_pagbank_issuer_unavailable',503);
  return pagbankFeeAdapter({environment:'sandbox',accessToken:token,issuerAccountId:issuer,notificationUrl:base+'/functions/v1/pagbank-webhook'});
 }
 if(op.gateway!=='asaas')throw new ManualFeeError('manual_gateway_not_implemented');
 const context=resolvePaymentContext({mode:'platform_fee',sale:{payment_environment:op.environment}});
 const issuer=getSecret(context.platformWalletSecretName);
 if(!context.apiKey||issuer!==op.issuer_account_id)throw new ManualFeeError('manual_fee_issuer_unavailable',503);
 return asaasFeeAdapter({baseUrl:context.baseUrl,apiKey:context.apiKey,issuerAccountId:issuer,environment:op.environment});
}
export async function handleManualFeeOperation(db:any,sale:any,op:any,allowCreate:boolean,getSecret:(name:string)=>string|undefined) {
 const persisted=await readManualFeeOperation(db,sale);if(!persisted||persisted.id!==op.id)throw new ManualFeeError('manual_fee_operation_missing');op=persisted;
 const tick=await db.from('platform_fee_operations').update({last_queried_at:new Date().toISOString()}).eq('id',op.id);
 if(tick.error)throw new ManualFeeError('manual_fee_persistence_failed',503);
 let result={operation:op,paid:['confirmed','exempt'].includes(op.state)};
 if(!result.paid){
  if(op.state==='prepared'&&!allowCreate)return {operation:op,paid:false,finalized:false};
  if(allowCreate){const config=await db.from('companies').select('manual_fee_flow_enabled').eq('id',sale.company_id).single();if(config.error||!config.data.manual_fee_flow_enabled)allowCreate=false;}
  result=await synchronizeManualFee(db,op,adapterForManualFee(op,getSecret),allowCreate);
 }
 if(!result.paid)return {...result,finalized:false};
 const ledger=await db.rpc('record_manual_fee_allocations',{p_operation_id:op.id});
 if(ledger.error)throw new ManualFeeError('manual_fee_ledger_incomplete');
 const finalized=await db.rpc('finalize_manual_sale',{p_operation_id:op.id});
 if(finalized.error){await logSaleOperationalEvent({supabaseAdmin:db,saleId:sale.id,companyId:sale.company_id,action:'manual_fee_paid_issuance_incomplete',source:'verify-payment-status',result:'error',errorCode:'manual_issuance_incomplete',paymentEnvironment:op.environment});throw new ManualFeeError('manual_issuance_incomplete');}
 if(finalized.data==='late_payment_review'){
  await db.from('platform_fee_operations').update({review_required:true}).eq('id',op.id);
  await logSaleOperationalEvent({supabaseAdmin:db,saleId:sale.id,companyId:sale.company_id,action:'manual_fee_late_payment_review',source:'verify-payment-status',result:'warning',paymentEnvironment:op.environment});
  throw new ManualFeeError('manual_late_payment_review');
 }
 return {...result,finalized:true};
}
export async function recoverManualFees(db:any,getSecret:(name:string)=>string|undefined,log:(entry:any)=>void,limit=20) {
 const candidates=await db.rpc('manual_fee_recovery_candidates',{p_limit:limit});
 if(candidates.error){log({stage:'manual_fee_recovery',reason:'candidates_unavailable'});return;}
 for(const row of candidates.data??[]){try{
  const saleRes=await db.from('sales').select('id,company_id,status').eq('id',row.sale_id).single();if(saleRes.error)throw new ManualFeeError('manual_sale_read_failed');
  const op=await readManualFeeOperation(db,saleRes.data);const r=await handleManualFeeOperation(db,saleRes.data,op,false,getSecret);
  if(!r.paid&&(r.operation.state==='prepared'||r.operation.state==='terminal'))await db.rpc('expire_unpaid_manual_sale',{p_sale_id:row.sale_id});
  log({stage:'manual_fee_recovery',sale_id:row.sale_id,result:r.finalized?'finalized':'preserved'});
 }catch(error){log({stage:'manual_fee_recovery',sale_id:row.sale_id,reason:error instanceof ManualFeeError?error.code:'reconciliation_failed'});}}
}
