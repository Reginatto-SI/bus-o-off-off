import {serve} from 'https://deno.land/std@0.190.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {authenticateManualOperator,ManualFeeError} from '../_shared/manual-fee/auth.ts';
import {registerManualSale} from '../_shared/manual-fee/register.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version','Content-Type':'application/json'};
serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 try{
  if(req.method!=='POST')throw new ManualFeeError('method_not_allowed',405);
  const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'');
  const actor=await authenticateManualOperator(db,req);const body=await req.json();
  const saleId=await registerManualSale(db,actor,body,req,name=>Deno.env.get(name));
  const op=await db.from('platform_fee_operations').select('id,state,amount_cents,snapshot').eq('sale_id',saleId).eq('company_id',body.company_id).single();
  if(op.error)throw new ManualFeeError('manual_operation_read_failed',503);
  if(op.data.state==='exempt'){const finalized=await db.rpc('finalize_manual_sale',{p_operation_id:op.data.id});if(finalized.error)throw new ManualFeeError('manual_issuance_incomplete');}
  const receipts=await db.from(op.data.state==='exempt'?'tickets':'sale_passengers').select('*').eq('sale_id',saleId).eq('company_id',body.company_id).order('seat_label');
  if(receipts.error)throw new ManualFeeError('manual_receipt_read_failed',503);
  return new Response(JSON.stringify({receipt_items:receipts.data,fee_rules:op.data.snapshot.event_fees??[],sale_id:saleId,status:op.data.state==='exempt'?'pago':'reservado',platform_fee_status:op.data.state==='exempt'?'not_applicable':'pending',platform_fee_amount:op.data.amount_cents/100}),{headers});
 }catch(e){const error=e instanceof ManualFeeError?e:new ManualFeeError('manual_registration_failed',500);return new Response(JSON.stringify({error:error.code}),{headers,status:error.status});}
});
