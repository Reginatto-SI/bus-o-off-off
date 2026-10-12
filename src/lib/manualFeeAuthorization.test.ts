import { describe, expect, it } from 'vitest';
import { authenticateManualOperator } from '../../supabase/functions/_shared/manual-fee/auth';
function db(roles: {role:string;company_id?:string}[], error: unknown = null) {
  return { auth: { getUser: async () => ({data:{user:{id:'u'}},error}) }, from: () => ({select:()=>({eq:async()=>({data:roles,error:null})})}) };
}
const request = () => new Request('https://example.test', {headers:{authorization:'Bearer synthetic-test'}});
describe('manual fee authorization',()=>{
 it('rejects missing session',async()=>{await expect(authenticateManualOperator(db([]),new Request('https://example.test'))).rejects.toMatchObject({status:401});});
 it('rejects invalid session',async()=>{await expect(authenticateManualOperator(db([],true),request())).rejects.toMatchObject({status:401});});
 it('rejects operator without management permission',async()=>{await expect(authenticateManualOperator(db([{role:'operador',company_id:'c'}]),request())).rejects.toMatchObject({status:403});});
 it('manager is restricted to own company',async()=>{const actor=await authenticateManualOperator(db([{role:'gerente',company_id:'c'}]),request());expect(()=>actor.assertCompany('c')).not.toThrow();expect(()=>actor.assertCompany('other')).toThrow('forbidden_company');});
 it('preserves global developer capability',async()=>{const actor=await authenticateManualOperator(db([{role:'developer'}]),request());expect(()=>actor.assertCompany('c')).not.toThrow();});
});
