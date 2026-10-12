import { ManualFeeError } from './auth.ts';
export type FeeOperation = {
 id: string; sale_id: string; company_id: string; gateway: 'asaas'|'pagbank';
 environment: 'sandbox'|'production'; issuer_account_id: string; amount_cents: number;
 reference: string; idempotency_key: string; state: string; external_id: string|null;
 snapshot: { customer: {name:string;document:string;email?:string}; allocations: Allocation[]; [key:string]:unknown };
 presentation?: Record<string,unknown>|null;
};
export type Allocation = { kind:'marketplace'|'socio'|'representative'; beneficiary_id:string; destination:string; amount_cents:number };
export type FeeFacts = { externalId:string; reference:string; amountCents:number; currency:'BRL';
 issuerAccountId:string; environment:string; state:'pending'|'paid'|'terminal'|'indeterminate'; rawStatus:string;
 presentation?:Record<string,unknown>; nativeDestinations:string[] };
export type FeeAdapter = { create(op:FeeOperation):Promise<FeeFacts>; query(op:FeeOperation):Promise<FeeFacts|null> };
export function assertFeeFacts(op:FeeOperation,f:FeeFacts) {
 if (!f.externalId || (op.external_id && op.external_id!==f.externalId) || f.reference!==op.reference ||
 f.amountCents!==op.amount_cents || f.currency!=='BRL' || f.issuerAccountId!==op.issuer_account_id || f.environment!==op.environment)
 throw new ManualFeeError('manual_fee_integrity_mismatch');
}
