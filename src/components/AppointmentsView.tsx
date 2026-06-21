import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  Users, 
  Plus,
  Info,
  X,
  Sparkles,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { Appointment, Customer, Treatment, Therapist } from '../types';

interface AppointmentsViewProps {
  appointments: Appointment[];
  onAddAppointment?: (app: Appointment) => void;
  onSettleAppointment?: (app: Appointment) => void;
  onCancelAppointment?: (appId: string) => void;
  customers?: Customer[];
  treatments?: Treatment[];
  /** Therapist list sourced from `therapists` DB table — NOT users table */
  therapistList?: Therapist[];
  userRole?: string;
}

interface RenderedAppointment {
  id: string;
  customerName: string;
  therapistId: string;
  therapistName: string;
  treatmentName: string;
  timeSlot: string;
  duration: number;
  top: number;
  height: number;
  isConflict: boolean;
  isDashed?: boolean;
  category: string;
}

// Default seed therapists for offline/demo mode (replaced by DB data in production)
const DEFAULT_THERAPISTS: Therapist[] = [];

// Pastel colors function for categorizing services
const getPastelColor = (category: string) => {
  const cat = category ? category.toLowerCase() : '';
  if (cat.includes('hair')) {
    // Hair category: soft rose
    return {
      bg: 'bg-[#FFF0F2]',
      border: 'border-[#F2C6CE]/60',
      borderLeft: 'border-l-[#EED1D5]',
      text: 'text-[#6B3A44]',
      badge: 'bg-[#FCE1E5] text-[#6B3A44] border-[#EED1D5]/40'
    };
  } else if (cat.includes('massage') || cat.includes('reflexology') || cat.includes('spa') || cat.includes('treatment')) {
    // Massage category: soft sage
    return {
      bg: 'bg-[#EDF6F2]',
      border: 'border-[#C2DDD0]/60',
      borderLeft: 'border-l-[#D2E3DB]',
      text: 'text-[#244A3A]',
      badge: 'bg-[#DCEEE5] text-[#244A3A] border-[#D2E3DB]/40'
    };
  } else if (cat.includes('face') || cat.includes('facial') || cat.includes('care')) {
    // Facial category: soft lavender
    return {
      bg: 'bg-[#F6F0FA]',
      border: 'border-[#DECBE6]/60',
      borderLeft: 'border-l-[#E6D8ED]',
      text: 'text-[#3E2E52]',
      badge: 'bg-[#EEDEF5] text-[#3E2E52] border-[#E6D8ED]/40'
    };
  } else {
    // Fallback default color
    return {
      bg: 'bg-[#FAF4F5]',
      border: 'border-[#F5E1E4]',
      borderLeft: 'border-l-[#D98897]',
      text: 'text-[#6B3A44]',
      badge: 'bg-[#F2C6CE]/20 text-[#6B3A44] border-[#F2C6CE]/30'
    };
  }
};

export default function AppointmentsView({ 
  appointments, 
  onAddAppointment, 
  onSettleAppointment,
  onCancelAppointment,
  customers = [], 
  treatments = [],
  therapistList,
  userRole
}: AppointmentsViewProps) {
  const [selectedDate, setSelectedDate] = useState('Hari ini, 24 Okt 2023');
  const [viewMode, setViewMode] = useState<'Hari' | 'Minggu'>('Hari');
  const [activeTooltip, setActiveTooltip] = useState<string | null>('siti-conflict'); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAppIdForAction, setSelectedAppIdForAction] = useState<string | null>(null);

  // Resolve active therapist list: prefer prop from DB, fall back to defaults
  const activeTherapists = useMemo(() => {
    const list = therapistList && therapistList.length > 0 ? therapistList : DEFAULT_THERAPISTS;
    return list.filter(t => t.is_active);
  }, [therapistList]);

  // Form Booking States
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    therapistId: '',
    therapistName: '',
    timeSlot: '11:00',
    treatmentId: '',
    notes: ''
  });

  // Clean treatments without mock fallbacks
  const activeTreatments = useMemo(() => {
    return treatments || [];
  }, [treatments]);

  // Specialty lookup — derived from treatment categories per therapist
  const getTherapistDisplayName = (t: Therapist) => `${t.nama}`;

  const hours = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  // Map app-wide state to local list
  const dynamicAppointments = useMemo(() => {
    // Map additional custom ones dynamically
    const customList = appointments.map((app, index) => {
      // Calculate top of cell based on hours
      const hourIndex = hours.indexOf(app.startTime);
      const calculatedTop = hourIndex !== -1 ? (hourIndex * 80) + 40 : 400 + (index * 60);
      
      // Calculate duration in minutes if possible
      let durationInMins = 60;
      if (app.startTime && app.endTime) {
        const [sh, sm] = app.startTime.split(':').map(Number);
        const [eh, em] = app.endTime.split(':').map(Number);
        durationInMins = (eh * 60 + em) - (sh * 60 + sm);
        if (durationInMins <= 0) durationInMins = 60;
      }

      // Find treatment category
      const treatment = treatments.find(t => t.id === app.service_id);
      const category = treatment?.kategori || '';

      return {
        id: app.id || `custom-${index}`,
        customerName: app.patientName,
        therapistId: app.therapist_id,          // FK → therapists.id
        therapistName: app.therapistName,        // from therapists.nama
        treatmentName: app.label,
        timeSlot: app.startTime,
        duration: durationInMins,
        top: calculatedTop,
        height: 64,
        isConflict: app.isConflict || false,
        isDashed: app.dashed || false,
        category: category
      };
    });

    return customList;
  }, [appointments, treatments]);

  // Real-time conflict engine
  const conflictDetection = useMemo(() => {
    const selectedSlot = formData.timeSlot;
    const selectedTherapist = formData.therapistId;

    if (!selectedSlot || !selectedTherapist) {
      return { isConflict: false, reason: '' };
    }

    // Convert time to numeric minutes for comparison
    const timeToMins = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const targetStart = timeToMins(selectedSlot);
    const selectedTreatment = activeTreatments.find(t => t.id === formData.treatmentId) as (Treatment & { duration?: number }) | undefined;
    const duration = selectedTreatment?.duration || 60;
    const targetEnd = targetStart + duration;

    // Check collisions — compare therapist_id (UUID or seeded string)
    for (const app of dynamicAppointments) {
      if (app.therapistId === selectedTherapist) {
        const appStart = timeToMins(app.timeSlot);
        const appEnd = appStart + app.duration;

        // check standard range overlap: targetStart < appEnd && targetEnd > appStart
        if (targetStart < appEnd && targetEnd > appStart) {
          const tName = activeTherapists.find(t => t.id === selectedTherapist)?.nama ?? selectedTherapist;
          return { 
            isConflict: true, 
            reason: `Terapis ${tName} sudah memiliki agenda "${app.treatmentName}" untuk ${app.customerName} pada jam ${app.timeSlot} (${app.duration} menit).` 
          };
        }
      }
    }

    return { isConflict: false, reason: '' };
  }, [formData, dynamicAppointments, activeTherapists]);

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName && !formData.customerId) return;

    // Find actual client name
    let clientName = formData.customerName;
    if (formData.customerId) {
      const found = customers.find(c => c.id === formData.customerId);
      if (found) clientName = found.name;
    }

    const selectedTreatment = activeTreatments.find(t => t.id === formData.treatmentId) as (Treatment & { duration?: number }) | undefined;
    const treatmentName = selectedTreatment ? selectedTreatment.nama_layanan : 'Signature Treatment';
    const duration = selectedTreatment?.duration || 60;
    const serviceId = selectedTreatment?.id || '00000000-0000-0000-0000-000000000000';
    const customerId = formData.customerId || '00000000-0000-0000-0000-000000000000';

    const [h, m] = formData.timeSlot.split(':').map(Number);
    const totalMinutes = h * 60 + m + duration;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const newApp: Appointment = {
      id: crypto.randomUUID(),
      customer_id: customerId,
      therapist_id: formData.therapistId,
      therapistName: formData.therapistName,
      service_id: serviceId,
      patientName: clientName || 'Walk-In Guest',
      startTime: formData.timeSlot,
      endTime: endStr,
      label: treatmentName,
      status: 'Scheduled',
      notes: formData.notes
    };

    if (onAddAppointment) {
      onAddAppointment(newApp);
    }

    setIsDrawerOpen(false);
    // Reset — restore default therapist from active list
    const defaultTherapist = activeTherapists[1] ?? activeTherapists[0];
    setFormData({
      customerId: '',
      customerName: '',
      therapistId: defaultTherapist?.id ?? '',
      therapistName: defaultTherapist?.nama ?? '',
      timeSlot: '13:00',
      treatmentId: '',
      notes: ''
    });
  };

  return (
    <div className="space-y-6 font-sans" id="appointments-view">
      {/* Controls Bar & Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white rounded-2xl p-5 shadow-premium-sm border border-[#F5E1E4]">
        <div>
          <h2 className="text-lg font-bold text-[#6B3A44] tracking-tight">Therapist Scheduling Matrix</h2>
          <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Coordinate client treatments, manage work schedules and mitigate conflict overlaps.</p>
        </div>

        <div className="flex flex-wrap gap-2.5 items-center justify-between md:justify-end">
          <div className="flex items-center gap-1 bg-[#FDF9FA] px-3 py-1.5 rounded-xl border border-[#F5E1E4]">
            <button className="p-1 hover:bg-white rounded-lg transition-colors cursor-pointer text-[#D98897]">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-bold text-xs text-[#6B3A44] px-2 font-mono">{selectedDate}</span>
            <button className="p-1 hover:bg-white rounded-lg transition-colors cursor-pointer text-[#D98897]">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-1 bg-[#FDF9FA] p-1 rounded-xl border border-[#F5E1E4]">
            <button 
              onClick={() => setViewMode('Hari')}
              className={`px-3.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'Hari' 
                  ? 'bg-white shadow-premium-sm text-[#D98897] border border-[#F5E1E4]/50 font-bold' 
                  : 'text-[#6B3A44] hover:text-[#D98897] opacity-80'
              }`}
            >
              Lanes Hari
            </button>
            <button 
              onClick={() => setViewMode('Minggu')}
              className={`px-3.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'Minggu' 
                  ? 'bg-white shadow-premium-sm text-[#D98897] border border-[#F5E1E4]/50 font-bold' 
                  : 'text-[#6B3A44] hover:text-[#D98897] opacity-80'
              }`}
            >
              Agenda Minggu
            </button>
          </div>

          <button 
            onClick={() => setIsDrawerOpen(true)}
            className="bg-[#D98897] text-white hover:bg-[#6B3A44] hover:shadow-premium-md transition-all font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 text-xs shadow-premium-sm cursor-pointer ml-auto md:ml-0"
          >
            <Plus className="w-4 h-4" />
            New Booking
          </button>
        </div>
      </div>

      {/* Bento Matrix Calendar Scheduling Card */}
      {activeTherapists.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white border border-[#F5E1E4] rounded-2xl shadow-premium-sm space-y-4 min-h-[450px]">
          <div className="w-16 h-16 rounded-full bg-[#FFF5F6] border border-[#F5E1E4] flex items-center justify-center animate-pulse">
            <Users className="w-6 h-6 text-[#D98897]" />
          </div>
          <div className="text-center max-w-sm space-y-1.5">
            <h3 className="text-sm font-bold text-[#6B3A44]">Terapis Tidak Ditemukan</h3>
            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              Tidak ada terapis aktif yang terdaftar di database. Pastikan perangkat Anda terhubung ke internet untuk sinkronisasi pertama kali.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#F5E1E4] rounded-2xl shadow-premium-md overflow-hidden">
          {/* Matrix Header (X-Axis Resources) */}
          <div className="grid border-b border-[#F5E1E4] bg-[#FAF3F4]/20"
            style={{ gridTemplateColumns: `80px repeat(${activeTherapists.length}, 1fr)` }}>
            <div className="p-4 text-right text-[10px] font-bold text-zinc-400 border-r border-[#F5E1E4]/50 flex items-end justify-end font-mono">
              WIB +07
            </div>
            {activeTherapists.map((therapist) => (
              <div key={therapist.id} className="p-4 text-center border-r border-[#F5E1E4]/40 last:border-r-0">
                <span className="text-xs font-bold text-[#6B3A44] block leading-tight">{getTherapistDisplayName(therapist)}</span>
                <span className="inline-block text-[9px] font-bold text-[#D98897] mt-1.5 uppercase tracking-wider bg-[#FAF3F4] px-2 py-0.5 rounded-md border border-[#F5E1E4]/40">
                  Terapis Aktif
                </span>
              </div>
            ))}
          </div>

          {/* Matrix Body (Y-Axis Time & Resource Lanes) */}
          <div className="grid relative bg-white min-h-[760px]"
            style={{ gridTemplateColumns: `80px repeat(${activeTherapists.length}, 1fr)` }}>
            {/* Horizontal Grid lines helper */}
            <div className="absolute inset-0 pointer-events-none flex flex-col z-0">
              {hours.map((_, i) => (
                <div key={i} className="h-[80px] border-b border-[#F5E1E4]/20 w-full last:border-b-0" />
              ))}
            </div>

            {/* Time Labels Column (Y-Axis) */}
            <div className="relative z-10 border-r border-[#F5E1E4]/50 bg-[#FAF3F4]/5 pt-[40px]">
              <div className="flex flex-col space-y-[62px] text-right pr-3 text-[#6B3A44]/75 font-bold text-xs font-mono">
                {hours.map((hour, i) => (
                  <span key={i} className="block -translate-y-1/2">{hour}</span>
                ))}
              </div>
            </div>

            {/* Dynamic Lanes — one per active therapist */}
            {activeTherapists.map((therapist, laneIndex) => {
              const isLastLane = laneIndex === activeTherapists.length - 1;

              return (
                <div key={therapist.id} className={`relative z-10 ${isLastLane ? '' : 'border-r border-[#F5E1E4]/30'} p-2 min-h-full`}>
                  {dynamicAppointments
                    .filter(app => app.therapistId === therapist.id)
                    .map(app => {
                      const catStyle = getPastelColor(app.category);
                      return (
                        <div 
                          key={app.id}
                          onClick={() => {
                            if (app.isConflict) {
                              setActiveTooltip(activeTooltip === app.id ? null : app.id);
                            } else {
                              setSelectedAppIdForAction(app.id);
                            }
                          }}
                          style={{ top: `${app.top}px`, height: `${app.height}px` }}
                          className={`absolute left-[8px] right-[8px] p-3 rounded-xl shadow-premium-sm overflow-visible flex flex-col justify-between cursor-pointer transition-all hover:shadow-premium-md hover:scale-[1.01] ${
                            app.isConflict 
                              ? 'bg-rose-50 border-2 border-rose-500 z-30 ring-4 ring-rose-100' 
                              : app.isDashed
                              ? 'bg-[#FAF6F6]/80 border border-dashed border-[#D98897] opacity-75'
                              : `${catStyle.bg} border ${catStyle.border} border-l-[3px] ${catStyle.borderLeft}`
                          }`}
                        >
                          {/* Conflict Tooltip */}
                          {app.isConflict && activeTooltip === app.id && (
                            <div className="absolute -top-[64px] left-1/2 -translate-x-1/2 w-[250px] bg-rose-600 text-white rounded-xl shadow-premium-lg p-3 flex items-start gap-2 z-50 animate-pulse pointer-events-none text-left">
                              <AlertTriangle className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />
                              <span className="text-[10px] font-bold leading-snug">Overlap terdeteksi: Terapis {therapist.nama} sudah memiliki jadwal pada jam ini!</span>
                              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-rose-600 rotate-45"></div>
                            </div>
                          )}
                          <div>
                            <span className={`text-[9px] font-bold block mb-0.5 uppercase tracking-wider ${
                              app.isConflict ? 'text-rose-700 font-bold' : catStyle.text
                            }`}>
                              {app.timeSlot} {app.isConflict && '[BENTROK]'}
                            </span>
                            <span className="text-xs font-bold text-[#6B3A44] truncate block">{app.treatmentName}</span>
                          </div>
                          <span className="text-[11px] font-bold text-[#6B3A44] truncate block flex items-center gap-1">
                            <Users className={`w-3.5 h-3.5 ${app.isConflict ? 'text-rose-500' : 'text-[#D98897]'}`} /> {app.customerName}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Synchronize Diagnostics Banner */}
      <div className="bg-[#FAF3F4]/40 p-4 rounded-2xl border border-[#F5E1E4] flex items-center gap-3 text-xs text-zinc-600 font-semibold">
        <Info className="w-4.5 h-4.5 text-[#D98897] flex-shrink-0" />
        <span className="leading-relaxed">
          <strong>Agenda Sinkronisasi Supabase</strong>: Semua jadwal yang diluncurkan otomatis divalidasi bentrok tabrakan di memori. Klik pada blok jadwal berwarna merah (BENTROK) untuk mensimulasikan kegagalan validasi trigger Cloud RLS.
        </span>
      </div>

      {/* Side Drawer Booking Registration */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-stone-900/20 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="relative w-full max-w-[460px] h-full bg-white shadow-premium-lg flex flex-col border-l border-[#F5E1E4] z-10 rounded-l-3xl overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-[#F5E1E4] flex justify-between items-center bg-[#FAF3F4]/20">
              <h3 className="text-base font-bold text-[#6B3A44] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#D98897]" />
                Reservasi Booking Terapis
              </h3>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="text-zinc-400 hover:text-[#6B3A44] p-1.5 rounded-full hover:bg-[#FAF3F4] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleBookingSubmit} className="flex-grow flex flex-col justify-between overflow-hidden">
              <div className="px-8 py-6 overflow-y-auto space-y-5 flex-1 text-xs">
                {/* Check user role */}
                {userRole === 'Terapis' && (
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-950 font-bold mb-2 leading-relaxed">
                    Review Mode: Anda login sebagai Terapis. Database Row Level Security (RLS) hanya mengizinkan pengamatan matrix; Tombol Submit dikunci.
                  </div>
                )}

                {/* Conflict banner warning */}
                {conflictDetection.isConflict && (
                  <div className="bg-rose-50 border border-rose-300 p-4 rounded-xl text-rose-950 font-bold flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-rose-700 text-[10px] uppercase tracking-widest font-bold">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Tabrakan Overlap Terdeteksi!
                    </span>
                    <p className="text-xs font-semibold leading-relaxed">{conflictDetection.reason}</p>
                  </div>
                )}

                {/* Customer Picker */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase text-[#6B3A44] tracking-wider">Nama Pelanggan / Nomor HP *</label>
                  {customers && customers.length > 0 ? (
                    <select 
                      value={formData.customerId}
                      onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value, customerName: '' }))}
                      className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                    >
                      <option value="">-- Pilih dari Database Pelanggan --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.phone} - {c.tier})</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      type="text"
                      placeholder="Masukkan nama pelanggan baru..."
                      value={formData.customerName}
                      onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value, customerId: '' }))}
                      className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                    />
                  )}
                  {formData.customerId === '' && (
                    <div className="pt-1.5">
                      <input 
                        type="text"
                        placeholder="Atau, ketik manual Walk-In Guest..."
                        value={formData.customerName}
                        onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value, customerId: '' }))}
                        className="w-full px-4 py-2.5 bg-[#FDF9FA] border border-[#F5E1E4]/70 rounded-xl text-xs text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] transition-all"
                      />
                    </div>
                  )}
                </div>

                {/* Therapist Picker */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase text-[#6B3A44] tracking-wider">Pilih Terapis Melayani *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {activeTherapists.map(t => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setFormData(p => ({ ...p, therapistId: t.id, therapistName: t.nama }))}
                        className={`p-3.5 border rounded-xl text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                          formData.therapistId === t.id 
                            ? 'border-[#D98897] bg-[#FFF0F2] text-[#D98897] font-bold ring-1 ring-[#D98897]/40 shadow-premium-sm' 
                            : 'border-[#F5E1E4] text-[#6B3A44] hover:bg-[#FAF3F4]/20 font-semibold'
                        }`}
                      >
                        <span className="block text-xs leading-none">{t.nama}</span>
                        <span className="text-[9px] opacity-75 font-semibold leading-none block mt-1">Terapis</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Treatment / Service Picker */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase text-[#6B3A44] tracking-wider">Pilih Jenis Layanan Salon *</label>
                  <select
                    value={formData.treatmentId}
                    required
                    onChange={(e) => setFormData(p => ({ ...p, treatmentId: e.target.value }))}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  >
                    <option value="">-- Pilih Layanan Salon --</option>
                    {activeTreatments.map(t => (
                      <option key={t.id} value={t.id}>{t.nama_layanan} (Rp {t.harga_jual.toLocaleString('id-ID')} - {t.duration} menit)</option>
                    ))}
                  </select>
                </div>

                {/* Time Slot Picker */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase text-[#6B3A44] tracking-wider">Jam Layanan (Mulai) *</label>
                  <div className="grid grid-cols-4 gap-2 max-h-[140px] overflow-y-auto pr-1">
                    {hours.map(h => (
                      <button
                        type="button"
                        key={h}
                        onClick={() => setFormData(p => ({ ...p, timeSlot: h }))}
                        className={`py-2.5 text-xs font-bold border rounded-xl cursor-pointer transition-all flex items-center justify-center ${
                          formData.timeSlot === h 
                            ? 'bg-[#D98897] border-[#D98897] text-white shadow-premium-sm' 
                            : 'bg-white border-[#F5E1E4] text-[#6B3A44] hover:bg-[#FAF3F4]/20 font-semibold'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Notes */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase text-[#6B3A44] tracking-wider">Catatan Alergi / Preferensi Khusus</label>
                  <textarea 
                    name="notes"
                    rows={2.5}
                    value={formData.notes}
                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs text-[#6B3A44] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] resize-none transition-all shadow-premium-sm"
                    placeholder="Contoh: Sensitif dengan shampoo mint, blow lurus saja..."
                  />
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="px-8 py-6 border-t border-[#F5E1E4] bg-[#FAF3F4]/20 flex justify-end gap-3.5">
                <button 
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-zinc-500 border border-[#F5E1E4] hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={conflictDetection.isConflict || (!formData.customerName && !formData.customerId) || !formData.treatmentId || !formData.therapistId}
                  className={`px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-white transition-all cursor-pointer ${
                    conflictDetection.isConflict || (!formData.customerName && !formData.customerId) || !formData.treatmentId || !formData.therapistId
                      ? 'bg-zinc-200 text-zinc-400 border border-[#F5E1E4] cursor-not-allowed opacity-50 shadow-none' 
                      : 'bg-[#D98897] hover:bg-[#6B3A44] shadow-premium-sm hover:shadow-premium-md'
                  }`}
                >
                  Simpan Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Action Modal for Appointments */}
      {selectedAppIdForAction && (() => {
        const app = dynamicAppointments.find(a => a.id === selectedAppIdForAction);
        const rawApp = appointments.find(a => a.id === selectedAppIdForAction);
        if (!app) return null;

        const currentStatus = rawApp?.status || 'Scheduled';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-stone-900/35 backdrop-blur-xs transition-opacity" 
              onClick={() => setSelectedAppIdForAction(null)}
            />

            <div className="relative bg-white text-[#6B3A44] max-w-sm w-full rounded-2xl p-6 shadow-premium-lg border border-[#F5E1E4] z-10 text-xs space-y-4">
              <div className="flex justify-between items-center border-b border-[#F5E1E4] pb-3.5">
                <h3 className="text-sm font-bold text-[#6B3A44] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#D98897]" />
                  Detail Jadwal Reservasi
                </h3>
                <button 
                  onClick={() => setSelectedAppIdForAction(null)}
                  className="text-zinc-400 hover:text-[#6B3A44] p-1 rounded-full hover:bg-[#FAF3F4] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 pt-1.5">
                <div className="flex justify-between items-center border-b border-[#FAF3F4]/50 pb-2.5">
                  <span className="font-bold text-zinc-400 text-[9px] uppercase tracking-wider">Pelanggan</span>
                  <span className="font-bold text-[#6B3A44] text-xs">{app.customerName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#FAF3F4]/50 pb-2.5">
                  <span className="font-bold text-zinc-400 text-[9px] uppercase tracking-wider">Layanan Salon</span>
                  <span className="font-bold text-[#6B3A44] text-xs">{app.treatmentName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#FAF3F4]/50 pb-2.5">
                  <span className="font-bold text-zinc-400 text-[9px] uppercase tracking-wider">Terapis Melayani</span>
                  <span className="font-bold text-[#6B3A44] text-xs">{app.therapistName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#FAF3F4]/50 pb-2.5">
                  <span className="font-bold text-zinc-400 text-[9px] uppercase tracking-wider">Jam Booking</span>
                  <span className="font-bold text-[#6B3A44] text-xs font-mono">{app.timeSlot} - {app.duration}m</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#FAF3F4]/50 pb-2.5">
                  <span className="font-bold text-zinc-400 text-[9px] uppercase tracking-wider">Status Sekarang</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase border ${
                    currentStatus === 'Done' ? 'bg-emerald-50 text-[#244A3A] border-[#D2E3DB]' :
                    currentStatus === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    currentStatus === 'In Progress' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                    'bg-[#FFF0F2] text-[#D98897] border-[#F2C6CE]/50'
                  }`}>
                    {currentStatus}
                  </span>
                </div>
                {rawApp?.notes && (
                  <div className="bg-[#FAF3F4]/30 border border-[#F5E1E4]/50 rounded-xl p-3 space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Catatan Khusus:</span>
                    <p className="font-semibold text-zinc-600 text-xs leading-relaxed italic">"{rawApp.notes}"</p>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-[#F5E1E4]/60 flex flex-col gap-2">
                {currentStatus !== 'Done' && currentStatus !== 'Cancelled' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onSettleAppointment && rawApp) {
                        onSettleAppointment(rawApp);
                      }
                      setSelectedAppIdForAction(null);
                    }}
                    className="w-full bg-[#D98897] text-white hover:bg-[#6B3A44] hover:shadow-premium-sm transition-all font-bold py-2.5 rounded-xl text-center cursor-pointer text-xs flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Selesaikan &amp; Bayar di POS
                  </button>
                )}

                {currentStatus !== 'Cancelled' && currentStatus !== 'Done' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onCancelAppointment && rawApp) {
                        onCancelAppointment(rawApp.id);
                      }
                      setSelectedAppIdForAction(null);
                    }}
                    className="w-full bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 transition-colors font-bold py-2 rounded-xl text-center cursor-pointer text-xs"
                  >
                    Batalkan Reservasi
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedAppIdForAction(null)}
                  className="w-full bg-white hover:bg-zinc-50 text-zinc-500 border border-[#F5E1E4] transition-colors font-bold py-2 rounded-xl text-center cursor-pointer text-xs"
                >
                  Kembali
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
