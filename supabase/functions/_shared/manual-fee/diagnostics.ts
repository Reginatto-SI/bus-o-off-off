import {ManualFeeError} from './auth.ts';
import type {PagbankHttpResult} from '../pagbank/client.ts';

export type ManualFeeDiagnostic = {
 stage:'POST /orders'|'GET /orders/{id}';
 http_status_original:number|null;
 classification:'provider_response'|'authorization_failure'|'required_data_rejected'|'provider_rejected'|'temporary_gateway_failure'|'indeterminate'|'idempotency_conflict'|'unexpected_response'|'persistence_failure'|'integrity_failure';
 occurred_at:string;
 provider_errors:{code:string|null;parameter_name:string|null;description:string;description_normalized:boolean}[];
};

export class ManualFeeDiagnosticError extends ManualFeeError {
 constructor(code:string,status:number,public diagnostic:ManualFeeDiagnostic){super(code,status);}
}

// These are field names, never field values. Unknown paths are omitted instead
// of allowing arbitrary provider text into the administrative log.
const FIELD_NAMES=new Set(['customer','name','email','tax_id','phones','country','area','number','items','reference_id','quantity','unit_amount','qr_codes','amount','value','expiration_date','notification_urls','charges','payment_method','type','pix','split','receivers','account','id','options']);
const CODE_WORDS=new Set(['invalid','parameter','parameters','required','mandatory','missing','unauthorized','forbidden','authentication','authorization','insufficient','permission','permissions','not','found','error','bad','request','value','format','unsupported','operation','payment','method','account','pix','key','charge','order','unavailable','internal','server','provider','timeout','idempotency','conflict','limit','exceeded','rate','too','many','requests','data','customer','email','tax','id','document','failed','rejected','inconsistent','duplicate','general','validation']);
function safeIdentifier(value:unknown,kind:'code'|'parameter',sensitiveValues:string[]) {
 if(typeof value!=='string'||!value||value.length>(kind==='code'?64:128))return null;
 if(sensitiveValues.some(secret=>secret&&value.toLowerCase().includes(secret.toLowerCase())))return null;
 if(kind==='code')return /^\d{5}$/.test(value)||(/^[a-z]+(?:_[a-z]+)*$/i.test(value)&&value.toLowerCase().split('_').every(word=>CODE_WORDS.has(word)))?value:null;
 if(!/^[a-z_]+(?:\[\d{1,3}\])?(?:\.[a-z_]+(?:\[\d{1,3}\])?)*$/i.test(value))return null;
 return value.replace(/\[\d+\]/g,'').split('.').every(field=>FIELD_NAMES.has(field))?value:null;
}

// Never store arbitrary descriptions: regex redaction alone cannot protect
// names or unexpected secrets echoed by a provider. Normalize recognizable
// reasons to fixed descriptions; retain code/path separately for investigation.
function safeDescription(value:unknown) {
 const text=typeof value==='string'?value.slice(0,512).toLowerCase():'';
 if(/(?:\brequired\b|\bmandatory\b|obrigat[oó]ri[oa])/.test(text))return {description:'O provedor informou ausência de dado obrigatório.',description_normalized:true,required:true};
 if(/(?:not authorized|unauthorized|forbidden|unauthorised|permiss[aã]o|n[aã]o autorizad)/.test(text))return {description:'O provedor informou restrição de autorização.',description_normalized:true,required:false};
 if(/(?:pix).*(?:key|chave)|(?:key|chave).*(?:pix)/.test(text))return {description:'O provedor informou um problema relacionado à chave Pix.',description_normalized:true,required:false};
 if(/(?:invalid|inv[aá]lid|format)/.test(text))return {description:'O provedor informou valor ou formato inválido.',description_normalized:true,required:false};
 if(/(?:not allowed|not supported|n[aã]o permitid|n[aã]o suportad)/.test(text))return {description:'O provedor informou operação ou dado não permitido.',description_normalized:true,required:false};
 return {description:'Descrição externa omitida por segurança; consultar código e parâmetro.',description_normalized:false,required:false};
}

export function manualFeeProviderDiagnostic(result:PagbankHttpResult,stage:ManualFeeDiagnostic['stage'],sensitiveValues:string[]=[]):ManualFeeDiagnostic {
 const status=Number.isInteger(result.status)&&result.status>=100&&result.status<=599?result.status:null;
 const body=result.data as {error_messages?:unknown}|null;
 const rawErrors=Array.isArray(body?.error_messages)?body.error_messages.slice(0,5):[];
 let required=false;
 const provider_errors=rawErrors.map((item:unknown)=>{
  const entry=item&&typeof item==='object'?item as Record<string,unknown>:{};
  const description=safeDescription(entry.description);required ||= description.required;
  return {code:safeIdentifier(entry.code,'code',sensitiveValues),parameter_name:safeIdentifier(entry.parameter_name,'parameter',sensitiveValues),description:description.description,description_normalized:description.description_normalized};
 });
 const classification:ManualFeeDiagnostic['classification']=result.indeterminate||status===null?'indeterminate'
  :status===401||status===403?'authorization_failure'
  :status===429||status>=500?'temporary_gateway_failure'
  :status===409?'idempotency_conflict'
  :!result.ok&&[400,422].includes(status)?required?'required_data_rejected':'provider_rejected'
  :!result.ok||!result.data?'unexpected_response':'provider_response';
 return {stage,http_status_original:status,classification,occurred_at:new Date().toISOString(),provider_errors};
}

export function withManualFeeDiagnostic(error:ManualFeeError,diagnostic:ManualFeeDiagnostic,classification?:ManualFeeDiagnostic['classification']) {
 return new ManualFeeDiagnosticError(error.code,error.status,{...diagnostic,...(classification?{classification}:{})});
}
