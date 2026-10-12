import { ManualFeeError } from './auth.ts';
import { assertFeeFacts,type FeeAdapter,type FeeOperation } from './contracts.ts';

// All externally confirmed payments are recorded before attempting ticket issuance.
// deno-lint-ignore no-explicit-any
export async function synchronizeManualFee(db:any,op:FeeOperation,adapter:FeeAdapter,allowCreate=false) {
 if(op.state==='exempt'||op.state==='confirmed') return {operation:op,paid:true};
 let claimed=false;
 if(allowCreate){const claim=await db.rpc('claim_manual_fee_creation',{p_id:op.id});if(claim.error)throw new ManualFeeError('manual_fee_claim_failed',503);claimed=claim.data===true;}
 try {
  const facts=claimed?await adapter.create(op):await adapter.query(op);
  if(!facts){return {operation:op,paid:false,uncertain:true};}
  assertFeeFacts(op,facts);
  const state=facts.state==='paid'?'confirmed':facts.state==='terminal'?'terminal':facts.state==='indeterminate'?'indeterminate':'pending';
  const patch={external_id:facts.externalId,state,external_status:facts.rawStatus,presentation:{...facts.presentation,native_destinations:facts.nativeDestinations},last_queried_at:new Date().toISOString(),...(state==='confirmed'?{confirmed_at:new Date().toISOString()}:{})};
  const saved=await db.from('platform_fee_operations').update(patch).eq('id',op.id).in('state',['prepared','creating','pending','indeterminate','terminal']).select('*').maybeSingle();
  if(saved.error)throw new ManualFeeError('manual_fee_persistence_failed',503);
  if(!saved.data){const current=await db.from('platform_fee_operations').select('*').eq('id',op.id).single();if(current.error)throw new ManualFeeError('manual_fee_read_failed',503);return {operation:current.data,paid:['confirmed','exempt'].includes(current.data.state)};}
  return {operation:saved.data,paid:state==='confirmed'};
 } catch(error) {
  if(claimed)await db.from('platform_fee_operations').update({state:'indeterminate'}).eq('id',op.id).eq('state','creating');
  throw error;
 }
}
