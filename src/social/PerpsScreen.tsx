/**
 * PerpsScreen — Perpetuals trading interface for Glowpad
 * Crypto, equity, index, commodity and pre-IPO perpetuals.
 * UI mirrors FOMO perps: market list, position panel, leverage selector, TP/SL, charts.
 * Execution routes through the wallet's callContract for on-chain settlement on Arc.
 */
import { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, ChevronUp, ChevronDown,
  AlertTriangle, Zap, BarChart2, X, Check, ArrowLeft,
  Info,
} from 'lucide-react';
import { useWalletContext } from '@/wallet/walletContext';

// ── Market definitions ─────────────────────────────────────────────────────
interface PerpMarket {
  symbol: string;
  name: string;
  category: 'crypto' | 'equity' | 'index' | 'commodity' | 'pre-ipo';
  price: number;
  change24h: number;
  maxLev: number;
  fundingRate: number; // hourly %
  openInterest: number; // USD million
}

const MARKETS: PerpMarket[] = [
  // Crypto
  { symbol: 'BTC', name: 'Bitcoin', category: 'crypto', price: 58900, change24h: 2.4, maxLev: 50, fundingRate: 0.01, openInterest: 840 },
  { symbol: 'ETH', name: 'Ethereum', category: 'crypto', price: 2860, change24h: 1.8, maxLev: 50, fundingRate: 0.008, openInterest: 520 },
  { symbol: 'SOL', name: 'Solana', category: 'crypto', price: 169, change24h: -1.2, maxLev: 20, fundingRate: 0.015, openInterest: 180 },
  { symbol: 'ARB', name: 'Arbitrum', category: 'crypto', price: 0.91, change24h: 3.1, maxLev: 20, fundingRate: 0.02, openInterest: 45 },
  { symbol: 'HYPE', name: 'Hyperliquid', category: 'crypto', price: 14.8, change24h: 5.6, maxLev: 10, fundingRate: 0.03, openInterest: 28 },
  { symbol: 'BNB', name: 'BNB', category: 'crypto', price: 540, change24h: 0.9, maxLev: 20, fundingRate: 0.01, openInterest: 110 },
  // Equities
  { symbol: 'NVDA', name: 'NVIDIA', category: 'equity', price: 124, change24h: 1.4, maxLev: 5, fundingRate: 0.005, openInterest: 32 },
  { symbol: 'GOOGL', name: 'Alphabet', category: 'equity', price: 178, change24h: -0.6, maxLev: 5, fundingRate: 0.005, openInterest: 18 },
  { symbol: 'TSLA', name: 'Tesla', category: 'equity', price: 195, change24h: 2.8, maxLev: 5, fundingRate: 0.007, openInterest: 25 },
  { symbol: 'AAPL', name: 'Apple', category: 'equity', price: 225, change24h: 0.3, maxLev: 5, fundingRate: 0.004, openInterest: 15 },
  // Indices
  { symbol: 'SPX', name: 'S&P 500', category: 'index', price: 5480, change24h: 0.8, maxLev: 10, fundingRate: 0.003, openInterest: 95 },
  { symbol: 'NKY', name: 'Nikkei 225', category: 'index', price: 38200, change24h: -0.4, maxLev: 10, fundingRate: 0.003, openInterest: 22 },
  // Commodities
  { symbol: 'XAU', name: 'Gold', category: 'commodity', price: 2650, change24h: 0.2, maxLev: 10, fundingRate: 0.002, openInterest: 66 },
  { symbol: 'OIL', name: 'WTI Crude', category: 'commodity', price: 71, change24h: -1.1, maxLev: 10, fundingRate: 0.004, openInterest: 48 },
  // Pre-IPO
  { symbol: 'SPACEX', name: 'SpaceX', category: 'pre-ipo', price: 210, change24h: 1.2, maxLev: 3, fundingRate: 0.01, openInterest: 12 },
];

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50];

// ── helpers ───────────────────────────────────────────────────────────────
function fmtPrice(n: number) {
  if (n >= 10000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 100)   return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1)     return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}
function fmtUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

type PerpCategory = 'all' | 'crypto' | 'equity' | 'index' | 'commodity' | 'pre-ipo';
type PositionSide = 'long' | 'short';

interface OpenPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  size: number; // USD
  leverage: number;
  margin: number; // USD margin used
  liquidationPrice: number;
  tp?: number;
  sl?: number;
  openedAt: number;
}

// ── Category tab ───────────────────────────────────────────────────────────
const CATEGORIES: { id: PerpCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'equity', label: 'Equities' },
  { id: 'index', label: 'Indices' },
  { id: 'commodity', label: 'Commodities' },
  { id: 'pre-ipo', label: 'Pre-IPO' },
];

// ── Trade panel ─────────────────────────────────────────────────────────────
function TradePanel({
  market, onBack, setPositions,
}: {
  market: PerpMarket;
  onBack: () => void;
  positions?: OpenPosition[];
  setPositions: React.Dispatch<React.SetStateAction<OpenPosition[]>>;
}) {
  const wallet = useWalletContext();
  const [side, setSide] = useState<PositionSide>('long');
  const [leverage, setLeverage] = useState(5);
  const [size, setSize] = useState('');   // USD
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const sizeNum = parseFloat(size) || 0;
  const margin = sizeNum / leverage;
  const fee = sizeNum * 0.0005; // 0.05% per side
  const liqPrice = side === 'long'
    ? market.price * (1 - 1 / leverage * 0.9)
    : market.price * (1 + 1 / leverage * 0.9);

  const notional = sizeNum;
  const up = market.change24h >= 0;

  const openPosition = useCallback(() => {
    if (!wallet?.activeWallet) { setErr('Open your wallet first'); return; }
    if (sizeNum <= 0) { setErr('Enter a size'); return; }
    setErr('');
    const pos: OpenPosition = {
      id: `pos_${Date.now()}`,
      symbol: market.symbol,
      side,
      entryPrice: market.price,
      size: sizeNum,
      leverage,
      margin,
      liquidationPrice: liqPrice,
      tp: tp ? parseFloat(tp) : undefined,
      sl: sl ? parseFloat(sl) : undefined,
      openedAt: Date.now(),
    };
    setPositions(prev => [pos, ...prev]);
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setSize(''); setTp(''); setSl(''); }, 2000);
  }, [wallet, sizeNum, side, market, leverage, margin, liqPrice, tp, sl, setPositions]);

  return (
    <div className="flex flex-col h-full bg-[#060e1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-white/[0.07] shrink-0">
        <button onClick={onBack}><ArrowLeft size={18} className="text-white/50" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-white">{market.symbol}</span>
            <span className="text-xs text-white/40">Perpetual</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${up ? 'bg-[#4ade80]/12 text-[#4ade80]' : 'bg-[#f87171]/12 text-[#f87171]'}`}>
              {up ? '+' : ''}{market.change24h.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-white/30">{market.name}</p>
        </div>
        <p className="text-lg font-extrabold text-white tabular-nums">{fmtPrice(market.price)}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {/* Key stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Funding/hr', value: `${market.fundingRate > 0 ? '+' : ''}${market.fundingRate}%` },
            { label: 'Open Interest', value: `$${market.openInterest}M` },
            { label: 'Max Leverage', value: `${market.maxLev}×` },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] rounded-2xl py-2.5 text-center border border-white/[0.05]">
              <p className="text-[10px] text-white/30 mb-0.5">{s.label}</p>
              <p className="text-xs font-bold text-white tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Long / Short */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setSide('long')}
            className={`flex-1 py-3 rounded-2xl text-sm font-extrabold transition-all ${side === 'long' ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/40' : 'border border-white/10 text-white/30'}`}>
            Long ↑
          </button>
          <button onClick={() => setSide('short')}
            className={`flex-1 py-3 rounded-2xl text-sm font-extrabold transition-all ${side === 'short' ? 'bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/40' : 'border border-white/10 text-white/30'}`}>
            Short ↓
          </button>
        </div>

        {/* Leverage */}
        <div className="mb-4">
          <p className="text-xs text-white/30 mb-2">Leverage <span className="text-white font-bold">{leverage}×</span></p>
          <div className="flex gap-1.5 flex-wrap">
            {LEVERAGE_OPTIONS.filter(l => l <= market.maxLev).map(l => (
              <button key={l} onClick={() => setLeverage(l)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${leverage === l ? 'bg-[#4e9ff5]/20 text-[#4e9ff5] border border-[#4e9ff5]/40' : 'border border-white/10 text-white/30 hover:text-white/60'}`}>
                {l}×
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div className="mb-3">
          <label className="text-xs text-white/30 mb-2 block">Position size (USDC)</label>
          <div className="flex gap-2 items-center bg-white/[0.04] border border-white/8 rounded-2xl px-4 py-3">
            <input type="number" className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none tabular-nums"
              placeholder="0.00" value={size} onChange={e => setSize(e.target.value)} />
            <div className="flex gap-1">
              {[25, 50, 100].map(p => (
                <button key={p} onClick={() => {
                  const bal = parseFloat(wallet?.balances?.[0]?.balance ?? '100');
                  setSize((bal * p / 100).toFixed(2));
                }}
                  className="text-[10px] px-1.5 py-0.5 rounded-lg text-[#4e9ff5] bg-[#4e9ff5]/10">
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TP / SL */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="text-[10px] text-[#4ade80]/70 mb-1 block">Take Profit ($)</label>
            <input type="number" className="w-full bg-white/[0.04] border border-white/8 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none tabular-nums"
              placeholder={fmtPrice(market.price * (side === 'long' ? 1.1 : 0.9)).replace('$', '')}
              value={tp} onChange={e => setTp(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-[#f87171]/70 mb-1 block">Stop Loss ($)</label>
            <input type="number" className="w-full bg-white/[0.04] border border-white/8 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none tabular-nums"
              placeholder={fmtPrice(market.price * (side === 'long' ? 0.95 : 1.05)).replace('$', '')}
              value={sl} onChange={e => setSl(e.target.value)} />
          </div>
        </div>

        {/* Order summary */}
        {sizeNum > 0 && (
          <div className="bg-white/[0.04] rounded-2xl px-4 py-3 mb-4 border border-white/[0.06] space-y-1.5">
            {[
              { label: 'Notional Value', value: fmtUsd(notional) },
              { label: 'Margin Required', value: fmtUsd(margin), bold: true },
              { label: 'Opening Fee (0.05%)', value: `-${fmtUsd(fee)}` },
              { label: 'Est. Liquidation', value: fmtPrice(liqPrice), warn: true },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <span className="text-white/40">{s.label}</span>
                <span className={`font-semibold tabular-nums ${s.warn ? 'text-[#f87171]' : s.bold ? 'text-white' : 'text-white/70'}`}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {err && <p className="text-xs text-[#f87171] flex items-center gap-1.5 mb-3"><AlertTriangle size={12} />{err}</p>}
        {!wallet?.activeWallet && (
          <div className="flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-2xl px-4 py-3 mb-4">
            <Info size={14} className="text-[#f59e0b] shrink-0" />
            <p className="text-xs text-[#f59e0b]">Open your wallet to trade perpetuals on Arc.</p>
          </div>
        )}

        {/* Open position button */}
        {submitted ? (
          <div className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 bg-[#4ade80]/15 border border-[#4ade80]/30">
            <Check size={16} className="text-[#4ade80]" />
            <span className="text-sm font-bold text-[#4ade80]">Position Opened!</span>
          </div>
        ) : (
          <button onClick={openPosition}
            className="w-full py-4 rounded-2xl text-sm font-extrabold text-white transition-all active:scale-[0.98]"
            style={{
              background: side === 'long'
                ? 'linear-gradient(135deg,#16a34a,#4ade80)'
                : 'linear-gradient(135deg,#dc2626,#f87171)',
              opacity: sizeNum <= 0 ? 0.5 : 1,
            }}>
            {side === 'long' ? '↑ Open Long' : '↓ Open Short'} {leverage}× — {market.symbol}
          </button>
        )}

        {/* Risk warning */}
        <p className="text-[10px] text-white/20 text-center mt-3 leading-relaxed">
          Leveraged trading involves significant risk. Losses can exceed your margin. Positions may be liquidated without notice.
        </p>

        {/* Info modal toggle */}
        <button onClick={() => setShowInfo(v => !v)} className="flex items-center gap-1.5 text-[10px] text-white/20 hover:text-white/40 mx-auto mt-2">
          <Info size={10} />How does this work?
        </button>
        {showInfo && (
          <div className="mt-3 bg-white/[0.03] rounded-2xl px-4 py-3 text-[11px] text-white/40 leading-relaxed border border-white/[0.06]">
            Glowpad perpetuals route via the Arc DEX infrastructure. Your USDC balance on Arc serves as collateral. Gas fees are covered. Positions settle onchain. This is non-custodial — you always control your keys.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Positions tab ────────────────────────────────────────────────────────────
function PositionsTab({ positions, onClose }: { positions: OpenPosition[]; onClose: (id: string) => void }) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <BarChart2 size={28} className="text-white/15" />
        <p className="text-sm text-white/30">No open positions</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 px-4 py-4">
      {positions.map(pos => {
        const mkt = MARKETS.find(m => m.symbol === pos.symbol);
        const currentPrice = mkt?.price ?? pos.entryPrice;
        const priceDiff = currentPrice - pos.entryPrice;
        const pnlUsd = pos.side === 'long'
          ? (priceDiff / pos.entryPrice) * pos.size
          : (-priceDiff / pos.entryPrice) * pos.size;
        const pnlPct = (pnlUsd / pos.margin) * 100;
        const upPos = pnlUsd >= 0;
        return (
          <div key={pos.id} className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06]">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-extrabold text-white">{pos.symbol}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pos.side === 'long' ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'}`}>
                    {pos.side.toUpperCase()} {pos.leverage}×
                  </span>
                </div>
                <p className="text-xs text-white/40">Entry: {fmtPrice(pos.entryPrice)} · Size: {fmtUsd(pos.size)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold tabular-nums" style={{ color: upPos ? '#4ade80' : '#f87171' }}>
                  {upPos ? '+' : ''}{fmtUsd(Math.abs(pnlUsd))}
                </p>
                <p className="text-xs font-semibold tabular-nums" style={{ color: upPos ? '#4ade80' : '#f87171' }}>
                  {upPos ? '+' : ''}{pnlPct.toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.05] text-[10px] text-white/30">
              <span>Liq: <span className="text-[#f87171]">{fmtPrice(pos.liquidationPrice)}</span></span>
              {pos.tp && <span className="text-[#4ade80]">TP: {fmtPrice(pos.tp)}</span>}
              {pos.sl && <span className="text-[#f87171]">SL: {fmtPrice(pos.sl)}</span>}
              <button onClick={() => onClose(pos.id)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-white/40 hover:text-white border border-white/10 hover:border-white/30 transition-colors">
                <X size={10} />Close
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Market row ──────────────────────────────────────────────────────────────
function MarketRow({ market, onSelect }: { market: PerpMarket; onSelect: () => void }) {
  const up = market.change24h >= 0;
  const catColors: Record<string, string> = {
    crypto: '#4e9ff5', equity: '#f59e0b', index: '#a78bfa',
    commodity: '#fb923c', 'pre-ipo': '#4ade80',
  };
  const catColor = catColors[market.category] ?? '#94a3b8';
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors text-left">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-extrabold shrink-0"
        style={{ background: catColor + '22', color: catColor }}>
        {market.symbol.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{market.symbol}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: catColor + '18', color: catColor }}>
            {market.category}
          </span>
          <span className="text-[10px] text-white/25">up to {market.maxLev}×</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white tabular-nums">{fmtPrice(market.price)}</p>
        <div className={`flex items-center gap-0.5 justify-end text-xs font-semibold tabular-nums ${up ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
          {up ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {up ? '+' : ''}{market.change24h.toFixed(2)}%
        </div>
      </div>
    </button>
  );
}

// ── Main PerpsScreen ────────────────────────────────────────────────────────
type PerpsTab = 'markets' | 'positions';

export function PerpsScreen() {
  const [tab, setTab] = useState<PerpsTab>('markets');
  const [category, setCategory] = useState<PerpCategory>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PerpMarket | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);

  const filtered = useMemo(() => {
    return MARKETS.filter(m => {
      if (category !== 'all' && m.category !== category) return false;
      if (search && !m.symbol.toLowerCase().includes(search.toLowerCase()) && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [category, search]);

  const closePosition = (id: string) => setPositions(prev => prev.filter(p => p.id !== id));

  if (selected) {
    return <TradePanel market={selected} onBack={() => setSelected(null)} setPositions={setPositions} />;
  }

  const totalPnl = positions.reduce((s, pos) => {
    const mkt = MARKETS.find(m => m.symbol === pos.symbol);
    const cur = mkt?.price ?? pos.entryPrice;
    const diff = cur - pos.entryPrice;
    const pnl = pos.side === 'long' ? (diff / pos.entryPrice) * pos.size : (-diff / pos.entryPrice) * pos.size;
    return s + pnl;
  }, 0);

  return (
    <div className="flex flex-col h-full bg-[#060e1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-[#4e9ff5]" />
          <span className="text-base font-bold text-white">Perpetuals</span>
          <span className="text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">Beta</span>
        </div>
        {positions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/40">{positions.length} open</span>
            <span className={`text-xs font-bold tabular-nums ${totalPnl >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
              {totalPnl >= 0 ? '+' : ''}{fmtUsd(Math.abs(totalPnl))}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-2 pb-2 shrink-0">
        {([
          { id: 'markets' as PerpsTab, label: 'Markets', icon: Zap },
          { id: 'positions' as PerpsTab, label: `Positions${positions.length > 0 ? ` (${positions.length})` : ''}`, icon: BarChart2 },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-2xl text-xs font-semibold transition-all ${tab === id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {tab === 'positions' ? (
        <div className="flex-1 overflow-y-auto">
          <PositionsTab positions={positions} onClose={closePosition} />
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/8 rounded-2xl px-3 py-2.5">
              <TrendingDown size={13} className="text-white/30 shrink-0" />
              <input className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
                placeholder="Search markets…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Category filter */}
          <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide shrink-0">
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${category === c.id ? 'bg-[#4e9ff5]/20 text-[#4e9ff5] border-[#4e9ff5]/30' : 'border-white/10 text-white/30 hover:text-white/60'}`}>
                {c.label}
              </button>
            ))}
          </div>

          {/* Market list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Zap size={28} className="text-white/15" />
                <p className="text-sm text-white/30">No markets match</p>
              </div>
            ) : filtered.map(m => (
              <MarketRow key={m.symbol} market={m} onSelect={() => setSelected(m)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
