// @ts-nocheck — provider SDK data.
import { ManualFeeError } from './auth.ts';
import type { FeeAdapter,FeeOperation,FeeFacts } from './contracts.ts';
import { isExplicitAsaasSplitRejection } from '../asaas-split-continuity.ts';

export function asaasFeeAdapter(params:{baseUrl:string;apiKey:string;issuerAccountId:string;environment:string;fetch?:typeof fetch}):FeeAdapter {
 const request=params.fetch??fetch;
 const headers={'Content-Type':'application/json',access_token:params.apiKey};
 const call=async(path:string,body?:unknown)=>{
  const res=await request(params.baseUrl+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json().catch(()=>null);return {res,data};
 };
 let issuerCheck:Promise<void>|undefined;
 const check=async(op:FeeOperation)=>{
  if(op.environment!==params.environment||op.issuer_account_id!==params.issuerAccountId)throw new ManualFeeError('manual_fee_issuer_mismatch');
  issuerCheck??=(async()=>{const wallets=await call('/wallets/');
   const rows=Array.isArray(wallets.data)?wallets.data:wallets.data?.data;
   if(!wallets.res.ok||!Array.isArray(rows)||!rows.some((r:any)=>(r.id??r.walletId)===params.issuerAccountId))throw new ManualFeeError('manual_fee_issuer_unverified',503);
  })();await issuerCheck;
 };
 const facts=(op:FeeOperation,data:any,sent?:string[]):FeeFacts=>({ // provider SDK data is validated at the boundary
  externalId:data.id, reference:data.externalReference, amountCents:Math.round(Number(data.value)*100), currency:'BRL',
  issuerAccountId:params.issuerAccountId, environment:params.environment,
  state:['CONFIRMED','RECEIVED','RECEIVED_IN_CASH'].includes(data.status)?'paid':data.deleted===true||['CANCELLED','DELETED'].includes(data.status)?'terminal':'pending',
  rawStatus:data.status??'UNKNOWN', presentation:{url:data.invoiceUrl??null},
  nativeDestinations:sent??(Array.isArray(data.split)?data.split.map((s:any)=>s.walletId):[]),
 });
 const query=async(op:FeeOperation)=>{
  await check(op);
  const {res,data}=await call(op.external_id?`/payments/${encodeURIComponent(op.external_id)}`:`/payments?externalReference=${encodeURIComponent(op.reference)}&limit=100`);
  if(!res.ok||!data)throw new ManualFeeError('manual_fee_query_failed',503);
  if(op.external_id)return facts(op,data);
  if(!Array.isArray(data.data)||data.hasMore||data.data.length>1)throw new ManualFeeError('manual_fee_reference_ambiguous');
  return data.data.length?facts(op,data.data[0]):null;
 };
 return {query,async create(op){
  await check(op);
  const prior=await query(op);if(prior)return prior;
  const customer=op.snapshot.customer;
  if(!/^\d{11}(\d{3})?$/.test(customer.document))throw new ManualFeeError('company_document_invalid',400);
  const search=await call(`/customers?cpfCnpj=${customer.document}&limit=2`);
  if(!search.res.ok||!Array.isArray(search.data?.data)||search.data.data.length>1)throw new ManualFeeError('manual_fee_customer_unresolved');
  let customerId=search.data.data[0]?.id;
  if(!customerId){const created=await call('/customers',{name:customer.name,cpfCnpj:customer.document,email:customer.email,notificationDisabled:true,externalReference:`company_${op.company_id}`});
   if(!created.res.ok||!created.data?.id)throw new ManualFeeError('manual_fee_customer_failed');customerId=created.data.id;}
  const split=op.snapshot.allocations.filter(a=>a.kind!=='marketplace'&&a.destination&&a.amount_cents>0&&a.destination!==params.issuerAccountId).map(a=>({walletId:a.destination,fixedValue:a.amount_cents/100}));
  const payload={customer:customerId,billingType:'PIX',value:op.amount_cents/100,dueDate:new Date(Date.now()+86400000).toISOString().slice(0,10),externalReference:op.reference,description:'Taxa SmartBus — venda manual',...(split.length?{split}:{})};
  let created=await call('/payments',payload);let destinations=split.map(s=>s.walletId);
  // Only an explicit provider rejection permits this same-worker no-split retry.
  // An ambiguous/network failure never authorizes another POST.
  if(!created.res.ok&&split.length&&isExplicitAsaasSplitRejection(created.res.status,created.data)){
   const recovered=await query(op);if(recovered)return recovered;
   const {split:_split,...without}=payload;created=await call('/payments',without);destinations=[];
  }
  if(!created.res.ok||!created.data?.id)throw new ManualFeeError('manual_fee_create_unresolved',503);
  return facts(op,created.data,destinations);
 }};
}
