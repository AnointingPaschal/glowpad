/**
 * WalletDashboard — Trust-Wallet-style dark UI for Glowpad
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Eye, EyeOff, Download, Repeat2, History,
  Lock, Copy, Check, ExternalLink, ChevronRight,
  Loader2, AlertTriangle, Plus, Shield, Key,
  Settings2, Search, RefreshCw, ArrowUpRight, ArrowDownLeft,
  Wallet as WalletIcon,
} from 'lucide-react';
import { toast } from 'sonner';
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
function fmtBal(b: string, dp = 4) {
  const n = parseFloat(b);
  if (isNaN(n)) return '0';
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

// ── Chain pill ────────────────────────────────────────────────────────────────
function ChainBadge({ chainId }: { chainId: number }) {
  const label = chainId === 5042 ? 'Arc' : chainId === 1 ? 'ETH' : chainId === 8453 ? 'Base' : `Chain ${chainId}`;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/80 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] inline-block" />
      {label}
      <ChevronRight size={11} className="opacity-50" />
    </div>
  );
}

// ── Wallet address selector pill ──────────────────────────────────────────────
function AddressPill({ address, onClick }: { address: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/80 font-medium">
      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#4e9ff5] to-[#7c3aed] flex items-center justify-center">
        <WalletIcon size={10} className="text-white" />
      </div>
      {shortAddr(address)}
      <ChevronRight size={11} className="opacity-50" />
    </button>
  );
}

// ── Portfolio balance card ────────────────────────────────────────────────────
function PortfolioCard({
  totalUsd, change24h, hide, onHide, chainId, tokenCount, nativeBalance, nativeSymbol, nativeUsdValue,
}: {
  totalUsd: number; change24h: number; hide: boolean; onHide: () => void;
  chainId: number; tokenCount: number; nativeBalance: string; nativeSymbol: string; nativeUsdValue: string;
}) {
  const up = change24h >= 0;
  const chainName = chainId === 5042 ? 'Arc' : chainId === 1 ? 'ETH' : chainId === 8453 ? 'Base' : `Chain ${chainId}`;
  return (
    <div className="mx-4 rounded-[24px] overflow-hidden relative"
      style={{
        background: 'linear-gradient(145deg, #0d1f3c 0%, #112248 40%, #0a1628 100%)',
        border: '1px solid rgba(78,159,245,0.15)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
      {/* Decorative blob */}
      <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-[0.08] blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle,#4e9ff5,transparent 70%)' }} />
      <div className="absolute bottom-0 left-8 w-32 h-32 rounded-full opacity-[0.06] blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle,#7c3aed,transparent 70%)' }} />

      <div className="relative px-5 pt-5 pb-4">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-white/60 text-xs font-medium">
            <div className="w-6 h-6 rounded-md border border-white/10 flex items-center justify-center">
              <WalletIcon size={12} className="text-white/60" />
            </div>
            Portfolio Balance
          </div>
          <button onClick={onHide} className="text-white/40 hover:text-white/70 transition-colors">
            {hide ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Balance */}
        <p className="text-[2.4rem] font-extrabold text-white tracking-tight tabular-nums leading-none mb-2">
          {hide ? '••••••' : usd(totalUsd, 2)}
        </p>

        {/* Change pill + chain pill */}
        <div className="flex items-center gap-2 mb-5">
          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${up ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'}`}>
            {up ? '↑' : '↓'} {pct(change24h)} 24h
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/50 px-2.5 py-1 rounded-full border border-white/8 bg-white/4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
            {nativeSymbol}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 mb-4" />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: nativeSymbol, value: hide ? '••' : fmtBal(nativeBalance, 2), sub: hide ? '•••' : usd(parseFloat(nativeUsdValue), 2) },
            { label: 'Assets', value: tokenCount.toString(), sub: 'tokens' },
            { label: 'Network', value: chainName, sub: 'Mainnet' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-3 py-2.5 bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[10px] text-white/40 mb-1">{s.label}</p>
              <p className="text-sm font-bold text-white/90 tabular-nums leading-tight">{s.value}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Action buttons row ────────────────────────────────────────────────────────
function ActionButtons({ onSend, onReceive, onSwap, onHistory, onLock }: {
  onSend: () => void; onReceive: () => void; onSwap: () => void;
  onHistory: () => void; onLock: () => void;
}) {
  const items = [
    { icon: ArrowUpRight, label: 'Send', action: onSend },
    { icon: Download, label: 'Receive', action: onReceive },
    { icon: Repeat2, label: 'Swap', action: onSwap },
    { icon: History, label: 'History', action: onHistory },
    { icon: Lock, label: 'Discipline', action: onLock },
  ] as const;
  return (
    <div className="mx-4 mt-3 rounded-[20px] bg-[#0e1d35] border border-white/[0.06] px-2 py-4">
      <div className="flex items-center justify-around">
        {items.map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#0d2040] border border-white/8 flex items-center justify-center hover:bg-[#1a3460] transition-colors active:scale-95">
              <Icon size={20} className="text-white" strokeWidth={2} />
            </div>
            <span className="text-[10px] font-medium text-white/50">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Asset row ────────────────────────────────────────────────────────────────
function AssetRow({ token, price, onClick }: {
  token: TokenBalance; price: number; onClick: () => void;
}) {
  const chg = parseFloat(token.change24h ?? '0');
  const bal = parseFloat(token.balance);
  const totalVal = bal * price;
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors">
      <TokenLogo symbol={token.symbol} logoUrl={token.usdValue ? undefined : undefined} size={44} />
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">{token.symbol}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-white/40">{price > 0 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '$0.00'}</span>
          {chg !== 0 && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${chg >= 0 ? 'bg-[#4ade80]/12 text-[#4ade80]' : 'bg-[#f87171]/12 text-[#f87171]'}`}>
              {pct(chg)}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white tabular-nums">{totalVal > 0 ? usd(totalVal, 2) : '$0.00'}</p>
        <p className="text-xs text-white/40 tabular-nums mt-0.5">{fmtBal(token.balance, 4)} {token.symbol}</p>
      </div>
    </button>
  );
}

// ── PwModal ───────────────────────────────────────────────────────────────────
function PwModal({ title, onConfirm, onCancel, loading, error }: {
  title: string; onConfirm: (pw: string) => void;
  onCancel: () => void; loading: boolean; error?: string;
}) {
  const [pw, setPw] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[#0e1d35] border border-white/10">
        <p className="text-sm font-semibold text-white">{title}</p>
        <input type="password" autoFocus
          className="w-full px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#4e9ff5]/50"
          placeholder="Wallet password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(pw); }} />
        {error && <p className="text-xs text-[#f87171] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-sm text-white/50 border border-white/10">Cancel</button>
          <button onClick={() => onConfirm(pw)} disabled={loading || !pw}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-[#4e9ff5] to-[#7c3aed] disabled:opacity-40 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddToken modal ─────────────────────────────────────────────────────────────
function AddTokenModal({ wallet, onClose }: { wallet: UseWalletReturn; onClose: () => void }) {
  const [addr, setAddr] = useState('');
  const [info, setInfo] = useState<{ symbol: string; name: string; decimals: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const lookup = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { setErr('Invalid address'); return; }
    setLoading(true); setErr('');
    try { setInfo(await wallet.lookupToken(addr)); }
    catch (e) { setErr((e as Error).message); }
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
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[#0e1d35] border border-white/10">
        <p className="text-sm font-semibold text-white">Import Token</p>
        <input className="w-full px-4 py-3 rounded-2xl text-xs font-mono bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none"
          placeholder="0x contract address" value={addr} onChange={e => setAddr(e.target.value)} />
        {err && <p className="text-xs text-[#f87171] flex items-center gap-1"><AlertTriangle size={12} />{err}</p>}
        {info && (
          <div className="bg-white/5 rounded-2xl p-3 text-xs text-white space-y-1">
            <p><span className="text-white/40">Name: </span>{info.name}</p>
            <p><span className="text-white/40">Symbol: </span>{info.symbol}</p>
            <p><span className="text-white/40">Decimals: </span>{info.decimals}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm text-white/50 border border-white/10">Cancel</button>
          {info
            ? <button onClick={add} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-[#4e9ff5] to-[#7c3aed]">Add Token</button>
            : <button onClick={() => { void lookup(); }} disabled={loading || !addr}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-[#4e9ff5] to-[#7c3aed] disabled:opacity-40 flex items-center justify-center gap-2">
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
      const hash = selectedToken.isNative
        ? await wallet.sendNative(to, amount, pw)
        : await wallet.sendToken(selectedToken.address, to, amount, selectedToken.decimals, pw);
      setTxHash(hash);
      toast.success('Transaction sent!');
      void wallet.refreshBalances();
    } catch (e) { setErr((e as Error).message.slice(0, 80)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[#0e1d35] border border-white/10">
        <p className="text-sm font-semibold text-white">Send</p>
        {txHash ? (
          <div className="text-center space-y-3 py-2">
            <Check size={28} className="mx-auto text-[#4ade80]" />
            <p className="text-sm font-semibold text-white">Sent!</p>
            <a href={buildTxExplorerUrl(wallet.activeChainId, txHash)} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#4e9ff5] flex items-center justify-center gap-1">
              <ExternalLink size={11} />View on Explorer
            </a>
            <button onClick={onClose} className="text-xs text-white/40">Close</button>
          </div>
        ) : (
          <>
            <select className="w-full px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white focus:outline-none"
              value={tokenIdx} onChange={e => setTokenIdx(Number(e.target.value))}>
              {wallet.balances.map((b, i) => (
                <option key={b.address} value={i} className="bg-[#0e1d35]">{b.symbol} — {parseFloat(b.balance).toFixed(4)}</option>
              ))}
            </select>
            <input className="w-full px-4 py-3 rounded-2xl text-xs font-mono bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none"
              placeholder="Recipient (0x…)" value={to} onChange={e => setTo(e.target.value)} />
            <div className="flex gap-2">
              <input type="number" className="flex-1 px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none"
                placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
              <button onClick={() => setAmount(parseFloat(selectedToken?.balance ?? '0').toFixed(6))}
                className="px-3 py-2 rounded-2xl text-xs font-semibold text-[#4e9ff5] bg-[#4e9ff5]/10 border border-[#4e9ff5]/20">Max</button>
            </div>
            <input type="password" className="w-full px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none"
              placeholder="Wallet password" value={pw} onChange={e => setPw(e.target.value)} />
            {err && <p className="text-xs text-[#f87171] flex items-center gap-1"><AlertTriangle size={12} />{err}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm text-white/50 border border-white/10">Cancel</button>
              <button onClick={() => { void send(); }} disabled={loading || !to || !amount || !pw}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-[#4e9ff5] to-[#7c3aed] disabled:opacity-40 flex items-center justify-center gap-2">
                {loading && <Loader2 size={14} className="animate-spin" />}Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Receive modal ─────────────────────────────────────────────────────────────
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
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-5 bg-[#0e1d35] border border-white/10">
        <p className="text-sm font-semibold text-white">Receive</p>
        <div className="w-40 h-40 mx-auto rounded-2xl bg-white flex items-center justify-center p-3">
          <div className="w-full h-full grid grid-cols-9 gap-[2px]">
            {[1,0,1,0,1,1,0,1,0, 0,1,1,0,1,0,1,0,1, 1,0,0,1,1,0,0,1,1, 0,1,0,0,0,1,0,0,0,
              1,1,1,0,1,1,1,0,1, 0,0,1,0,0,0,1,1,0, 1,0,1,1,0,1,0,0,1, 0,1,0,1,1,0,1,0,0,
              1,1,0,0,1,0,1,1,0].map((v, i) => (
              <div key={i} className="rounded-[1px]" style={{ background: v ? '#000' : 'transparent' }} />
            ))}
          </div>
        </div>
        <div className="bg-white/5 rounded-2xl px-4 py-3 flex items-center gap-3 border border-white/10">
          <p className="flex-1 text-xs font-mono text-white/80 truncate">{addr}</p>
          <button onClick={copy} className="text-white/40 hover:text-[#4e9ff5] transition-colors">
            {copied ? <Check size={14} className="text-[#4ade80]" /> : <Copy size={14} />}
          </button>
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-semibold text-white/60 border border-white/10">Close</button>
      </div>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────
function SettingsContent({ wallet }: { wallet: UseWalletReturn }) {
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<'pk' | 'seed'>('pk');
  const [exportResult, setExportResult] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const doExport = async (pw: string) => {
    setPwLoading(true); setPwErr('');
    try {
      setExportResult(exportType === 'pk' ? await wallet.exportPrivateKey(pw) : await wallet.exportMnemonic(pw));
      setShowExport(false);
    } catch { setPwErr('Wrong password'); }
    finally { setPwLoading(false); }
  };
  const walletName = (wallet.activeWallet as unknown as { name?: string })?.name ?? 'My Wallet';
  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5">
      {showExport && <PwModal title={exportType === 'pk' ? 'Export Private Key' : 'Export Seed Phrase'}
        onConfirm={pw => { void doExport(pw); }} onCancel={() => setShowExport(false)}
        loading={pwLoading} error={pwErr} />}
      <p className="text-base font-bold text-white mb-4">Settings</p>
      {exportResult && (
        <div className="bg-[#f87171]/10 border border-[#f87171]/20 rounded-2xl p-4 mb-4">
          <p className="text-[10px] text-[#f87171] mb-2 flex items-center gap-1"><Shield size={11} />Keep secret — never share!</p>
          <p className="text-xs font-mono text-white break-all">{exportResult}</p>
          <button onClick={() => setExportResult('')} className="text-[10px] text-white/40 mt-2">Clear</button>
        </div>
      )}
      <div className="space-y-2">
        <div className="bg-[#0e1d35] rounded-2xl p-4 border border-white/8">
          <p className="text-[10px] text-white/30 mb-1">Active Wallet</p>
          <p className="text-sm font-bold text-white">{walletName}</p>
          <p className="text-xs font-mono text-white/40 truncate mt-0.5">{wallet.activeWallet?.address ?? '—'}</p>
        </div>
        <div className="bg-[#0e1d35] rounded-2xl p-4 border border-white/8 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-white/30">Network</p>
            <p className="text-sm font-semibold text-white">Arc Mainnet</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
        </div>
        {[
          { icon: Key, label: 'Export Private Key', action: () => { setExportType('pk'); setShowExport(true); } },
          { icon: Download, label: 'Export Seed Phrase', action: () => { setExportType('seed'); setShowExport(true); } },
          { icon: Lock, label: 'Lock Wallet', action: () => { wallet.lock(); } },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action}
            className="w-full bg-[#0e1d35] rounded-2xl p-4 border border-white/8 flex items-center gap-3 hover:border-[#4e9ff5]/30 transition-colors">
            <Icon size={16} className="text-white/40" />
            <span className="text-sm text-white/80 font-medium flex-1 text-left">{label}</span>
            <ChevronRight size={14} className="text-white/20" />
          </button>
        ))}
        <div className="bg-[#0e1d35] rounded-2xl p-4 border border-white/8">
          <p className="text-xs font-bold text-white mb-3">All Wallets ({wallet.wallets.length})</p>
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
                  <p className="text-xs font-semibold text-white">{(w as unknown as { name?: string }).name ?? `Wallet ${i + 1}`}</p>
                  <p className="text-[10px] font-mono text-white/40 truncate">{shortAddr(w.address)}</p>
                </div>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#4e9ff5]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryContent({ wallet }: { wallet: UseWalletReturn }) {
  useEffect(() => {
    if (wallet.activeWallet) void wallet.refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.activeWallet?.address]);
  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-base font-bold text-white">Transactions</p>
        <button onClick={() => void wallet.refreshHistory()}
          className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white">
          <RefreshCw size={13} className={wallet.isLoadingHistory ? 'animate-spin' : ''} />
        </button>
      </div>
      {wallet.isLoadingHistory ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[#4e9ff5]" /></div>
      ) : wallet.txHistory.length === 0 ? (
        <div className="text-center py-12">
          <History size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-sm text-white/30">No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {wallet.txHistory.slice(0, 25).map(tx => {
            const isSent = tx.from?.toLowerCase() === wallet.activeWallet?.address.toLowerCase();
            return (
              <div key={tx.hash} className="flex items-center gap-3 bg-[#0e1d35] rounded-2xl p-3.5 border border-white/6">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: isSent ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)' }}>
                  {isSent
                    ? <ArrowUpRight size={16} className="text-[#f87171]" />
                    : <ArrowDownLeft size={16} className="text-[#4ade80]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{isSent ? 'Sent' : 'Received'}</p>
                  <p className="text-xs text-white/30 truncate">{isSent ? shortAddr(tx.to ?? '') : shortAddr(tx.from ?? '')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-white tabular-nums">{tx.value}</p>
                  <a href={buildTxExplorerUrl(wallet.activeChainId, tx.hash)} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-[#4e9ff5] flex items-center gap-0.5 justify-end mt-0.5">
                    <ExternalLink size={9} />Tx
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Bottom nav tabs ───────────────────────────────────────────────────────────
type DashTab = 'home' | 'history' | 'settings';

// ── Main WalletDashboard ──────────────────────────────────────────────────────
export function WalletDashboard({ wallet }: { wallet: UseWalletReturn }) {
  const [tab, setTab] = useState<DashTab>('home');
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [hideBalance, setHideBalance] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');

  // Refresh balances once on mount
  useEffect(() => {
    if (wallet.activeWallet && !wallet.balancesLoaded) {
      void wallet.refreshBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.activeWallet?.address]);

  const handleTokenSelect = useCallback((t: TokenBalance) => setSelectedToken(t), []);

  if (selectedToken) {
    return <TokenDetail token={selectedToken} onBack={() => setSelectedToken(null)} wallet={wallet} />;
  }

  // Totals — usdValue is now set by price enrichment in useWallet
  const priceMap: Record<string, number> = {};
  wallet.balances.forEach(b => {
    const usdVal = parseFloat(b.usdValue ?? '0');
    const bal = parseFloat(b.balance) || 1e-18;
    const p = isFinite(usdVal / bal) ? usdVal / bal : 0;
    if (p > 0) priceMap[b.address.toLowerCase()] = p;
  });
  const totalUsd = wallet.balances.reduce((s, b) => s + parseFloat(b.usdValue ?? '0'), 0);
  const avgChange = wallet.balances.length > 0
    ? wallet.balances.reduce((s, b) => s + parseFloat(b.change24h ?? '0'), 0) / wallet.balances.length
    : 0;
  const nativeBal = wallet.balances[0];
  const nativeSymbol = nativeBal?.symbol ?? 'USDC';
  const nativeBalance = nativeBal?.balance ?? '0';
  const nativeUsdValue = nativeBal?.usdValue ?? '0';

  const filteredTokens = wallet.balances.filter(b =>
    b.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
    b.name.toLowerCase().includes(tokenSearch.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-[#060e1a] relative overflow-hidden">
      {showSend && <SendModal wallet={wallet} onClose={() => setShowSend(false)} />}
      {showReceive && <ReceiveModal wallet={wallet} onClose={() => setShowReceive(false)} />}
      {showAddToken && <AddTokenModal wallet={wallet} onClose={() => setShowAddToken(false)} />}

      {tab === 'home' && (
        <div className="flex-1 overflow-y-auto pb-20">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-5 pb-4">
            <AddressPill
              address={wallet.activeWallet?.address ?? '0x0000000000000000000000000000000000000000'}
              onClick={() => setTab('settings')}
            />
            <ChainBadge chainId={wallet.activeChainId} />
          </div>

          {/* Portfolio card */}
          <PortfolioCard
            totalUsd={totalUsd}
            change24h={avgChange}
            hide={hideBalance}
            onHide={() => setHideBalance(v => !v)}
            chainId={wallet.activeChainId}
            tokenCount={wallet.balances.length}
            nativeBalance={nativeBalance}
            nativeSymbol={nativeSymbol}
            nativeUsdValue={nativeUsdValue}
          />

          {/* Action buttons */}
          <ActionButtons
            onSend={() => setShowSend(true)}
            onReceive={() => setShowReceive(true)}
            onSwap={() => toast.info('Swap coming soon — use the DEX Markets tab')}
            onHistory={() => setTab('history')}
            onLock={() => wallet.lock()}
          />

          {/* My Assets header */}
          <div className="flex items-center justify-between px-4 mt-6 mb-1">
            <p className="text-base font-bold text-white">My Assets</p>
            <button onClick={() => setShowAddToken(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0e1d35] border border-white/10 px-3 py-1.5 rounded-full hover:border-[#4e9ff5]/40 transition-colors">
              <Plus size={12} />Import
            </button>
          </div>

          {/* Search */}
          <div className="mx-4 mb-2">
            <div className="flex items-center gap-2 bg-[#0e1d35] rounded-2xl px-3 py-2.5 border border-white/6">
              <Search size={13} className="text-white/30 shrink-0" />
              <input className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none"
                placeholder="Search tokens…" value={tokenSearch} onChange={e => setTokenSearch(e.target.value)} />
            </div>
          </div>

          {/* Refresh / loading */}
          {wallet.isLoadingBalances ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[#4e9ff5]" />
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="text-center py-10">
              <WalletIcon size={32} className="mx-auto text-white/10 mb-3" />
              <p className="text-sm text-white/30">No tokens yet</p>
              <button onClick={() => setShowAddToken(true)} className="mt-3 text-xs text-[#4e9ff5] font-medium">+ Import a token</button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filteredTokens.map(t => (
                <AssetRow
                  key={t.address}
                  token={t}
                  price={priceMap[t.address.toLowerCase()] ?? 0}
                  onClick={() => handleTokenSelect(t)}
                />
              ))}
            </div>
          )}

          {/* Refresh button */}
          <div className="flex justify-center mt-4 pb-2">
            <button onClick={() => void wallet.refreshBalances()}
              disabled={wallet.isLoadingBalances}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
              <RefreshCw size={12} className={wallet.isLoadingBalances ? 'animate-spin' : ''} />
              Refresh balances
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && <HistoryContent wallet={wallet} />}
      {tab === 'settings' && <SettingsContent wallet={wallet} />}

      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 flex border-t border-white/[0.06] bg-[#060e1a]/96 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
        {([
          { id: 'home' as DashTab, icon: WalletIcon, label: 'Home' },
          { id: 'history' as DashTab, icon: History, label: 'History' },
          { id: 'settings' as DashTab, icon: Settings2, label: 'Settings' },
        ] as const).map(({ id, icon: Icon, label }) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors">
              <Icon size={19} style={{ color: active ? '#4e9ff5' : 'rgba(255,255,255,0.25)' }} />
              <span className="text-[10px] font-semibold" style={{ color: active ? '#4e9ff5' : 'rgba(255,255,255,0.25)' }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
