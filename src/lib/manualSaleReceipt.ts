import {supabase} from '@/integrations/supabase/client';
import type {SaleStatus,TicketRecord} from '@/types/database';
import type {TicketCardData} from '@/components/public/TicketCard';
import {resolveTicketPurchaseConfirmedAt} from '@/lib/ticketPurchaseMetadata';

export const MANUAL_RECEIPT_UPDATED_EVENT='smartbus:manual-sale-receipt-updated';
export type ManualReceiptTicket=TicketRecord & {sale_passenger_id?:string|null};
export type ManualReceiptSale={id:string;company_id:string;status:SaleStatus;platform_fee_status:string|null;platform_fee_amount:number|null;expected_ticket_count:number|null;payment_confirmed_at:string|null;platform_fee_paid_at:string|null;payment_environment:string};
export type ManualReceiptSnapshot={sale:ManualReceiptSale;financialConfirmed:boolean;phase:'reserved'|'issuing'|'complete'|'closed';tickets:ManualReceiptTicket[]};

export function notifyManualReceiptUpdated(saleId:string){
 window.dispatchEvent(new CustomEvent(MANUAL_RECEIPT_UPDATED_EVENT,{detail:{saleId}}));
}

export function refreshManualReceiptCard(template:TicketCardData,ticket:ManualReceiptTicket,snapshot:ManualReceiptSnapshot):TicketCardData{
 const complete=snapshot.phase==='complete';
 const unitPrice=Number(ticket.final_price??template.unitPrice??0);
 return {...template,ticketId:ticket.id,ticketNumber:complete?ticket.ticket_number:null,qrCodeToken:complete?ticket.qr_code_token:'',saleId:snapshot.sale.id,
  passengerName:ticket.passenger_name,passengerCpf:ticket.passenger_cpf,seatLabel:ticket.seat_label,boardingStatus:ticket.boarding_status,
  saleStatus:complete?'pago':snapshot.phase==='closed'?snapshot.sale.status:'reservado',
  purchaseConfirmedAt:complete?resolveTicketPurchaseConfirmedAt({saleStatus:'pago',paymentConfirmedAt:snapshot.sale.payment_confirmed_at,platformFeePaidAt:snapshot.sale.platform_fee_paid_at,asaasPaymentId:template.asaasPaymentId??null}):null,
  unitPrice,totalPaid:unitPrice+(template.fees??[]).reduce((sum,fee)=>sum+fee.amount,0),benefitApplied:ticket.benefit_applied,benefitProgramName:ticket.benefit_program_name,benefitDiscountAmount:ticket.discount_amount};
}

// This is a display consistency check. Financial confirmation and issuance stay
// in the existing backend transaction; a toast/event can only request a reload.
export function resolveManualReceipt(sale:ManualReceiptSale,operation:{state:string;items:unknown}|null,issued:ManualReceiptTicket[]):ManualReceiptSnapshot {
 const financialConfirmed=operation?['confirmed','exempt'].includes(operation.state):sale.status==='pago'||sale.platform_fee_status==='paid'||sale.platform_fee_status==='waived';
 const manifest=operation&&Array.isArray(operation.items)&&operation.items.every(p=>p!==null&&typeof p==='object')?operation.items as Partial<ManualReceiptTicket>[]:null;
 const scoped=issued.every(t=>t.sale_id===sale.id&&t.company_id===sale.company_id);
 const unique=issued.length>0&&new Set(issued.map(t=>t.id)).size===issued.length&&new Set(issued.map(t=>t.qr_code_token)).size===issued.length&&issued.every(t=>Boolean(t.id&&typeof t.qr_code_token==='string'&&t.qr_code_token.trim()));
 const expected=sale.expected_ticket_count;
 const countMatches=expected===null?!operation:Number.isInteger(expected)&&expected>0&&issued.length===expected;
 const itemIds=issued.map(t=>t.sale_passenger_id);
 const identityMatches=expected===null||itemIds.every(Boolean)&&new Set(itemIds).size===issued.length;
 const manifestMatches=!operation||Boolean(manifest&&manifest.length===expected&&new Set(manifest.map(p=>p.id)).size===manifest.length&&manifest.every(p=>Boolean(p.id)&&issued.some(t=>t.sale_passenger_id===p.id&&t.trip_id===p.trip_id&&t.seat_id===(p.seat_id??null)&&t.seat_label===p.seat_label)));
 const complete=financialConfirmed&&sale.status==='pago'&&scoped&&unique&&countMatches&&identityMatches&&manifestMatches;
 const phase=sale.status==='cancelado'||sale.status==='bloqueado'?'closed':complete?'complete':financialConfirmed?'issuing':'reserved';
 const previews=manifest?.map(p=>({...p,sale_id:sale.id,company_id:sale.company_id,qr_code_token:'',ticket_number:null,boarding_status:'pendente'} as ManualReceiptTicket))??issued.map(t=>({...t,qr_code_token:''}));
 return {sale,financialConfirmed,phase,tickets:complete?issued:previews};
}

export async function readManualSaleReceipt(saleId:string,companyId:string,signal?:AbortSignal):Promise<ManualReceiptSnapshot>{
 const controller=new AbortController();const abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,15_000);
 try{
 const [saleRes,operationRes,ticketRes]=await Promise.all([
  supabase.from('sales').select('id,company_id,status,platform_fee_status,platform_fee_amount,expected_ticket_count,payment_confirmed_at,platform_fee_paid_at,payment_environment').eq('id',saleId).eq('company_id',companyId).abortSignal(controller.signal).single(),
  // Only the issuance manifest is selected: no payer or financial allocation data.
  supabase.from('platform_fee_operations').select<'state,items:snapshot->items',{state:string;items:unknown}>('state,items:snapshot->items').eq('sale_id',saleId).eq('company_id',companyId).abortSignal(controller.signal).maybeSingle(),
  supabase.from('tickets').select('*').eq('sale_id',saleId).eq('company_id',companyId).order('seat_label').abortSignal(controller.signal),
 ]);
 if(saleRes.error||operationRes.error||ticketRes.error||!saleRes.data||!Array.isArray(ticketRes.data))throw Error('manual_receipt_refresh_failed');
 const sale=saleRes.data as ManualReceiptSale;
 if(sale.id!==saleId||sale.company_id!==companyId)throw Error('manual_receipt_scope_mismatch');
 return resolveManualReceipt(sale,operationRes.data as {state:string;items:unknown}|null,ticketRes.data as ManualReceiptTicket[]);
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
