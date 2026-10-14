import {afterEach,describe,it,expect,vi} from 'vitest';
import {logSaleIntegrationEvent} from '../../supabase/functions/_shared/payment-observability';
vi.mock('https://esm.sh/@supabase/supabase-js@2.39.0',()=>({createClient:vi.fn()}));
afterEach(()=>vi.restoreAllMocks());
const event={saleId:'synthetic-sale',companyId:'synthetic-company',provider:'pagbank' as const,direction:'outgoing_request' as const,eventType:'manual_fee_gateway_failure',processingStatus:'failed' as const,httpStatus:401,message:'Safe description'};
describe('existing payment integration logger result',()=>{
 it('persists the original provider HTTP and reports success',async()=>{const insert=vi.fn(async(_row:Record<string,unknown>)=>({error:null}));const db={from:vi.fn(()=>({insert}))};expect(await logSaleIntegrationEvent({...event,supabaseAdmin:db})).toBe(true);expect(db.from).toHaveBeenCalledWith('sale_integration_logs');expect(insert.mock.calls[0][0]).toMatchObject({http_status:401,message:'Safe description'});});
 it.each(['returned','thrown'])('detects %s storage error without logging its raw message',async mode=>{
  const trace=vi.spyOn(console,'error').mockImplementation(()=>{});const error={code:'23514',message:'private@example.test Authorization Bearer synthetic-secret'};const insert=vi.fn(async()=>{if(mode==='thrown')throw error;return {error};});
  expect(await logSaleIntegrationEvent({...event,supabaseAdmin:{from:()=>({insert})}})).toBe(false);const text=JSON.stringify(trace.mock.calls);expect(text).toContain('23514');expect(text).not.toContain('private@example.test');expect(text).not.toContain('synthetic-secret');
 });
});
