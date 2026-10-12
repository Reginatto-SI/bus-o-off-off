import {useEffect,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export type ManualFeePixEvent={saleId:string;pix:{qr_text:string;expires_at:string|null;amount_cents:number|null}};
export function ManualFeePixDialog({onConfirmed}:{onConfirmed:()=>void}) {
 const [payment,setPayment]=useState<ManualFeePixEvent|null>(null);
 useEffect(()=>{const listener=(e:Event)=>{const data=(e as CustomEvent<ManualFeePixEvent>).detail;if(data?.saleId&&data.pix?.qr_text)setPayment(data);};window.addEventListener('smartbus:manual-fee-pix',listener);return()=>window.removeEventListener('smartbus:manual-fee-pix',listener);},[]);
 useEffect(()=>{
  if(!payment)return;let cancelled=false;let busy=false;
  const poll=async()=>{if(busy)return;busy=true;try{const {data,error}=await supabase.functions.invoke('verify-payment-status',{body:{sale_id:payment.saleId}});if(!cancelled&&!error&&data?.paymentStatus==='pago'){toast.success('Taxa confirmada e passagens liberadas.');setPayment(null);onConfirmed();}}catch{/* Keep the reservation; backend recovery continues after a network failure. */}finally{busy=false;}};
  const timer=setInterval(()=>void poll(),10000);void poll();return()=>{cancelled=true;clearInterval(timer);};
 },[payment,onConfirmed]);
 return <Dialog open={!!payment} onOpenChange={open=>{if(!open)setPayment(null);}}><DialogContent><DialogHeader><DialogTitle>Taxa SmartBus da venda manual</DialogTitle></DialogHeader>
  {payment&&<div className="space-y-4 text-center"><p>Pagamento somente da taxa da plataforma: {((payment.pix.amount_cents??0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
  <div className="flex justify-center"><QRCodeSVG value={payment.pix.qr_text} size={220}/></div>
  <Button onClick={()=>void navigator.clipboard.writeText(payment.pix.qr_text).then(()=>toast.success('Código Pix copiado.'))}>Copiar código Pix</Button>
  <p className="text-sm text-muted-foreground">As passagens serão liberadas após confirmação e emissão integral. Você pode fechar esta janela; a verificação continua no servidor.</p></div>}
 </DialogContent></Dialog>;
}
