import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {readManualSaleReceipt,resolveManualReceipt,refreshManualReceiptCard} from './manualSaleReceipt';
import {receiptSale,paidReceiptSale,receiptTickets,receiptManifest,receiptCard} from '@/test/manualReceiptFixture';
const mocks=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from}}));
const confirmed={state:'confirmed',items:receiptManifest};
afterEach(()=>vi.useRealTimers());
describe('manual receipt authoritative state and item integrity',()=>{
 it('pending payment remains a reservation without operational QR',()=>{const s=resolveManualReceipt(receiptSale,{...confirmed,state:'pending'},[]);expect(s.phase).toBe('reserved');expect(s.financialConfirmed).toBe(false);expect(s.tickets).toHaveLength(2);expect(s.tickets.every(t=>!t.qr_code_token)).toBe(true);});
 it('confirmed fee cannot release tickets until the sale transaction finishes',()=>{const s=resolveManualReceipt(receiptSale,confirmed,receiptTickets);expect(s.phase).toBe('issuing');expect(s.financialConfirmed).toBe(true);expect(s.tickets.every(t=>!t.qr_code_token)).toBe(true);});
 it.each(['asaas','pagbank','future_gateway'])('uses the same confirmed backend contract for %s',gateway=>{const s=resolveManualReceipt({...paidReceiptSale,...{payment_gateway:gateway}},confirmed,receiptTickets);expect(s.phase).toBe('complete');expect(s.tickets).toEqual(receiptTickets);});
 it('one existing ticket out of two expected does not become a released receipt',()=>{const s=resolveManualReceipt(paidReceiptSale,confirmed,receiptTickets.slice(0,1));expect(s.phase).toBe('issuing');expect(s.tickets).toHaveLength(2);expect(s.tickets.every(t=>!t.qr_code_token)).toBe(true);});
 it.each(['wrong_item','duplicate_item','wrong_trip','wrong_seat','wrong_company','wrong_sale','missing_qr','duplicate_qr','extra_ticket'])('rejects %s even when rows exist',failure=>{
  const rows=structuredClone(receiptTickets);
  if(failure==='wrong_item')rows[1].sale_passenger_id='other';if(failure==='duplicate_item')rows[1].sale_passenger_id=rows[0].sale_passenger_id;if(failure==='wrong_trip')rows[1].trip_id='other';if(failure==='wrong_seat')rows[1].seat_id='other';if(failure==='wrong_company')rows[1].company_id='other';if(failure==='wrong_sale')rows[1].sale_id='other';if(failure==='missing_qr')rows[1].qr_code_token='';if(failure==='extra_ticket')rows.push({...rows[0],id:'extra'});
  if(failure==='duplicate_qr')rows[1].qr_code_token=rows[0].qr_code_token;
  expect(resolveManualReceipt(paidReceiptSale,confirmed,rows).phase).toBe('issuing');
 });
 it('matches ida/volta and legitimate repeated labels by individual item identity',()=>{
  const rows=receiptTickets.map((t,i)=>({...t,passenger_cpf:'11111111111',trip_id:i?'trip-volta':'trip-ida',seat_id:null,seat_label:'SN'}));const items=rows.map(t=>({...t,id:t.sale_passenger_id}));
  expect(resolveManualReceipt(paidReceiptSale,{state:'confirmed',items},rows).phase).toBe('complete');
 });
 it.each([null,[],[null],[{id:'item-1'},{id:'item-1'}]])('does not infer a complete managed manifest from malformed data',items=>expect(resolveManualReceipt(paidReceiptSale,{state:'confirmed',items},receiptTickets).phase).toBe('issuing'));
 it('preserves historical manual Asaas receipts without a managed operation',()=>expect(resolveManualReceipt({...paidReceiptSale,expected_ticket_count:null},null,receiptTickets.map(t=>({...t,sale_passenger_id:null}))).phase).toBe('complete'));
 it('canceled sale stays closed without functional QR or new payment',()=>{const s=resolveManualReceipt({...paidReceiptSale,status:'cancelado'},confirmed,receiptTickets);expect(s.phase).toBe('closed');expect(s.tickets.every(t=>!t.qr_code_token)).toBe(true);});
 it('updates the data consumed by the existing digital ticket and PDF',()=>{
  const original=receiptCard(receiptManifest[0]);const before=structuredClone(original);const s=resolveManualReceipt(paidReceiptSale,confirmed,receiptTickets);const card=refreshManualReceiptCard(original,receiptTickets[0],s);
  expect(card).toMatchObject({ticketId:'ticket-1',ticketNumber:'TICKET-1',qrCodeToken:'backend-qr-1',saleStatus:'pago',purchaseConfirmedAt:paidReceiptSale.payment_confirmed_at,companyName:original.companyName,fees:original.fees,totalPaid:102});expect(original).toEqual(before);
 });
});
describe('read-only receipt loading and scope',()=>{
 let rows:Record<string,{data:unknown;error:unknown}>;
 const calls:{table:string;filters:Record<string,string>;selection:string}[]=[];
 beforeEach(()=>{
  calls.length=0;rows={sales:{data:paidReceiptSale,error:null},platform_fee_operations:{data:confirmed,error:null},tickets:{data:receiptTickets,error:null}};
  mocks.from.mockImplementation((table:string)=>{
   const call={table,filters:{},selection:''};calls.push(call);
   const q:any={select:(s:string)=>{call.selection=s;return q;},eq:(field:string,value:string)=>{call.filters[field]=value;return q;},order:()=>q,abortSignal:()=>q,single:async()=>rows[table],maybeSingle:async()=>rows[table],then:(resolve:any)=>Promise.resolve(rows[table]).then(resolve)};return q;
  });
 });
 it('only selects scoped records and the necessary private manifest',async()=>{
  expect((await readManualSaleReceipt(receiptSale.id,receiptSale.company_id)).phase).toBe('complete');expect(calls).toHaveLength(3);expect(calls.every(c=>c.filters.company_id===receiptSale.company_id)).toBe(true);expect(calls.find(c=>c.table==='platform_fee_operations')?.selection).toBe('state,items:snapshot->items');
 });
 it.each(['sales','platform_fee_operations','tickets'])('fails closed on %s lookup error',async table=>{rows[table]={data:null,error:{message:'synthetic'}};await expect(readManualSaleReceipt(receiptSale.id,receiptSale.company_id)).rejects.toThrow('manual_receipt_refresh_failed');});
 it('rejects another sale or company rather than displaying those tickets',async()=>{rows.sales.data={...paidReceiptSale,company_id:'other'};await expect(readManualSaleReceipt(receiptSale.id,receiptSale.company_id)).rejects.toThrow('manual_receipt_scope_mismatch');});
 it('aborts stalled reads instead of keeping an infinite loading state',async()=>{
  vi.useFakeTimers();let aborted=false;
  mocks.from.mockImplementation(()=>{let signal:AbortSignal;const result=()=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve({data:null,error:{message:'aborted'}});}));const q:any={select:()=>q,eq:()=>q,order:()=>q,abortSignal:(s:AbortSignal)=>{signal=s;return q;},single:result,maybeSingle:result,then:(resolve:any)=>result().then(resolve)};return q;});
  const reading=expect(readManualSaleReceipt(receiptSale.id,receiptSale.company_id)).rejects.toThrow('manual_receipt_refresh_failed');await vi.advanceTimersByTimeAsync(15000);await reading;expect(aborted).toBe(true);
 });
});
