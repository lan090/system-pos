import { useState, useEffect, useMemo } from 'react';
import { 
  CloudOff, 
  RefreshCw, 
  Bell, 
  User, 
  Info, 
  HelpCircle,
  Database,
  Trash2,
  Lock,
  ChevronRight,
  Sparkles,
  Wifi,
  Sliders,
  AlertCircle,
  CheckCircle,
  Users,
  ShoppingBag,
  Calendar,
  Menu,
  LayoutDashboard,
  Bookmark,
  LogOut,
  Settings
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import POSTerminalView from './components/POSTerminalView';
import LoginView from './components/LoginView';
import UpdateNotificationBanner from './components/UpdateNotificationBanner';

import { lazy, Suspense } from 'react';
import { DashboardSkeleton, CustomerDBSkeleton } from './components/Skeletons';

const DashboardView = lazy(() => import('./components/DashboardView'));
const CustomerDBView = lazy(() => import('./components/CustomerDBView'));
const ServiceCatalogView = lazy(() => import('./components/ServiceCatalogView'));
const AppointmentsView = lazy(() => import('./components/AppointmentsView'));
const UserManagementView = lazy(() => import('./components/UserManagementView'));
const QueueInspector = lazy(() => import('./components/QueueInspector'));

import { useAuth } from './hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDashboardData } from './hooks/useDashboardData';
import {
  selectRevenue,
  selectTransactionCount,
  selectYesterdayRevenue,
  selectYesterdayTransactionCount,
  selectGuestRatio,
  selectSyncStatus,
  selectTopServices,
  selectAverageTicketSize,
  selectPaymentMethodSplits,
  selectMembershipTierCounts,
  selectShiftSummary,
  selectBookingStatistics,
  selectSystemDiagnostics,
  selectHybridRevenueSeries,
  HybridRevenueResult
} from './utils/dashboardSelectors';

import { Treatment, Customer, Appointment, Discount, SystemUser, Therapist } from './types';
import { getQueueCount, safeAddToQueue, getOfflineSalesAggregate, bootstrapPublicCredentials, openSecureDB } from './utils/storageEngine';
import { runCustomerIdRecovery, hasInvalidCustomerIds } from './utils/recoveryMigration';
import { runIntegrityCheck } from './utils/integrityChecker';
import { runAllAnomalyChecks, startOfflineTracking } from './utils/anomalyDetector';

// Strict Transformer: Mencegah undefined/null dari tabel services DB ke UI
const mapServiceToTreatment = (service: any): Treatment => ({
  id: service?.id || '',
  nama_layanan: service?.nama_layanan || 'Unknown Service',
  kategori: service?.kategori || 'Uncategorized',
  harga_jual: Number(service?.harga_jual) || 0,
  duration: Number(service?.duration_minutes) || 60,
  description: service?.description || '',
  availableOffline: Boolean(service?.available_offline ?? true),
  is_active: Boolean(service?.is_active ?? true),
  icon: service?.kategori?.toLowerCase().includes('hair') ? 'content_cut' :
        service?.kategori?.toLowerCase().includes('reflexology') ? 'spa' : 'face'
});

const getAsiaJakartaStartOfDay = () => {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(new Date());
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const y = parts.find(p => p.type === 'year')!.value;
  return `${y}-${m}-${d}T00:00:00+07:00`;
};

const getAsiaJakartaYesterdayStart = (todayStartStr: string) => {
  const todayDate = new Date(todayStartStr);
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(yesterdayDate);
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const y = parts.find(p => p.type === 'year')!.value;
  return `${y}-${m}-${d}T00:00:00+07:00`;
};



export default function App() {
  // Connectivity Detection: Gunakan navigator.onLine + browser events.
  // Ping HTTP ke /rest/v1/ dihapus karena menyebabkan 'Fetch failed' akibat
  // CORS/HEAD blocking. navigator.onLine adalah Web API standar tanpa
  // network request tambahan dan tidak memblokir catalog fetch.
  const checkActualConnectivity = (): boolean => navigator.onLine;

  const { isLoggedIn, isCheckingAuth, currentUser: authUser, handleLogin, handleLogout: authLogout } = useAuth(checkActualConnectivity);
  const queryClient = useQueryClient();
  const [currentTab, setCurrentTab] = useState('pos');
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Derived quarantinedCount from useDashboardData hook

  // =========================================================================
  // currentUser: derivasi dinamis dari Supabase Auth session (authUser)
  // Nama kasir pada struk thermal, header, dan sidebar kini ditarik otomatis
  // dari user_metadata yang terdaftar di Supabase Dashboard.
  // =========================================================================
  const currentUser: SystemUser = authUser ? {
    id: authUser.id,
    email: authUser.email || '',
    username: authUser.username || authUser.user_metadata?.username || '',
    nama_lengkap: authUser.user_metadata?.nama_lengkap
      || authUser.user_metadata?.full_name
      || authUser.email
      || 'Kasir',
    role: (authUser.user_metadata?.role as SystemUser['role']) || 'Kasir/Front Desk',
    is_active: true,
    created_at: authUser.created_at
  } : {
    id: '',
    email: '',
    username: '',
    nama_lengkap: '',
    role: 'Kasir/Front Desk',
    is_active: false
  };

  // userRole derivasi dari currentUser.role — tidak lagi hardcoded / dropdown manual
  const userRole = currentUser.role as 'Owner/Manager' | 'Kasir/Front Desk' | 'Terapis';
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [softAlert, setSoftAlert] = useState<any | null>(null);
  const [hardFailure, setHardFailure] = useState<any | null>(null);
  const [syncEngineState, setSyncEngineState] = useState<{ frozen: boolean; reason?: string } | null>(null);

  const handleViewReceipt = async (mediaPath: string) => {
    if (!mediaPath) return;
    if (mediaPath.startsWith('data:image')) {
      setActiveReceiptUrl(mediaPath);
      setIsReceiptModalOpen(true);
      return;
    }

    try {
      const { supabase } = await import('./lib/supabaseClient');
      const { data, error } = await supabase.storage
        .from('transaction-receipts')
        .createSignedUrl(mediaPath, 1800); // 30 minutes signed URL

      if (error) throw error;
      if (data?.signedUrl) {
        setActiveReceiptUrl(data.signedUrl);
        setIsReceiptModalOpen(true);
      }
    } catch (err) {
      console.error("Failed to generate signed URL for receipt:", err);
      // Fallback: if error or offline, try directly
      setActiveReceiptUrl(mediaPath);
      setIsReceiptModalOpen(true);
    }
  };

  const [notificationsCount, setNotificationsCount] = useState(1);
  const [notifications, setNotifications] = useState<string[]>([
    'Selamat datang kembali di AuraDesk - Dashboard Siap Digunakan.'
  ]);

  // Network connection state reading from native browser API
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const { offlineQueue, quarantinedCount: hookQuarantinedCount, activeShift, systemSnapshot, clockDrift, integrityReport, onlineSalesData, refetch: refetchDashboard } = useDashboardData(isOnline, userRole);
  const pendingSyncCount = offlineQueue.length;
  const quarantinedCount = hookQuarantinedCount;
  const syncStatus = selectSyncStatus(isOnline, pendingSyncCount, quarantinedCount);
  const [offlineTxs, setOfflineTxs] = useState<any[]>([]);
  const [offlineCusts, setOfflineCusts] = useState<Customer[]>([]);

  const [posDraft, setPosDraft] = useState<{
    customerId: string;
    treatmentId: string;
    appointmentId: string;
  } | null>(null);

  // Decoupled states using IndexedDB caches
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [services, setServices] = useState<any[]>([]);

  const treatments: Treatment[] = useMemo(() => services.map(mapServiceToTreatment), [services]);

  const runIntegrityAndAnomalyChecks = async () => {
    try {
      const { supabase } = await import('./lib/supabaseClient');
      await runIntegrityCheck(supabase, { runDbChecks: isOnline, silent: false });
      await runAllAnomalyChecks(supabase, null);
    } catch (err) {
      console.error('[App] Error running integrity/anomaly checks:', err);
    }
  };

  useEffect(() => {
    const handleSoftAlert = (e: any) => {
      setSoftAlert(e.detail);
    };
    const handleHardFailure = (e: any) => {
      setHardFailure(e.detail);
    };
    const handleSyncEngineFrozen = (e: any) => {
      setSyncEngineState({ frozen: true, reason: e.detail?.reason });
    };

    window.addEventListener('fsrms-soft-alert' as any, handleSoftAlert);
    window.addEventListener('fsrms-hard-failure' as any, handleHardFailure);
    window.addEventListener('sync-engine-frozen' as any, handleSyncEngineFrozen);

    return () => {
      window.removeEventListener('fsrms-soft-alert' as any, handleSoftAlert);
      window.removeEventListener('fsrms-hard-failure' as any, handleHardFailure);
      window.removeEventListener('sync-engine-frozen' as any, handleSyncEngineFrozen);
    };
  }, []);

  useEffect(() => {
    let monitorId: any = null;
    if (!isOnline) {
      monitorId = startOfflineTracking();
    }
    return () => {
      if (monitorId) clearInterval(monitorId);
    };
  }, [isOnline]);

  const fetchServices = async () => {
    try {
      const db = await openSecureDB();
      if (isOnline) {
        const { supabase } = await import('./lib/supabaseClient');
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('is_active', true);
        if (error) throw error;
        if (data) {
          // Clear and save to IndexedDB cache
          const tx = db.transaction('LOCAL_SERVICE_CACHE', 'readwrite');
          const store = tx.objectStore('LOCAL_SERVICE_CACHE');
          await store.clear();
          for (const svc of data) {
            await store.put(svc);
          }
          await tx.done;
          
          setServices(data);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch services from Supabase, loading from IndexedDB:", err);
    }

    try {
      const db = await openSecureDB();
      const allCached = await db.getAll('LOCAL_SERVICE_CACHE');
      if (allCached && allCached.length > 0) {
        setServices(allCached);
      }
    } catch (err) {
      console.error("Failed to load offline services from IndexedDB:", err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const db = await openSecureDB();
      if (isOnline) {
        const { supabase } = await import('./lib/supabaseClient');
        const { data, error } = await supabase
          .from('customers')
          .select('*');
        if (error) throw error;
        if (data) {
          const mappedFromSupabase: Customer[] = data.map((c: any) => ({
            id: c.id,
            name: c.nama_lengkap,
            phone: c.nomor_telepon,
            totalVisits: Number(c.total_kunjungan) || 0,
            joinDate: c.created_at ? new Date(c.created_at).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : 'Unknown',
            tier: c.membership_tier || 'Silver',
            email: c.email || undefined,
            notes: c.catatan_khusus || undefined
          }));

          // FIX: Merge strategy — read existing local cache first, keep local-only customers
          // (those pending sync and not yet in Supabase), then overwrite with fresh Supabase data.
          const localTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readonly');
          const existingLocal: Customer[] = await localTx.objectStore('LOCAL_CUSTOMER_CACHE').getAll();
          
          const supabaseIds = new Set(mappedFromSupabase.map(c => c.id));
          const pendingLocalOnly = existingLocal.filter(c => !supabaseIds.has(c.id));
          const merged = [...mappedFromSupabase, ...pendingLocalOnly];

          // Write merged result back to cache
          const writeTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readwrite');
          const store = writeTx.objectStore('LOCAL_CUSTOMER_CACHE');
          await store.clear();
          for (const cust of merged) {
            await store.put(cust);
          }
          await writeTx.done;

          setCustomers(merged);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch customers from Supabase, loading from IndexedDB:", err);
    }

    try {
      const db = await openSecureDB();
      const allCached = await db.getAll('LOCAL_CUSTOMER_CACHE');
      if (allCached && allCached.length > 0) {
        setCustomers(allCached);
      }
    } catch (err) {
      console.error("Failed to load offline customers from IndexedDB:", err);
    }
  };



  const fetchAppointments = async () => {
    try {
      const db = await openSecureDB();
      if (isOnline) {
        const { supabase } = await import('./lib/supabaseClient');
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            *,
            customers ( nama_lengkap ),
            therapists ( nama ),
            services:service_id ( id, nama_layanan, harga_jual, duration_minutes )
          `);
        if (error) throw error;
        if (data) {
          const mappedApps: Appointment[] = data.map((a: any) => {
            const startTs = new Date(a.appointment_ts);
            // Format start and end times in WIB (HH:MM)
            const startTime = startTs.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, ':');
            
            // Safely retrieve the service object (could be an array or object, or undefined)
            const serviceData = Array.isArray(a.services) ? a.services[0] : a.services;
            const duration = serviceData?.duration_minutes || 60;
            const endTs = new Date(startTs.getTime() + duration * 60 * 1000);
            const endTime = endTs.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, ':');

            // Safely retrieve therapist and customer objects
            const therapistData = Array.isArray(a.therapists) ? a.therapists[0] : a.therapists;
            const customerData = Array.isArray(a.customers) ? a.customers[0] : a.customers;

            return {
              id: a.id,
              customer_id: a.customer_id,
              therapist_id: a.therapist_id,
              therapistName: therapistData?.nama || 'Unknown',
              service_id: serviceData?.id || '00000000-0000-0000-0000-000000000000',
              patientName: customerData?.nama_lengkap || 'Walk-In Guest',
              startTime,
              endTime,
              label: serviceData?.nama_layanan || 'Salon Treatment',
              status: a.status || 'Scheduled'
            };
          });

          // Save to IndexedDB
          const tx = db.transaction('LOCAL_APPOINTMENT_CACHE', 'readwrite');
          const store = tx.objectStore('LOCAL_APPOINTMENT_CACHE');
          await store.clear();
          for (const app of mappedApps) {
            await store.put(app);
          }
          await tx.done;

          setAppointments(mappedApps);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch appointments from Supabase, loading from IndexedDB:", err);
    }

    try {
      const db = await openSecureDB();
      const allCached = await db.getAll('LOCAL_APPOINTMENT_CACHE');
      if (allCached && allCached.length > 0) {
        setAppointments(allCached);
      }
    } catch (err) {
      console.error("Failed to load offline appointments from IndexedDB:", err);
    }
  };

  const fetchTherapists = async () => {
    try {
      const db = await openSecureDB();
      if (isOnline) {
        const { supabase } = await import('./lib/supabaseClient');
        const { data, error } = await supabase
          .from('therapists')
          .select('*')
          .eq('is_active', true);
        if (error) throw error;
        if (data) {
          // Save to IndexedDB
          const tx = db.transaction('LOCAL_THERAPIST_CACHE', 'readwrite');
          const store = tx.objectStore('LOCAL_THERAPIST_CACHE');
          await store.clear();
          for (const t of data) {
            await store.put(t);
          }
          await tx.done;

          setTherapists(data);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch therapists from Supabase, loading from IndexedDB:", err);
    }

    try {
      const db = await openSecureDB();
      const allCached = await db.getAll('LOCAL_THERAPIST_CACHE');
      if (allCached && allCached.length > 0) {
        setTherapists(allCached);
      }
    } catch (err) {
      console.error("Failed to load offline therapists from IndexedDB:", err);
    }
  };

  // Derived state from useDashboardData and selectors
  const startOfDay = useMemo(() => getAsiaJakartaStartOfDay(), []);
  const startOfYesterday = useMemo(() => getAsiaJakartaYesterdayStart(startOfDay), [startOfDay]);

  const totalSalesToday = useMemo(() => selectRevenue(onlineSalesData.sum, offlineQueue, startOfDay), [onlineSalesData.sum, offlineQueue, startOfDay]);
  const successTransactionsCount = useMemo(() => selectTransactionCount(onlineSalesData.count, offlineQueue, startOfDay), [onlineSalesData.count, offlineQueue, startOfDay]);

  const yesterdaySales = useMemo(() => selectYesterdayRevenue(onlineSalesData.yesterdaySum || 0, offlineQueue, startOfYesterday, startOfDay), [onlineSalesData.yesterdaySum, offlineQueue, startOfYesterday, startOfDay]);
  const yesterdayTransactionsCount = useMemo(() => selectYesterdayTransactionCount(onlineSalesData.yesterdayCount || 0, offlineQueue, startOfYesterday, startOfDay), [onlineSalesData.yesterdayCount, offlineQueue, startOfYesterday, startOfDay]);

  const guestRatio = useMemo(() => selectGuestRatio(onlineSalesData.rawTxs, offlineQueue), [onlineSalesData.rawTxs, offlineQueue]);
  const topServices = useMemo(() => selectTopServices(onlineSalesData.serviceCounts, offlineQueue, treatments), [onlineSalesData.serviceCounts, offlineQueue, treatments]);

  const averageTicketSize = useMemo(() => selectAverageTicketSize(totalSalesToday, successTransactionsCount), [totalSalesToday, successTransactionsCount]);
  const paymentMethodSplits = useMemo(() => selectPaymentMethodSplits(onlineSalesData.rawTxs, offlineQueue), [onlineSalesData.rawTxs, offlineQueue]);
  const membershipTierCounts = useMemo(() => selectMembershipTierCounts(customers), [customers]);
  const shiftSummary = useMemo(() => selectShiftSummary(activeShift, onlineSalesData.rawTxs), [activeShift, onlineSalesData.rawTxs]);
  const bookingStats = useMemo(() => selectBookingStatistics(appointments), [appointments]);
  const systemDiagnostics = useMemo(() => selectSystemDiagnostics(userRole, systemSnapshot, clockDrift, integrityReport), [userRole, systemSnapshot, clockDrift, integrityReport]);
  const safeModeViewModel = useMemo(() => ({
    isSafeModeActive: integrityReport?.overallStatus === 'CRITICAL',
    degradedBannerMessage: integrityReport?.overallStatus === 'CRITICAL' ? 'WARNING: Critical database integrity issues detected. Shift sync disabled.' : ''
  }), [integrityReport]);

  const hybridRevenue = useMemo(() => selectHybridRevenueSeries(onlineSalesData.serverRevenue, offlineQueue), [onlineSalesData.serverRevenue, offlineQueue]);

  // Combine hourly activity
  const activityData = useMemo(() => {
    const combinedHourly: Record<string, { value: number, amount: number }> = {};
    for (let i = 9; i <= 20; i++) {
      const label = `${i.toString().padStart(2, '0')}:00`;
      combinedHourly[label] = { value: 0, amount: 0 };
    }

    const mergeHourly = (source: Record<string, { value: number, amount: number }>) => {
      Object.entries(source || {}).forEach(([hour, data]) => {
         if (combinedHourly[hour]) {
           combinedHourly[hour].value += data.value;
           combinedHourly[hour].amount += data.amount;
         }
       });
    };

    mergeHourly(onlineSalesData.hourlyActivity || {});

    // Merge offline hourly from metadata
    offlineQueue
      .filter(item => item.type === 'CREATE_TRANSACTION' && item.metadata)
      .forEach(item => {
         const dateStr = item.created_at;
         if (dateStr) {
            const hour = new Date(dateStr).getHours();
            const label = `${hour.toString().padStart(2, '0')}:00`;
            if (combinedHourly[label]) {
               combinedHourly[label].value += 1;
               combinedHourly[label].amount += Number(item.metadata?.total_amount) || 0;
            }
         }
      });

    let maxHourlyAmount = 0;
    const activity = Object.entries(combinedHourly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, data]) => {
        if (data.amount > maxHourlyAmount) maxHourlyAmount = data.amount;
        const rpFormatted = data.amount > 0 ? `Rp ${(data.amount / 1000).toFixed(0)}K` : 'Rp 0';
        return {
          label,
          value: data.amount,
          raw: rpFormatted,
          peak: false
        };
      });
      
    if (maxHourlyAmount > 0) {
      const peakIndex = activity.findIndex(d => d.value === maxHourlyAmount);
      if (peakIndex !== -1) activity[peakIndex].peak = true;
    }

    return activity;
  }, [onlineSalesData.hourlyActivity, offlineQueue]);

  const loadQueueCounts = async () => {
    refetchDashboard();
  };

  // Atomic Invalidation & CustomEvent Listener
  useEffect(() => {
    const handleQueueUpdated = () => {
      loadQueueCounts();
    };

    const handleSyncComplete = () => {
      loadQueueCounts();
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['dashboard-sales', getAsiaJakartaStartOfDay()] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        fetchServices();
        fetchCustomers(); // FIX: Refresh customers after sync so newly-synced records appear in the UI
        runIntegrityAndAnomalyChecks();
      }
    };

    const handleCustomerCreated = () => {
      fetchCustomers();
    };

    window.addEventListener('pos-queue-updated', handleQueueUpdated);
    window.addEventListener('global-sync-complete', handleSyncComplete);
    window.addEventListener('customer-created', handleCustomerCreated);
    return () => {
      window.removeEventListener('pos-queue-updated', handleQueueUpdated);
      window.removeEventListener('global-sync-complete', handleSyncComplete);
      window.removeEventListener('customer-created', handleCustomerCreated);
    };
  }, [isOnline, queryClient]);

  useEffect(() => {
    loadQueueCounts();
    runIntegrityAndAnomalyChecks();
  }, [isOnline]);

  useEffect(() => {
    const activeMigrationAndDestruction = async () => {
      try {
        const legacyDbName = 'fsrms_offline_db';
        const request = indexedDB.open(legacyDbName);
        request.onsuccess = async (event: any) => {
          const db = event.target.result;
          let hasPending = false;
          const stores = ['transactions', 'customers'];
          
          for (const storeName of stores) {
            if (db.objectStoreNames.contains(storeName)) {
              hasPending = true;
            }
          }

          if (hasPending) {
            console.log('Active Migration: Found legacy database, migrating data...');
            const readLegacyData = (storeName: string): Promise<any[]> => {
              return new Promise((resolve) => {
                if (!db.objectStoreNames.contains(storeName)) return resolve([]);
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getReq = store.getAll();
                getReq.onsuccess = () => resolve(getReq.result || []);
                getReq.onerror = () => resolve([]);
              });
            };

            const oldTxs = await readLegacyData('transactions');
            for (const tx of oldTxs) {
              await safeAddToQueue({ type: 'CREATE_TRANSACTION', payload: tx }, true);
            }

            const oldCusts = await readLegacyData('customers');
            for (const cust of oldCusts) {
              await safeAddToQueue({ type: 'CREATE_CUSTOMER', payload: cust }, true);
            }
          }
          
          db.close();
          // Absolut Destruction
          indexedDB.deleteDatabase(legacyDbName);
          console.log('Active Migration: Legacy fsrms_offline_db destroyed permanently.');
          loadQueueCounts();
        };
        request.onerror = () => {
          console.warn('Active Migration: Failed to open legacy db or not exists.');
        };
      } catch (e) {
        console.error('Active Migration Error:', e);
      }
    };
    activeMigrationAndDestruction();

    // Customer ID Recovery Migration
    // Repairs any customer whose id was generated with Math.random (short string)
    // instead of crypto.randomUUID(). Runs once on startup; skipped on clean systems.
    const runIdRecovery = async () => {
      try {
        const needsRepair = await hasInvalidCustomerIds();
        if (needsRepair) {
          console.warn('[App] Invalid customer IDs detected. Running recovery migration...');
          const stats = await runCustomerIdRecovery();
          console.log('[App] Recovery migration complete:', stats);
          // Refresh customer list so repaired customers appear immediately
          await fetchCustomers();
        }
      } catch (err) {
        console.error('[App] Recovery migration failed:', err);
      }
    };
    runIdRecovery();
  }, []);

  // Bootstrap: Simpan supabaseUrl & supabaseAnonKey ke IndexedDB saat mount.
  // WAJIB dilakukan dari main thread sebelum SW membutuhkan credentials.
  // import.meta.env tidak tersedia di Service Worker context, sehingga nilai ini
  // harus di-relay melalui IndexedDB oleh main thread.
  useEffect(() => {
    const bootstrapSWCredentials = async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Bootstrap: VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY tidak terbaca. Service Worker tidak akan bisa sync!');
        return;
      }

      try {
        await bootstrapPublicCredentials(supabaseUrl, supabaseAnonKey);
        setIsAuthReady(true);
      } catch (err) {
        console.error('Bootstrap: Gagal menyimpan public credentials ke IndexedDB.', err);
      }
    };
    bootstrapSWCredentials();
  }, []);


  const fetchDiscounts = async () => {
    try {
      if (isOnline) {
        const { supabase } = await import('./lib/supabaseClient');
        const { data, error } = await supabase
          .from('discounts')
          .select('*')
          .eq('is_active', true);
        if (error) throw error;
        if (data && data.length > 0) {
          localStorage.setItem('fsrms_discounts', JSON.stringify(data));
          setDiscounts(data);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch discounts from Supabase, loading from LocalStorage:", err);
    }

    try {
      const stored = localStorage.getItem('fsrms_discounts');
      if (stored) {
        setDiscounts(JSON.parse(stored));
      }
    } catch (err) {
      console.error("Failed to load offline discounts:", err);
    }
  };

  // Connectivity Detection via navigator.onLine + browser events
  // Menggantikan ping HTTP yang menyebabkan Fetch failed / CORS error.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Picu sinkronisasi otomatis saat internet kembali tersambung
      import('./utils/syncEngine')
        .then(({ flushMutationQueue }) => {
          if (typeof flushMutationQueue === 'function') flushMutationQueue();
        })
        .catch((err) => {
          console.error('Failed to dynamic import syncEngine in online event handler:', err);
        });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (isOnline) {
      Promise.all([fetchCustomers(), fetchAppointments(), fetchTherapists(), fetchDiscounts(), fetchServices()])
        .then(() => { if (!isMounted) return; })
        .catch((err) => console.error("Batch fetch failed", err));
    } else {
      Promise.all([fetchCustomers(), fetchAppointments(), fetchTherapists(), fetchDiscounts(), fetchServices()])
        .then(() => { if (!isMounted) return; })
        .catch((err) => console.error("Batch offline load failed", err));
    }
    return () => { isMounted = false; };
  }, [isOnline]);

  // Sync Engine Trigger
  useEffect(() => {
    if (isOnline) {
      triggerManualSync();
    }
  }, [isOnline]);

  // Intelligent Idle-Time Prefetching of secondary views
  useEffect(() => {
    if (isLoggedIn) {
      const prefetchRoutes = () => {
        console.log('[Prefetch] App is idle, prefetching secondary views...');
        import('./components/DashboardView');
        import('./components/CustomerDBView');
        import('./components/AppointmentsView');
      };
      
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => prefetchRoutes());
      } else {
        setTimeout(prefetchRoutes, 3000); // 3s fallback
      }
    }
  }, [isLoggedIn]);

  const triggerManualSync = async () => {
    console.log('[SYNC-TRACE][6] triggerManualSync called.');
    try {
      const queueLength = await getQueueCount();
      console.log('[SYNC-TRACE][6a] Queue depth =', queueLength);
      if (queueLength > 0) {
        const hasSW = 'serviceWorker' in navigator;
        const hasController = !!navigator.serviceWorker?.controller;
        console.log('[SYNC-TRACE][6b] hasSW =', hasSW, '| hasController =', hasController);
        if (hasSW && hasController) {
          console.log('[SYNC-TRACE][6c] Posting BACKGROUND_SYNC_TRIGGER to Service Worker...');
          navigator.serviceWorker.controller.postMessage({ type: 'BACKGROUND_SYNC_TRIGGER' });
          console.log('[SYNC-TRACE][6d] postMessage sent. Waiting for SW to call backgroundSyncFlush().');
          return;
        }
        // Fallback: run on main thread only when Service Worker is not controlling
        console.warn('[SYNC-TRACE][6e] No SW controller — running flushMutationQueue() on MAIN THREAD as fallback.');
        const { flushMutationQueue } = await import('./utils/syncEngine');
        await flushMutationQueue();
      } else {
        console.log('[SYNC-TRACE][6f] Queue is empty — sync skipped.');
      }
    } catch (err) {
      console.error("Critical failure executing FIFO sync:", err);
    }
  };



  // State modification callbacks
  const handleAddTreatment = async (treatment: Treatment) => {
    const payload = {
      id: treatment.id,
      nama_layanan: treatment.nama_layanan,
      kategori: treatment.kategori,
      harga_jual: treatment.harga_jual,
      description: treatment.description || null,
      available_offline: Boolean(treatment.availableOffline ?? true),
      is_active: Boolean(treatment.is_active ?? true)
    };

    if (isOnline) {
      try {
        const { supabase } = await import('./lib/supabaseClient');
        const { data: newSvc, error } = await supabase
          .from('services')
          .insert([payload])
          .select();

        if (error) {
          console.error("Supabase Insert Failed:", error.message);
          throw new Error(error.message);
        }

        if (newSvc && newSvc[0]) {
          const db = await openSecureDB();
          const tx = db.transaction('LOCAL_SERVICE_CACHE', 'readwrite');
          await tx.objectStore('LOCAL_SERVICE_CACHE').put(newSvc[0]);
          await tx.done;

          setServices(prev => [...prev, newSvc[0]]);
          setNotifications(prev => [`Layanan baru "${treatment.nama_layanan}" disinkronkan ke Supabase.`, ...prev]);
          setNotificationsCount(n => n + 1);
          return;
        }
      } catch (err: any) {
        console.error("Failed to insert service on Supabase:", err);
        throw err;
      }
    } else {
      // 2. Jalur Offline Murni (Hanya dipicu jika jaringan benar-benar timeout/putus)
      console.log("Aplikasi offline, memasukkan ke antrean IndexedDB...");
      try {
        await safeAddToQueue({ type: 'CREATE_SERVICE', payload });

        const db = await openSecureDB();
        const tx = db.transaction('LOCAL_SERVICE_CACHE', 'readwrite');
        await tx.objectStore('LOCAL_SERVICE_CACHE').put(payload);
        await tx.done;

        // Masukkan data lokal temporer dengan flag pending ke UI
        setServices(prev => [...prev, { ...payload, isPending: true }]);
        
        setNotifications(prev => [`Layanan baru "${treatment.nama_layanan}" disimpan secara lokal (offline queue).`, ...prev]);
        setNotificationsCount(n => n + 1);
      } catch (err: any) {
        console.error("Failed to save offline service:", err);
        throw err;
      }
    }
  };

  const handleDeleteTreatment = async (id: string) => {
    if (isOnline) {
      try {
        const { supabase } = await import('./lib/supabaseClient');
        const { error } = await supabase.from('services').update({ is_active: false }).eq('id', id);
        if (error) {
          console.error("Failed to delete service on Supabase:", error);
        } else {
          const db = await openSecureDB();
          const tx = db.transaction('LOCAL_SERVICE_CACHE', 'readwrite');
          await tx.objectStore('LOCAL_SERVICE_CACHE').delete(id);
          await tx.done;

          setServices(prev => prev.filter(s => s.id !== id));
          setNotifications(prev => [`Layanan berhasil dinonaktifkan di Supabase.`, ...prev]);
          setNotificationsCount(n => n + 1);
          return;
        }
      } catch (err) {
        console.error("Failed to delete service:", err);
      }
    }

    // Offline fallback / direct local update
    try {
      const db = await openSecureDB();
      const tx = db.transaction('LOCAL_SERVICE_CACHE', 'readwrite');
      await tx.objectStore('LOCAL_SERVICE_CACHE').delete(id);
      await tx.done;

      setServices(prev => prev.filter(s => s.id !== id));
      setNotifications(prev => [`Layanan dinonaktifkan secara lokal.`, ...prev]);
      setNotificationsCount(n => n + 1);
    } catch (err) {
      console.error("Failed to delete local service:", err);
    }
  };

  const handleAddCustomer = async (customer: Customer) => {
    setCustomers(prev => [...prev, customer]);
    setNotifications(prev => [`Pelanggan baru "${customer.name}" terdaftar secara lokal.`, ...prev]);
    setNotificationsCount(n => n + 1);

    console.log('[SYNC-TRACE][1] handleAddCustomer fired.', {
      id: customer.id,
      name: customer.name,
      isOnline,
      hasSW: 'serviceWorker' in navigator,
      SWController: !!(navigator.serviceWorker?.controller)
    });

    try {
      // FIX: Persist customer to LOCAL_CUSTOMER_CACHE immediately so it survives page reload.
      // Without this, fetchCustomers() replaces the whole cache from Supabase on next load,
      // and since the customer hasn't synced yet it disappears from the UI.
      const db = await openSecureDB();
      const cacheTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readwrite');
      await cacheTx.objectStore('LOCAL_CUSTOMER_CACHE').put(customer);
      await cacheTx.done;
      console.log('[SYNC-TRACE][2] Wrote customer to LOCAL_CUSTOMER_CACHE.');

      console.log('[SYNC-TRACE][3] Calling safeAddToQueue...');
      await safeAddToQueue({ type: 'CREATE_CUSTOMER', payload: customer });
      console.log('[SYNC-TRACE][4] safeAddToQueue returned (mutation encrypted and written to OFFLINE_MUTATION_QUEUE).');

      await loadQueueCounts();
      console.log('[SYNC-TRACE][5] isOnline =', isOnline, '— will triggerManualSync:', isOnline);
      if (isOnline) {
        triggerManualSync();
      } else {
        console.warn('[SYNC-TRACE][5] OFFLINE — triggerManualSync SKIPPED. Mutation will wait for online/heartbeat event.');
      }
    } catch (err) {
      console.error("Failed to queue customer creation:", err);
    }
  };

  const handleEditCustomer = async (customer: Customer) => {
    setCustomers(prev =>
      prev.map(c => (c.id === customer.id ? customer : c))
    );
    setNotifications(prev => [`Perubahan data pelanggan "${customer.name}" disimpan secara lokal.`, ...prev]);
    setNotificationsCount(n => n + 1);

    console.log('[SYNC-TRACE] handleEditCustomer fired.', {
      id: customer.id,
      name: customer.name,
      isOnline
    });

    try {
      const db = await openSecureDB();
      const cacheTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readwrite');
      await cacheTx.objectStore('LOCAL_CUSTOMER_CACHE').put(customer);
      await cacheTx.done;
      console.log('[SYNC-TRACE] Wrote updated customer to LOCAL_CUSTOMER_CACHE.');

      await safeAddToQueue({ type: 'UPDATE_CUSTOMER', payload: customer });
      await loadQueueCounts();

      if (isOnline) {
        triggerManualSync();
      }
    } catch (err) {
      console.error("Failed to queue customer update:", err);
    }
  };


  const updateAppointmentStatus = async (app: Appointment, newStatus: 'Scheduled' | 'In Progress' | 'Done' | 'Cancelled') => {
    const updatedApp = { ...app, status: newStatus };
    const dbPayload = {
      id: app.id,
      status: newStatus
    };

    try {
      // 1. Update local IndexedDB cache LOCAL_APPOINTMENT_CACHE
      const db = await openSecureDB();
      const tx = db.transaction('LOCAL_APPOINTMENT_CACHE', 'readwrite');
      const store = tx.objectStore('LOCAL_APPOINTMENT_CACHE');
      const cached = await store.get(app.id);
      if (cached) {
        cached.status = newStatus;
        await store.put(cached);
      } else {
        await store.put(updatedApp);
      }
      await tx.done;

      // 2. Update React memory state
      setAppointments(prev => prev.map(a => a.id === app.id ? updatedApp : a));

      // 3. Queue the UPDATE_APPOINTMENT status mutation
      await safeAddToQueue({ type: 'UPDATE_APPOINTMENT', payload: dbPayload });
      await loadQueueCounts();

      // 4. If online, trigger sync
      if (isOnline) {
        triggerManualSync();
      }
    } catch (err: any) {
      console.error(`Failed to update appointment status to ${newStatus}:`, err);
    }
  };

  const handleAddAppointment = async (app: Appointment) => {
    // Determine target ISO timestamp
    const todayStr = new Date().toISOString().split('T')[0];
    const appointmentTs = `${todayStr}T${app.startTime}:00.000Z`;

    const dbPayload = {
      id: app.id,
      customer_id: app.customer_id || '00000000-0000-0000-0000-000000000000',
      therapist_id: app.therapist_id,
      service_id: app.service_id,
      appointment_ts: appointmentTs,
      status: app.status || 'Scheduled'
    };

    try {
      // 1. Save to local IndexedDB cache LOCAL_APPOINTMENT_CACHE
      const db = await openSecureDB();
      const tx = db.transaction('LOCAL_APPOINTMENT_CACHE', 'readwrite');
      await tx.objectStore('LOCAL_APPOINTMENT_CACHE').put(app);
      await tx.done;

      // 2. Add to React memory state
      setAppointments(prev => [...prev, app]);

      // 3. Queue the CREATE_APPOINTMENT mutation
      await safeAddToQueue({ type: 'CREATE_APPOINTMENT', payload: dbPayload });
      await loadQueueCounts();

      // 4. Notify system
      setNotifications(prev => [`Jadwal booking baru untuk "${app.patientName}" berhasil disimpan secara lokal (offline queue).`, ...prev]);
      setNotificationsCount(n => n + 1);

      // 5. If online, trigger sync
      if (isOnline) {
        triggerManualSync();
      }
    } catch (err: any) {
      console.error("Failed to process appointment creation:", err);
    }
  };

  const handleNewTransaction = async (grandTotal: number, updatedCustomersList?: Customer[], appointmentId?: string) => {
    // Fire event instantly for < 1ms dashboard update reactivity
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos-queue-updated'));
    }

    if (isOnline) {
      if (updatedCustomersList) {
        setCustomers(updatedCustomersList);
      }
      setNotifications(prev => [`Transaksi senilai Rp ${grandTotal.toLocaleString('id-ID')} disinkronkan ke Supabase.`, ...prev]);
      setNotificationsCount(n => n + 1);
    } else {
      setNotifications(prev => [`Transaksi baru tersimpan offline di antrean lokal (AES-GCM terenkripsi).`, ...prev]);
      setNotificationsCount(n => n + 1);
    }

    // If checkout is linked to an appointment, mark appointment as Done
    if (appointmentId) {
      const app = appointments.find(a => a.id === appointmentId);
      if (app) {
        await updateAppointmentStatus(app, 'Done');
      } else {
        setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'Done' } : a));
      }
      setNotifications(prev => [`Booking #${appointmentId.substring(0, 8)} lunas & diset 'Done'!`, ...prev]);
      setNotificationsCount(n => n + 1);
    }
  };

  const handleAddTherapist = async (therapist: Therapist) => {
    const payload = {
      id: therapist.id,
      nama: therapist.nama,
      is_active: Boolean(therapist.is_active ?? true),
      created_at: therapist.created_at || new Date().toISOString()
    };

    try {
      const db = await openSecureDB();
      const tx = db.transaction('LOCAL_THERAPIST_CACHE', 'readwrite');
      await tx.objectStore('LOCAL_THERAPIST_CACHE').put(payload);
      await tx.done;

      setTherapists(prev => [...prev, payload]);

      await safeAddToQueue({ type: 'CREATE_THERAPIST', payload });
      await loadQueueCounts();

      setNotifications(prev => [`Terapis baru "${therapist.nama}" didaftarkan secara lokal.`, ...prev]);
      setNotificationsCount(n => n + 1);

      if (isOnline) {
        triggerManualSync();
      }
    } catch (err: any) {
      console.error("Failed to process therapist creation:", err);
    }
  };

  const handleUpdateTherapist = async (id: string, updates: Partial<Therapist>) => {
    try {
      const db = await openSecureDB();
      const tx = db.transaction('LOCAL_THERAPIST_CACHE', 'readwrite');
      const store = tx.objectStore('LOCAL_THERAPIST_CACHE');
      const cached = await store.get(id);

      if (!cached) {
        throw new Error(`Therapist with ID ${id} not found in cache.`);
      }

      const updated = { ...cached, ...updates };
      await store.put(updated);
      await tx.done;

      setTherapists(prev => prev.map(t => t.id === id ? updated : t));

      await safeAddToQueue({ type: 'UPDATE_THERAPIST', payload: { id, ...updates } });
      await loadQueueCounts();

      setNotifications(prev => [`Data terapis "${updated.nama}" diperbarui secara lokal.`, ...prev]);
      setNotificationsCount(n => n + 1);

      if (isOnline) {
        triggerManualSync();
      }
    } catch (err: any) {
      console.error("Failed to update therapist:", err);
    }
  };

  const handleSettleAppointment = async (app: Appointment) => {
    // Move status to 'In Progress' via unified helper
    await updateAppointmentStatus(app, 'In Progress');

    // Centralize preFilledCart draft details (align Guest Customer ID)
    setPosDraft({
      customerId: app.customer_id || '00000000-0000-0000-0000-000000000000',
      treatmentId: app.service_id,
      appointmentId: app.id
    });

    // Redirect to POS tab
    setCurrentTab('pos');

    // Notify kasir
    setNotifications(prev => [
      `Booking ${app.patientName} dipindahkan ke POS Terminal (Status: In Progress). Silakan selesaikan pembayaran.`,
      ...prev
    ]);
    setNotificationsCount(n => n + 1);
  };

  const handleCancelAppointment = async (appId: string) => {
    const app = appointments.find(a => a.id === appId);
    if (!app) return;
    await updateAppointmentStatus(app, 'Cancelled');
    setNotifications(prev => [`Reservasi booking berhasil dibatalkan.`, ...prev]);
    setNotificationsCount(n => n + 1);
  };

  const handleLogout = () => {
    authLogout();
  };

  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
  };

  // Helper title strings
  const getTabTitle = () => {
    switch(currentTab) {
      case 'dashboard': return 'Dashboard';
      case 'pos': return 'POS Terminal';
      case 'customers': return 'Customer Database';
      case 'catalog': return 'Service Catalog';
      case 'appointments': return 'Board Jadwal - Appointments';
      case 'users': return 'User Management';
      case 'settings': return 'System Settings';
      default: return 'Fenina Salon';
    }
  };

  if (isCheckingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-primary font-bold">Verifikasi Sesi Login...</div>;
  }

  if (!isLoggedIn) {
    return (
      <LoginView
        onLogin={async (email, password) => {
          const result = await handleLogin(email, password);
          if (result.success) {
            setHardFailure(null);
            setSoftAlert(null);
            setCurrentTab('pos');
          }
          return result;
        }}
      />
    );
  }

  return (
    <div className="bg-background text-on-background font-sans antialiased overflow-hidden flex h-screen leading-relaxed">
      
      {/* SideNavBar Menu */}
      <Sidebar 
        currentTab={currentTab} 
        onTabChange={handleTabChange} 
        onLogout={handleLogout} 
        userRole={userRole}
        currentUser={currentUser}
      />

      {/* Main Content Workspace viewport */}
      <main className={`${isMobile ? 'ml-0 pb-20' : 'ml-[260px]'} flex-1 flex flex-col h-screen bg-[#FAF6F6] relative z-0`}>
        
        {hardFailure && (
          <div className="bg-rose-700 text-white font-semibold text-xs px-10 py-3 flex items-center justify-between shadow-md select-none z-20">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-white flex-shrink-0 animate-bounce" />
              <span>
                CRITICAL SYSTEM HARD FAILURE: {hardFailure.reason || hardFailure.message || 'System corruption or queue overflow detected. Operations frozen.'}
              </span>
            </div>
            <button
              onClick={() => setHardFailure(null)}
              className="bg-white text-rose-800 px-3 py-1 rounded text-[10px] font-bold shadow hover:bg-rose-50 uppercase tracking-widest cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {softAlert && (
          <div className="bg-amber-600 text-white font-semibold text-xs px-10 py-3 flex items-center justify-between shadow-md select-none z-20">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-white flex-shrink-0" />
              <span>
                SYSTEM WARNING: {softAlert.reason || softAlert.message || 'Minor transaction mismatch or queue limit warning.'}
              </span>
            </div>
            <button
              onClick={() => setSoftAlert(null)}
              className="bg-white text-amber-800 px-3 py-1 rounded text-[10px] font-bold shadow hover:bg-amber-50 uppercase tracking-widest cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {syncEngineState?.frozen && (
          <div className="bg-rose-900 text-white font-semibold text-xs px-10 py-3 flex items-center justify-between shadow-md select-none z-20">
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-white flex-shrink-0" />
              <span>
                SYNC ENGINE FROZEN: {syncEngineState.reason || 'Sync engine has been locked due to safety anomaly check.'}
              </span>
            </div>
            {userRole === 'Owner/Manager' ? (
              <button
                onClick={async () => {
                  const { resumeSyncEngine } = await import('./utils/controlPlane');
                  try {
                    await resumeSyncEngine(currentUser);
                    setSyncEngineState(null);
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}
                className="bg-white text-rose-955 px-3 py-1 rounded text-[10px] font-bold shadow hover:bg-rose-50 uppercase tracking-widest cursor-pointer"
              >
                Resume Engine
              </button>
            ) : (
              <span className="text-[10px] opacity-75 italic">Only Owner/Manager can resume</span>
            )}
          </div>
        )}

        {quarantinedCount > 0 && (
          <div className="bg-red-600 text-white font-semibold text-xs px-10 py-3 flex items-center justify-between shadow-md select-none anim-pulse z-20">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-white flex-shrink-0 animate-bounce" />
              <span>⚠ PERINGATAN: Terdapat {quarantinedCount} transaksi terisolasi (Quarantine) yang gagal disinkronkan ke server. Hubungi Tim IT segera!</span>
            </div>
            <button
              onClick={() => setCurrentTab('settings')}
              className="bg-white text-red-700 px-3 py-1 rounded text-[10px] font-bold shadow hover:bg-red-50 uppercase tracking-widest cursor-pointer"
            >
              Buka Pengaturan IT
            </button>
          </div>
        )}

        {/* Unified Elegant TopNavBar Header */}
        <header className="bg-white border-b border-[#F2C6CE] flex justify-between items-center px-10 h-16 w-full flex-shrink-0 z-10 transition-all shadow-sm">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-widest text-[#D98897] select-none font-mono">AuraDesk</span>
            <div className="h-4 w-[1px] bg-[#F2C6CE]" />
            <span className="text-xs font-semibold text-outline uppercase tracking-wider font-mono">Console View</span>
          </div>

          <div className="flex items-center gap-4">
            
            {/* Interactive Network status Simulation tool removed */}

            {/* Dynamic Status Display alert */}
            {isOnline ? (
              <div className="bg-green-50 text-green-700 font-bold text-[11px] px-3.5 py-1.5 rounded-full flex items-center gap-1.5 border border-green-200 select-none anim-fade-in font-mono">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Supabase Connected</span>
              </div>
            ) : (
              <div className="bg-error-container text-[#6B3A44] font-semibold text-[11px] px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-error/10 select-none anim-pulse font-mono">
                <CloudOff className="w-3.5 h-3.5 text-error" />
                <span>{pendingSyncCount} Antrean Offline (IndexedDB)</span>
              </div>
            )}

            {/* User Session Badge — menampilkan nama & role dari Supabase Auth JWT */}
            <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-[#F2C6CE]/60">
              <User className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <div className="flex flex-col leading-none">
                <span className="text-[11px] font-bold text-[#6B3A44] truncate max-w-[120px]">
                  {currentUser.nama_lengkap || currentUser.email}
                </span>
                <span className="text-xs font-semibold text-outline font-mono uppercase tracking-wider">
                  {currentUser.role}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 border-l border-outline-variant/60 pl-4">
              <button 
                onClick={() => setNotificationsCount(0)}
                className="text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-high p-2 rounded-full relative cursor-pointer"
                title="Notifications Log"
              >
                <Bell className="w-4 h-4" />
                {notificationsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Inner Tab Viewport Router block */}
        <div className="flex-grow p-8 overflow-y-auto max-w-[1280px] mx-auto w-full pb-16">
          
          {/* Notifications Panel overlay when new messages arrive */}
          {notificationsCount > 0 && (
            <div className="mb-6 bg-white border-l-4 border-primary rounded-r-xl p-4 shadow-sm anim-fade-in space-y-1">
              <div className="flex justify-between items-center pb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                  <Bell className="w-3.5 h-3.5" />
                  Notifikasi Sistem Terkini
                </span>
                <button onClick={() => setNotificationsCount(0)} className="text-[10px] text-outline hover:underline font-bold">
                  Sembunyikan
                </button>
              </div>
              {notifications.slice(0, 2).map((notif, index) => (
                <p key={index} className="text-sm font-normal text-on-surface-variant">{notif}</p>
              ))}
            </div>
          )}

          {currentTab === 'dashboard' && (
            userRole !== 'Terapis' ? (
              <Suspense fallback={<DashboardSkeleton />}>
                <DashboardView 
                  userRole={userRole}
                  syncStatus={syncStatus} 
                  queueCount={pendingSyncCount} 
                  totalSalesToday={totalSalesToday}
                  successTransactionsCount={successTransactionsCount}
                  yesterdaySales={yesterdaySales}
                  yesterdayTransactionsCount={yesterdayTransactionsCount}
                  guestRatio={guestRatio}
                  topServices={topServices}
                  activityData={activityData}
                  averageTicketSize={averageTicketSize}
                  paymentMethodSplits={paymentMethodSplits}
                  membershipTierCounts={membershipTierCounts}
                  shiftSummary={shiftSummary}
                  bookingStats={bookingStats}
                  systemDiagnostics={systemDiagnostics}
                  safeModeViewModel={safeModeViewModel}
                  isOnline={isOnline}
                  hybridRevenue={hybridRevenue}
                />
              </Suspense>
            ) : (
              <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-md">
                <Lock className="w-12 h-12 text-[#D98897] mx-auto" />
                <h3 className="text-base font-semibold text-[#6B3A44]">Akses Dashboard Dibatasi</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed font-normal">
                  Sesuai kebijakan keamanan Row-Level Security (RLS) di database Supabase cloud, staf berstatus <strong className="font-semibold">Terapis</strong> tidak diizinkan membaca data finansial atau analitik transaksi bulanan.
                </p>
                <p className="text-xs text-primary font-mono bg-secondary-container py-1.5 px-3 rounded-lg inline-block">
                  POLICY "get_current_user_role() = 'Owner/Manager'"
                </p>
              </div>
            )
          )}
          
          {currentTab === 'pos' && (
            userRole !== 'Terapis' ? (
              <POSTerminalView 
                treatments={treatments.filter(t => t.is_active !== false)} 
                onAddTransaction={handleNewTransaction}
                customers={customers}
                isOnline={isOnline}
                onRefreshQueues={loadQueueCounts}
                preFilledCart={posDraft}
                onClearPreFilledCart={() => setPosDraft(null)}
                discounts={discounts}
                currentUser={currentUser}
                isAuthReady={isAuthReady}
                offlineQueue={offlineQueue}
              />
            ) : (
              <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-md">
                <Lock className="w-12 h-12 text-[#D98897] mx-auto" />
                <h3 className="text-base font-semibold text-[#6B3A44]">Terminal Kasir (POS) Terkunci</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed font-normal">
                  Hanya staf dengan peran <strong className="font-semibold">Owner/Manager</strong> atau <strong className="font-semibold">Kasir/Front Desk</strong> yang diijinkan untuk mengoperasikan kasir dan memisahkan transaksi.
                </p>
                <div className="border border-outline-variant rounded-lg p-3 bg-surface-container text-left text-xs space-y-1">
                  <span className="font-semibold text-on-surface">Tips untuk Penguji (QA):</span>
                  <p className="font-normal text-on-surface-variant">Silakan ubah pilihan <strong className="font-semibold">"Role: Terapis"</strong> di header atas menjadi <strong className="font-semibold">"Kasir/Front Desk"</strong> untuk membuka akses terminal ini.</p>
                </div>
              </div>
            )
          )}
 
          {currentTab === 'customers' && (
            <Suspense fallback={<CustomerDBSkeleton />}>
              <CustomerDBView 
                customers={customers} 
                onAddCustomer={handleAddCustomer} 
                onEditCustomer={handleEditCustomer}
                userRole={userRole}
              />
            </Suspense>
          )}
 
          {currentTab === 'catalog' && (
            <Suspense fallback={
              <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-md">
                <div className="w-8 h-8 border-4 border-[#D98897] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-on-surface-variant font-semibold">Memuat Layanan...</p>
              </div>
            }>
              <ServiceCatalogView 
                treatments={treatments} 
                onAddTreatment={handleAddTreatment} 
                onDeleteTreatment={handleDeleteTreatment} 
                userRole={userRole}
              />
            </Suspense>
          )}
 
          {currentTab === 'appointments' && (
            <Suspense fallback={
              <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-md">
                <div className="w-8 h-8 border-4 border-[#D98897] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-on-surface-variant font-semibold">Memuat Jadwal Booking...</p>
              </div>
            }>
              <AppointmentsView 
                appointments={appointments} 
                customers={customers}
                treatments={treatments}
                therapistList={therapists}
                onAddAppointment={handleAddAppointment}
                onSettleAppointment={handleSettleAppointment}
                onCancelAppointment={handleCancelAppointment}
                userRole={userRole}
              />
            </Suspense>
          )}
 
          {currentTab === 'users' && (
            userRole === 'Owner/Manager' ? (
              <Suspense fallback={
                <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-md">
                  <div className="w-8 h-8 border-4 border-[#D98897] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-on-surface-variant font-semibold">Memuat Manajemen Staf...</p>
                </div>
              }>
                <UserManagementView 
                  therapists={therapists}
                  onAddTherapist={handleAddTherapist}
                  onUpdateTherapist={handleUpdateTherapist}
                  isOnline={isOnline}
                />
              </Suspense>
            ) : (
              <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-md">
                <Lock className="w-12 h-12 text-[#D98897] mx-auto" />
                <h3 className="text-base font-semibold text-[#6B3A44]">Akses Dibatasi</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed font-normal">
                  Hanya pengguna dengan peran <strong className="font-semibold">Owner/Manager</strong> yang diizinkan untuk mengelola akun staff.
                </p>
              </div>
            )
          )}

          {currentTab === 'settings' && (
            <div className="space-y-6 max-w-3xl anim-fade-in" id="settings-tab">
              <div className="border-b border-outline-variant pb-4">
                <h2 className="text-xl font-bold text-[#6B3A44] font-display flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  System Settings
                </h2>
                <p className="text-xs font-medium text-[#857375] mt-1">Configure offline preferences, view local IndexedDB queues, and inspect Supabase trigger configurations.</p>
              </div>

              {/* Network, Role and General System state card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-white border border-[#F2C6CE] rounded-xl p-6 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-[#6B3A44]">Status Sinkronisasi Lokal</h3>
                  
                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-lg border border-outline-variant/50">
                    <span className="text-xs font-semibold">Status Jaringan:</span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isOnline ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                      {isOnline ? 'ONLINE (Direct)' : 'OFFLINE (Queued)'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-lg border border-outline-variant/50">
                    <span className="text-xs font-semibold">Antrean Mutasi Terenkripsi:</span>
                    <span className="text-xs font-bold text-[#6B3A44]">{pendingSyncCount} Record</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-lg border border-outline-variant/50">

                  </div>

                  {!isOnline && (
                    <button 
                      onClick={() => setIsOnline(true)}
                      className="w-full bg-primary-container text-on-primary-container py-2.5 rounded-lg text-xs font-bold hover:bg-opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Paksa Hubungkan ke Supabase (FIFO Sync)
                    </button>
                  )}
                </div>

                <div className="bg-white border border-[#F2C6CE] rounded-xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#6B3A44]">Kategori Keanggotaan (Loyalty Tiers)</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed mt-2 font-normal">
                      Otomatisasi dijalankan di server Supabase via database trigger dari tabel <code>transactions</code> ketika berstatus **'Done'**:
                    </p>
                    <ul className="text-sm mt-3 space-y-2 list-disc list-inside font-normal text-on-surface-variant">
                      <li><strong className="font-semibold text-[#6B3A44]">Silver:</strong> Default tanpa minimal kriteria</li>
                      <li><strong className="font-semibold text-[#D98897]">Gold:</strong> Belanja &gt; Rp 2.000.000 ATAU &gt; 10 kunjungan</li>
                      <li><strong className="font-semibold text-zinc-900">Platinum:</strong> Belanja &gt; Rp 5.000.000 ATAU &gt; 25 kunjungan</li>
                    </ul>
                  </div>

                  <div className="bg-zinc-900 text-stone-200 text-xs font-mono p-2 rounded-lg leading-relaxed mt-2 max-h-24 overflow-y-auto">
                    -- Supabase Trigger code in triggers.sql<br />
                    CREATE TRIGGER trg_on_transaction_finished<br />
                    AFTER INSERT OR UPDATE ON transactions...
                  </div>
                </div>

              </div>

              {/* Detailed IndexedDB Queue Inspector Dashboard */}
              <Suspense fallback={
                <div className="bg-white border border-[#F2C6CE] rounded-xl p-8 text-center space-y-4 shadow-md">
                  <div className="w-8 h-8 border-4 border-[#D98897] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-on-surface-variant font-semibold">Memuat Telemetri &amp; Antrean...</p>
                </div>
              }>
                <QueueInspector userRole={userRole} />
              </Suspense>

              {/* Developer walkthrough hints */}
              <div className="bg-white border border-[#F2C6CE] rounded-xl p-6 shadow-sm space-y-3">
                <div className="flex items-center gap-1.5 text-primary">
                  <Info className="w-4 h-4 text-[#D98897]" />
                  <span className="font-semibold text-xs uppercase tracking-wide">Developer &amp; QA Walkthrough Guide:</span>
                </div>
                <div className="text-sm font-normal text-on-surface-variant leading-relaxed space-y-1">
                  <p>1. **Uji Kasus Offline:** Matikan jaringan dengan memilih tombol **OFFLINE** di kanan atas.</p>
                  <p>2. **Proses POS Transaksi:** Pilih menu Terminal POS, isi keranjang, select Pembayaran **Opsi B (Bukti Transfer)**.</p>
                  <p>3. **Uji Komperesor Berkas:** Unggah foto acak pada input berkas. Utilitas visual akan menampilkan kompresi instan dari foto asli (misal 5MB) berukuran super kecil (112KB), di bawah batas standar **&lt; 150KB**!</p>
                  <p>4. **Selesaikan Transaksi:** Selesaikan dan cetak struk. Transaksi akan langsung masuk ke tabel IndexedDB.</p>
                  <p>5. **Kembali Online:** Klik tombol **ONLINE**. Tonton sinkronisasi FIFO instan, total omset bertambah, dan loyalty tier pemilik dihitung ulang secara otomatis berkat database triggers!</p>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>

      {/* Receipts Secure Viewer Modal */}
      {isReceiptModalOpen && activeReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#261C1D]/60 backdrop-blur-sm" onClick={() => setIsReceiptModalOpen(false)} />
          <div className="relative bg-white border border-[#F2C6CE] max-w-lg w-full rounded-2xl p-6 shadow-2xl overflow-hidden anim-zoom-in">
            <div className="flex justify-between items-center pb-3 border-b border-[#F2C6CE]/60">
              <h3 className="text-sm font-semibold text-[#6B3A44] uppercase tracking-wider font-display">Bukti Pembayaran Terverifikasi</h3>
              <button onClick={() => setIsReceiptModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 font-bold">
                ✕
              </button>
            </div>
            <div className="mt-4 border border-outline-variant bg-slate-50 rounded-xl overflow-hidden max-h-[60vh] flex items-center justify-center">
              <img src={activeReceiptUrl} alt="Secure Receipt" className="object-contain w-full h-full max-h-[50vh]" referrerPolicy="no-referrer" />
            </div>
            <div className="mt-4 flex justify-between items-center text-xs text-on-surface-variant font-medium">
              <span>🔒 Signed URL Aktif (Kedaluwarsa 30 Menit)</span>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="bg-[#D98897] text-white font-bold px-4 py-2 rounded-lg text-xs hover:opacity-90 cursor-pointer"
              >
                Tutup Viewer
              </button>
            </div>
          </div>
        </div>
      )}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#F2C6CE] flex justify-around items-center z-40 shadow-lg px-2">
          <button 
            onClick={() => { setCurrentTab('pos'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${currentTab === 'pos' && !isMobileMenuOpen ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Terminal POS</span>
          </button>
          <button 
            onClick={() => { setCurrentTab('appointments'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${currentTab === 'appointments' && !isMobileMenuOpen ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Janji Temu</span>
          </button>
          <button 
            onClick={() => { setCurrentTab('customers'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${currentTab === 'customers' && !isMobileMenuOpen ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Pelanggan</span>
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center flex-1 py-1 ${isMobileMenuOpen ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Lainnya</span>
          </button>
        </div>
      )}

      {/* Drawer Menu Lainnya */}
      {isMobile && isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative bg-white rounded-t-3xl p-6 shadow-2xl max-h-[70vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center pb-2 border-b border-[#FFE4EC]">
              <h3 className="text-sm font-bold text-[#6B3A44] uppercase tracking-wider">AuraDesk Menu</h3>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-zinc-600 font-bold p-1">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {userRole === 'Owner/Manager' && (
                <button 
                  onClick={() => { setCurrentTab('dashboard'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'dashboard' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  <LayoutDashboard className="w-4 h-4 text-[#F7477B]" />
                  <span>Dashboard</span>
                </button>
              )}
              <button 
                onClick={() => { setCurrentTab('catalog'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'catalog' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
              >
                <Bookmark className="w-4 h-4 text-[#F7477B]" />
                <span>Katalog Layanan</span>
              </button>
              {userRole === 'Owner/Manager' && (
                <button 
                  onClick={() => { setCurrentTab('users'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'users' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  <Users className="w-4 h-4 text-[#F7477B]" />
                  <span>Manajemen Staf</span>
                </button>
              )}
              <button 
                onClick={() => { setCurrentTab('settings'); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'settings' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
              >
                <Settings className="w-4 h-4 text-[#F7477B]" />
                <span>Pengaturan</span>
              </button>
            </div>

            <div className="border-t border-[#FFE4EC] pt-4 flex flex-col gap-3.5">
              <div className="flex items-center gap-3 bg-[#FFF7FA] p-3 rounded-2xl border border-[#FFE4EC]">
                <div className="w-8 h-8 rounded-lg bg-[#F7477B] flex items-center justify-center text-white"><User className="w-4 h-4" /></div>
                <div>
                  <span className="text-xs font-bold text-[#C0365A] block leading-tight">{currentUser.nama_lengkap}</span>
                  <span className="text-[9px] font-bold text-gray-400 block uppercase mt-0.5">{userRole}</span>
                </div>
              </div>
              <button 
                onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                className="w-full py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-2xl text-xs flex justify-center items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Keluar Sistem
              </button>
            </div>
          </div>
        </div>
      )}
      <UpdateNotificationBanner />
    </div>
  );
}
