'use client';

import React, { useState } from 'react';
import { registerAccount, loginAccount } from '@/lib/authStore';
import { UserAccount } from '@/types/fantasy';
import { User, Lock, ArrowRight, Loader2, X, ShieldCheck, Sparkles } from 'lucide-react';
import { UnicornLogo } from './UnicornLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'register' | 'login';
  onSuccess?: (user: UserAccount) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'register',
  onSuccess,
}) => {
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser) {
      setError('Please enter a username.');
      return;
    }
    if (!password) {
      setError('Please enter a password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let user: UserAccount;
      if (mode === 'register') {
        user = await registerAccount(cleanUser, password);
      } else {
        user = await loginAccount(cleanUser, password);
      }
      setIsLoading(false);
      onSuccess?.(user);
      onClose();
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Authentication failed. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-md my-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <UnicornLogo className="w-6 h-6 fill-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">
                {mode === 'register' ? 'Create Your Account' : 'Log In to Trade Horny'}
              </h2>
              <p className="text-xs text-slate-400">
                Keep your claimed team synced across phone, tablet, and PC
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                mode === 'register'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                mode === 'login'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log In
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium text-left">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={mode === 'register' ? 'Choose username (e.g. BlitzKing)' : 'Enter username'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm text-white placeholder-slate-600 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder={mode === 'register' ? 'Password (min 4 characters)' : 'Enter password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm text-white placeholder-slate-600 outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{mode === 'register' ? 'Create Account & Continue' : 'Log In & Continue'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-400">
            {mode === 'register' ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="text-blue-400 hover:underline font-bold"
                >
                  Log In
                </button>
              </span>
            ) : (
              <span>
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="text-blue-400 hover:underline font-bold"
                >
                  Create Account
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
