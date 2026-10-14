// @ts-nocheck — Orders API transport is reused; this purpose always belongs to the platform.
import {pagbankRequest} from '../pagbank/client.ts';
import {extractPagbankPixArtifacts} from '../pagbank/core.ts';
import {isValidCustomerEmail} from '../customer-email.ts';
import {ManualFeeError} from './auth.ts';
import {manualFeeProviderDiagnostic,withManualFeeDiagnostic} from './diagnostics.ts';
import type {FeeAdapter,FeeOperation,FeeFacts} from './contracts.ts';
export function pagbankFeeAdapter(params:{environment:string;accessToken:string;issuerAccountId:string;notificationUrl:string;request?:typeof pagbankRequest}):FeeAdapter {
 const request=params.request??pagbankRequest;
 const check=(op:FeeOperation)=>{if(op.gateway!=='pagbank'||params.environment!=='sandbox'||op.environment!=='sandbox'||op.issuer_account_id!==params.issuerAccountId)throw new ManualFeeError('manual_pagbank_context_rejected');};
 const call=(method:'GET'|'POST',path:string,body?:unknown,key?:string)=>request({environment:'sandbox',accessToken:params.accessToken,method,path,body,idempotencyKey:key});
 const diagnostic=(op:FeeOperation,res:any,stage:'POST /orders'|'GET /orders/{id}')=>manualFeeProviderDiagnostic(res,stage,[params.accessToken,op.idempotency_key,op.snapshot.customer.name,op.snapshot.customer.document,op.snapshot.customer.email??'']);
 const responseFacts=(op:FeeOperation,res:any,stage:'POST /orders'|'GET /orders/{id}')=>{
  const observation=diagnostic(op,res,stage);
  try{return {...facts(op,res.data),diagnostic:observation};}
  catch(error){if(error instanceof ManualFeeError)throw withManualFeeDiagnostic(error,observation,'integrity_failure');throw error;}
 };
 const facts=(op:FeeOperation,data:any):FeeFacts=>{
  if((data.charges?.length??0)>1||(data.qr_codes?.length??0)>1)throw new ManualFeeError('manual_fee_order_ambiguous');
  const art=extractPagbankPixArtifacts(data);const charge=data.charges?.[0];const paid=charge?.status==='PAID';
  const amount=charge?.amount??data.qr_codes?.[0]?.amount;
  if((paid&&amount?.currency!=='BRL')||(amount?.currency&&amount.currency!=='BRL'))throw new ManualFeeError('manual_fee_currency_mismatch');
  return {externalId:data.id,reference:data.reference_id,amountCents:amount?.value,currency:'BRL',environment:'sandbox',issuerAccountId:params.issuerAccountId,
   // A canceled Charge alone does not prove that the Order/PIX cannot be paid.
   state:paid?'paid':charge?.status==='CANCELED'?'indeterminate':'pending',rawStatus:art.rawStatus??'WAITING',nativeDestinations:[],
   presentation:{pix:{qr_text:art.qrText,qr_image_url:art.qrImageUrl,expires_at:art.expiresAt,amount_cents:op.amount_cents}}};
 };
 const query=async(op:FeeOperation)=>{
  check(op);
  // Orders supports lookup by Order ID (or charge_id), not by our reference_id.
  // Missing local identity is never proof of absence at the provider. Without
  // a documented replay window and the original request, require reconciliation.
  if(!op.external_id)throw new ManualFeeError('manual_fee_order_id_required');
  const res=await call('GET',`/orders/${encodeURIComponent(op.external_id)}`);
  if(!res.ok||!res.data)throw withManualFeeDiagnostic(new ManualFeeError('manual_fee_query_failed',503),diagnostic(op,res,'GET /orders/{id}'));
  return responseFacts(op,res,'GET /orders/{id}');
 };
 return {query,async create(op){
  check(op);
  if(op.external_id)return query(op);
  // Only the common service's exclusive creation claim permits this first POST.
  // An uncertain operation cannot be made eligible merely by retrying the adapter.
  if(op.state!=='prepared')throw new ManualFeeError('manual_fee_order_id_required');
  if(!op.idempotency_key)throw new ManualFeeError('manual_fee_idempotency_key_missing');
  if(!isValidCustomerEmail(op.snapshot.customer.email))throw new ManualFeeError('company_email_invalid',400);
  const body={reference_id:op.reference,customer:{name:op.snapshot.customer.name,email:op.snapshot.customer.email,tax_id:op.snapshot.customer.document},
   items:[{reference_id:'smartbus_manual_fee',name:'Taxa SmartBus — venda manual',quantity:1,unit_amount:op.amount_cents}],
   qr_codes:[{amount:{value:op.amount_cents},expiration_date:new Date(Date.now()+86400000).toISOString()}],notification_urls:[params.notificationUrl]};
  // The entire fee goes technically to the platform; third-party rights stay in the common ledger.
  const res=await call('POST','/orders',body,op.idempotency_key);
  if(!res.ok&&!res.indeterminate&&[400,401,403,422].includes(res.status)&&!res.data?.id)
   throw withManualFeeDiagnostic(new ManualFeeError('manual_fee_create_rejected',422),diagnostic(op,res,'POST /orders'));
  if(!res.ok||!res.data)throw withManualFeeDiagnostic(new ManualFeeError('manual_fee_create_unresolved',503),diagnostic(op,res,'POST /orders'));
  // Persist a validated Order identity even if its QR text is not available yet.
  // The same operation can then recover it by GET without another POST.
  return responseFacts(op,res,'POST /orders');
 }};
}
