/** First-time wallet setup — create or import */
import { useState } from 'react';
import { Wallet, Plus, Download, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { UseWalletReturn } from './useWallet';

type Mode = 'choose' | 'create' | 'import';

export function WalletSetup({ wallet }: { wallet: UseWalletReturn }) {
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('My Wallet');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [secret, setSecret] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (password.length < 8) { setError('Min 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await wallet.setup(name, password);
      toast.success('Wallet created! Keep your password safe.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!secret.trim()) { setError('Enter a private key or mnemonic'); return; }
    if (password.length < 8) { setError('Min 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await wallet.importExisting(name, secret, password);
      await wallet.setup(name, password).catch(() => {});
      // setup already imported, so just unlock
      await wallet.unlock(password);
      toast.success('Wallet imported!');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'choose') return (
    <div className="flex flex-col items-center justify-center h-full px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)' }}>
            <Wallet size={30} className="text-white" />
          </div>
          <h1 className="display text-2xl font-bold text-[var(--ink)] tracking-tight">Glowpad Wallet</h1>
          <p className="text-xs text-[var(--subtle)] mt-1.5 text-center">Your self-custodied EVM wallet. Keys never leave your device.</p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setMode('create')}
            className="w-full py-4 rounded-2xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Create New Wallet
          </button>
          <button
            onClick={() => setMode('import')}
            className="w-full py-4 rounded-2xl text-sm font-medium border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-hover)] flex items-center justify-center gap-2"
          >
            <Download size={16} /> Import Existing Wallet
          </button>
        </div>
        <p className="text-center text-[10px] text-[var(--subtle)] mt-4">
          Your keys are encrypted on-device. Neither Glowpad nor any third party can access them.
        </p>
      </div>
    </div>
  );

  if (mode === 'import') return (
    <div className="flex flex-col items-center justify-center h-full px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setMode('choose')} className="text-xs text-[var(--accent)] hover:opacity-80">← Back</button>
          <h2 className="display text-lg font-bold text-[var(--ink)]">Import Wallet</h2>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="Wallet name" value={name} onChange={e => setName(e.target.value)} />
          <textarea
            className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none"
            rows={3}
            placeholder="Private key (0x...) or 12/24-word seed phrase"
            value={secret}
            onChange={e => setSecret(e.target.value)}
          />
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="Create password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]">{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>
          <input type={showPw ? 'text' : 'password'} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
          <button
            onClick={() => { void handleImport(); }}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? 'Importing…' : 'Import Wallet'}
          </button>
        </div>
      </div>
    </div>
  );

  // create mode
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setMode('choose')} className="text-xs text-[var(--accent)] hover:opacity-80">← Back</button>
          <h2 className="display text-lg font-bold text-[var(--ink)]">Create Wallet</h2>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="Wallet name" value={name} onChange={e => setName(e.target.value)} />
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]">{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>
          <input type={showPw ? 'text' : 'password'} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-xl p-3 text-[10px] text-[var(--warning)] space-y-1">
            <p className="font-semibold">Back up your seed phrase after creation.</p>
            <p>If you lose your password you will need the seed phrase to recover access.</p>
          </div>
          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
          <button
            onClick={() => { void handleCreate(); }}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? 'Creating…' : 'Create Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}
