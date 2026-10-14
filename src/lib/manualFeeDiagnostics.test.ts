import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {manualFeeProviderDiagnostic,ManualFeeDiagnosticError} from '../../supabase/functions/_shared/manual-fee/diagnostics';
import {recordManualFeeDiagnostic,handleManualFeeOperation} from '../../supabase/functions/_shared/manual-fee/runtime';
import type {FeeOperation} from '../../supabase/functions/_shared/manual-fee/contracts';

const mocks=vi.hoisted(()=>({integration:vi.fn(),trace:vi.fn(),operational:vi.fn()}));
vi.mock('../../supabase/functions/_shared/payment-observability.ts',()=>({logSaleIntegrationEvent:mocks.integration,logPaymentTrace:mocks.trace,logSaleOperationalEvent:mocks.operational}));
const op:FeeOperation={id:'synthetic-operation',sale_id:'synthetic-sale',company_id:'synthetic-company',gateway:'pagbank',environment:'sandbox',issuer_account_id:'synthetic-issuer',amount_cents:600,reference:'platform_fee_synthetic-sale',idempotency_key:'original_key',external_id:null,state:'prepared',snapshot:{customer:{name:'Company Name',email:'private@example.test',document:'12345678901'},allocations:[]}};
const provider=(status:number,data:unknown=null,indeterminate=false)=>({ok:status>=200&&status<300,status,data,indeterminate,errorMessages:[]});
const rejection={error_messages:[{code:'10003',parameter_name:'customer.email',description:'customer.email is required'}]};
beforeEach(()=>{vi.resetAllMocks();mocks.integration.mockResolvedValue(true);});
afterEach(()=>vi.unstubAllGlobals());

describe('bounded and sanitized manual fee provider diagnostics',()=>{
 it('keeps original HTTP, code, parameter, safe description and provider timestamp',()=>{
  const d=manualFeeProviderDiagnostic(provider(400,rejection),'POST /orders');
  expect(d).toMatchObject({http_status_original:400,classification:'required_data_rejected',stage:'POST /orders',provider_errors:[{code:'10003',parameter_name:'customer.email',description:'O provedor informou ausência de dado obrigatório.',description_normalized:true}]});expect(Number.isNaN(Date.parse(d.occurred_at))).toBe(false);
 });
 it.each([[401,'authorization_failure'],[403,'authorization_failure'],[422,'provider_rejected'],[409,'idempotency_conflict'],[429,'temporary_gateway_failure'],[503,'temporary_gateway_failure'],[0,'indeterminate'],[200,'unexpected_response'],[404,'unexpected_response']])('classifies HTTP %s as %s without changing financial decisions',(status,classification)=>expect(manualFeeProviderDiagnostic(provider(status as number),'POST /orders').classification).toBe(classification));
 it('inconclusive transport takes precedence over HTTP rejection',()=>expect(manualFeeProviderDiagnostic(provider(400,rejection,true),'POST /orders')).toMatchObject({http_status_original:400,classification:'indeterminate'}));
 it('never retains arbitrary external descriptions or unknown fields',()=>{
  const privateText='Authorization: Bearer synthetic-secret; Company Name, private@example.test, 123.456.789-01, +55 (65) 99999-9999; original_key';
  const result=provider(400,{customer:{name:'Company Name'},token:'synthetic-secret',error_messages:[{code:'invalid_parameter',parameter_name:'customer.tax_id',description:`Invalid: ${privateText}`,authorization:'synthetic-secret'},{code:'original_key',parameter_name:'private@example.test',description:privateText},{code:'12345678901',parameter_name:'synthetic_secret',description:'Unexpected Company Name'},{code:'John_Doe',description:'99999999'}]});
  const d=manualFeeProviderDiagnostic(result,'POST /orders',['synthetic-secret','original_key']);const text=JSON.stringify(d);
  for(const sensitive of ['synthetic-secret','original_key','Company Name','private@example.test','123.456.789-01','12345678901','99999-9999','John_Doe','99999999'])expect(text).not.toContain(sensitive);
  expect(d.provider_errors[0]).toMatchObject({code:'invalid_parameter',parameter_name:'customer.tax_id',description:'O provedor informou valor ou formato inválido.'});expect(d.provider_errors[1].code).toBe(null);expect(d.provider_errors[2].parameter_name).toBe(null);
 });
 it('allows schema paths with array indexes, never arbitrary values',()=>expect(manualFeeProviderDiagnostic(provider(400,{error_messages:[{code:'10003',parameter_name:'customer.phones[0].number'}]}),'POST /orders').provider_errors[0].parameter_name).toBe('customer.phones[0].number'));
 it.each([null,'<html>private@example.test</html>',{error_messages:'unexpected'}, {error_messages:[null,17,'private@example.test']}])('handles unexpected response shape without raw logging',data=>{
  const d=manualFeeProviderDiagnostic(provider(400,data),'POST /orders');expect(JSON.stringify(d)).not.toContain('private@example.test');expect(d.provider_errors.length).toBeLessThanOrEqual(5);
 });
 it('limits messages and identifier lengths without truncating a secret into a valid code',()=>{
  const errors=Array.from({length:100},()=>({code:'x'.repeat(1000),parameter_name:'customer.'+'x'.repeat(1000),description:'s'.repeat(100000)}));
  const d=manualFeeProviderDiagnostic(provider(400,{error_messages:errors}),'POST /orders');expect(d.provider_errors).toHaveLength(5);expect(d.provider_errors[0]).toMatchObject({code:null,parameter_name:null});expect(JSON.stringify(d).length).toBeLessThan(1800);
 });
 it('normalizes a Pix key reason without asserting that account capability was verified',()=>expect(manualFeeProviderDiagnostic(provider(400,{error_messages:[{code:'invalid_parameter',description:'Account does not have a valid Pix key: private@example.test'}]}),'POST /orders').provider_errors[0].description).toBe('O provedor informou um problema relacionado à chave Pix.'));
});

describe('existing integration log and runtime',()=>{
 const secrets=(name:string)=>name==='PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX'?'synthetic-issuer':name==='PAGBANK_SMARTBUS_TOKEN_SANDBOX'?'synthetic-token':name==='SUPABASE_URL'?'https://synthetic.test':undefined;
 function db(failPersistence=false,initial:FeeOperation=op){
  let row=structuredClone(initial);let fail=failPersistence;const sale={id:op.sale_id,company_id:op.company_id,status:'reservado'};
  return {sale,get row(){return structuredClone(row);},rpc:vi.fn(async(name:string)=>{expect(name).toBe('claim_manual_fee_creation');const won=row.state==='prepared';if(won)row.state='creating';return {data:won,error:null};}),from:(table:string)=>{
   let patch:Record<string,unknown>|undefined;const filters:((r:FeeOperation)=>boolean)[]=[];
   const execute=()=>{if(table==='companies')return {data:{manual_fee_flow_enabled:true},error:null};if(!filters.every(f=>f(row)))return {data:null,error:null};if(patch?.external_id&&fail){fail=false;return {data:null,error:{message:'private write failure'}};}if(patch)row={...row,...patch};return {data:structuredClone(row),error:null};};
   const q:any={select:()=>q,update:(p:Record<string,unknown>)=>{patch=p;return q;},eq:(k:keyof FeeOperation,v:unknown)=>{if(table==='platform_fee_operations')filters.push(r=>r[k]===v);return q;},in:(k:keyof FeeOperation,values:unknown[])=>{filters.push(r=>values.includes(r[k]));return q;},single:async()=>execute(),maybeSingle:async()=>execute(),then:(resolve:any,reject:any)=>Promise.resolve(execute()).then(resolve,reject)};return q;
  }};
 }
 it('records external 401 separately from internal 422, and retry never sends another POST',async()=>{
  const store=db();const fetch=vi.fn(async()=>Response.json(rejection,{status:401}));vi.stubGlobal('fetch',fetch);
  await expect(handleManualFeeOperation(store,store.sale,store.row,true,secrets)).rejects.toMatchObject({code:'manual_fee_create_rejected',status:422});
  expect(store.row).toMatchObject({state:'indeterminate',external_id:null,idempotency_key:'original_key',snapshot:op.snapshot});expect(store.sale.status).toBe('reservado');
  expect(mocks.integration).toHaveBeenCalledTimes(1);expect(mocks.integration.mock.calls[0][0]).toMatchObject({provider:'pagbank',saleId:op.sale_id,companyId:op.company_id,httpStatus:401,eventType:'manual_fee_gateway_failure',incidentCode:'manual_fee_create_rejected',responseJson:{operation_id:op.id,internal_http_status:422,http_status_original:401,classification:'authorization_failure'}});
  await expect(handleManualFeeOperation(store,store.sale,store.row,true,secrets)).rejects.toThrow('manual_fee_order_id_required');expect(fetch).toHaveBeenCalledTimes(1);expect(mocks.integration).toHaveBeenCalledTimes(1);expect(store.rpc.mock.calls.every(([name])=>name==='claim_manual_fee_creation')).toBe(true);
 });
 it('captures successful provider HTTP when local persistence fails, without issuing or retrying',async()=>{
  const store=db(true);const fetch=vi.fn(async()=>Response.json({id:'ORDE_SYNTHETIC',reference_id:op.reference,qr_codes:[{amount:{value:600},text:'synthetic-qr'}]},{status:201}));vi.stubGlobal('fetch',fetch);
  await expect(handleManualFeeOperation(store,store.sale,store.row,true,secrets)).rejects.toThrow('manual_fee_persistence_failed');expect(mocks.integration.mock.calls[0][0]).toMatchObject({httpStatus:201,responseJson:{classification:'persistence_failure',internal_error_code:'manual_fee_persistence_failed'}});expect(store.row.state).toBe('indeterminate');
  await expect(handleManualFeeOperation(store,store.sale,store.row,true,secrets)).rejects.toThrow('manual_fee_order_id_required');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('records query failure at GET stage without logging a response payload',async()=>{
  const store=db(false,{...op,state:'pending',external_id:'ORDE_SYNTHETIC'});const fetch=vi.fn(async()=>Response.json({error_messages:[{code:'provider_unavailable',description:'private@example.test'}],raw:'secret'},{status:503}));vi.stubGlobal('fetch',fetch);
  await expect(handleManualFeeOperation(store,store.sale,store.row,false,secrets)).rejects.toThrow('manual_fee_query_failed');const {supabaseAdmin:_client,...logged}=mocks.integration.mock.calls[0][0];expect(logged).toMatchObject({httpStatus:503,responseJson:{stage:'GET /orders/{id}',classification:'temporary_gateway_failure'}});expect(JSON.stringify(logged)).not.toContain('private@example.test');expect(JSON.stringify(logged)).not.toContain('secret');expect(store.row.state).toBe('pending');
 });
 it('falls back to the existing Cloud trace when log insertion fails',async()=>{
  mocks.integration.mockResolvedValue(false);const error=new ManualFeeDiagnosticError('manual_fee_create_rejected',422,manualFeeProviderDiagnostic(provider(400,rejection),'POST /orders'));await recordManualFeeDiagnostic({},op,error);
  expect(mocks.trace).toHaveBeenCalledWith('error','manual-fee','manual_fee_gateway_failure',expect.objectContaining({http_status_original:400,operation_id:op.id}));
 });
 it('logging failures cannot replace the original financial error or create a new attempt',async()=>{
  mocks.integration.mockRejectedValue(Error('logger unavailable'));mocks.trace.mockImplementation(()=>{throw Error('trace unavailable');});const store=db();const fetch=vi.fn(async()=>Response.json(rejection,{status:400}));vi.stubGlobal('fetch',fetch);
  await expect(handleManualFeeOperation(store,store.sale,store.row,true,secrets)).rejects.toThrow('manual_fee_create_rejected');expect(fetch).toHaveBeenCalledTimes(1);expect(store.row.state).toBe('indeterminate');
 });
 it('never logs through this seam for Asaas or for an old operation with no provider response',async()=>{
  const error=new ManualFeeDiagnosticError('manual_fee_create_rejected',422,manualFeeProviderDiagnostic(provider(400,rejection),'POST /orders'));await recordManualFeeDiagnostic({}, {...op,gateway:'asaas'},error);await recordManualFeeDiagnostic({},op,Error('local-only'));expect(mocks.integration).not.toHaveBeenCalled();expect(mocks.trace).not.toHaveBeenCalled();
 });
});
