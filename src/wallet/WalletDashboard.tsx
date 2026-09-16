/**
 * WalletDashboard — finance-app UI (dark mode)
 * Layout: Home | Explore | Assets | Wallet | Settings  (bottom nav)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Home, Compass, BarChart3, Wallet, Settings2,
  Eye, EyeOff, Search, Bell, ArrowUpRight, ArrowDownLeft,
  RefreshCw, Plus, Send, Download, Repeat2,
  Copy, Check, ExternalLink, ChevronRight, Loader2,
  AlertTriangle, Lock, Key, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { UseWalletReturn, TokenBalance } from './useWallet';
import { TokenLogo, TokenDetail } from './TokenDetail';
import { buildTxExplorerUrl } from '@/onchain-facts';

// ── helpers ───────────────────────────────────────────────────────────────────
function usd(n: number, dp = 2) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

// Tiny sparkline — random walk around a change value
function sparkData(change: number, pts = 12) {
  let v = 100;
  return Array.from({ length: pts }, (_, i) => {
    const drift = (change / pts) * (0.5 + Math.random());
    v = Math.max(v + drift + (Math.random() - 0.5) * 2, 10);
    return { i, v };
  });
}

function Sparkline({ change, width = 64, height = 32 }: { change: number; width?: number; height?: number }) {
  const data = sparkData(change);
  const color = change >= 0 ? '#22c55e' : '#ef4444';
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── portfolio sparkline (bigger) ──────────────────────────────────────────────
function PortfolioChart({ totalUsd }: { totalUsd: number }) {
  const data = sparkData(8.42, 30).map((d, i) => ({ ...d, t: i }));
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4e9ff5" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#4e9ff5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="#4e9ff5" strokeWidth={2} fill="url(#pg)" dot={false} />
        <XAxis hide />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 10, color: 'var(--ink)' }}
          formatter={(v) => [`$${((v as number) / 100 * totalUsd).toFixed(2)}`, '']}
          labelFormatter={() => ''}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── password modal ────────────────────────────────────────────────────────────
function PwModal({ title, onConfirm, onCancel, loading, error }: {
  title: string; onConfirm: (pw: string) => void;
  onCancel: () => void; loading: boolean; error?: string;
}) {
  const [pw, setPw] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
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
            {loading && <Loader2 size={14} className="animate-spin" />}Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddToken modal ────────────────────────────────────────────────────────────
function AddTokenModal({ wallet, onClose }: { wallet: UseWalletReturn; onClose: () => void }) {
  const [addr, setAddr] = useState('');
  const [info, setInfo] = useState<{ symbol: string; name: string; decimals: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const lookup = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { setErr('Invalid address'); return; }
    setLoading(true); setErr('');
    try {
      const meta = await wallet.lookupToken(addr);
      setInfo(meta);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  const add = () => {
    if (!info) return;
    wallet.addCustomToken(addr, info.symbol, info.name, info.decimals);
    toast.success(`${info.symbol} added`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">Add Custom Token</p>
        <input className="w-full px-4 py-3 rounded-2xl text-xs font-mono bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
          placeholder="0x contract address" value={addr} onChange={e => setAddr(e.target.value)} />
        {err && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{err}</p>}
        {info && (
          <div className="bg-[var(--surface-muted)] rounded-2xl p-3 text-xs text-[var(--ink)] space-y-1">
            <p><span className="text-[var(--subtle)]">Name: </span>{info.name}</p>
            <p><span className="text-[var(--subtle)]">Symbol: </span>{info.symbol}</p>
            <p><span className="text-[var(--subtle)]">Decimals: </span>{info.decimals}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm text-[var(--subtle)] border border-[var(--border)]">Cancel</button>
          {info
            ? <button onClick={add} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[var(--accent)]">Add Token</button>
            : <button onClick={() => { void lookup(); }} disabled={loading || !addr} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[var(--accent)] disabled:opacity-40 flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}Look up
            </button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Send modal ────────────────────────────────────────────────────────────────
function SendModal({ wallet, onClose }: { wallet: UseWalletReturn; onClose: () => void }) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenIdx, setTokenIdx] = useState(0);
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [txHash, setTxHash] = useState('');

  const selectedToken = wallet.balances[tokenIdx];

  const send = async () => {
    if (!selectedToken || !to || !amount || !pw) return;
    setLoading(true); setErr('');
    try {
      let hash: string;
      if (selectedToken.isNative) {
        hash = await wallet.sendNative(to, amount, pw);
      } else {
        hash = await wallet.sendToken(selectedToken.address, to, amount, selectedToken.decimals, pw);
      }
      setTxHash(hash);
      toast.success('Transaction sent!');
      await wallet.refreshBalances();
    } catch (e) { setErr((e as Error).message.slice(0, 80)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">Send</p>
        {txHash ? (
          <div className="text-center space-y-3 py-2">
            <Check size={28} className="mx-auto text-[var(--success)]" />
            <p className="text-sm font-semibold text-[var(--ink)]">Sent!</p>
            <a href={buildTxExplorerUrl(wallet.activeChainId, txHash)} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] flex items-center justify-center gap-1">
              <ExternalLink size={11} />View on Explorer
            </a>
            <button onClick={onClose} className="text-xs text-[var(--subtle)]">Close</button>
          </div>
        ) : (
          <>
            <select className="w-full px-4 py-3 rounded-2xl text-sm bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
              value={tokenIdx} onChange={e => setTokenIdx(Number(e.target.value))}>
              {wallet.balances.map((b, i) => (
                <option key={b.address} value={i}>{b.symbol} — {parseFloat(b.balance).toFixed(4)}</option>
              ))}
            </select>
            <input className="w-full px-4 py-3 rounded-2xl text-xs font-mono bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
              placeholder="Recipient address (0x…)" value={to} onChange={e => setTo(e.target.value)} />
            <div className="flex gap-2">
              <input type="number" className="flex-1 px-4 py-3 rounded-2xl text-sm bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
                placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
              <button onClick={() => setAmount(parseFloat(selectedToken?.balance ?? '0').toFixed(6))}
                className="px-3 py-2 rounded-2xl text-xs font-semibold text-[var(--accent)] bg-[var(--surface-muted)] border border-[var(--border)]">Max</button>
            </div>
            <input type="password" className="w-full px-4 py-3 rounded-2xl text-sm bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
              placeholder="Wallet password" value={pw} onChange={e => setPw(e.target.value)} />
            {err && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{err}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm text-[var(--subtle)] border border-[var(--border)]">Cancel</button>
              <button onClick={() => { void send(); }} disabled={loading || !to || !amount || !pw}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[var(--accent)] disabled:opacity-40 flex items-center justify-center gap-2">
                {loading && <Loader2 size={14} className="animate-spin" />}Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ReceiveModal ──────────────────────────────────────────────────────────────
function ReceiveModal({ wallet, onClose }: { wallet: UseWalletReturn; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const addr = wallet.activeWallet?.address ?? '';
  const copy = () => {
    void navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-5 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">Receive</p>
        {/* QR placeholder — static pattern */}
        <div className="w-36 h-36 mx-auto rounded-2xl bg-white flex items-center justify-center p-3">
          <div className="w-full h-full grid grid-cols-9 gap-px">
            {[1,0,1,0,1,1,0,1,0, 0,1,1,0,1,0,1,0,1, 1,0,0,1,1,0,0,1,1, 0,1,0,0,0,1,0,0,0,
              1,1,1,0,1,1,1,0,1, 0,0,1,0,0,0,1,1,0, 1,0,1,1,0,1,0,0,1, 0,1,0,1,1,0,1,0,0,
              1,1,0,0,1,0,1,1,0].map((v, i) => (
              <div key={i} className="rounded-sm" style={{ background: v ? '#000' : 'transparent' }} />
            ))}
          </div>
        </div>
        <div className="bg-[var(--surface-muted)] rounded-2xl px-4 py-3 flex items-center gap-3 border border-[var(--border)]">
          <p className="flex-1 text-xs font-mono text-[var(--ink)] truncate">{addr}</p>
          <button onClick={copy} className="text-[var(--subtle)] hover:text-[var(--accent)]">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-semibold text-[var(--subtle)] border border-[var(--border)]">Close</button>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'home' | 'explore' | 'assets' | 'wallet' | 'settings';

const NAV: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'explore', icon: Compass, label: 'Explore' },
  { id: 'assets', icon: BarChart3, label: 'Assets' },
  { id: 'wallet', icon: Wallet, label: 'Wallet' },
  { id: 'settings', icon: Settings2, label: 'Settings' },
];

// ── HomeTab ───────────────────────────────────────────────────────────────────
function HomeTab({ wallet, onTokenSelect, onSend, onReceive, onSwap }: {
  wallet: UseWalletReturn;
  onTokenSelect: (t: TokenBalance) => void;
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
}) {
  const [hideBalance, setHideBalance] = useState(false);
  const totalUsd = wallet.balances.reduce((s, b) => s + parseFloat(b.usdValue ?? '0'), 0);

  const watchlist = wallet.balances.filter(b => b.watchlisted).slice(0, 4);
  const topMovers = [...wallet.balances].sort((a, b) => Math.abs(parseFloat(b.change24h ?? '0')) - Math.abs(parseFloat(a.change24h ?? '0'))).slice(0, 6);

  const name = wallet.activeWallet ? (wallet.activeWallet as unknown as { name?: string }).name ?? 'My Wallet' : 'My Wallet';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Greeting */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm"
            style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-[10px] text-[var(--subtle)]">{greeting} 👋</p>
            <p className="text-sm font-bold text-[var(--ink)] leading-tight">{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl bg-[var(--surface)] text-[var(--subtle)]"><Search size={15} /></button>
          <button className="p-2 rounded-xl bg-[var(--surface)] text-[var(--subtle)]"><Bell size={15} /></button>
        </div>
      </div>

      {/* Balance hero */}
      <div className="mx-4 rounded-3xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0f2044 0%,#1a1060 60%,#0d1f3c 100%)' }}>
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 70% 40%,#4e9ff5 0%,transparent 60%)' }} />
        <div className="relative z-10">
          <p className="text-xs text-blue-300/80 mb-1">Total Balance</p>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-3xl font-bold tabular-nums text-white tracking-tight">
              {hideBalance ? '••••••' : usd(totalUsd)}
            </p>
            <button onClick={() => setHideBalance(v => !v)} className="text-blue-300/60 hover:text-white">
              {hideBalance ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-xs text-green-400 font-semibold">+8.42% Today (+{usd(totalUsd * 0.0842)})</p>
          <div className="mt-3">
            <PortfolioChart totalUsd={totalUsd} />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-around px-6 pt-5 pb-2">
        {[
          { icon: Plus, label: 'Deposit', action: onReceive },
          { icon: ArrowUpRight, label: 'Withdraw', action: onSend },
          { icon: Send, label: 'Transfer', action: onSend },
          { icon: Repeat2, label: 'Swap', action: onSwap },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
              <Icon size={18} className="text-white" />
            </div>
            <span className="text-[10px] text-[var(--subtle)]">{label}</span>
          </button>
        ))}
      </div>

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-[var(--ink)]">My Watchlist</p>
            <button className="text-xs text-[var(--accent)]">See All</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {watchlist.map(t => {
              const chg = parseFloat(t.change24h ?? '0');
              return (
                <button key={t.address} onClick={() => onTokenSelect(t)}
                  className="bg-[var(--surface)] rounded-2xl p-3.5 text-left border border-[var(--border)] hover:border-[var(--accent)]/40 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <TokenLogo symbol={t.symbol} size={28} />
                    <div>
                      <p className="text-xs font-semibold text-[var(--ink)]">{t.name}</p>
                      <p className="text-[10px] text-[var(--subtle)]">({t.symbol})</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-[var(--ink)]">{usd(parseFloat(t.usdValue ?? '0'))}</p>
                  <p className="text-[10px] font-semibold mt-0.5" style={{ color: chg >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(2)}%
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Movers */}
      <div className="px-4 mt-4">
        <p className="text-sm font-bold text-[var(--ink)] mb-3">Top Movers</p>
        <div className="space-y-0">
          {topMovers.map(t => {
            const chg = parseFloat(t.change24h ?? '0');
            const price = parseFloat(t.usdValue ?? '0') / Math.max(parseFloat(t.balance), 0.000001);
            return (
              <button key={t.address} onClick={() => onTokenSelect(t)}
                className="w-full flex items-center gap-3 py-3 border-b border-[var(--border)]/40 last:border-0 hover:bg-[var(--surface)]/40 rounded-xl px-1 transition-colors">
                <TokenLogo symbol={t.symbol} size={36} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold text-[var(--ink)]">{t.name} <span className="text-[var(--subtle)]">({t.symbol})</span></p>
                  <p className="text-[10px] tabular-nums font-medium text-[var(--ink)]">${price > 0 ? price.toFixed(4) : '—'}</p>
                </div>
                <Sparkline change={chg} />
                <p className="text-xs font-bold w-14 text-right tabular-nums" style={{ color: chg >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {pct(chg)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ExploreTab ────────────────────────────────────────────────────────────────
function ExploreTab({ wallet, onTokenSelect }: { wallet: UseWalletReturn; onTokenSelect: (t: TokenBalance) => void }) {
  const [q, setQ] = useState('');
  const filtered = wallet.balances.filter(b =>
    b.symbol.toLowerCase().includes(q.toLowerCase()) || b.name.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-5 pt-6 pb-4">
        <p className="text-lg font-bold text-[var(--ink)] mb-3">Explore</p>
        <div className="flex items-center gap-2 bg-[var(--surface)] rounded-2xl px-4 py-3 border border-[var(--border)]">
          <Search size={14} className="text-[var(--subtle)] shrink-0" />
          <input className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder-[var(--subtle)] outline-none"
            placeholder="Search tokens…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="px-4 space-y-0">
        {filtered.map(t => {
          const chg = parseFloat(t.change24h ?? '0');
          const price = parseFloat(t.usdValue ?? '0') / Math.max(parseFloat(t.balance), 0.000001);
          return (
            <button key={t.address} onClick={() => onTokenSelect(t)}
              className="w-full flex items-center gap-3 py-3.5 border-b border-[var(--border)]/40 last:border-0">
              <TokenLogo symbol={t.symbol} size={40} />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-[var(--ink)]">{t.name}</p>
                <p className="text-xs text-[var(--subtle)]">{t.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums text-[var(--ink)]">${price > 0 ? price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</p>
                <p className="text-xs font-semibold" style={{ color: chg >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pct(chg)}</p>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-[var(--subtle)] text-center py-8">No tokens found</p>}
      </div>
    </div>
  );
}

// ── AssetsTab ─────────────────────────────────────────────────────────────────
function AssetsTab({ wallet, onTokenSelect, onAddToken }: {
  wallet: UseWalletReturn; onTokenSelect: (t: TokenBalance) => void; onAddToken: () => void;
}) {
  const totalUsd = wallet.balances.reduce((s, b) => s + parseFloat(b.usdValue ?? '0'), 0);
  const totalProfit = totalUsd * 0.1274;

  const stats = [
    { icon: '📈', label: 'Portfolio Growth', value: '+12.74%', sub: 'From all time your investment', color: 'var(--success)' },
    { icon: '💰', label: 'Total Profit', value: usd(totalProfit), sub: 'Your profits earned so far', color: 'var(--success)' },
    { icon: '💵', label: 'Total Cash', value: usd(totalUsd * 0.07), sub: 'Funds you can use for trading', color: 'var(--ink)' },
    { icon: '📊', label: 'Total Assets', value: String(wallet.balances.length), sub: 'Crypto assets in portfolio', color: 'var(--ink)' },
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <p className="text-lg font-bold text-[var(--ink)]">My Assets</p>
        <button className="p-2 text-[var(--subtle)]">⋮</button>
      </div>

      <div className="px-4">
        <p className="text-xs text-[var(--subtle)] mb-1">Top Assets</p>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-[var(--subtle)]">Based On Assets Type Available</p>
          <span className="text-[10px] bg-[var(--surface)] border border-[var(--border)] rounded-full px-2 py-0.5 text-[var(--subtle)]">{wallet.balances.length} Assets</span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {stats.map(s => (
            <div key={s.label} className="bg-[var(--surface)] rounded-2xl p-3.5 border border-[var(--border)]">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-[var(--subtle)]">{s.label}</p>
                <span className="text-sm">{s.icon}</span>
              </div>
              <p className="text-sm font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] text-[var(--subtle)] mt-0.5 leading-tight">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Watchlist full */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-[var(--ink)]">My Watchlist</p>
          <button onClick={onAddToken} className="flex items-center gap-1 text-xs text-[var(--accent)]">
            <Plus size={12} />Add Token
          </button>
        </div>
        <div className="space-y-0">
          {wallet.balances.map(t => {
            const chg = parseFloat(t.change24h ?? '0');
            const price = parseFloat(t.usdValue ?? '0') / Math.max(parseFloat(t.balance), 0.000001);
            return (
              <button key={t.address} onClick={() => onTokenSelect(t)}
                className="w-full flex items-center gap-3 py-3 border-b border-[var(--border)]/40 last:border-0">
                <TokenLogo symbol={t.symbol} size={38} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold text-[var(--ink)]">{t.name}</p>
                  <p className="text-[10px] text-[var(--subtle)]">{t.symbol}</p>
                </div>
                <Sparkline change={chg} width={56} height={28} />
                <div className="text-right min-w-[90px]">
                  <p className="text-sm font-bold tabular-nums text-[var(--ink)]">${price > 0 ? price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</p>
                  <p className="text-[10px] font-semibold" style={{ color: chg >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pct(chg)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── WalletTab ─────────────────────────────────────────────────────────────────
function WalletTab({ wallet }: { wallet: UseWalletReturn }) {
  // Trigger refresh once on mount if balances not yet loaded — use a ref to avoid set-state-in-effect
  useEffect(() => {
    if (wallet.activeWallet && !wallet.balancesLoaded) {
      void wallet.refreshBalances();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.activeWallet?.address, wallet.balancesLoaded]);

  const loading = wallet.isLoadingBalances;

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <p className="text-lg font-bold text-[var(--ink)]">Wallet</p>
        <button onClick={() => { void wallet.refreshBalances(); }}
          className="p-2 rounded-xl bg-[var(--surface)] text-[var(--subtle)]">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Address */}
      <div className="mx-4 bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] mb-4">
        <p className="text-[10px] text-[var(--subtle)] mb-1">Address</p>
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono text-[var(--ink)] flex-1 truncate">{wallet.activeWallet?.address ?? '—'}</p>
          <button onClick={() => {
            void navigator.clipboard.writeText(wallet.activeWallet?.address ?? '');
            toast.success('Copied!');
          }} className="text-[var(--subtle)] hover:text-[var(--accent)]"><Copy size={13} /></button>
        </div>
      </div>

      {/* Balances */}
      <div className="px-4">
        <p className="text-sm font-bold text-[var(--ink)] mb-3">Balances</p>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-[var(--accent)]" /></div>
        ) : wallet.balances.length === 0 ? (
          <p className="text-sm text-[var(--subtle)] text-center py-6">No balances found</p>
        ) : (
          <div className="space-y-0">
            {wallet.balances.map(b => (
              <div key={b.address} className="flex items-center gap-3 py-3 border-b border-[var(--border)]/40 last:border-0">
                <TokenLogo symbol={b.symbol} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--ink)]">{b.name}</p>
                  <p className="text-[10px] text-[var(--subtle)]">{b.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-[var(--ink)]">{parseFloat(b.balance).toFixed(4)}</p>
                  {b.usdValue && <p className="text-[10px] text-[var(--subtle)]">{usd(parseFloat(b.usdValue))}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TX History */}
      {wallet.txHistory.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-sm font-bold text-[var(--ink)] mb-3">Recent Transactions</p>
          <div className="space-y-2">
            {wallet.txHistory.slice(0, 10).map((tx) => {
              const isSent = tx.from?.toLowerCase() === wallet.activeWallet?.address.toLowerCase();
              return (
                <div key={tx.hash} className="flex items-center gap-3 bg-[var(--surface)] rounded-2xl p-3 border border-[var(--border)]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: isSent ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}>
                    {isSent ? <ArrowUpRight size={14} className="text-[var(--danger)]" /> : <ArrowDownLeft size={14} className="text-[var(--success)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--ink)]">{isSent ? 'Sent' : 'Received'}</p>
                    <p className="text-[10px] text-[var(--subtle)] truncate">{isSent ? shortAddr(tx.to ?? '') : shortAddr(tx.from ?? '')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-[var(--ink)]">{tx.value}</p>
                    <a href={buildTxExplorerUrl(wallet.activeChainId, tx.hash)} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-[var(--accent)] flex items-center gap-0.5 justify-end">
                      <ExternalLink size={9} />Tx
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SettingsTab ───────────────────────────────────────────────────────────────
function SettingsTab({ wallet }: { wallet: UseWalletReturn }) {
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<'pk' | 'seed'>('pk');
  const [exportResult, setExportResult] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErr, setPwErr] = useState('');

  const doExport = async (pw: string) => {
    setPwLoading(true); setPwErr('');
    try {
      const result = exportType === 'pk'
        ? await wallet.exportPrivateKey(pw)
        : await wallet.exportMnemonic(pw);
      setExportResult(result);
      setShowExport(false);
    } catch { setPwErr('Wrong password'); }
    finally { setPwLoading(false); }
  };

  const walletObj = wallet.activeWallet as unknown as { name?: string } | null;

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {showExport && <PwModal title={exportType === 'pk' ? 'Export Private Key' : 'Export Seed Phrase'}
        onConfirm={pw => { void doExport(pw); }} onCancel={() => setShowExport(false)}
        loading={pwLoading} error={pwErr} />}

      <div className="px-5 pt-6 pb-4">
        <p className="text-lg font-bold text-[var(--ink)]">Settings</p>
      </div>

      {exportResult && (
        <div className="mx-4 bg-[var(--surface)] border border-[var(--danger)]/30 rounded-2xl p-4 mb-4">
          <p className="text-[10px] text-[var(--danger)] mb-2 flex items-center gap-1"><Shield size={11} />Keep this secret!</p>
          <p className="text-xs font-mono text-[var(--ink)] break-all">{exportResult}</p>
          <button onClick={() => setExportResult('')} className="text-[10px] text-[var(--subtle)] mt-2">Clear</button>
        </div>
      )}

      <div className="px-4 space-y-2">
        {/* Active wallet */}
        <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
          <p className="text-[10px] text-[var(--subtle)] mb-1">Active Wallet</p>
          <p className="text-sm font-bold text-[var(--ink)]">{walletObj?.name ?? 'My Wallet'}</p>
          <p className="text-xs font-mono text-[var(--subtle)] truncate mt-0.5">{wallet.activeWallet?.address ?? '—'}</p>
        </div>

        {/* Chain */}
        <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[var(--subtle)]">Network</p>
            <p className="text-sm font-semibold text-[var(--ink)]">Arc Mainnet</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
        </div>

        {[
          { icon: Key, label: 'Export Private Key', action: () => { setExportType('pk'); setShowExport(true); } },
          { icon: Download, label: 'Export Seed Phrase', action: () => { setExportType('seed'); setShowExport(true); } },
          { icon: Lock, label: 'Lock Wallet', action: () => { wallet.lock(); } },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action}
            className="w-full bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] flex items-center gap-3 hover:border-[var(--accent)]/40 transition-colors">
            <Icon size={16} className="text-[var(--subtle)]" />
            <span className="text-sm text-[var(--ink)] font-medium flex-1 text-left">{label}</span>
            <ChevronRight size={14} className="text-[var(--subtle)]" />
          </button>
        ))}

        {/* Multi-wallet */}
        <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
          <p className="text-xs font-bold text-[var(--ink)] mb-3">All Wallets ({wallet.wallets.length})</p>
          {wallet.wallets.map((w, i) => {
            const isActive = w.address === wallet.activeWallet?.address;
            return (
              <button key={w.address} onClick={() => wallet.setActiveWallet(i)}
                className="w-full flex items-center gap-2 py-2 text-left">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
                  {(w as unknown as { name?: string }).name?.charAt(0) ?? 'W'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--ink)]">{(w as unknown as { name?: string }).name ?? `Wallet ${i + 1}`}</p>
                  <p className="text-[10px] font-mono text-[var(--subtle)] truncate">{shortAddr(w.address)}</p>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
              </button>
            );
          })}
          <button onClick={() => toast.info('Create new wallet in the setup flow')}
            className="w-full flex items-center gap-2 py-2 mt-1 text-[var(--accent)] text-xs font-medium">
            <Plus size={13} />Add Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main WalletDashboard ───────────────────────────────────────────────────────
export function WalletDashboard({ wallet }: { wallet: UseWalletReturn }) {
  const [tab, setTab] = useState<Tab>('home');
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);

  const handleTokenSelect = useCallback((t: TokenBalance) => setSelectedToken(t), []);

  if (selectedToken) {
    return <TokenDetail token={selectedToken} onBack={() => setSelectedToken(null)} wallet={wallet} />;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] relative overflow-hidden">
      {showSend && <SendModal wallet={wallet} onClose={() => setShowSend(false)} />}
      {showReceive && <ReceiveModal wallet={wallet} onClose={() => setShowReceive(false)} />}
      {showAddToken && <AddTokenModal wallet={wallet} onClose={() => setShowAddToken(false)} />}

      {/* Tab content */}
      {tab === 'home' && <HomeTab wallet={wallet} onTokenSelect={handleTokenSelect} onSend={() => setShowSend(true)} onReceive={() => setShowReceive(true)} onSwap={() => setTab('explore')} />}
      {tab === 'explore' && <ExploreTab wallet={wallet} onTokenSelect={handleTokenSelect} />}
      {tab === 'assets' && <AssetsTab wallet={wallet} onTokenSelect={handleTokenSelect} onAddToken={() => setShowAddToken(true)} />}
      {tab === 'wallet' && <WalletTab wallet={wallet} />}
      {tab === 'settings' && <SettingsTab wallet={wallet} />}

      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 flex border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-xl">
        {NAV.map(({ id, icon: Icon, label }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors">
              <Icon size={18} style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }} />
              <span className="text-[9px] font-semibold" style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
