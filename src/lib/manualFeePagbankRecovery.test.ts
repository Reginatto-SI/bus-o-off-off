import {afterEach,describe,it,expect,vi} from 'vitest';
import {pagbankFeeAdapter} from '../../supabase/functions/_shared/manual-fee/pagbank';
import {synchronizeManualFee} from '../../supabase/functions/_shared/manual-fee/service';
import type {FeeOperation} from '../../supabase/functions/_shared/manual-fee/contracts';

const operation:FeeOperation={id:'synthetic-op',sale_id:'synthetic-sale',company_id:'synthetic-company',gateway:'pagbank',environment:'sandbox',issuer_account_id:'synthetic-issuer',amount_cents:600,reference:'platform_fee_synthetic-sale',idempotency_key:'original_key',state:'prepared',external_id:null,snapshot:{customer:{name:'Company',document:'12345678901',email:'company@example.test'},allocations:[]}};
const order={id:'ORDE_SYNTHETIC',reference_id:operation.reference,qr_codes:[{amount:{value:600},text:'synthetic-qr',expiration_date:'2099-01-01T00:00:00Z',links:[{media:'image/png',href:'https://synthetic.test/qr.png'}]}]};
const adapter=(request:any)=>pagbankFeeAdapter({environment:'sandbox',accessToken:'synthetic-token',issuerAccountId:operation.issuer_account_id,notificationUrl:'https://synthetic.test/hook',request});
afterEach(()=>vi.unstubAllGlobals());

// In-memory store models the existing creation CAS and conditional updates.
// No database, secret resolution or external payment request is used.
function store(initial:FeeOperation=operation,failSave=false) {
 let row=structuredClone(initial);let pendingFailure=failSave;
 const db={
  get row(){return structuredClone(row);},
  rpc:vi.fn(async(name:string)=>{expect(name).toBe('claim_manual_fee_creation');const won=row.state==='prepared';if(won)row.state='creating';return {data:won,error:null};}),
  from:vi.fn((table:string)=>{
   expect(table).toBe('platform_fee_operations');let patch:any;const filters:((r:FeeOperation)=>boolean)[]=[];
   const execute=()=>{
    if(!filters.every(f=>f(row)))return {data:null,error:null};
    if(patch?.external_id&&pendingFailure){pendingFailure=false;return {data:null,error:{message:'synthetic write failure'}};}
    if(patch)row={...row,...patch};return {data:structuredClone(row),error:null};
   };
   const q:any={update:(p:any)=>{patch=p;return q;},eq:(key:keyof FeeOperation,value:unknown)=>{filters.push(r=>r[key]===value);return q;},in:(key:keyof FeeOperation,values:unknown[])=>{filters.push(r=>values.includes(r[key]));return q;},select:()=>q,maybeSingle:async()=>execute(),single:async()=>execute(),then:(resolve:any,reject:any)=>Promise.resolve(execute()).then(resolve,reject)};
   return q;
  }),
 };
 return db;
}

describe('PagBank fee creation and conservative recovery through the common service',()=>{
 it('reuses the existing HTTP client and sends the original idempotency header to Sandbox',async()=>{
  const fetch=vi.fn(async()=>Response.json(order));vi.stubGlobal('fetch',fetch);
  const a=pagbankFeeAdapter({environment:'sandbox',accessToken:'synthetic-token',issuerAccountId:operation.issuer_account_id,notificationUrl:'https://synthetic.test/hook'});
  const db=store();expect((await synchronizeManualFee(db,db.row,a,true)).paid).toBe(false);
  const [url,options]=(fetch.mock.calls as unknown as [string,RequestInit][])[0];
  expect(url).toBe('https://sandbox.api.pagseguro.com/orders');expect(options.method).toBe('POST');expect(options.headers).toMatchObject({'x-idempotency-key':'original_key',Authorization:'Bearer synthetic-token'});expect(JSON.parse(options.body as string).qr_codes[0].amount.value).toBe(600);expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('persists and returns the R$6 PIX pending, then uses only GET on repeated clicks',async()=>{
  const db=store();const request=vi.fn(async()=>({ok:true,data:order}));const a=adapter(request);
  const result=await synchronizeManualFee(db,db.row,a,true);
  expect(result.paid).toBe(false);expect(db.row).toMatchObject({state:'pending',external_id:order.id,idempotency_key:operation.idempotency_key,reference:operation.reference,snapshot:operation.snapshot});
  expect(result.operation.presentation?.pix).toEqual({qr_text:'synthetic-qr',qr_image_url:'https://synthetic.test/qr.png',expires_at:'2099-01-01T00:00:00Z',amount_cents:600});
  for(let i=0;i<3;i++)expect((await synchronizeManualFee(db,db.row,a,true)).paid).toBe(false);
  const calls=request.mock.calls as unknown as [any][];
  expect(calls.filter(([p])=>p.method==='POST')).toHaveLength(1);
  expect(calls[0][0]).toMatchObject({method:'POST',path:'/orders',idempotencyKey:'original_key',body:{reference_id:operation.reference,items:[{unit_amount:600}],qr_codes:[{amount:{value:600}}]}});
  expect(calls.slice(1).every(([p])=>p.method==='GET'&&p.path==='/orders/ORDE_SYNTHETIC')).toBe(true);
 });
 it('retains the Order ID even without QR text and recovers its presentation by GET',async()=>{
  const db=store();const request=vi.fn(async(p:any)=>({ok:true,data:p.method==='POST'?{...order,qr_codes:[{amount:{value:600}}]}:order}));const a=adapter(request);
  expect((await synchronizeManualFee(db,db.row,a,true)).paid).toBe(false);expect(db.row.external_id).toBe(order.id);expect(db.row.presentation?.pix).toMatchObject({qr_text:null});
  const recovered=await synchronizeManualFee(db,db.row,a,true);
  expect(recovered.operation.presentation?.pix).toMatchObject({qr_text:'synthetic-qr'});expect(recovered.paid).toBe(false);
  expect(request.mock.calls.map(([p])=>p.method)).toEqual(['POST','GET']);
 });
 it('an old indeterminate operation without ID remains blocked, with no HTTP request or reset',async()=>{
  const db=store({...operation,state:'indeterminate'});const before=db.row;const request=vi.fn();const a=adapter(request);
  for(let i=0;i<3;i++)await expect(synchronizeManualFee(db,db.row,a,true)).rejects.toThrow('manual_fee_order_id_required');
  expect(db.row).toEqual(before);expect(request).not.toHaveBeenCalled();
 });
 it.each(['network','server','unreadable','rejected','conflict'])('%s never authorizes another POST',async kind=>{
  const db=store();const request=vi.fn(async()=>({ok:kind==='unreadable',status:kind==='network'?0:kind==='server'?500:kind==='unreadable'?200:kind==='rejected'?400:409,indeterminate:kind==='network',data:null}));const a=adapter(request);
  await expect(synchronizeManualFee(db,db.row,a,true)).rejects.toThrow(kind==='rejected'?'manual_fee_create_rejected':'manual_fee_create_unresolved');
  expect(db.row).toMatchObject({state:'indeterminate',external_id:null,idempotency_key:'original_key'});
  for(let i=0;i<2;i++)await expect(synchronizeManualFee(db,db.row,a,true)).rejects.toThrow('manual_fee_order_id_required');
  expect(request).toHaveBeenCalledTimes(1);
 });
 it('a lost local write after external creation also blocks another POST',async()=>{
  const db=store(operation,true);const request=vi.fn(async()=>({ok:true,data:order}));const a=adapter(request);
  await expect(synchronizeManualFee(db,db.row,a,true)).rejects.toThrow('manual_fee_persistence_failed');
  await expect(synchronizeManualFee(db,db.row,a,true)).rejects.toThrow('manual_fee_order_id_required');
  expect(db.row).toMatchObject({state:'indeterminate',external_id:null});expect(request).toHaveBeenCalledTimes(1);
 });
 it('two simultaneous clicks have a single POST owner; the other preserves uncertainty',async()=>{
  const db=store();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
  const request=vi.fn(async()=>{entered();await gate;return {ok:true,data:order};});const a=adapter(request);
  const first=synchronizeManualFee(db,db.row,a,true);await started;
  await expect(synchronizeManualFee(db,db.row,a,true)).rejects.toThrow('manual_fee_order_id_required');
  expect(db.row.state).toBe('creating');release();await first;
  expect(request).toHaveBeenCalledTimes(1);expect(db.row).toMatchObject({state:'pending',external_id:order.id});
 });
 it('an indeterminate operation with a known ID recovers PAID without creating; replay is local only',async()=>{
  const db=store({...operation,state:'indeterminate',external_id:order.id});const request=vi.fn(async()=>({ok:true,data:{...order,charges:[{status:'PAID',amount:{value:600,currency:'BRL'}}]}}));const a=adapter(request);
  expect((await synchronizeManualFee(db,db.row,a,false)).paid).toBe(true);expect(db.row.state).toBe('confirmed');
  expect((await synchronizeManualFee(db,db.row,a,true)).paid).toBe(true);expect(request).toHaveBeenCalledTimes(1);
  expect((request.mock.calls as unknown as [any][])[0][0]).toMatchObject({method:'GET',path:'/orders/ORDE_SYNTHETIC'});
 });
 it.each(['reference','amount','id','currency'])('a %s mismatch cannot be persisted as payment',async mismatch=>{
  const db=store({...operation,state:'pending',external_id:order.id});const invalid={...order,id:mismatch==='id'?'ORDE_OTHER':order.id,reference_id:mismatch==='reference'?'other-sale':operation.reference,charges:[{status:'PAID',amount:{value:mismatch==='amount'?601:600,currency:mismatch==='currency'?'USD':'BRL'}}]};
  const before=db.row;const request=vi.fn(async()=>({ok:true,data:invalid}));
  await expect(synchronizeManualFee(db,db.row,adapter(request))).rejects.toThrow(mismatch==='currency'?'manual_fee_currency_mismatch':'manual_fee_integrity_mismatch');expect(db.row).toEqual(before);
 });
 it.each(['issuer','production','other_gateway'])('rejects %s context before any HTTP request',async mismatch=>{
  const db=store({...operation,...(mismatch==='issuer'?{issuer_account_id:'other'}:mismatch==='production'?{environment:'production' as const}:{gateway:'asaas' as const})});const request=vi.fn();
  await expect(synchronizeManualFee(db,db.row,adapter(request),true)).rejects.toThrow('manual_pagbank_context_rejected');expect(request).not.toHaveBeenCalled();expect(db.row.state).toBe('indeterminate');
 });
});
