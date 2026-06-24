import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, Banknote, AlertCircle, Sparkles } from 'lucide-react';
import { Treatment, CartItem, Customer, Discount, CashShift, OfflineTransaction } from '../types';
import { safeAddToQueue, saveActiveShift, loadActiveShift, clearActiveShift, openSecureDB, updateQueuedTransactionCustomer } from '../utils/storageEngine';
import { compressImage } from '../lib/imageCompressor';
import { getFlag } from '../utils/featureFlags';

// Import newly refactored subcomponents
import ProductCatalog from './pos/ProductCatalog';
import CartPanel from './pos/CartPanel';
import CustomerSelector from './pos/CustomerSelector';
import ReceiptModal from './pos/ReceiptModal';

type PaymentMethod = 'Cash' | 'QRIS' | 'Bank Transfer';
type OfflineVerificationMode = 'sender' | 'photo';

interface POSTerminalViewProps {
  treatments: Treatment[];
  onAddTransaction: (amount: number, updatedCustomersList: Customer[], appointmentId?: string) => void;
  customers: Customer[];
  isOnline: boolean;
  onRefreshQueues: () => void;
  preFilledCart?: {
    customerId: string;
    treatmentId: string;
    appointmentId: string;
  } | null;
  onClearPreFilledCart?: () => void;
  discounts: Discount[];
  currentUser?: {
    id: string;
    email: string;
    nama_lengkap: string;
  };
  isAuthReady: boolean;
  offlineQueue?: any[];
  isMobile?: boolean;
}

const MEANINGLESS_INPUTS = ['', '.', '-', 'test', 'xxx', 'asdf', '0', '00', 'n/a'];
function sanitizeCustomerInput(val: string): string | null {
  const trimmed = val.trim().toLowerCase();
  if (MEANINGLESS_INPUTS.includes(trimmed)) return null;
  if (trimmed.length < 2) return null;
  return val.trim();
}

export default function POSTerminalView({
  treatments,
  onAddTransaction,
  customers,
  isOnline,
  onRefreshQueues,
  preFilledCart,
  onClearPreFilledCart,
  discounts,
  currentUser,
  isAuthReady,
  offlineQueue = [],
  isMobile = false,
}: POSTerminalViewProps) {
  const cleanCashierId = (currentUser?.id && currentUser.id !== 'undefined' && currentUser.id !== 'null' && currentUser.id.trim() !== '')
    ? currentUser.id
    : 'd0000000-0000-0000-0000-000000000001';

  const CHECKOUT_V2_ENABLED = getFlag('CHECKOUT_V2_ENABLED');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [checkoutCustomerMode, setCheckoutCustomerMode] = useState<'fast' | 'customer'>('fast');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');

  // Checkout V2 Post-Checkout Capture Modal state
  const [isCustomerCaptureOpen, setIsCustomerCaptureOpen] = useState(false);
  const [captureName, setCaptureName] = useState('');
  const [captureWA, setCaptureWA] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [capturedCustomerName, setCapturedCustomerName] = useState('Walk-in Guest');

  // --- Catalog & Cart ---
  const [searchTerm, setSearchTerm] = useState('');

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const backup = sessionStorage.getItem('fsrms_emergency_cart_backup');
      if (backup) {
        const parsed = JSON.parse(backup);
        if (parsed.cart && parsed.cart.length > 0) return parsed.cart;
      }
    } catch (e) { }
    return [];
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    try {
      const backup = sessionStorage.getItem('fsrms_emergency_cart_backup');
      if (backup) {
        const parsed = JSON.parse(backup);
        if (parsed.selectedCustomerId) {
          sessionStorage.removeItem('fsrms_emergency_cart_backup');
          return parsed.selectedCustomerId;
        }
      }
    } catch (e) { }
    return '00000000-0000-0000-0000-000000000000';
  });

  useEffect(() => {
    if (cart.length > 0) {
      sessionStorage.setItem('fsrms_emergency_cart_backup', JSON.stringify({
        cart,
        selectedCustomerId
      }));
    } else {
      sessionStorage.removeItem('fsrms_emergency_cart_backup');
    }
  }, [cart, selectedCustomerId]);

  const [activeAppointmentId, setActiveAppointmentId] = useState<string | undefined>(undefined);

  // Void Flow States
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [showVoidInput, setShowVoidInput] = useState(false);

  // --- Shift / Cash Harian ---
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [isShiftLoading, setIsShiftLoading] = useState(true);

  const [startingCashInput, setStartingCashInput] = useState('');
  const [operatorNameInput, setOperatorNameInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);

  // Restore activeShift from IndexedDB
  useEffect(() => {
    const restoreShiftFromIDB = async () => {
      try {
        const restored = await loadActiveShift();
        if (restored) {
          setActiveShift(restored as CashShift);
        }
      } catch (err) {
        console.error('[ActiveShift] Failed to restore shift:', err);
      } finally {
        setIsShiftLoading(false);
      }
    };
    restoreShiftFromIDB();
  }, []);

  // Auto-fill operator name
  useEffect(() => {
    const name = currentUser?.nama_lengkap;
    if (name) {
      setOperatorNameInput((prev) => prev === '' ? name : prev);
    }
  }, [currentUser]);

  // Sync Shift state
  const fetchCashShifts = async () => {
    if (!isOnline || !activeShift?.id) return;
    try {
      const { supabase } = await import('../lib/supabaseClient');
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('id', activeShift.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setActiveShift(data as CashShift);
        await saveActiveShift(data);
      }
    } catch (err) {
      console.error('Failed to verify shift on server:', err);
    }
  };

  useEffect(() => {
    if (!isAuthReady) return;
    fetchCashShifts();
  }, [isAuthReady, activeShift?.id, isOnline]);

  const isOperatorNameValid = operatorNameInput.trim().length >= 3;
  const isOpenShiftReady = startingCashInput !== '' && isOperatorNameValid && !!isAuthReady;

  const handleOpenShift = async () => {
    if (!isOpenShiftReady) return;
    const shiftId = crypto.randomUUID();
    const operatorName = operatorNameInput.trim();
    const startingCash = parseFloat(startingCashInput);

    const newShiftData: CashShift = {
      id: shiftId,
      cashier_id: cleanCashierId,
      operator_name: operatorName,
      starting_cash: isNaN(startingCash) ? 0 : startingCash,
      expected_cash: isNaN(startingCash) ? 0 : startingCash,
      status: 'Open',
      start_time: new Date().toISOString(),
    };

    setActiveShift(newShiftData);
    await saveActiveShift(newShiftData);

    const payload = {
      id: shiftId,
      cashier_id: cleanCashierId,
      operator_name: operatorName,
      starting_cash: newShiftData.starting_cash,
      expected_cash: newShiftData.expected_cash,
      status: 'Open',
      start_time: newShiftData.start_time
    };

    if (isOnline) {
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase.from('cash_shifts').insert(payload);
        if (error) throw error;
      } catch (err: any) {
        console.error('Failed to open shift on server, queuing offline:', err);
        await safeAddToQueue({ type: 'CREATE_CASH_SHIFT', payload });
        onRefreshQueues();
      }
    } else {
      await safeAddToQueue({ type: 'CREATE_CASH_SHIFT', payload });
      onRefreshQueues();
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift-updated'));
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift?.id || !actualCashInput || !isAuthReady) return;

    const actualCash = parseFloat(actualCashInput);
    const expectedCash = activeShift.expected_cash;

    const payload = {
      id: activeShift.id,
      end_time: new Date().toISOString(),
      actual_cash: isNaN(actualCash) ? 0 : actualCash,
      expected_cash: isNaN(expectedCash) ? 0 : expectedCash,
      status: 'Closed'
    };

    if (isOnline) {
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase
          .from('cash_shifts')
          .update({
            end_time: payload.end_time,
            actual_cash: payload.actual_cash,
            expected_cash: payload.expected_cash,
            status: 'Closed'
          })
          .eq('id', payload.id);

        if (error) throw error;
      } catch (err: any) {
        console.error('Failed to close shift, queuing offline:', err);
        await safeAddToQueue({ type: 'CLOSE_CASH_SHIFT', payload });
        onRefreshQueues();
      }
    } else {
      await safeAddToQueue({ type: 'CLOSE_CASH_SHIFT', payload });
      onRefreshQueues();
    }

    await clearActiveShift();
    setActiveShift(null);
    setOperatorNameInput('');
    setActualCashInput('');
    setIsCloseShiftModalOpen(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift-updated'));
    }
  };

  // Auto-fill draft transaction from appointment
  useEffect(() => {
    if (preFilledCart) {
      const treatment = treatments.find((t) => t.id === preFilledCart.treatmentId);
      if (treatment) {
        setCart([{ treatment, quantity: 1 }]);
        setSelectedCustomerId(preFilledCart.customerId);
        setActiveAppointmentId(preFilledCart.appointmentId);
      }
      if (onClearPreFilledCart) {
        onClearPreFilledCart();
      }
    }
  }, [preFilledCart, treatments]);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [offlineVerificationMode, setOfflineVerificationMode] = useState<OfflineVerificationMode>('sender');
  const [senderName, setSenderName] = useState('');

  // Image upload compression
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedImageMeta, setCompressedImageMeta] = useState<{
    originalSizeKB: number;
    sizeKB: number;
    base64: string;
  } | null>(null);

  const [isCheckoutSuccessOpen, setIsCheckoutSuccessOpen] = useState(false);

  const fallbackCustomer: Customer = {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Walk-in Customer/Guest',
    phone: '000000000000',
    totalVisits: 0,
    joinDate: '',
    tier: 'Silver'
  };

  const activeCustomer = useMemo(() => {
    if (CHECKOUT_V2_ENABLED) {
      if (checkoutCustomerMode === 'fast') {
        return {
          id: '00000000-0000-0000-0000-000000000000',
          name: 'Tamu/Guest',
          phone: '',
          totalVisits: 0,
          joinDate: '',
          tier: 'Silver' as const
        };
      } else {
        const sanitizedPhone = sanitizeCustomerInput(customerPhoneInput);
        const matched = sanitizedPhone ? customers.find((c) => c.phone === sanitizedPhone) : null;
        if (matched) return matched;

        const sanitizedName = sanitizeCustomerInput(customerNameInput);
        return {
          id: '00000000-0000-0000-0000-000000000000',
          name: sanitizedName || 'Tamu/Guest',
          phone: sanitizedPhone || '',
          totalVisits: 0,
          joinDate: '',
          tier: 'Silver' as const
        };
      }
    }
    return customers.find((c) => c.id === selectedCustomerId) || customers[0] || fallbackCustomer;
  }, [CHECKOUT_V2_ENABLED, checkoutCustomerMode, customerPhoneInput, customerNameInput, customers, selectedCustomerId, fallbackCustomer]);

  const requiresOfflineVerification = !isOnline && paymentMethod !== 'Cash';

  const isOfflineVerificationSatisfied = useMemo(() => {
    if (!requiresOfflineVerification) return true;
    if (offlineVerificationMode === 'sender') return senderName.trim().length > 0;
    if (offlineVerificationMode === 'photo') return compressedImageMeta !== null;
    return false;
  }, [requiresOfflineVerification, offlineVerificationMode, senderName, compressedImageMeta]);

  const hasPendingClose = useMemo(() => {
    return Array.isArray(offlineQueue) && offlineQueue.some(item => item.type === 'CLOSE_CASH_SHIFT');
  }, [offlineQueue]);

  const isCheckoutDisabled = cart.length === 0 || !isOfflineVerificationSatisfied || hasPendingClose;

  // Cart operations
  const addToCart = (treatment: Treatment) => {
    if (!treatment.availableOffline) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.treatment.id === treatment.id);
      if (existing) {
        return prev.map((item) =>
          item.treatment.id === treatment.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { treatment, quantity: 1 }];
    });
  };

  const removeFromCart = (treatmentId: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.treatment.id === treatmentId);
      if (existing && existing.quantity > 1) {
        return prev.map((item) =>
          item.treatment.id === treatmentId ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter((item) => item.treatment.id !== treatmentId);
    });
  };

  // Totals calculations
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.treatment.harga_jual * item.quantity, 0),
    [cart]
  );

  const activeDiscount = useMemo(() => {
    if (!activeCustomer.discount_id) return null;
    return discounts.find(d => d.id === activeCustomer.discount_id) || null;
  }, [activeCustomer, discounts]);

  const discountAmount = useMemo(() => {
    if (!activeDiscount) return 0;
    const rawDiscount = activeDiscount.tipe === 'percentage'
      ? (subtotal * activeDiscount.nilai) / 100
      : activeDiscount.nilai;
    return Math.round(rawDiscount);
  }, [subtotal, activeDiscount]);

  const grandTotal = useMemo(() => {
    const rawGrandTotal = subtotal - discountAmount;
    return Math.max(0, Math.round(rawGrandTotal));
  }, [subtotal, discountAmount]);

  const filteredTreatments = useMemo(
    () =>
      treatments.filter(
        (t) =>
          t.nama_layanan.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.kategori.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [treatments, searchTerm]
  );

  const triggerFileSelect = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const result = await compressImage(file);
      setCompressedImageMeta({
        originalSizeKB: result.originalSizeKB,
        sizeKB: result.sizeKB,
        base64: result.base64,
      });
    } catch (err) {
      console.error('Compression failed:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleCheckout = async () => {
    const txId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const sessionId = crypto.randomUUID();

    const cartItems = cart.map((item) => ({
      service_id: item.treatment.id,
      nama_layanan: item.treatment.nama_layanan,
      harga_jual: item.treatment.harga_jual,
      quantity: item.quantity,
    }));

    const finalCustomerId = CHECKOUT_V2_ENABLED ? null : selectedCustomerId;
    const finalCustomerName = CHECKOUT_V2_ENABLED ? null : activeCustomer.name;
    const finalCustomerPhone = CHECKOUT_V2_ENABLED ? null : null;

    const tx: OfflineTransaction = {
      id: txId,
      session_id: sessionId,
      customer_id: finalCustomerId,
      customer_name: finalCustomerName,
      customer_phone: finalCustomerPhone,
      processed_by: cleanCashierId,
      operator_name: activeShift?.operator_name || undefined,
      appointment_id: activeAppointmentId,
      discount_id: activeCustomer.discount_id || undefined,
      discount_amount: discountAmount,
      payment_method: paymentMethod,
      offline_sender: requiresOfflineVerification && offlineVerificationMode === 'sender' ? senderName.trim() : undefined,
      offline_media: requiresOfflineVerification && offlineVerificationMode === 'photo' && compressedImageMeta ? compressedImageMeta.base64 : undefined,
      status: 'Done',
      total_amount: grandTotal,
      created_at: nowIso,
      cart: cartItems,
      items: cartItems.map(item => ({
        service_id: item.service_id,
        price_at_sale: item.harga_jual,
        quantity: item.quantity
      }))
    };

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('fsrms_last_tx_debug', JSON.stringify(tx));
    }

    let updatedCusts = [...customers];

    if (isOnline) {
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { error: txErr } = await supabase.from('transactions').insert({
          id: tx.id,
          session_id: tx.session_id,
          customer_id: tx.customer_id,
          customer_name: tx.customer_name,
          customer_phone: tx.customer_phone,
          processed_by: tx.processed_by,
          appointment_id: tx.appointment_id || null,
          discount_id: tx.discount_id || null,
          discount_amount: tx.discount_amount,
          payment_method: tx.payment_method,
          offline_sender: tx.offline_sender || null,
          offline_media: tx.offline_media || null,
          status: 'Draft',
          total_amount: tx.total_amount,
          created_at: tx.created_at
        });

        if (txErr) throw txErr;

        const itemsToInsert = tx.items.map(item => ({
          transaction_id: tx.id,
          service_id: item.service_id,
          price_at_sale: item.price_at_sale,
          quantity: item.quantity
        }));

        const { error: itemsErr } = await supabase.from('transaction_items').insert(itemsToInsert);
        if (itemsErr) throw itemsErr;

        const { error: statusErr } = await supabase
          .from('transactions')
          .update({ status: 'Done' })
          .eq('id', tx.id);
        if (statusErr) throw statusErr;

        if (tx.appointment_id) {
          const payload = { status: 'Done' };
          await supabase.from('appointments').update(payload).eq('id', tx.appointment_id);
        }

        if (finalCustomerId) {
          updatedCusts = updatedCusts.map((c) => {
            if (c.id === finalCustomerId) {
              const visits = c.totalVisits + 1;
              const currentOmset = (c.totalOmset || 0) + grandTotal;
              let nextTier: 'Silver' | 'Gold' | 'Platinum' = 'Silver';
              if (currentOmset >= 5000000 && visits >= 25) nextTier = 'Platinum';
              else if (currentOmset >= 2000000 && visits >= 10) nextTier = 'Gold';
              else nextTier = 'Silver';
              return { ...c, totalVisits: visits, totalOmset: currentOmset, tier: nextTier };
            }
            return c;
          });
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('global-sync-complete'));
        }

      } catch (err) {
        console.error('Online checkout failed, queuing offline:', err);
        await safeAddToQueue({ type: 'CREATE_TRANSACTION', payload: tx });
        onRefreshQueues();
      }
    } else {
      await safeAddToQueue({ type: 'CREATE_TRANSACTION', payload: tx });
      onRefreshQueues();
    }

    onAddTransaction(grandTotal, updatedCusts, activeAppointmentId);
    setLastTransactionId(tx.id);
    if (CHECKOUT_V2_ENABLED) {
      setCapturedCustomerName('Walk-in Guest');
      setCaptureName('');
      setCaptureWA('');
      setCaptureError('');
      setIsCustomerCaptureOpen(true);
    } else {
      setIsCheckoutSuccessOpen(true);
    }
  };

  const handleSkipCapture = () => {
    setIsCustomerCaptureOpen(false);
    setIsCheckoutSuccessOpen(true);
  };

  const handleSaveCapture = async () => {
    setCaptureError('');
    const sanitizedName = sanitizeCustomerInput(captureName);
    const sanitizedWA = sanitizeCustomerInput(captureWA);
    const nameVal = sanitizedName || '';
    const waVal = sanitizedWA ? sanitizedWA.trim().replace(/\D/g, '') : '';

    if (!nameVal && !waVal) {
      handleSkipCapture();
      return;
    }

    if (sanitizedWA && !/^08\d{8,12}$/.test(waVal)) {
      setCaptureError('Format WhatsApp tidak valid (Gunakan format 08xxxxxxxxxx, 10-14 digit).');
      return;
    }

    try {
      let finalCustId: string | null = null;
      let finalCustName: string = '';
      let finalCustPhone: string | null = null;

      if (waVal) {
        const matched = customers.find((c) => c.phone.replace(/\D/g, '') === waVal);
        if (matched) {
          finalCustId = matched.id;
          finalCustName = matched.name;
          finalCustPhone = matched.phone;
        }
      }

      if (!finalCustId) {
        finalCustId = crypto.randomUUID();
        finalCustPhone = waVal || null;
        finalCustName = nameVal || 'WhatsApp Customer';
        const isPartial = !waVal;

        const newCustomer: Customer = {
          id: finalCustId,
          name: finalCustName,
          phone: finalCustPhone || '',
          totalVisits: 1,
          totalOmset: grandTotal,
          tier: 'Silver' as const,
          customer_type: isPartial ? 'PARTIAL' : 'STANDARD'
        };

        const db = await openSecureDB();
        const cacheTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readwrite');
        await cacheTx.objectStore('LOCAL_CUSTOMER_CACHE').put(newCustomer);
        await cacheTx.done;

        await safeAddToQueue({ type: 'CREATE_CUSTOMER', payload: newCustomer });
        window.dispatchEvent(new CustomEvent('customer-created'));
      }

      if (lastTransactionId) {
        await updateQueuedTransactionCustomer(lastTransactionId, finalCustId, finalCustName, finalCustPhone);

        if (typeof sessionStorage !== 'undefined') {
          const debugTxStr = sessionStorage.getItem('fsrms_last_tx_debug');
          if (debugTxStr) {
            const debugTx = JSON.parse(debugTxStr);
            if (debugTx.id === lastTransactionId) {
              debugTx.customer_id = finalCustId;
              debugTx.customer_name = finalCustName;
              debugTx.customer_phone = finalCustPhone;
              sessionStorage.setItem('fsrms_last_tx_debug', JSON.stringify(debugTx));
            }
          }
        }

        if (isOnline) {
          const { supabase } = await import('../lib/supabaseClient');
          await supabase
            .from('transactions')
            .update({
              customer_id: finalCustId,
              customer_name: finalCustName,
              customer_phone: finalCustPhone
            })
            .eq('id', lastTransactionId);
        }
      }

      setCapturedCustomerName(finalCustName);
      setIsCustomerCaptureOpen(false);
      setIsCheckoutSuccessOpen(true);

      if (isOnline) {
        window.dispatchEvent(new CustomEvent('global-sync-complete'));
      }
    } catch (err: any) {
      setCaptureError(err.message || 'Terjadi kesalahan saat menyimpan data pelanggan.');
    }
  };

  const handleCloseReceipt = () => {
    setIsCheckoutSuccessOpen(false);
    setCart([]);
    setSenderName('');
    setCompressedImageMeta(null);
    setActiveAppointmentId(undefined);
    setLastTransactionId(null);
    setVoidReason('');
    setShowVoidInput(false);
  };

  const handleVoidTransaction = async () => {
    if (!lastTransactionId || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      if (isOnline) {
        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase.from('transactions').update({
          status: 'Voided',
          voided_by: currentUser?.id || 'd0000000-0000-0000-0000-000000000001',
          voided_at: new Date().toISOString(),
          void_reason: voidReason
        }).eq('id', lastTransactionId);

        if (error) throw error;
        alert('Transaksi berhasil di-void.');
      } else {
        alert('Anda sedang offline. Void hanya dapat dilakukan secara online.');
      }
    } catch (err) {
      console.error('Failed to void transaction:', err);
      alert('Gagal melakukan void transaksi.');
    } finally {
      setIsVoiding(false);
      handleCloseReceipt();
    }
  };

  // Loading state
  if (isShiftLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-[#FAFAFA]">
        <div className="flex flex-col items-center gap-3 text-[#F9A8BF]">
          <RefreshCw className="w-7 h-7 animate-spin text-[#F7477B]" />
          <p className="text-xs font-bold text-[#C0365A]">Memuat sesi shift...</p>
        </div>
      </div>
    );
  }

  // Shift Gatekeeper
  if (!activeShift) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 h-full max-w-[1280px] mx-auto w-full font-sans bg-[#FAFAFA]">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-[0_16px_48px_rgba(247,71,123,0.12)] border border-[#FFE4EC] text-center space-y-6">
          <div className="w-16 h-16 bg-[#F7477B] rounded-2xl flex items-center justify-center mx-auto text-white mb-2 shadow-[0_8px_24px_rgba(247,71,123,0.35)]">
            <Banknote className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[#C0365A]">Buka Shift Kasir</h2>
            <p className="text-xs text-gray-500 font-medium leading-relaxed mt-2">
              Deklarasikan identitas kasir bertugas dan saldo kas awal laci sebelum melayani transaksi penjualan.
            </p>
          </div>

          {/* Cashier Name Input */}
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-700">
              Nama Lengkap Kasir/Operator <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="operator-name-input"
              value={operatorNameInput}
              onChange={(e) => setOperatorNameInput(e.target.value)}
              placeholder="Masukkan nama operator..."
              className={`w-full bg-[#FFF7FA] border rounded-xl py-3.5 px-4 text-xs font-semibold text-gray-800 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.12)] transition-all ${
                operatorNameInput.length > 0 && !isOperatorNameValid
                  ? 'border-red-400'
                  : 'border-[#FFE4EC]'
              }`}
            />
            {operatorNameInput.length > 0 && !isOperatorNameValid && (
              <p className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Nama minimal 3 karakter.
              </p>
            )}
          </div>

          {/* Saldo Awal Kas Input */}
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-700">Saldo Awal Kas Laci</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#F7477B]">Rp</span>
              <input
                type="number"
                id="starting-cash-input"
                value={startingCashInput}
                onChange={(e) => setStartingCashInput(e.target.value)}
                placeholder="0"
                className="w-full bg-[#FFF7FA] border border-[#FFE4EC] rounded-xl py-3.5 pl-10 pr-4 text-xs font-mono text-gray-800 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.12)] transition-all"
              />
            </div>
          </div>

          <button
            onClick={handleOpenShift}
            disabled={!isOpenShiftReady}
            id="open-shift-btn"
            className="w-full bg-[#F7477B] text-white font-bold uppercase tracking-wider text-xs py-3.5 rounded-full hover:bg-[#C0365A] shadow-[0_4px_20px_rgba(247,71,123,0.35)] hover:shadow-[0_6px_28px_rgba(247,71,123,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0 cursor-pointer"
          >
            Buka Shift &amp; Jualan
          </button>

          {!isOpenShiftReady && (
            <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider -mt-3">
              {!isOperatorNameValid ? 'Lengkapi nama operator kasir.' : 'Saldo laci wajib dideklarasikan.'}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full max-w-[1280px] mx-auto w-full overflow-hidden bg-[#FAFAFA] font-sans relative" id="pos-terminal-view">
      
      {/* Print stylesheet */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * {
            visibility: hidden !important;
            background: none !important;
            box-shadow: none !important;
          }
          #thermal-receipt-area,
          #thermal-receipt-area * {
            visibility: visible !important;
          }
          #thermal-receipt-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 58mm !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 2mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            font-family: Georgia, serif !important;
          }
          #thermal-receipt-area * {
            color: black !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #thermal-receipt-area .font-mono,
          #thermal-receipt-area .font-mono * {
            font-family: 'Courier New', Courier, monospace !important;
          }
          @page {
            size: 58mm auto;
            margin: 0;
          }
        }
      `}} />

      {/* Hidden File Upload Capturer */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* LEFT COLUMN: Product / Service Catalog */}
      <div className="flex-1 overflow-y-auto">
        <ProductCatalog
          filteredTreatments={filteredTreatments}
          cart={cart}
          addToCart={addToCart}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onOpenCloseShift={() => setIsCloseShiftModalOpen(true)}
        />
      </div>

      {/* RIGHT COLUMN: Cart Panel (Statis di desktop, Bottom Sheet di mobile) */}
      {!isMobile ? (
        <div className="w-[380px] flex-shrink-0">
          <CartPanel
            cart={cart}
            removeFromCart={removeFromCart}
            subtotal={subtotal}
            discountAmount={discountAmount}
            activeDiscount={activeDiscount}
            grandTotal={grandTotal}
            activeCustomer={activeCustomer}
            selectedCustomerId={selectedCustomerId}
            setSelectedCustomerId={setSelectedCustomerId}
            customers={customers}
            CHECKOUT_V2_ENABLED={CHECKOUT_V2_ENABLED}
            isCheckoutDisabled={isCheckoutDisabled}
            hasPendingClose={hasPendingClose}
            requiresOfflineVerification={requiresOfflineVerification}
            offlineVerificationMode={offlineVerificationMode}
            setOfflineVerificationMode={setOfflineVerificationMode}
            senderName={senderName}
            setSenderName={setSenderName}
            compressedImageMeta={compressedImageMeta}
            isCompressing={isCompressing}
            triggerFileSelect={triggerFileSelect}
            handleCheckout={handleCheckout}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            isOnline={isOnline}
          />
        </div>
      ) : (
        isMobileCartOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
            <div className="absolute inset-0" onClick={() => setIsMobileCartOpen(false)} />
            <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col h-[85vh] z-50">
              <div className="px-6 py-4 border-b border-[#FFE4EC] flex justify-between items-center flex-shrink-0 bg-[#FFF7FA] rounded-t-3xl">
                <div>
                  <h3 className="text-sm font-bold text-[#6B3A44] uppercase tracking-wider">Keranjang Belanja</h3>
                  <span className="text-[10px] text-zinc-400">Total: {cart.length} item layanan</span>
                </div>
                <button 
                  onClick={() => setIsMobileCartOpen(false)} 
                  className="text-zinc-400 hover:text-[#6B3A44] font-bold p-1 bg-white border border-[#FFE4EC] rounded-full w-8 h-8 flex items-center justify-center shadow-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pb-20">
                <CartPanel
                  cart={cart}
                  removeFromCart={removeFromCart}
                  subtotal={subtotal}
                  discountAmount={discountAmount}
                  activeDiscount={activeDiscount}
                  grandTotal={grandTotal}
                  activeCustomer={activeCustomer}
                  selectedCustomerId={selectedCustomerId}
                  setSelectedCustomerId={setSelectedCustomerId}
                  customers={customers}
                  CHECKOUT_V2_ENABLED={CHECKOUT_V2_ENABLED}
                  isCheckoutDisabled={isCheckoutDisabled}
                  hasPendingClose={hasPendingClose}
                  requiresOfflineVerification={requiresOfflineVerification}
                  offlineVerificationMode={offlineVerificationMode}
                  setOfflineVerificationMode={setOfflineVerificationMode}
                  senderName={senderName}
                  setSenderName={setSenderName}
                  compressedImageMeta={compressedImageMeta}
                  isCompressing={isCompressing}
                  triggerFileSelect={triggerFileSelect}
                  handleCheckout={async () => {
                    await handleCheckout();
                    setIsMobileCartOpen(false);
                  }}
                  paymentMethod={paymentMethod}
                  setPaymentMethod={setPaymentMethod}
                  isOnline={isOnline}
                />
              </div>
            </div>
          </div>
        )
      )}

      {/* Floating Action Button (FAB) Keranjang di Mobile */}
      {isMobile && cart.length > 0 && !isMobileCartOpen && (
        <button 
          onClick={() => setIsMobileCartOpen(true)}
          className="fixed bottom-20 right-5 z-40 bg-gradient-to-r from-[#F7477B] to-[#C0365A] text-white font-extrabold py-3.5 px-6 rounded-full flex items-center gap-2 shadow-2xl hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span>Tinjau Keranjang ({cart.length})</span>
          <span className="font-mono bg-white/20 px-2 py-0.5 rounded-md">Rp {(grandTotal / 1000).toFixed(0)}K</span>
        </button>
      )}

      {/* Receipt success & thermal printer preview Modal */}
      <ReceiptModal
        isOpen={isCheckoutSuccessOpen}
        onClose={handleCloseReceipt}
        activeShift={activeShift}
        capturedCustomerName={capturedCustomerName}
        activeCustomer={activeCustomer}
        CHECKOUT_V2_ENABLED={CHECKOUT_V2_ENABLED}
        paymentMethod={paymentMethod}
        isOnline={isOnline}
        offlineVerificationMode={offlineVerificationMode}
        senderName={senderName}
        cart={cart}
        subtotal={subtotal}
        discountAmount={discountAmount}
        activeDiscount={activeDiscount}
        grandTotal={grandTotal}
        showVoidInput={showVoidInput}
        setShowVoidInput={setShowVoidInput}
        voidReason={voidReason}
        setVoidReason={setVoidReason}
        handleVoidTransaction={handleVoidTransaction}
        isVoiding={isVoiding}
      />

      {/* Customer Post-Checkout Capture link (V2) */}
      <CustomerSelector
        isOpen={isCustomerCaptureOpen}
        onClose={handleSkipCapture}
        captureName={captureName}
        setCaptureName={setCaptureName}
        captureWA={captureWA}
        setCaptureWA={setCaptureWA}
        captureError={captureError}
        handleSkipCapture={handleSkipCapture}
        handleSaveCapture={handleSaveCapture}
      />

      {/* Close Shift Confirmation overlay */}
      {isCloseShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#261C1D]/40 backdrop-blur-md" onClick={() => setIsCloseShiftModalOpen(false)} />
          <div className="relative bg-white text-[#6B3A44] max-w-sm w-full rounded-3xl p-6 shadow-premium-lg border border-[#F5E1E4] anim-zoom-in">
            <h3 className="text-base font-bold text-[#6B3A44] mb-2 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[#D98897]" />
              Tutup Shift Harian
            </h3>
            <p className="text-xs text-zinc-500 font-semibold mb-5">
              Masukkan jumlah uang tunai fisik riil di dalam laci kasir saat ini untuk mengakhiri sesi.
            </p>

            <div className="space-y-2 text-left mb-6">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B3A44]">Saldo Fisik Kas Riil</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6B3A44]/75">Rp</span>
                <input
                  type="number"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl py-3.5 pl-10 pr-4 text-xs font-mono text-[#6B3A44] focus:outline-none focus:border-[#D98897] transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 font-sans">
              <button
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="flex-1 bg-white border border-[#F5E1E4] text-[#6B3A44] font-bold uppercase tracking-wider text-[10px] py-2.5 rounded-xl hover:bg-[#FAF3F4]/50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleCloseShift}
                disabled={!actualCashInput}
                className="flex-1 bg-[#C85C5C] text-white font-bold uppercase tracking-wider text-[10px] py-2.5 rounded-xl hover:bg-red-700 shadow-premium-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                Tutup Shift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}