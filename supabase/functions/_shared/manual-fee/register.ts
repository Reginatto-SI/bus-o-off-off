// @ts-nocheck — service-role queries use the deployed schema.
import {ManualFeeError} from './auth.ts';
import {prepareManualFeeDecision} from './decision.ts';
import {resolveBestBenefitForPassengerPrice} from '../benefit-price.ts';
import {manualItemBasePrice} from './pricing.ts';
import {calculateFeesTotal} from '../checkout-financial-integrity.ts';
import {resolveEffectivePaymentEnvironment,classifyRequestOrigin} from '../payment-environment-policy.ts';

export async function registerManualSale(db:any,operator:any,body:any,req:Request,getSecret:(name:string)=>string|undefined) {
 operator.assertCompany(body.company_id);
 if(!/^[0-9a-f-]{36}$/i.test(body.request_key??''))throw new ManualFeeError('manual_request_key_invalid',400);
 const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const previous=await db.from('manual_sale_requests').select('*').eq('company_id',body.company_id).eq('request_key',body.request_key).maybeSingle();
 if(previous.error)throw new ManualFeeError('manual_request_read_failed',503);
 if(previous.data){if(previous.data.request_hash!==requestHash)throw new ManualFeeError('manual_request_payload_changed');return previous.data.sale_id;}
 const companyRes=await db.from('companies').select('*').eq('id',body.company_id).single();
 if(companyRes.error||!companyRes.data?.manual_fee_flow_enabled)throw new ManualFeeError('manual_flow_disabled');
 const company=companyRes.data;
 const environment=resolveEffectivePaymentEnvironment({configured:company.payment_environment,originClass:classifyRequestOrigin(req).originClass}).environment;
 if(!['sandbox','production'].includes(environment))throw new ManualFeeError('payment_environment_unresolved');
 const eventRes=await db.from('events').select('*').eq('id',body.event_id).eq('company_id',company.id).single();
 const event=eventRes.data;if(eventRes.error||!event||event.status!=='a_venda')throw new ManualFeeError('manual_event_invalid');
 if(event.transport_policy==='ida_volta_obrigatorio'&&!body.return_trip_id)throw new ManualFeeError('manual_return_required');
 if(body.return_trip_id===body.trip_id)throw new ManualFeeError('manual_return_invalid');
 const trips=await db.from('trips').select('id,vehicle_id').eq('company_id',company.id).eq('event_id',event.id).in('id',[body.trip_id,...(body.return_trip_id?[body.return_trip_id]:[])]);
 if(trips.error||trips.data?.length!==(body.return_trip_id?2:1))throw new ManualFeeError('manual_trip_invalid');
 if(!Array.isArray(body.passengers)||!body.passengers.length||body.passengers.length>100)throw new ManualFeeError('manual_passengers_invalid',400);
 const unitPrice=Number(body.unit_price);if(!Number.isFinite(unitPrice)||unitPrice<0)throw new ManualFeeError('manual_price_invalid',400);
 const boarding=await db.from('boarding_locations').select('id').eq('id',body.boarding_location_id).eq('company_id',company.id).maybeSingle();
 if(boarding.error||!boarding.data)throw new ManualFeeError('manual_boarding_invalid');
 if(body.seller_id){const seller=await db.from('sellers').select('id').eq('id',body.seller_id).eq('company_id',company.id).maybeSingle();if(seller.error||!seller.data)throw new ManualFeeError('manual_seller_invalid');}
 const items=[];
 const categoryPrices=new Map<string,number>();
 if(event.use_category_pricing){
  const categories=await db.from('event_category_prices').select('category,price').eq('event_id',event.id).eq('company_id',company.id);
  if(categories.error)throw new ManualFeeError('manual_category_prices_unresolved',503);
  for(const row of categories.data??[]){if(categoryPrices.has(row.category))throw new ManualFeeError('manual_category_price_ambiguous');categoryPrices.set(row.category,Number(row.price));}
 }
 for(const [i,p] of body.passengers.entries()){
  const cpf=String(p.cpf??'').replace(/\D/g,'');
  if(!/^\d{11}$/.test(cpf)||typeof p.name!=='string'||p.name.trim().length<3)throw new ManualFeeError('manual_passenger_invalid',400);
  let label=String(p.seat_label??''),seatId=p.seat_id??null,seatCategory=null;
  if(seatId){const seat=await db.from('seats').select('id,label,category').eq('id',seatId).eq('company_id',company.id).eq('vehicle_id',trips.data.find((t:any)=>t.id===body.trip_id).vehicle_id).single();if(seat.error||!seat.data)throw new ManualFeeError('manual_seat_invalid');label=seat.data.label;seatCategory=seat.data.category;}
  if(!label||label.length>80)throw new ManualFeeError('manual_seat_label_invalid');
  let type=null;if(p.ticket_type_id){const t=await db.from('event_ticket_types').select('*').eq('id',p.ticket_type_id).eq('company_id',company.id).eq('event_id',event.id).eq('is_active',true).single();if(t.error||!t.data)throw new ManualFeeError('manual_ticket_type_invalid');type=t.data;}
  const originalPrice=manualItemBasePrice(unitPrice,type?.price,categoryPrices.get(seatCategory));
  const benefits=await db.rpc('get_benefit_eligibility_matches',{p_company_id:company.id,p_event_id:event.id,p_cpf:cpf,p_reference_date:new Date().toISOString().slice(0,10)});
  if(benefits.error)throw new ManualFeeError('manual_benefit_unresolved',503);
  const price=resolveBestBenefitForPassengerPrice(originalPrice,(benefits.data??[]).map((r:any)=>({program:{id:r.program_id,name:r.program_name,benefit_type:r.benefit_type,benefit_value:Number(r.benefit_value)}})));
  items.push({id:crypto.randomUUID(),trip_id:body.trip_id,seat_id:seatId,seat_label:label,passenger_name:p.name.trim(),passenger_cpf:cpf,passenger_phone:String(p.phone??'').replace(/\D/g,''),sort_order:i,
   ticket_type_id:type?.id??null,ticket_type_name:type?.name??null,ticket_type_price:type?.price??null,
   benefit_program_id:price.benefitProgramId,benefit_program_name:price.benefitProgramName,benefit_type:price.benefitType,benefit_value:price.benefitValue,original_price:price.originalPrice,discount_amount:price.discountAmount,final_price:price.finalPrice,benefit_applied:price.benefitApplied,pricing_rule_version:price.pricingRuleVersion});
 }
 const links=await db.from('representative_company_links').select('representative_id').eq('company_id',company.id);
 if(links.error||links.data?.length>1)throw new ManualFeeError('manual_representative_unresolved',503);
 const decision=await prepareManualFeeDecision(db,company,environment,items.map(p=>p.final_price),links.data?.[0]?.representative_id??null,getSecret);
 const subtotal=items.reduce((s,p)=>s+p.final_price,0);
 const fees=await db.from('event_fees').select('name,fee_type,value,is_active').eq('event_id',event.id).eq('company_id',company.id).eq('is_active',true);
 if(fees.error)throw new ManualFeeError('manual_event_fees_unresolved',503);
 const additional=calculateFeesTotal({passengerUnitPrices:items.map(p=>p.final_price),eventFees:fees.data??[],passPlatformFeeToCustomer:false,progressivePlatformFeeTotal:0});
 decision.snapshot={...decision.snapshot,representative_id:links.data?.[0]?.representative_id??null,receipt_method:body.receipt_method,financial_item_prices:items.map(p=>p.final_price),event_fees:fees.data??[],additional_amount:additional};
 if(!['pix','dinheiro','cartao','outro'].includes(body.receipt_method))throw new ManualFeeError('manual_receipt_method_invalid',400);
 if(body.return_trip_id)items.push(...items.slice().map((p,i)=>({...p,id:crypto.randomUUID(),trip_id:body.return_trip_id,seat_id:null,seat_label:`VOLTA-${i+1}`,sort_order:items.length+i,benefit_program_id:null,benefit_program_name:null,benefit_type:null,benefit_value:null,original_price:0,discount_amount:0,final_price:0,benefit_applied:false})));
 const registered=await db.rpc('register_manual_sale',{p_request_key:body.request_key,p_request_hash:requestHash,p_actor_id:operator.userId,p_sale:{company_id:company.id,event_id:event.id,trip_id:body.trip_id,boarding_location_id:body.boarding_location_id,
  customer_name:items[0].passenger_name,customer_cpf:items[0].passenger_cpf,customer_phone:items[0].passenger_phone,quantity:body.passengers.length,unit_price:unitPrice,gross_amount:Math.round((subtotal+additional)*100)/100,benefit_total_discount:items.reduce((s,p)=>s+p.discount_amount,0),seller_id:body.seller_id??null,payment_gateway:decision.gateway,payment_environment:environment,
  reservation_expires_at:new Date(Date.now()+Math.max(1,Number(company.manual_reservation_ttl_minutes??4320))*60000).toISOString()},p_passengers:items,p_operation:decision});
 if(registered.error)throw new ManualFeeError('manual_registration_failed');
 return registered.data;
}
