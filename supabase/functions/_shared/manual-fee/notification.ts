import {verifyPagbankWebhookSignature} from '../pagbank/core.ts';
import {ManualFeeError} from './auth.ts';
import type {FeeOperation} from './contracts.ts';
// Direct platform Orders: one account token, no seller/Connect or diagnostic fallbacks.
export async function authenticateManualPagbankNotification(op:FeeOperation,req:Request,rawBody:string,getSecret:(name:string)=>string|undefined) {
 if(op.gateway!=='pagbank'||op.environment!=='sandbox'||op.issuer_account_id!==getSecret('PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX'))throw new ManualFeeError('manual_notification_context_rejected',401);
 const token=getSecret('PAGBANK_SMARTBUS_TOKEN_SANDBOX');
 const result=await verifyPagbankWebhookSignature({rawBody,token,receivedSignature:req.headers.get('x-authenticity-token')});
 if(!result.valid)throw new ManualFeeError('pagbank_signature_mismatch',401);
}
