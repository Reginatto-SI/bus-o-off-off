// Authorization belongs to the manual administrative flow, never to a gateway.
export class ManualFeeError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

// deno-lint-ignore no-explicit-any
export async function authenticateManualOperator(db: any, req: Request) {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) throw new ManualFeeError('unauthorized', 401);
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data?.user?.id) throw new ManualFeeError('unauthorized', 401);
  const roles = await db.from('user_roles').select('role,company_id').eq('user_id', data.user.id);
  if (roles.error) throw new ManualFeeError('authorization_unavailable', 503);
  const developer = (roles.data ?? []).some((r: {role: string}) => r.role === 'developer');
  const companies = (roles.data ?? []).filter((r: {role: string}) => r.role === 'gerente').map((r: {company_id: string}) => r.company_id);
  if (!developer && !companies.length) throw new ManualFeeError('forbidden', 403);
  return { userId: data.user.id as string, assertCompany(companyId: string) {
    if (!developer && !companies.includes(companyId)) throw new ManualFeeError('forbidden_company', 403);
  }};
}
