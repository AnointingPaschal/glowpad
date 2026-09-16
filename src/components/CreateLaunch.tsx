import { useState } from 'react';
import { ArrowLeft, Check, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  LAUNCHPAD_ADDRESS, LAUNCHPAD_ABI, ARC_MAINNET_CHAIN_ID,
} from '../launchpad-contract';
import { getAdminStore } from '../admin/adminStore';
import { useWalletContext } from '../wallet/walletContext';

interface CreateLaunchProps {
  onBack: () => void;
  onCreated: () => void;
  onNavigateToWallet?: () => void;
}

function PwModal({ onConfirm, onCancel, loading, error }: {
  onConfirm: (pw: string) => void;
  onCancel: () => void;
  loading: boolean;
  error?: string;
}) {
  const [pw, setPw] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">Confirm — enter wallet password</p>
        <input type="password" autoFocus
          className="w-full px-4 py-3 rounded-2xl text-sm bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
          placeholder="Wallet password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(pw); }} />
        {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-sm text-[var(--subtle)] border border-[var(--border)]">Cancel</button>
          <button onClick={() => onConfirm(pw)} disabled={loading || !pw}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[var(--accent)] disabled:opacity-40 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}Sign & Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateLaunch({ onBack, onCreated, onNavigateToWallet }: CreateLaunchProps) {
  const walletCtx = useWalletContext();
  const address = walletCtx?.activeWallet?.address;
  const chainId = walletCtx?.activeChainId ?? 0;

  // Use admin-overridden launchpad address if set
  const effectiveAddress = (() => {
    const override = getAdminStore().siteInfo.launchpadAddress;
    return (override && override !== '0x0000000000000000000000000000000000000000')
      ? override as `0x${string}`
      : LAUNCHPAD_ADDRESS;
  })();

  const [form, setForm] = useState({
    name: '', symbol: '', description: '',
    totalSupply: '', pricePerToken: '',
    softCap: '', hardCap: '',
    startOffsetHours: '1', durationHours: '24',
  });

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !walletCtx) return;
    if (chainId !== ARC_MAINNET_CHAIN_ID) {
      walletCtx.setActiveChainId(ARC_MAINNET_CHAIN_ID);
      toast.info('Switched to Arc Mainnet');
    }
    setShowPw(true);
  };

  const doCreate = async (password: string) => {
    if (!walletCtx) return;
    setLoading(true);
    setError('');
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const startTime = now + BigInt(Math.round(parseFloat(form.startOffsetHours) * 3600));
      const endTime = startTime + BigInt(Math.round(parseFloat(form.durationHours) * 3600));
      const totalSupply = BigInt(form.totalSupply) * 10n ** 18n;
      const pricePerToken = BigInt(Math.round(parseFloat(form.pricePerToken) * 1_000_000));
      const softCap = BigInt(Math.round(parseFloat(form.softCap) * 1_000_000));
      const hardCap = BigInt(Math.round(parseFloat(form.hardCap) * 1_000_000));

      const hash = await walletCtx.callContract(
        effectiveAddress,
        LAUNCHPAD_ABI,
        'createLaunch',
        [form.name, form.symbol.toUpperCase(), form.description,
          totalSupply, pricePerToken, softCap, hardCap, startTime, endTime],
        password,
      );
      setTxHash(hash);
      setSuccess(true);
      setShowPw(false);
      toast.success('Launch created! Tx: ' + hash.slice(0, 10) + '…');
    } catch (e) {
      setError((e as Error).message.slice(0, 140));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] px-4 py-3 text-[var(--ink)] placeholder-[var(--subtle)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors';
  const labelClass = 'block text-xs font-semibold text-[var(--subtle)] uppercase tracking-wide mb-1.5';

  if (success) {
    return (
      <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[var(--success)]/20 flex items-center justify-center mx-auto">
          <Check size={24} className="text-[var(--success)]" />
        </div>
        <div>
          <p className="display font-semibold text-xl text-[var(--ink)]">Launch created!</p>
          <p className="text-sm text-[var(--muted)] mt-1">Your token launch is live on Arc Mainnet.</p>
          {txHash && (
            <a href={`https://explorer.arc.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] mt-2 inline-block">View on Arc Explorer ↗</a>
          )}
        </div>
        <button onClick={onCreated}
          className="px-8 py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
          View all launches
        </button>
      </div>
    );
  }

  // No wallet set up
  if (!address) {
    return (
      <div className="space-y-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--subtle)] hover:text-[var(--ink)] transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
            <Wallet size={24} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--ink)]">Wallet required</p>
            <p className="text-sm text-[var(--subtle)] mt-1">Set up your Glowpad wallet to create a launch.</p>
          </div>
          {onNavigateToWallet && (
            <button onClick={onNavigateToWallet}
              className="px-6 py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              Set up wallet →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showPw && (
        <PwModal
          onConfirm={pw => { void doCreate(pw); }}
          onCancel={() => { setShowPw(false); setError(''); }}
          loading={loading}
          error={error}
        />
      )}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[var(--subtle)] hover:text-[var(--ink)] transition-colors">
        <ArrowLeft size={15} /> Back
      </button>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="display font-semibold text-xl text-[var(--ink)] flex-1">Create a launch</h2>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            <span className="text-[10px] font-mono text-[var(--subtle)]">{address.slice(0,6)}…{address.slice(-4)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Token name</label>
              <input className={inputClass} value={form.name} onChange={set('name')} placeholder="My Token" required />
            </div>
            <div>
              <label className={labelClass}>Symbol</label>
              <input className={inputClass} value={form.symbol} onChange={set('symbol')} placeholder="MTK" maxLength={8} required />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={`${inputClass} resize-none`} rows={3} value={form.description} onChange={set('description')} placeholder="A short description of your project" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Total supply</label>
              <input className={inputClass} type="number" min="1" value={form.totalSupply} onChange={set('totalSupply')} placeholder="1000000" required />
            </div>
            <div>
              <label className={labelClass}>Price per token (USDC)</label>
              <input className={inputClass} type="number" min="0.000001" step="0.000001" value={form.pricePerToken} onChange={set('pricePerToken')} placeholder="0.01" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Soft cap (USDC)</label>
              <input className={inputClass} type="number" min="0.000001" step="0.000001" value={form.softCap} onChange={set('softCap')} placeholder="5000" required />
            </div>
            <div>
              <label className={labelClass}>Hard cap (USDC)</label>
              <input className={inputClass} type="number" min="0.000001" step="0.000001" value={form.hardCap} onChange={set('hardCap')} placeholder="10000" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Starts in (hours)</label>
              <input className={inputClass} type="number" min="0.1" step="0.1" value={form.startOffsetHours} onChange={set('startOffsetHours')} required />
            </div>
            <div>
              <label className={labelClass}>Duration (hours)</label>
              <input className={inputClass} type="number" min="1" step="1" value={form.durationHours} onChange={set('durationHours')} required />
            </div>
          </div>
          <p className="text-xs text-[var(--subtle)]">A 2% platform fee is deducted from successful raises.</p>
          {error && !showPw && (
            <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
            Create Launch
          </button>
        </form>
      </div>
    </div>
  );
}
