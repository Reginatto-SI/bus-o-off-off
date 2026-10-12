// @ts-nocheck — Orders API transport is reused; this purpose always belongs to the platform.
import {pagbankRequest} from '../pagbank/client.ts';
import {extractPagbankPixArtifacts} from '../pagbank/core.ts';
import {isValidCustomerEmail} from '../customer-email.ts';
import {ManualFeeError} from './auth.ts';
import type {FeeAdapter,FeeOperation,FeeFacts} from './contracts.ts';
export function pagbankFeeAdapter(params:{environment:string;accessToken:string;issuerAccountId:string;notificationUrl:string;request?:typeof pagbankRequest}):FeeAdapter {
 const request=params.request??pagbankRequest;
 const check=(op:FeeOperation)=>{if(params.environment!=='sandbox'||op.environment!=='sandbox'||op.issuer_account_id!==params.issuerAccountId)throw new ManualFeeError('manual_pagbank_context_rejected');};
 const call=(method:'GET'|'POST',path:string,body?:unknown,key?:string)=>request({environment:'sandbox',accessToken:params.accessToken,method,path,body,idempotencyKey:key});
 const facts=(op:FeeOperation,data:any):FeeFacts=>{
  const art=extractPagbankPixArtifacts(data);const charge=data.charges?.[0];const paid=charge?.status==='PAID';
  if(paid&&charge.amount?.currency!=='BRL')throw new ManualFeeError('manual_fee_currency_mismatch');
  const amount=charge?.amount??data.qr_codes?.[0]?.amount;
  return {externalId:data.id,reference:data.reference_id,amountCents:amount?.value,currency:'BRL',environment:'sandbox',issuerAccountId:params.issuerAccountId,
   state:paid?'paid':charge?.status==='CANCELED'?'terminal':'pending',rawStatus:art.rawStatus??'WAITING',nativeDestinations:[],
   presentation:{pix:{qr_text:art.qrText,qr_image_url:art.qrImageUrl,expires_at:art.expiresAt,amount_cents:op.amount_cents}}};
 };
 const query=async(op:FeeOperation)=>{
  check(op);const res=await call('GET',op.external_id?`/orders/${encodeURIComponent(op.external_id)}`:`/orders?reference_id=${encodeURIComponent(op.reference)}`);
  if(!res.ok||!res.data)throw new ManualFeeError('manual_fee_query_failed',503);
  if(op.external_id)return facts(op,res.data);
  const rows=Array.isArray(res.data)?res.data:res.data.orders;
  if(!Array.isArray(rows)||rows.length>1||res.data.has_more||res.data.links?.some((l:any)=>String(l.rel).toLowerCase()==='next'))throw new ManualFeeError('manual_fee_reference_ambiguous');
  return rows.length?facts(op,rows[0]):null;
 };
 return {query,async create(op){
  check(op);if(!isValidCustomerEmail(op.snapshot.customer.email))throw new ManualFeeError('company_email_invalid',400);
  const prior=await query(op);if(prior)return prior;
  const body={reference_id:op.reference,customer:{name:op.snapshot.customer.name,email:op.snapshot.customer.email,tax_id:op.snapshot.customer.document},
   items:[{reference_id:'smartbus_manual_fee',name:'Taxa SmartBus — venda manual',quantity:1,unit_amount:op.amount_cents}],
   qr_codes:[{amount:{value:op.amount_cents},expiration_date:new Date(Date.now()+86400000).toISOString()}],notification_urls:[params.notificationUrl]};
  // The entire fee goes technically to the platform; third-party rights stay in the common ledger.
  const res=await call('POST','/orders',body,op.idempotency_key);
  if(!res.ok||!res.data)throw new ManualFeeError('manual_fee_create_unresolved',503);
  const result=facts(op,res.data);if(result.state!=='paid'&&!result.presentation?.pix?.qr_text)throw new ManualFeeError('manual_fee_pix_missing',503);
  return result;
 }};
}
