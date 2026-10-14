import {useCallback,useEffect,useRef,useState} from 'react';
import {MANUAL_RECEIPT_UPDATED_EVENT,readManualSaleReceipt,type ManualReceiptSnapshot} from '@/lib/manualSaleReceipt';

const REFRESH_INTERVAL_MS=10_000;
const MAX_AUTOMATIC_REFRESHES=30;
export function useManualSaleReceipt({saleId,companyId,enabled}:{saleId:string|null;companyId:string|null;enabled:boolean}){
 const [snapshot,setSnapshot]=useState<ManualReceiptSnapshot|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState(false);
 const [paused,setPaused]=useState(false);
 const reloadRef=useRef<()=>Promise<ManualReceiptSnapshot|null>>(async()=>null);
 const refresh=useCallback(()=>reloadRef.current(),[]);
 useEffect(()=>{
  setSnapshot(null);setError(false);setPaused(false);setLoading(false);
  if(!enabled||!saleId||!companyId){reloadRef.current=async()=>null;return;}
  let disposed=false;let automatic=0;let current:ManualReceiptSnapshot|null=null;
  let inFlight:Promise<ManualReceiptSnapshot|null>|null=null;
  let requestController:AbortController|null=null;
  const load=()=>{
   if(inFlight)return inFlight;
   setLoading(true);
   requestController=new AbortController();
   inFlight=(async()=>{
    try{
     const next=await readManualSaleReceipt(saleId,companyId,requestController!.signal);
     if(disposed)return null;
     // A stale response must not ask for another payment after confirmed proof.
     if(current?.financialConfirmed&&!next.financialConfirmed){setError(true);return current;}
     current=next;setSnapshot(next);setError(false);return next;
    }catch{if(!disposed)setError(true);return null;}
    finally{inFlight=null;if(!disposed)setLoading(false);}
   })();return inFlight;
  };
  reloadRef.current=()=>{automatic=0;setPaused(false);return load();};
  void load();
  const timer=setInterval(()=>{
   if(disposed||document.visibilityState==='hidden'||current?.phase==='complete'||current?.phase==='closed')return;
   if(automatic>=MAX_AUTOMATIC_REFRESHES){setPaused(true);return;}
   automatic++;void load();
  },REFRESH_INTERVAL_MS);
  const hint=(event:Event)=>{if((event as CustomEvent<{saleId:string}>).detail?.saleId===saleId)void load();};
  const focus=()=>{if(document.visibilityState!=='hidden'&&current?.phase!=='complete'&&current?.phase!=='closed'&&automatic<MAX_AUTOMATIC_REFRESHES){automatic++;void load();}};
  window.addEventListener(MANUAL_RECEIPT_UPDATED_EVENT,hint);window.addEventListener('focus',focus);
  return()=>{disposed=true;requestController?.abort();clearInterval(timer);window.removeEventListener(MANUAL_RECEIPT_UPDATED_EVENT,hint);window.removeEventListener('focus',focus);reloadRef.current=async()=>null;};
 },[saleId,companyId,enabled]);
 const scopedSnapshot=enabled&&snapshot?.sale.id===saleId&&snapshot.sale.company_id===companyId?snapshot:null;
 return {snapshot:scopedSnapshot,loading,error,paused,refresh};
}
