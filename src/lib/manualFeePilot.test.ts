import {describe,it,expect,vi} from 'vitest';
import {manualItemBasePrice} from '../../supabase/functions/_shared/manual-fee/pricing';
import {asaasFeeAdapter} from '../../supabase/functions/_shared/manual-fee/asaas';
import {synchronizeManualFee} from '../../supabase/functions/_shared/manual-fee/service';
import type {FeeOperation} from '../../supabase/functions/_shared/manual-fee/contracts';

const op:FeeOperation={id:'op',company_id:'company',sale_id:'sale',gateway:'asaas',environment:'sandbox',issuer_account_id:'issuer',amount_cents:6000,reference:'platform_fee_sale',idempotency_key:'manual_fee_sale',state:'prepared',external_id:null,snapshot:{customer:{name:'Company',document:'12345678901'},allocations:[{kind:'marketplace',beneficiary_id:'issuer',destination:'issuer',amount_cents:4000},{kind:'socio',beneficiary_id:'socio',destination:'socio_wallet',amount_cents:2000}]}};
describe('manual pilot gates and provider boundaries',()=>{
 it.each([[100,150,120,150],[100,null,120,120],[100,0,120,120],[100,null,null,100],[100,null,0,0]])('preserves admin price precedence %s/%s/%s', (base,type,category,expected)=>expect(manualItemBasePrice(base,type,category)).toBe(expected));
 it.each([NaN,Infinity,-1])('rejects invalid category price %s',price=>expect(()=>manualItemBasePrice(100,null,price)).toThrow('manual_price_invalid'));
 it('confirmed financial proof recovers issuance without another provider call',async()=>{
  const create=vi.fn(),query=vi.fn();const result=await synchronizeManualFee({}, {...op,state:'confirmed',external_id:'paid'}, {create,query},true);
  expect(result.paid).toBe(true);expect(create).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
 });
 function transport(paymentResponse:()=>Response|Promise<Response>,wallet='issuer') {
  return vi.fn(async(url:string,options:any)=>{
   if(url.includes('/wallets/'))return Response.json({data:[{id:wallet}]});
   if(url.includes('/payments?'))return Response.json({data:[],hasMore:false});
   if(url.includes('/customers?'))return Response.json({data:[{id:'customer'}]});
   return paymentResponse();
  });
 }
 const adapter=(fetch:any)=>asaasFeeAdapter({baseUrl:'https://synthetic.test',apiKey:'synthetic-test-only',issuerAccountId:'issuer',environment:'sandbox',fetch});
 it('wallet mismatch blocks all payment requests',async()=>{
  const request=transport(()=>Response.json({}),'other');await expect(adapter(request).create(op)).rejects.toThrow('manual_fee_issuer_unverified');expect(request).toHaveBeenCalledTimes(1);
 });
 it.each(['timeout','server','ambiguous'])('no fallback POST for %s',async failure=>{
  const request=transport(()=>{if(failure==='timeout')throw Error('timeout');return Response.json({errors:[{code:failure==='server'?'invalid_split':'invalid_payment'}]},{status:failure==='server'?500:400});});
  await expect(adapter(request).create(op)).rejects.toThrow();expect(request.mock.calls.filter(([,o])=>o.method==='POST')).toHaveLength(1);
 });
 it('explicit split rejection preserves rights with one accepted no-split charge',async()=>{
  let posts=0;const request=transport(()=>++posts===1?Response.json({errors:[{code:'invalid_split'}]},{status:400}):Response.json({id:'pay_1',externalReference:op.reference,value:60,status:'PENDING'}));
  const result=await adapter(request).create(op);const bodies=request.mock.calls.filter(([,o])=>o.method==='POST').map(([,o])=>JSON.parse(o.body));
  expect(bodies).toHaveLength(2);expect(bodies[0].split).toEqual([{walletId:'socio_wallet',fixedValue:20}]);expect(bodies[1].split).toBeUndefined();expect(bodies[1].value).toBe(60);expect(result.nativeDestinations).toEqual([]);expect(op.snapshot.allocations[1].amount_cents).toBe(2000);
 });
 it('query without split metadata does not erase recorded creation destinations',async()=>{
  const request=transport(()=>Response.json({id:'pay_1',externalReference:op.reference,value:60,status:'RECEIVED'}));
  const result=await adapter(request).query({...op,external_id:'pay_1',presentation:{native_destinations:['socio_wallet']}});expect(result?.nativeDestinations).toEqual(['socio_wallet']);
 });
});
