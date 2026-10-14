import {beforeEach,describe,it,expect,vi} from 'vitest';
import {ManualFeeDiagnosticError,manualFeeProviderDiagnostic} from '../../supabase/functions/_shared/manual-fee/diagnostics';
const mocks=vi.hoisted(()=>({serve:vi.fn(),client:vi.fn(),read:vi.fn(),handle:vi.fn(),log:vi.fn()}));
vi.mock('https://deno.land/std@0.190.0/http/server.ts',()=>({serve:mocks.serve}));
vi.mock('https://esm.sh/@supabase/supabase-js@2',()=>({createClient:mocks.client}));
vi.mock('../../supabase/functions/_shared/payment-observability.ts',()=>({logPaymentTrace:mocks.log,logSaleIntegrationEvent:mocks.log,logSaleOperationalEvent:mocks.log}));
vi.mock('../../supabase/functions/_shared/manual-fee/runtime.ts',()=>({readManualFeeOperation:mocks.read,handleManualFeeOperation:mocks.handle}));
const entrypoint='../../supabase/functions/create-platform-fee-checkout/index.ts';
await import(/* @vite-ignore */ entrypoint);
const handler=mocks.serve.mock.calls[0][0] as (req:Request)=>Promise<Response>;
let roles:{role:string;company_id:string}[]=[];
beforeEach(()=>{
 vi.clearAllMocks();vi.stubGlobal('Deno',{env:{get:()=>undefined}});
 roles=[{role:'gerente',company_id:'owned-company'}];
 mocks.client.mockReturnValue({auth:{getUser:async()=>({data:{user:{id:'synthetic-user'}},error:null})},from:(table:string)=>{
  const result=()=>({data:table==='user_roles'?roles:{id:'synthetic-sale',company_id:'owned-company'},error:null});
  const q:any={select:()=>q,eq:()=>q,single:async()=>result(),then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;
 }});
 mocks.read.mockResolvedValue({id:'synthetic-operation'});
 const diagnostic=manualFeeProviderDiagnostic({ok:false,status:401,data:{error_messages:[{code:'10003',parameter_name:'customer.email',description:'Required'}]},indeterminate:false,errorMessages:[]},'POST /orders');
 mocks.handle.mockRejectedValue(new ManualFeeDiagnosticError('manual_fee_create_rejected',422,diagnostic));
});
const request=(auth=true)=>new Request('https://synthetic.test',{method:'POST',headers:auth?{authorization:'Bearer synthetic-session'}:{},body:JSON.stringify({sale_id:'synthetic-sale'})});
describe('operator responses and administrative diagnostic boundary',()=>{
 it('keeps technical provider details out of an authorized operator response',async()=>{
  const response=await handler(request());expect(response.status).toBe(422);expect(await response.json()).toEqual({error:'manual_fee_create_rejected'});expect(mocks.handle).toHaveBeenCalledTimes(1);
 });
 it('rejects a request without authentication before reading the operation',async()=>{
  const response=await handler(request(false));expect(response.status).toBe(401);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.handle).not.toHaveBeenCalled();
 });
 it.each(['other_company','insufficient_role'])('rejects %s before diagnostics or payment orchestration',async scenario=>{
  roles=scenario==='other_company'?[{role:'gerente',company_id:'other-company'}]:[{role:'operador',company_id:'owned-company'}];
  const response=await handler(request());expect(response.status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.handle).not.toHaveBeenCalled();
 });
});
