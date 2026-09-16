/** Password unlock screen */
import { useState } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import type { UseWalletReturn } from './useWallet';

export function WalletLock({ wallet }: { wallet: UseWalletReturn }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!password) return;
    setLoading(true); setError('');
    try {
      await wallet.unlock(password);
    } catch {
      setError('Wrong password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 bg-[var(--bg)]">
      <div className="w-full max-w-xs">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-4">
            <Lock size={26} className="text-[var(--accent)]" />
          </div>
          <h1 className="display text-xl font-bold text-[var(--ink)]">Wallet Locked</h1>
          <p className="text-xs text-[var(--subtle)] mt-1">Enter your password to unlock</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handle(); }}
              autoFocus
            />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
          <button
            onClick={() => { void handle(); }}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
