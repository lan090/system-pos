import { useState, useEffect } from 'react';
import { 
  Database, 
  Trash2, 
  RefreshCw, 
  Play, 
  AlertTriangle, 
  Activity, 
  ShieldAlert, 
  CheckCircle,
  FileText,
  Clock
} from 'lucide-react';
import { getStorageAdapter } from '../utils/storageEngine';
import { flushMutationQueue } from '../utils/syncEngine';

export default function QueueInspector({ userRole = 'Kasir/Front Desk' }: { userRole?: string }) {
  const [activeQueue, setActiveQueue] = useState<any[]>([]);
  const [quarantined, setQuarantined] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [syncState, setSyncState] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'quarantine' | 'metrics'>('active');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const db = await getStorageAdapter();
      
      const [rawQueue, rawQuarantined, rawMetrics, rawState] = await Promise.all([
        db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []),
        db.getAll('QUARANTINED_MUTATIONS').catch(() => []),
        db.get('SYNC_ENGINE_STATE', 'sync_metrics_histogram').catch(() => null),
        db.get('SYNC_ENGINE_STATE', 'state').catch(() => null)
      ]);

      const sortedQueue = [...rawQueue].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      setActiveQueue(sortedQueue);
      setQuarantined(rawQuarantined);
      setMetrics(rawMetrics || {
        total_sync_attempts: 0,
        successful_syncs: 0,
        '0-200ms': 0,
        '200-500ms': 0,
        '500-1000ms': 0,
        '1000-5000ms': 0,
        '>5000ms': 0
      });
      setSyncState(rawState);
    } catch (err) {
      console.error('[QUEUE-INSPECTOR] Failed to load stores:', err);
    }
  };

  useEffect(() => {
    loadData();

    window.addEventListener('pos-queue-updated', loadData);
    window.addEventListener('fsrms-sync-complete', loadData);
    window.addEventListener('fsrms-observability-event', loadData);

    return () => {
      window.removeEventListener('pos-queue-updated', loadData);
      window.removeEventListener('fsrms-sync-complete', loadData);
      window.removeEventListener('fsrms-observability-event', loadData);
    };
  }, []);

  const handleForceSync = async () => {
    setLoading(true);
    try {
      await flushMutationQueue();
      await loadData();
    } catch (err) {
      console.error('[QUEUE-INSPECTOR] Force sync failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteActive = async (id: string) => {
    try {
      const db = await getStorageAdapter();
      const tx = db.transaction(['OFFLINE_MUTATION_QUEUE'], 'readwrite');
      await tx.objectStore('OFFLINE_MUTATION_QUEUE').delete(id);
      await tx.done;
      
      window.dispatchEvent(new CustomEvent('pos-queue-updated'));
      await loadData();
    } catch (err) {
      console.error('[QUEUE-INSPECTOR] Failed to delete queue item:', err);
    }
  };

  const handleDeleteQuarantined = async (queueId: string) => {
    try {
      const db = await getStorageAdapter();
      const tx = db.transaction(['QUARANTINED_MUTATIONS'], 'readwrite');
      await tx.objectStore('QUARANTINED_MUTATIONS').delete(queueId);
      await tx.done;
      await loadData();
    } catch (err) {
      console.error('[QUEUE-INSPECTOR] Failed to delete quarantined item:', err);
    }
  };

  const handleRetryQuarantined = async (item: any) => {
    try {
      const db = await getStorageAdapter();
      const tx = db.transaction(['OFFLINE_MUTATION_QUEUE', 'QUARANTINED_MUTATIONS'], 'readwrite');
      const queueStore = tx.objectStore('OFFLINE_MUTATION_QUEUE');
      const quarantineStore = tx.objectStore('QUARANTINED_MUTATIONS');

      await queueStore.put({
        id: item.queueId,
        encrypted: item.encrypted || false,
        payload: item.payload,
        type: item.type,
        correlationId: item.correlationId || crypto.randomUUID(),
        retryCount: 0,
        created_at: new Date().toISOString()
      });

      await quarantineStore.delete(item.queueId);
      await tx.done;

      window.dispatchEvent(new CustomEvent('pos-queue-updated'));
      await loadData();
      
      flushMutationQueue();
    } catch (err) {
      console.error('[QUEUE-INSPECTOR] Failed to retry quarantined item:', err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear the entire queue and quarantined database? This cannot be undone.')) {
      return;
    }
    try {
      const db = await getStorageAdapter();
      const tx = db.transaction(['OFFLINE_MUTATION_QUEUE', 'QUARANTINED_MUTATIONS'], 'readwrite');
      
      const qStore = tx.objectStore('OFFLINE_MUTATION_QUEUE');
      const items = await qStore.getAll();
      for (const item of items) {
        await qStore.delete(item.id);
      }

      const quarantineStore = tx.objectStore('QUARANTINED_MUTATIONS');
      const quarantinedItems = await quarantineStore.getAll();
      for (const item of quarantinedItems) {
        await quarantineStore.delete(item.queueId);
      }
      
      await tx.done;
      window.dispatchEvent(new CustomEvent('pos-queue-updated'));
      await loadData();
    } catch (err) {
      console.error('[QUEUE-INSPECTOR] Failed to clear stores:', err);
    }
  };

  const getPercent = (value: number, total: number) => {
    if (!total || total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <div className="bg-white border border-[#F5E1E4] rounded-2xl shadow-premium-md overflow-hidden flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b border-[#F5E1E4]/60 px-6 py-4.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFF0F2] flex items-center justify-center text-[#D98897]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#6B3A44] uppercase tracking-wider">Queue Inspector</h3>
            <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">Offline-first sync buffer controls and latency diagnostics.</p>
          </div>
        </div>
        
        {userRole === 'Owner/Manager' && (
          <div className="flex flex-wrap gap-2">
            {syncState?.frozen && (
              <span className="bg-rose-50 text-rose-700 border border-rose-250 px-2.5 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                Engine Frozen
              </span>
            )}
            <button
              onClick={handleForceSync}
              disabled={loading || activeQueue.length === 0}
              className={`px-4 py-2 bg-[#FAF3F4] text-[#D98897] border border-[#F5E1E4] hover:bg-[#D98897] hover:text-white disabled:opacity-55 transition-all rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-premium-sm`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Force Sync
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#F5E1E4]/50 bg-[#FAF3F4]/20 px-4">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-3.5 text-xs font-bold cursor-pointer border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'active' 
              ? 'border-[#D98897] text-[#D98897]' 
              : 'border-transparent text-zinc-400 hover:text-[#D98897]'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Active Buffer
          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
            activeQueue.length > 0 ? 'bg-[#D98897] text-white' : 'bg-zinc-150 text-zinc-500 bg-zinc-100'
          }`}>
            {activeQueue.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('quarantine')}
          className={`px-4 py-3.5 text-xs font-bold cursor-pointer border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'quarantine' 
              ? 'border-[#D98897] text-[#D98897]' 
              : 'border-transparent text-zinc-400 hover:text-[#D98897]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          DLQ Quarantine
          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
            quarantined.length > 0 ? 'bg-rose-600 text-white animate-pulse' : 'bg-zinc-150 text-zinc-500 bg-zinc-100'
          }`}>
            {quarantined.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-4 py-3.5 text-xs font-bold cursor-pointer border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'metrics' 
              ? 'border-[#D98897] text-[#D98897]' 
              : 'border-transparent text-zinc-400 hover:text-[#D98897]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Telemetry Latency
        </button>
      </div>

      {/* Content */}
      <div className="p-6 min-h-[220px] bg-white">
        {/* Active Tab */}
        {activeTab === 'active' && (
          <div className="space-y-4">
            {activeQueue.length > 0 ? (
              <div className="border border-[#F5E1E4] rounded-xl overflow-x-auto overflow-y-auto max-h-80 shadow-premium-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF3F4]/10 border-b border-[#F5E1E4] text-zinc-400 font-bold uppercase tracking-wider text-[9px]">
                      <th className="p-3">Type</th>
                      <th className="p-3">ID / Queue ID</th>
                      <th className="p-3">Retries</th>
                      <th className="p-3">Correlation ID</th>
                      <th className="p-3">Timestamp</th>
                      {userRole === 'Owner/Manager' && <th className="p-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5E1E4]/30 text-zinc-500 font-semibold">
                    {activeQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FAF3F4]/10 transition-colors">
                        <td className="p-3">
                          <span className="bg-[#FFF0F2] text-[#6B3A44] border border-[#F2C6CE]/50 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase font-mono">
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-zinc-400">{item.id.substring(0, 8)}...</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${
                            item.retryCount > 0 
                              ? 'bg-amber-50 text-amber-800 border-amber-200' 
                              : 'bg-[#EDF6F2] text-[#244A3A] border-[#D2E3DB]'
                          }`}>
                            {item.retryCount || 0} / 5
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[9px] text-zinc-400">{item.correlationId || 'N/A'}</td>
                        <td className="p-3 text-[10px] text-zinc-400">{new Date(item.created_at || Date.now()).toLocaleTimeString()}</td>
                        {userRole === 'Owner/Manager' && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteActive(item.id)}
                              className="text-zinc-300 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                              title="Drop mutation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-[#FAF3F4]/10 border border-dashed border-[#F5E1E4] rounded-2xl">
                <CheckCircle className="w-9 h-9 text-[#4F8A6B] mx-auto mb-2" />
                <h4 className="text-xs font-bold text-[#6B3A44] uppercase tracking-wider">Sync Queue Empty</h4>
                <p className="text-[11px] text-zinc-400 font-semibold mt-1">All mutations have been synchronized successfully.</p>
              </div>
            )}
          </div>
        )}

        {/* Quarantine Tab */}
        {activeTab === 'quarantine' && (
          <div className="space-y-4">
            {quarantined.length > 0 ? (
              <div className="space-y-3.5 max-h-80 overflow-y-auto">
                {quarantined.map((item) => (
                  <div key={item.queueId} className="border border-rose-200 bg-rose-50/30 rounded-xl p-4 text-xs flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="space-y-2 flex-grow min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase font-mono">
                          {item.type}
                        </span>
                        <span className="text-[9px] font-bold text-[#6B3A44] font-mono">
                          QueueID: {item.queueId.substring(0, 8)}...
                        </span>
                        <span className="text-[9px] font-bold bg-zinc-100 text-zinc-650 px-2 py-0.5 rounded-md border border-zinc-200 font-mono">
                          CorrelID: {item.correlationId || 'N/A'}
                        </span>
                      </div>
                      
                      <div className="text-[10px] font-bold text-rose-950 font-mono bg-white border border-rose-150 p-3 rounded-xl whitespace-pre-wrap max-w-full overflow-x-auto shadow-premium-sm">
                        <span className="font-bold block text-rose-800 uppercase text-[9px] mb-1">Incident Trace Log:</span>
                        {item.errorLog || item.incident_metadata?.error || 'Unknown Non-Transient Sync error'}
                      </div>
                      
                      <div className="text-[10px] text-zinc-400 flex gap-4 font-semibold">
                        <span>Quarantined At: {new Date(item.quarantinedAt).toLocaleString()}</span>
                        <span>Total Retry Attempts: {item.retryCount}</span>
                      </div>
                    </div>

                    {userRole === 'Owner/Manager' ? (
                      <div className="flex gap-2 w-full sm:w-auto flex-row sm:flex-col justify-end flex-shrink-0">
                        <button
                          onClick={() => handleRetryQuarantined(item)}
                          className="bg-white hover:bg-emerald-600 hover:text-white border border-emerald-200 text-emerald-600 px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 flex-1 sm:flex-initial cursor-pointer transition-all shadow-premium-sm"
                          title="Reset retry count and append back to Active queue"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Re-Queue
                        </button>
                        <button
                          onClick={() => handleDeleteQuarantined(item.queueId)}
                          className="bg-white hover:bg-rose-600 hover:text-white border border-rose-200 text-rose-605 px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 flex-1 sm:flex-initial cursor-pointer transition-all shadow-premium-sm"
                        >
                          <Trash2 className="w-3 h-3" />
                          Discard
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end text-right w-full sm:w-auto flex-shrink-0">
                        <span className="text-[10px] text-zinc-400 font-semibold italic">Hanya Owner yang dapat re-queue/discard</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-[#FAF3F4]/10 border border-dashed border-[#F5E1E4] rounded-2xl">
                <CheckCircle className="w-9 h-9 text-[#4F8A6B] mx-auto mb-2" />
                <h4 className="text-xs font-bold text-[#6B3A44] uppercase tracking-wider">DLQ Healthy &amp; Clear</h4>
                <p className="text-[11px] text-zinc-400 font-semibold mt-1">No transactions have been quarantined. Zero non-transient mutations.</p>
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {/* Counts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#FAF3F4]/10 border border-[#F5E1E4]/60 rounded-xl p-4 text-center shadow-premium-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Sync Attempts</span>
                <p className="text-lg font-bold text-[#6B3A44] mt-1 font-mono">{metrics?.total_sync_attempts || 0}</p>
              </div>
              <div className="bg-[#EDF6F2]/30 border border-[#C2DDD0]/60 rounded-xl p-4 text-center shadow-premium-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#244A3A]">Successful Syncs</span>
                <p className="text-lg font-bold text-emerald-800 mt-1 font-mono">{metrics?.successful_syncs || 0}</p>
              </div>
              <div className="bg-[#FFF0F2]/40 border border-[#F2C6CE]/50 rounded-xl p-4 text-center shadow-premium-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B3A44]">Sync Success Rate</span>
                <p className="text-lg font-bold text-[#D98897] mt-1 font-mono">
                  {getPercent(metrics?.successful_syncs, metrics?.total_sync_attempts)}%
                </p>
              </div>
            </div>

            {/* Latency distribution */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-[#6B3A44] uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#D98897]" />
                Latency Distribution Histogram
              </h4>
              
              <div className="space-y-3">
                {[
                  { label: '0-200 ms (Optimized)', key: '0-200ms', color: 'bg-emerald-500' },
                  { label: '200-500 ms (Normal)', key: '200-500ms', color: 'bg-emerald-455 bg-emerald-400' },
                  { label: '500-1000 ms (Degraded)', key: '500-1000ms', color: 'bg-amber-405 bg-amber-450 bg-amber-400' },
                  { label: '1000-5000 ms (Poor)', key: '1000-5000ms', color: 'bg-orange-400' },
                  { label: '>5000 ms (Timeout risk)', key: '>5000ms', color: 'bg-rose-500' }
                ].map((bucket) => {
                  const count = metrics?.[bucket.key] || 0;
                  const total = (metrics?.['0-200ms'] || 0) + (metrics?.['200-500ms'] || 0) + (metrics?.['500-1000ms'] || 0) + (metrics?.['1000-5000ms'] || 0) + (metrics?.['>5000ms'] || 0);
                  const percent = getPercent(count, total);
                  
                  return (
                    <div key={bucket.key} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-zinc-650">
                        <span>{bucket.label}</span>
                        <span className="font-mono text-[11px]">{count} ({percent}%)</span>
                      </div>
                      <div className="w-full bg-[#FAF3F4]/30 border border-[#F5E1E4]/30 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className={`${bucket.color} h-full transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      {userRole === 'Owner/Manager' && (
        <div className="border-t border-rose-100 bg-rose-50/20 px-6 py-4.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Danger Zone
              </p>
              <p className="text-xs text-rose-600 font-semibold leading-relaxed">
                Permanently deletes the entire active queue and quarantined store. This action cannot be undone.
              </p>
            </div>
            <button
              onClick={handleClearAll}
              className="flex-shrink-0 px-4 py-2 bg-white text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white transition-all rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-premium-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
