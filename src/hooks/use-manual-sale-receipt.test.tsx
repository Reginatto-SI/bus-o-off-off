import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {act,renderHook} from '@testing-library/react';
import {useManualSaleReceipt} from './use-manual-sale-receipt';
import {MANUAL_RECEIPT_UPDATED_EVENT,resolveManualReceipt,type ManualReceiptSnapshot} from '@/lib/manualSaleReceipt';
import {receiptSale,paidReceiptSale,receiptTickets,receiptManifest} from '@/test/manualReceiptFixture';
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/manualSaleReceipt',async importOriginal=>({...await importOriginal<typeof import('@/lib/manualSaleReceipt')>(),readManualSaleReceipt:mocks.read}));
const pending=resolveManualReceipt(receiptSale,{state:'pending',items:receiptManifest},[]);
const issuing=resolveManualReceipt(receiptSale,{state:'confirmed',items:receiptManifest},[]);
const complete=resolveManualReceipt(paidReceiptSale,{state:'confirmed',items:receiptManifest},receiptTickets);
const options={saleId:receiptSale.id,companyId:receiptSale.company_id,enabled:true};
const flush=async()=>{await act(async()=>{});};
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();mocks.read.mockResolvedValue(pending);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
describe('shared manual receipt subscription',()=>{
 it('does nothing while closed and reloads when reopened',async()=>{
  const {result,rerender}=renderHook(props=>useManualSaleReceipt(props),{initialProps:{...options,enabled:false}});await flush();expect(mocks.read).not.toHaveBeenCalled();
  rerender(options);await flush();expect(result.current.snapshot?.phase).toBe('reserved');rerender({...options,enabled:false});await flush();expect(result.current.snapshot).toBe(null);
  mocks.read.mockResolvedValue(complete);rerender(options);await flush();expect(result.current.snapshot?.phase).toBe('complete');expect(mocks.read).toHaveBeenCalledTimes(2);
 });
 it('automatically progresses from reserved to issuing and complete without closing',async()=>{
  mocks.read.mockResolvedValueOnce(pending).mockResolvedValueOnce(issuing).mockResolvedValue(complete);const {result}=renderHook(()=>useManualSaleReceipt(options));await flush();
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(result.current.snapshot?.phase).toBe('issuing');
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(result.current.snapshot?.phase).toBe('complete');
  await act(async()=>{await vi.advanceTimersByTimeAsync(120000);});expect(mocks.read).toHaveBeenCalledTimes(3);
 });
 it('an event is only a hint: official pending data never turns into paid',async()=>{
  const {result}=renderHook(()=>useManualSaleReceipt(options));await flush();
  await act(async()=>{window.dispatchEvent(new CustomEvent(MANUAL_RECEIPT_UPDATED_EVENT,{detail:{saleId:options.saleId,paymentStatus:'pago'}}));});
  expect(result.current.snapshot?.phase).toBe('reserved');expect(mocks.read).toHaveBeenCalledTimes(2);
  await act(async()=>{window.dispatchEvent(new CustomEvent(MANUAL_RECEIPT_UPDATED_EVENT,{detail:{saleId:'other-sale'}}));});expect(mocks.read).toHaveBeenCalledTimes(2);
 });
 it('preserves confirmed financial proof after a temporary error and allows manual reload',async()=>{
  mocks.read.mockResolvedValueOnce(issuing).mockRejectedValueOnce(Error('offline')).mockResolvedValue(complete);const {result}=renderHook(()=>useManualSaleReceipt(options));await flush();
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(result.current.error).toBe(true);expect(result.current.snapshot?.phase).toBe('issuing');expect(result.current.loading).toBe(false);
  await act(async()=>{await result.current.refresh();});expect(result.current.error).toBe(false);expect(result.current.snapshot?.phase).toBe('complete');
 });
 it('a stale successful response cannot restore the payment action',async()=>{
  mocks.read.mockResolvedValueOnce(issuing).mockResolvedValue(pending);const {result}=renderHook(()=>useManualSaleReceipt(options));await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(result.current.snapshot?.financialConfirmed).toBe(true);expect(result.current.error).toBe(true);
 });
 it('coalesces concurrent interval, focus, event and manual refresh',async()=>{
  let release!:(s:ManualReceiptSnapshot)=>void;mocks.read.mockResolvedValueOnce(pending).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const {result}=renderHook(()=>useManualSaleReceipt(options));await flush();
  act(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new CustomEvent(MANUAL_RECEIPT_UPDATED_EVENT,{detail:{saleId:options.saleId}}));void result.current.refresh();});
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(mocks.read).toHaveBeenCalledTimes(2);
  await act(async()=>{release(complete);});expect(result.current.snapshot?.phase).toBe('complete');
 });
 it('aborts and ignores a response arriving after the receipt closes',async()=>{
  let release!:(s:ManualReceiptSnapshot)=>void;mocks.read.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const {result,rerender}=renderHook(props=>useManualSaleReceipt(props),{initialProps:options});await flush();const signal=mocks.read.mock.calls[0][2] as AbortSignal;
  rerender({...options,enabled:false});await flush();expect(signal.aborted).toBe(true);await act(async()=>{release(complete);});expect(result.current.snapshot).toBe(null);
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);window.dispatchEvent(new CustomEvent(MANUAL_RECEIPT_UPDATED_EVENT,{detail:{saleId:options.saleId}}));});expect(mocks.read).toHaveBeenCalledTimes(1);
 });
 it('does not display the previous company snapshot after changing context',async()=>{
  const {result,rerender}=renderHook(props=>useManualSaleReceipt(props),{initialProps:options});await flush();mocks.read.mockImplementation(()=>new Promise(()=>{}));rerender({...options,companyId:'other-company'});expect(result.current.snapshot).toBe(null);expect(mocks.read.mock.calls.at(-1)?.[1]).toBe('other-company');
 });
 it('bounds automatic reads and lets the operator resume explicitly',async()=>{
  const {result}=renderHook(()=>useManualSaleReceipt(options));await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(400000);});expect(mocks.read).toHaveBeenCalledTimes(31);expect(result.current.paused).toBe(true);
  await act(async()=>{await result.current.refresh();});expect(mocks.read).toHaveBeenCalledTimes(32);expect(result.current.paused).toBe(false);
 });
 it('does not poll while the tab is hidden',async()=>{
  vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');renderHook(()=>useManualSaleReceipt(options));await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});expect(mocks.read).toHaveBeenCalledTimes(1);
 });
});
