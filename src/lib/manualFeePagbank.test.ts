import {describe,it,expect,vi} from 'vitest';
import {pagbankFeeAdapter} from '../../supabase/functions/_shared/manual-fee/pagbank';
import {authenticateManualPagbankNotification} from '../../supabase/functions/_shared/manual-fee/notification';
import {sha256Hex} from '../../supabase/functions/_shared/pagbank/core';
import type {FeeOperation} from '../../supabase/functions/_shared/manual-fee/contracts';
const op:FeeOperation={id:'op',sale_id:'sale',company_id:'c',gateway:'pagbank',environment:'sandbox',issuer_account_id:'issuer',amount_cents:6000,reference:'platform_fee_sale',idempotency_key:'stable',state:'prepared',external_id:null,snapshot:{customer:{name:'Company',document:'12345678901',email:'company@example.test'},allocations:[]}};
const order={id:'ORDE_SYNTHETIC',reference_id:op.reference,qr_codes:[{amount:{value:6000},text:'synthetic-qr'}]};
const secrets=(name:string)=>name.includes('ACCOUNT_ID')?'issuer':name.includes('TOKEN')?'synthetic-account-token':undefined;
describe('manual PagBank fee adapter',()=>{
 it('creates one fee item with platform token, stable key and no passenger charge',async()=>{
  const request=vi.fn(async(p:any)=>({ok:true,data:p.method==='GET'?{orders:[]}:order}));
  const adapter=pagbankFeeAdapter({environment:'sandbox',accessToken:'synthetic',issuerAccountId:'issuer',notificationUrl:'https://synthetic.test/hook',request:request as any});
  const result=await adapter.create(op);const sent=request.mock.calls.find(c=>c[0].method==='POST')?.[0];
  expect(sent.body.items).toEqual([{reference_id:'smartbus_manual_fee',name:'Taxa SmartBus — venda manual',quantity:1,unit_amount:6000}]);expect(sent.body.qr_codes[0].amount.value).toBe(6000);expect(sent.idempotencyKey).toBe('stable');expect(result.presentation?.pix).toMatchObject({qr_text:'synthetic-qr',amount_cents:6000});
 });
 it('rejects production before any request',async()=>{const request=vi.fn();const adapter=pagbankFeeAdapter({environment:'production',accessToken:'synthetic',issuerAccountId:'issuer',notificationUrl:'x',request:request as any});await expect(adapter.create({...op,environment:'production'})).rejects.toThrow('manual_pagbank_context_rejected');expect(request).not.toHaveBeenCalled();});
 it('PAID requires currency BRL',async()=>{const adapter=pagbankFeeAdapter({environment:'sandbox',accessToken:'synthetic',issuerAccountId:'issuer',notificationUrl:'x',request:async()=>({ok:true,data:{...order,charges:[{status:'PAID',amount:{value:6000,currency:'USD'}}]}}) as any});await expect(adapter.query({...op,external_id:order.id})).rejects.toThrow('manual_fee_currency_mismatch');});
 it('ambiguous reference never chooses an Order',async()=>{const adapter=pagbankFeeAdapter({environment:'sandbox',accessToken:'synthetic',issuerAccountId:'issuer',notificationUrl:'x',request:async()=>({ok:true,data:{orders:[order,order]}}) as any});await expect(adapter.query(op)).rejects.toThrow('manual_fee_reference_ambiguous');});
});
describe('manual platform notification authentication',()=>{
 it('accepts valid signature with one platform account token',async()=>{const raw=JSON.stringify(order);const signature=await sha256Hex(`synthetic-account-token-${raw}`);await expect(authenticateManualPagbankNotification(op,new Request('https://synthetic.test',{headers:{'x-authenticity-token':signature}}),raw,secrets)).resolves.toBeUndefined();});
 it.each(['missing','wrong','modified'])('rejects %s without fallback',async kind=>{const raw=JSON.stringify(order);const signature=await sha256Hex(`synthetic-account-token-${raw}`);const req=new Request('https://synthetic.test',{headers:kind==='missing'?{'x-payload-signature':'synthetic'}:{'x-authenticity-token':kind==='wrong'?'00':signature}});await expect(authenticateManualPagbankNotification(op,req,kind==='modified'?raw+' ':raw,secrets)).rejects.toMatchObject({status:401});});
 it('rejects wrong issuer context',async()=>{await expect(authenticateManualPagbankNotification({...op,issuer_account_id:'other'},new Request('https://synthetic.test'),'{}',secrets)).rejects.toMatchObject({status:401});});
});
