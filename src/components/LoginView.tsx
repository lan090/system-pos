import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle,
  Eye,
  EyeOff,
  WifiOff,
  Loader2,
  Sparkles
} from 'lucide-react';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Deteksi status koneksi untuk tampilkan banner offline
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await onLogin(email.trim(), password);
      if (!result.success) {
        setErrorMessage(result.error || 'Login gagal. Coba lagi.');
      }
      // Jika sukses, App.tsx akan unmount LoginView secara otomatis via isLoggedIn state
    } catch (err) {
      setErrorMessage('Terjadi kesalahan tidak terduga. Silakan coba lagi.');
      console.error('[LoginView] Unhandled error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6 antialiased font-sans relative overflow-hidden" 
      id="login-view"
      style={{ background: 'linear-gradient(135deg, #FFF0F5 0%, #FAFAFA 50%, #FFF7FA 100%)' }}
    >
      {/* Background decorative blobs */}
      <div className="absolute top-[-80px] right-[-80px] w-[320px] h-[320px] rounded-full opacity-20 pointer-events-none"
           style={{ background: 'radial-gradient(circle, #F7477B, transparent 70%)' }} />
      <div className="absolute bottom-[-60px] left-[-60px] w-[260px] h-[260px] rounded-full opacity-15 pointer-events-none"
           style={{ background: 'radial-gradient(circle, #F9A8BF, transparent 70%)' }} />
      
      <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-[0_16px_48px_rgba(247,71,123,0.14)] border border-[#FFE4EC] p-8 flex flex-col relative overflow-hidden z-10">
        
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 rounded-t-3xl"
             style={{ background: 'linear-gradient(90deg, #F9A8BF, #F7477B, #C0365A)' }} />
        
        {/* ── BRANDING ── */}
        <div className="text-center mb-8 mt-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-[#F7477B] items-center justify-center mb-4 shadow-[0_8px_24px_rgba(247,71,123,0.35)]">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#C0365A] tracking-tight">AuraDesk</h1>
          <p className="text-[11px] font-bold text-[#F7477B] uppercase tracking-widest mt-1.5 opacity-80">
            Salon &amp; Kecantikan Management
          </p>
          <p className="text-xs text-gray-400 font-medium mt-1">Fenina Salon &amp; Reflexology</p>
        </div>

        {/* ── OFFLINE BANNER ── */}
        {isOffline && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Mode Offline Terdeteksi</p>
              <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                Login diverifikasi secara lokal menggunakan data yang tersimpan di perangkat ini.
              </p>
            </div>
          </div>
        )}

        {/* ── FORM ── */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          
          {/* Email Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider" htmlFor="login-email">
              Alamat Email
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F9A8BF]">
                <Mail className="w-4 h-4" />
              </span>
              <input 
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }}
                placeholder="email@salon.com"
                disabled={isLoading}
                className="w-full bg-[#FFF7FA] border border-[#FFE4EC] rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.12)] transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider" htmlFor="login-password">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F9A8BF]">
                <Lock className="w-4 h-4" />
              </span>
              <input 
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMessage(null); }}
                placeholder="••••••••"
                disabled={isLoading}
                className="w-full bg-[#FFF7FA] border border-[#FFE4EC] rounded-xl py-3 pl-10 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.12)] transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-gray-300"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#F9A8BF] hover:text-[#F7477B] transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3">
              <AlertCircle className="text-rose-500 w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-rose-700 text-xs font-semibold leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Submit Button */}
          <button 
            id="login-submit-btn"
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full bg-[#F7477B] text-white font-bold text-sm h-12 rounded-full hover:bg-[#C0365A] transition-all shadow-[0_4px_20px_rgba(247,71,123,0.35)] hover:shadow-[0_6px_28px_rgba(247,71,123,0.45)] flex justify-center items-center gap-2 mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-wider"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isOffline ? 'Memverifikasi Offline...' : 'Memverifikasi...'}
              </>
            ) : (
              <>
                Masuk ke Sistem
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security note */}
        <p className="text-center text-[10px] text-gray-400 mt-6 font-mono select-none">
          🔒 Dilindungi Supabase Auth + AES-GCM Offline Encryption
        </p>
      </div>
    </div>
  );
}
