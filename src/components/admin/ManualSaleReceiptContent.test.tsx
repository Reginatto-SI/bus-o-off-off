import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,fireEvent,render,screen,cleanup} from '@testing-library/react';
import {ManualSaleReceiptContent} from './ManualSaleReceiptContent';
import {Dialog,DialogContent} from '@/components/ui/dialog';
import {resolveManualReceipt,type ManualReceiptSnapshot} from '@/lib/manualSaleReceipt';
import {receiptSale,paidReceiptSale,receiptTickets,receiptManifest,receiptCard} from '@/test/manualReceiptFixture';
const mocks=vi.hoisted(()=>({read:vi.fn(),checkout:vi.fn(),pdf:vi.fn(),close:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/manualSaleReceipt',async importOriginal=>({...await importOriginal<typeof import('@/lib/manualSaleReceipt')>(),readManualSaleReceipt:mocks.read}));
vi.mock('@/lib/platformFeeCheckout',()=>({startPlatformFeeCheckout:mocks.checkout}));
vi.mock('@/lib/ticketPdfGenerator',()=>({generateTicketPdf:mocks.pdf}));
vi.mock('@/lib/ticketImageGenerator',()=>({generateTicketImageFromCanvas:vi.fn()}));
vi.mock('qrcode.react',async()=>{const {forwardRef}=await import('react');return {QRCodeCanvas:forwardRef<HTMLCanvasElement,{value:string}>(({value},ref)=><canvas ref={ref} data-qr={value}/>)};});
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
const pending=resolveManualReceipt(receiptSale,{state:'pending',items:receiptManifest},[]);
const issuing=resolveManualReceipt(receiptSale,{state:'confirmed',items:receiptManifest},receiptTickets.slice(0,1));
const complete=resolveManualReceipt(paidReceiptSale,{state:'confirmed',items:receiptManifest},receiptTickets);
const props={saleId:receiptSale.id,companyId:receiptSale.company_id,activeCompanyId:receiptSale.company_id,open:true,canManage:true,initialTickets:receiptManifest.map(ticket=>({ticket,ticketCardData:receiptCard(ticket)})),buildTicketCardData:receiptCard,onClose:mocks.close};
function Receipt({open=true}:{open?:boolean}){return <Dialog open={open}><DialogContent aria-describedby={undefined}><ManualSaleReceiptContent {...props} open={open}/></DialogContent></Dialog>;}
const flush=async()=>{await act(async()=>{});};
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();mocks.read.mockResolvedValue(pending);mocks.checkout.mockResolvedValue({status:'pix'});vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,synthetic');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('open manual sale receipt',()=>{
 it('starts reserved and offers payment only after reading official pending data',async()=>{
  render(<Receipt/>);expect(screen.queryByRole('button',{name:'Pagar taxa agora'})).toBe(null);await flush();expect(screen.getByRole('button',{name:'Pagar taxa agora'})).toBeEnabled();expect(screen.getByText('Comprovante de Reserva')).toBeInTheDocument();expect(mocks.checkout).not.toHaveBeenCalled();
 });
 it('updates in place, removes payment and exports the definitive PDF with the backend QR',async()=>{
  mocks.read.mockResolvedValueOnce(pending).mockResolvedValue(complete);render(<Receipt/>);await flush();
  fireEvent.click(screen.getByRole('button',{name:/Pessoa Sintética 1/}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(screen.getByText('Comprovante de Venda')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar taxa agora'})).toBe(null);expect(screen.getByText('Venda concluída. Passagens atualizadas.')).toBeInTheDocument();expect(mocks.close).not.toHaveBeenCalled();expect(screen.queryByText(/A reserva continua ativa/)).toBe(null);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Salvar PDF'}));});
  expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ticket:expect.objectContaining({ticketId:'ticket-1',ticketNumber:'TICKET-1',qrCodeToken:'backend-qr-1',saleStatus:'pago',purchaseConfirmedAt:paidReceiptSale.payment_confirmed_at,companyName:'Empresa sintética',totalPaid:102})}));expect(mocks.checkout).not.toHaveBeenCalled();
 });
 it('confirmed payment with partial issuance never offers payment or an operational ticket',async()=>{
  mocks.read.mockResolvedValue(issuing);render(<Receipt/>);await flush();expect(screen.getByText('Pagamento confirmado. Estamos finalizando suas passagens.')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar taxa agora'})).toBe(null);expect(screen.queryByRole('button',{name:'Salvar PDF'})).toBe(null);expect(mocks.close).not.toHaveBeenCalled();
 });
 it('preserves confirmation on lookup failure and permits a simple reload',async()=>{
  mocks.read.mockResolvedValueOnce(issuing).mockRejectedValueOnce(Error('offline')).mockResolvedValue(complete);render(<Receipt/>);await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(screen.getByText('Pagamento confirmado. Estamos finalizando suas passagens.')).toBeInTheDocument();expect(screen.getByText(/Não foi possível atualizar agora/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar taxa agora'})).toBe(null);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Consultar novamente'}));});expect(screen.getByText('Comprovante de Venda')).toBeInTheDocument();
 });
 it('checks again before payment, suppressing a stale action when the fee was just confirmed',async()=>{
  mocks.read.mockResolvedValueOnce(pending).mockResolvedValue(issuing);render(<Receipt/>);await flush();await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Pagar taxa agora'}));});expect(mocks.checkout).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Pagar taxa agora'})).toBe(null);
 });
 it('coalesces repeated clicks into one existing checkout call',async()=>{
  let release!:(s:ManualReceiptSnapshot)=>void;render(<Receipt/>);await flush();mocks.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue(pending);
  act(()=>{const button=screen.getByRole('button',{name:'Pagar taxa agora'});fireEvent.click(button);fireEvent.click(button);});await act(async()=>{release(pending);});expect(mocks.checkout).toHaveBeenCalledTimes(1);expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({saleId:props.saleId}));
 });
 it('reopening reloads current backend data without losing the sale',async()=>{
  const {rerender}=render(<Receipt/>);await flush();fireEvent.click(screen.getByRole('button',{name:'Fechar e pagar depois'}));expect(mocks.close).toHaveBeenCalledTimes(1);rerender(<Receipt open={false}/>);await flush();mocks.read.mockResolvedValue(complete);rerender(<Receipt/>);await flush();expect(screen.getByText('Comprovante de Venda')).toBeInTheDocument();
 });
 it('does not query or display a receipt in another company context',async()=>{
  render(<Dialog open><DialogContent aria-describedby={undefined}><ManualSaleReceiptContent {...props} activeCompanyId="other-company"/></DialogContent></Dialog>);await flush();expect(mocks.read).not.toHaveBeenCalled();expect(screen.getByText(/Selecione a empresa/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar taxa agora'})).toBe(null);
 });
});
