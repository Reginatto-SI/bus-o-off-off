import {useRef,useState} from 'react';
import {Loader2,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {ScrollArea} from '@/components/ui/scroll-area';
import {PassengerTicketList} from '@/components/public/PassengerTicketList';
import type {TicketCardData} from '@/components/public/TicketCard';
import type {TicketRecord} from '@/types/database';
import {useManualSaleReceipt} from '@/hooks/use-manual-sale-receipt';
import {refreshManualReceiptCard} from '@/lib/manualSaleReceipt';
import {startPlatformFeeCheckout} from '@/lib/platformFeeCheckout';

type Props={saleId:string;companyId:string;activeCompanyId:string|null;open:boolean;canManage:boolean;initialTickets:{ticket:TicketRecord;ticketCardData:TicketCardData}[];buildTicketCardData:(ticket:TicketRecord)=>TicketCardData;onClose:()=>void};
export function ManualSaleReceiptContent({saleId,companyId,activeCompanyId,open,canManage,initialTickets,buildTicketCardData,onClose}:Props){
 const sameCompany=companyId===activeCompanyId;
 const receipt=useManualSaleReceipt({saleId,companyId,enabled:open&&sameCompany});
 const [paying,setPaying]=useState(false);
 const paymentInFlight=useRef(false);
 const snapshot=receipt.snapshot;
 const cards=snapshot?snapshot.tickets.map(ticket=>{
  const initial=initialTickets.find(item=>item.ticket.id===ticket.id||item.ticket.id===ticket.sale_passenger_id);
  return refreshManualReceiptCard(initial?.ticketCardData??buildTicketCardData(ticket),ticket,snapshot);
 }):initialTickets.map(item=>({...item.ticketCardData,saleStatus:'reservado' as const,qrCodeToken:'',purchaseConfirmedAt:null}));
 const canPay=Boolean(sameCompany&&canManage&&snapshot&&!receipt.error&&!snapshot.financialConfirmed&&snapshot.phase==='reserved'&&['reservado','pendente_pagamento'].includes(snapshot.sale.status)&&['pending','failed'].includes(snapshot.sale.platform_fee_status??''));
 const pay=async()=>{
  if(paymentInFlight.current||!canPay)return;paymentInFlight.current=true;setPaying(true);
  try{
   const latest=await receipt.refresh();
   if(!latest||latest.financialConfirmed||latest.phase!=='reserved')return;
   await startPlatformFeeCheckout({saleId,onWaived:async()=>{await receipt.refresh();}});
  }finally{await receipt.refresh();paymentInFlight.current=false;setPaying(false);}
 };
 return <>
  <DialogHeader className="px-6 py-4 border-b border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))]">
   <DialogTitle className="text-[hsl(var(--ticket-text))]">{snapshot?.phase==='complete'?'Comprovante de Venda':'Comprovante de Reserva'}</DialogTitle>
  </DialogHeader>
  <ScrollArea className="flex-1 px-4 py-4 sm:px-6"><div className="mx-auto w-full max-w-[460px]">
   {sameCompany?<PassengerTicketList tickets={cards} allowReservedDownloads reservedPresentation="receipt" context="admin"/>:<p>Selecione a empresa da venda para consultar este comprovante.</p>}
  </div></ScrollArea>
  <DialogFooter className="px-6 py-4 border-t border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))]">
   <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="text-sm text-[hsl(var(--ticket-muted))]" role="status">
     {snapshot?.phase==='complete'?'Venda concluída. Passagens atualizadas.':snapshot?.phase==='issuing'?'Pagamento confirmado. Estamos finalizando suas passagens.':snapshot?.phase==='closed'?'Venda encerrada. Consulte a situação na listagem.':'A reserva continua ativa até a confirmação financeira correspondente.'}
     {(receipt.error||receipt.paused)&&<p>{receipt.error?'Não foi possível atualizar agora. Os últimos dados foram preservados.':'Acompanhamento automático pausado. Consulte novamente.'}</p>}
    </div>
    <div className="flex flex-col-reverse gap-2 sm:flex-row">
     {snapshot?.phase!=='complete'&&snapshot?.phase!=='closed'&&<Button variant="outline" className="border-[hsl(var(--ticket-border))] bg-transparent text-[hsl(var(--ticket-text))] hover:bg-[hsl(var(--ticket-surface-2))] hover:text-[hsl(var(--ticket-text))] disabled:opacity-50" onClick={()=>void receipt.refresh()} disabled={receipt.loading||!sameCompany}>Consultar novamente</Button>}
     <Button variant="outline" onClick={onClose} className="border-[hsl(var(--ticket-border))] bg-transparent text-[hsl(var(--ticket-text))] hover:bg-[hsl(var(--ticket-surface-2))] hover:text-[hsl(var(--ticket-text))]">{canPay?'Fechar e pagar depois':'Fechar'}</Button>
     {canPay&&<Button onClick={()=>void pay()} disabled={paying||receipt.loading}>{paying?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<ExternalLink className="mr-2 h-4 w-4"/>}Pagar taxa agora</Button>}
    </div>
   </div>
  </DialogFooter>
 </>;
}
