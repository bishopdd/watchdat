import React, { useState } from 'react';
import {
  X,
  Cloud,
  Lock,
  Mail,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Settings,
  Copy,
  Check,
  Loader2,
  UserPlus,
  LogIn
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  SUPABASE_SQL_SETUP_SCRIPT
} from '../services/supabase';

interface AuthModalProps {
  user: User | null;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User) => Promise<void>;
  onSignOutSuccess: () => void;
  onManualSync: () => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  user,
  lastSyncedAt,
  isSyncing,
  onClose,
  onAuthSuccess,
  onSignOutSuccess,
  onManualSync
}) => {
  const initialConfig = getSupabaseConfig();
  const [showConfig, setShowConfig] = useState(!initialConfig.isConfigured);
  const [supabaseUrl, setSupabaseUrl] = useState(initialConfig.url);
  const [supabaseKey, setSupabaseKey] = useState(initialConfig.anonKey);
  const [copiedSql, setCopiedSql] = useState(false);

  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrl.trim().startsWith('https://') || !supabaseKey.trim()) {
      setErrorMsg('Please enter a valid https:// Supabase Project URL and Anon Public Key.');
      return;
    }
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setErrorMsg(null);
    setShowConfig(false);
    setInfoMsg('Supabase connection saved! You can now sign up or sign in below.');
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SETUP_SCRIPT);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim() || password.length < 6) {
      setErrorMsg('Please enter a valid email and a password of at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authTab === 'signup') {
        const { user: newUser, needsEmailConfirmation } = await signUpWithEmail(email, password);
        if (needsEmailConfirmation) {
          setInfoMsg(
            'Account created! Check your email inbox to confirm your address, then sign in.'
          );
          setAuthTab('signin');
        } else if (newUser) {
          await onAuthSuccess(newUser);
        }
      } else {
        const loggedInUser = await signInWithEmail(email, password);
        await onAuthSuccess(loggedInUser);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    try {
      await signOutUser();
      onSignOutSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[92vh] bg-[#12141c] border border-zinc-800/90 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-gradient-to-r from-[#171a26] to-[#12141c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                {user ? 'Cloud Account & Sync' : 'Sign In & Cloud Sync'}
              </h2>
              <p className="text-xs text-zinc-400">
                Save your shows &amp; episode progress across Android and Web
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowConfig(!showConfig)}
              title="Supabase Cloud Database Settings"
              className={`p-2 rounded-full border transition cursor-pointer ${
                showConfig
                  ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                  : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Supabase Project Configuration View */}
          {showConfig ? (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-300 space-y-2">
                <div className="font-bold text-amber-300">
                  Free Supabase Cloud Setup (100% Free Tier)
                </div>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>
                    Create a free project at{' '}
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 underline"
                    >
                      supabase.com/dashboard
                    </a>
                    .
                  </li>
                  <li>
                    In Supabase, open <strong>SQL Editor</strong>, click{' '}
                    <strong>Copy SQL Table Setup</strong> below, and run it once.
                  </li>
                  <li>
                    Go to <strong>Project Settings &rarr; Data API / API Keys</strong> and paste
                    your <strong>Project URL</strong> and <strong>anon public key</strong> below.
                  </li>
                </ol>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied SQL Script to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy SQL Table Setup Script
                    </>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project-id.supabase.co"
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Supabase Anon Public Key
                </label>
                <input
                  type="text"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {initialConfig.isConfigured && (
                  <button
                    type="button"
                    onClick={() => setShowConfig(false)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold cursor-pointer"
                  >
                    Back to Login
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs shadow transition cursor-pointer"
                >
                  Save Cloud Connection
                </button>
              </div>
            </form>
          ) : user ? (
            /* Signed-In User Account View */
            <div className="space-y-4">
              <div className="bg-zinc-900/90 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Signed In &amp; Cloud Sync Active
                  </div>
                  <div className="text-sm font-extrabold text-white truncate mt-1">
                    {user.email}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {lastSyncedAt
                      ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}`
                      : 'Synced with cloud account'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={onManualSync}
                  disabled={isSyncing}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing with Cloud...' : 'Sync Shows Now'}
                </button>

                <button
                  onClick={handleSignOut}
                  disabled={isSubmitting}
                  className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            /* Sign In / Sign Up Form */
            <div className="space-y-4">
              <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    authTab === 'signin'
                      ? 'bg-amber-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signup');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    authTab === 'signup'
                      ? 'bg-amber-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full rounded-xl bg-zinc-900 border border-zinc-800 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                      className="w-full rounded-xl bg-zinc-900 border border-zinc-800 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : authTab === 'signin' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {authTab === 'signin'
                    ? 'Sign In & Sync Shows'
                    : 'Create Free Cloud Account'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
