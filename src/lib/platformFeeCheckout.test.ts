import {afterEach,describe,it,expect,vi} from 'vitest';
import {startPlatformFeeCheckout} from './platformFeeCheckout';

const mocks=vi.hoisted(()=>({invoke:vi.fn(),info:vi.fn(),warning:vi.fn(),error:vi.fn(),success:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('sonner',()=>({toast:{info:mocks.info,warning:mocks.warning,error:mocks.error,success:mocks.success}}));
afterEach(()=>vi.resetAllMocks());

describe('manual fee checkout presentation',()=>{
 it('presents the persisted PIX through the existing dialog event without releasing tickets',async()=>{
  const pix={qr_text:'synthetic-qr',amount_cents:600,expires_at:'2099-01-01T00:00:00Z'};mocks.invoke.mockResolvedValue({data:{pix,payment_id:'ORDE_SYNTHETIC',payment_status:'pending',already_paid:false},error:null});
  const listener=vi.fn();window.addEventListener('smartbus:manual-fee-pix',listener);const onWaived=vi.fn();
  try {expect(await startPlatformFeeCheckout({saleId:'synthetic-sale',onWaived})).toEqual({status:'pix'});expect(listener.mock.calls[0][0].detail).toEqual({saleId:'synthetic-sale',pix});expect(onWaived).not.toHaveBeenCalled();expect(mocks.invoke).toHaveBeenCalledTimes(1);}finally{window.removeEventListener('smartbus:manual-fee-pix',listener);}
 });
 it('a linked Order missing QR text asks for consultation rather than a new charge',async()=>{
  mocks.invoke.mockResolvedValue({data:{pix:{qr_text:null},payment_id:'ORDE_SYNTHETIC',payment_status:'pending'},error:null});
  expect(await startPlatformFeeCheckout({saleId:'synthetic-sale'})).toEqual({status:'error'});expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('consulte novamente'));expect(mocks.invoke).toHaveBeenCalledTimes(1);
 });
 it.each(['manual_fee_order_id_required','manual_fee_create_rejected'])('explains %s without retrying the endpoint',async code=>{
  mocks.invoke.mockResolvedValue({data:{error_code:code},error:{}});await startPlatformFeeCheckout({saleId:'synthetic-sale'});expect(mocks.warning).toHaveBeenCalledTimes(1);expect(mocks.invoke).toHaveBeenCalledTimes(1);
 });
 it('uncertain creation continues to preserve the reservation',async()=>{mocks.invoke.mockResolvedValue({data:{error:'manual_fee_create_unresolved'},error:{}});await startPlatformFeeCheckout({saleId:'synthetic-sale'});expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('reserva está preservada'));});
 it('keeps existing Asaas URL and consultation behavior',async()=>{
  mocks.invoke.mockResolvedValue({data:{url:'https://synthetic.test/asaas',reused_existing_payment:true},error:null});const open=vi.spyOn(window,'open').mockImplementation(()=>null);const onCheckoutOpened=vi.fn();
  try {expect(await startPlatformFeeCheckout({saleId:'synthetic-sale',mode:'consult_only',onCheckoutOpened})).toEqual({status:'opened',url:'https://synthetic.test/asaas'});expect(open).toHaveBeenCalledWith('https://synthetic.test/asaas','_blank');expect(onCheckoutOpened).toHaveBeenCalledWith('https://synthetic.test/asaas');expect(mocks.invoke).toHaveBeenCalledWith('create-platform-fee-checkout',{body:{sale_id:'synthetic-sale',consult_only:true}});}finally{open.mockRestore();}
 });
});
