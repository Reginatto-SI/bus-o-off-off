import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,render,screen,cleanup} from '@testing-library/react';
import {ManualFeePixDialog} from './ManualFeePixDialog';
import {MANUAL_RECEIPT_UPDATED_EVENT} from '@/lib/manualSaleReceipt';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('qrcode.react',()=>({QRCodeSVG:()=>null}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();});
afterEach(()=>{cleanup();vi.useRealTimers();});
const openPix=()=>window.dispatchEvent(new CustomEvent('smartbus:manual-fee-pix',{detail:{saleId:'synthetic-sale',pix:{qr_text:'synthetic-qr',amount_cents:600,expires_at:null}}}));
describe('existing PIX confirmation refresh hint',()=>{
 it('notifies the open receipt only after successful backend finalization',async()=>{
  mocks.invoke.mockResolvedValue({data:{paymentStatus:'pago'},error:null});const confirmed=vi.fn(),hint=vi.fn();window.addEventListener(MANUAL_RECEIPT_UPDATED_EVENT,hint);
  try{render(<ManualFeePixDialog onConfirmed={confirmed}/>);await act(async()=>{openPix();});expect(confirmed).toHaveBeenCalledTimes(1);expect(hint.mock.calls[0][0].detail).toEqual({saleId:'synthetic-sale'});expect(mocks.invoke).toHaveBeenCalledWith('verify-payment-status',{body:{sale_id:'synthetic-sale'}});}finally{window.removeEventListener(MANUAL_RECEIPT_UPDATED_EVENT,hint);}
 });
 it('does not claim tickets were released on an incomplete issuance response',async()=>{
  mocks.invoke.mockResolvedValue({data:{error:'manual_issuance_incomplete'},error:{}});const confirmed=vi.fn(),hint=vi.fn();window.addEventListener(MANUAL_RECEIPT_UPDATED_EVENT,hint);
  try{render(<ManualFeePixDialog onConfirmed={confirmed}/>);await act(async()=>{openPix();});expect(screen.getByText('Taxa SmartBus da venda manual')).toBeInTheDocument();expect(confirmed).not.toHaveBeenCalled();expect(hint).not.toHaveBeenCalled();}finally{window.removeEventListener(MANUAL_RECEIPT_UPDATED_EVENT,hint);}
 });
});
