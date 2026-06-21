import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle,
  Eye,
  EyeOff,
  WifiOff,
  Loader2
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
    <div className="min-h-screen bg-background flex items-center justify-center p-6 antialiased" id="login-view">
      <div className="w-full max-w-[420px] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-wellness p-6 md:p-8 flex flex-col relative overflow-hidden">
        {/* Decorative top ambient bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-container via-primary to-primary-container opacity-50"></div>
        
        {/* Branding header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container mb-3 shadow-sm select-none">
            <span className="text-xl">🌸</span>
          </div>
          <h1 className="text-3xl font-bold text-on-primary-container tracking-tight">AuraDesk</h1>
          <p className="text-xs font-semibold text-on-surface-variant mt-1">Salon &amp; Reflexology Management System</p>
        </div>

        {/* Offline Mode Banner */}
        {isOffline && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5 animate-fade-in">
            <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Mode Offline Terdeteksi</p>
              <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                Login akan diverifikasi secara lokal menggunakan data yang tersimpan di perangkat ini. Pastikan Anda pernah login online di perangkat ini sebelumnya.
              </p>
            </div>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          
          {/* Field: Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface flex items-center gap-1" htmlFor="login-email">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline">
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
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-3.5 pl-10 pr-4 text-sm font-normal text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Field: Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface" htmlFor="login-password">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline">
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
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-3.5 pl-10 pr-10 text-sm font-normal text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Banner (dinamis dari server / verifikasi lokal) */}
          {errorMessage && (
            <div className="bg-error-container border border-error/20 rounded-lg p-3.5 flex items-start gap-3 animate-fade-in text-[12px]">
              <AlertCircle className="text-error w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-on-error-container font-semibold leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Submit action button */}
          <button 
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full bg-primary-container text-on-primary-container font-semibold text-sm h-12 rounded-lg hover:bg-tertiary-container transition-all shadow-sm flex justify-center items-center gap-1.5 mt-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isOffline ? 'Memverifikasi Offline...' : 'Memverifikasi...'}
              </>
            ) : (
              <>
                Masuk
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security footer note */}
        <p className="text-center text-[10px] text-outline mt-6 font-mono select-none">
          🔒 Dilindungi Supabase Auth + AES-GCM Offline Encryption
        </p>
      </div>
    </div>
  );
}
