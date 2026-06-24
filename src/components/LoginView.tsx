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
import loginIllustration from './login_salon_illustration.png';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Detect offline connection status for offline banner
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
    } catch (err) {
      setErrorMessage('Terjadi kesalahan tidak terduga. Silakan coba lagi.');
      console.error('[LoginView] Unhandled error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 antialiased font-sans relative overflow-hidden" 
      id="login-view"
      style={{ background: 'linear-gradient(135deg, #FFF0F5 0%, #FAFAFA 50%, #FFF7FA 100%)' }}
    >
      {/* Background decorative elements */}
      <div className="absolute top-[-100px] right-[-100px] w-[350px] h-[350px] rounded-full opacity-20 pointer-events-none"
           style={{ background: 'radial-gradient(circle, #F7477B, transparent 70%)' }} />
      <div className="absolute bottom-[-80px] left-[-80px] w-[300px] h-[300px] rounded-full opacity-15 pointer-events-none"
           style={{ background: 'radial-gradient(circle, #F9A8BF, transparent 70%)' }} />

      {/* Split Card Container */}
      <div className="w-full max-w-[840px] bg-white rounded-[32px] shadow-[0_20px_50px_rgba(247,71,123,0.12)] border border-[#FFE4EC] flex flex-col md:grid md:grid-cols-[1.15fr_0.85fr] relative overflow-hidden z-10 anim-zoom-in">
        
        {/* Left Side: Login Form */}
        <div className="p-8 md:p-12 flex flex-col justify-center">
          
          {/* Flower Icon & Branding Header */}
          <div className="flex flex-col items-start mb-8 text-left">
            <div className="w-10 h-10 rounded-full bg-[#FFF0F5] border border-[#FFE4EC] flex items-center justify-center mb-4">
              <span className="text-[#F7477B] text-lg font-serif">✿</span>
            </div>
            
            <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight leading-none">AuraDesk</h1>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-2">
              Salon &amp; Reflexology Management System
            </p>
          </div>

          {/* Offline Banner */}
          {isOffline && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-xs font-semibold text-amber-800">Mode Offline Terdeteksi</p>
                <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                  Login diverifikasi secara lokal menggunakan data yang tersimpan di perangkat ini.
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            
            {/* Email Input */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider" htmlFor="login-email">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input 
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }}
                  placeholder="owner@fenina.com"
                  disabled={isLoading}
                  className="w-full bg-[#FFF9FB] border border-zinc-200 rounded-xl py-3 pl-10 pr-4 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.08)] transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-zinc-300"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input 
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(null); }}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                  className="w-full bg-[#FFF9FB] border border-zinc-200 rounded-xl py-3 pl-10 pr-10 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.08)] transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-zinc-300"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#F7477B] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 flex items-start gap-2.5 text-left">
                <AlertCircle className="text-rose-500 w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-rose-700 text-xs font-semibold leading-relaxed">{errorMessage}</p>
              </div>
            )}

            {/* Submit Button */}
            <button 
              id="login-submit-btn"
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-[#F7477B] text-white font-bold text-xs h-12 rounded-xl hover:bg-[#C0365A] transition-all shadow-[0_4px_16px_rgba(247,71,123,0.25)] hover:shadow-[0_6px_22px_rgba(247,71,123,0.35)] flex justify-center items-center gap-2 mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-widest"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isOffline ? 'Memverifikasi Offline...' : 'Memverifikasi...'}
                </>
              ) : (
                <>
                  Masuk
                  <ArrowRight className="w-4.5 h-4.5" />
                </>
              )}
            </button>
          </form>

          {/* Security note */}
          <div className="flex items-center justify-center gap-1 mt-8 select-none text-zinc-400 text-[9px] font-medium font-sans">
            <span>🔒 Dilindungi Supabase Auth + AES-GCM Offline Encryption</span>
          </div>
        </div>

        {/* Right Side: 3D Illustration Area */}
        <div className="hidden md:block relative bg-[#FFF0F5]">
          <img 
            src={loginIllustration} 
            alt="Salon Treatment Corner"
            className="w-full h-full object-cover"
          />
          {/* Subtle overlay matching the arched style */}
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#FFF0F5]/5 pointer-events-none" />
        </div>

      </div>
    </div>
  );
}
