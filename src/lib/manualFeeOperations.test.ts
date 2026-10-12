import {describe,it,expect,vi} from 'vitest';
import {synchronizeManualFee} from '../../supabase/functions/_shared/manual-fee/service';
import {asaasFeeAdapter} from '../../supabase/functions/_shared/manual-fee/asaas';
import type {FeeOperation,FeeFacts} from '../../supabase/functions/_shared/manual-fee/contracts';
const operation:FeeOperation={id:'op',sale_id:'sale',company_id:'c',gateway:'asaas',environment:'sandbox',issuer_account_id:'wallet',amount_cents:6000,reference:'fee_sale',idempotency_key:'key',state:'prepared',external_id:null,snapshot:{customer:{name:'Company',document:'12345678901'},allocations:[{kind:'marketplace',beneficiary_id:'wallet',destination:'wallet',amount_cents:6000}]}};
const facts:FeeFacts={externalId:'pay_1',reference:operation.reference,amountCents:6000,currency:'BRL',issuerAccountId:'wallet',environment:'sandbox',state:'paid',rawStatus:'RECEIVED',nativeDestinations:[]};
function fakeDb() {
 let row={...operation};let creates=0;
 return {get row(){return row;},get creates(){return creates;},rpc:async()=>{const won=row.state==='prepared';if(won){row.state='creating';creates++;}return {data:won,error:null};},from:()=>{
  let patch:Partial<FeeOperation>|undefined;let expected:string[]|undefined;
  const q:any={update:(p:any)=>{patch=p;return q;},eq:()=>q,in:(_:unknown,s:string[])=>{expected=s;return q;},select:()=>q,
   maybeSingle:async()=>{if(patch&&(!expected||expected.includes(row.state)))row={...row,...patch};return {data:row,error:null};},single:async()=>({data:row,error:null}),then:(resolve:any)=>{if(patch)row={...row,...patch};return Promise.resolve({error:null}).then(resolve);}};return q;
 }};
}
describe('manual fee operations',()=>{
 it('two simultaneous confirmations have one creation owner',async()=>{const db=fakeDb();const create=vi.fn(async()=>facts);const adapter={create,query:async()=>null};await Promise.all([synchronizeManualFee(db,operation,adapter,true),synchronizeManualFee(db,operation,adapter,true)]);expect(create).toHaveBeenCalledTimes(1);expect(db.row.state).toBe('confirmed');});
 it('uncertain creation never retries POST after empty lookup',async()=>{const db=fakeDb();const create=vi.fn(async()=>{throw Error('timeout');});const adapter={create,query:async()=>null};await expect(synchronizeManualFee(db,operation,adapter,true)).rejects.toThrow('timeout');await synchronizeManualFee(db,db.row,adapter,true);expect(create).toHaveBeenCalledTimes(1);expect(db.row.state).toBe('indeterminate');});
 it.each(['amountCents','reference','issuerAccountId','environment','externalId'] as const)('rejects integrity mismatch %s',async key=>{const db=fakeDb();const wrong={...facts,[key]:key==='amountCents'?100000:''};await expect(synchronizeManualFee(db,operation,{create:async()=>wrong,query:async()=>wrong},true)).rejects.toThrow('manual_fee_integrity_mismatch');expect(db.row.state).not.toBe('confirmed');});
 it('charges 60 fee instead of 1000 received outside',async()=>{
  const bodies:any[]=[];
  const request=vi.fn(async(url:string,options:any)=>{if(options.body)bodies.push(JSON.parse(options.body));return new Response(JSON.stringify(url.includes('/payments?')?{data:[]}:url.includes('/customers?')?{data:[{id:'customer'}]}:{id:'pay',externalReference:operation.reference,value:60,status:'PENDING'}),{status:200});});
  const adapter=asaasFeeAdapter({baseUrl:'https://synthetic.test',apiKey:'synthetic',issuerAccountId:'wallet',environment:'sandbox',fetch:request as any});await adapter.create(operation);expect(bodies).toHaveLength(1);expect(bodies[0].value).toBe(60);expect(bodies[0].billingType).toBe('PIX');
 });
});
