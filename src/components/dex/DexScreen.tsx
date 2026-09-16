import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, TrendingUp, TrendingDown, Star, StarOff,
  ExternalLink, RefreshCw, Filter, ChevronUp, ChevronDown,
  Activity, Zap, Globe,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface DexToken {
  chainId: string;
  chainName: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd: string;
  priceChange: { h1: number; h6: number; h24: number };
  volume: { h24: number };
  liquidity: { usd: number };
  txns: { h24: { buys: number; sells: number } };
  url: string;
  fdv?: number;
  marketCap?: number;
}

type SortKey = 'priceChange' | 'volume' | 'liquidity' | 'price' | 'txns';
type TimeFrame = 'h1' | 'h6' | 'h24';

// ── Chain metadata ─────────────────────────────────────────────────────────
const CHAINS: { id: string; name: string; color: string }[] = [
  { id: 'all',       name: 'All Chains',   color: '#4e9ff5' },
  { id: 'arc',       name: 'Arc',          color: '#4e9ff5' },
  { id: 'ethereum',  name: 'Ethereum',     color: '#627eea' },
  { id: 'base',      name: 'Base',         color: '#0052ff' },
  { id: 'arbitrum',  name: 'Arbitrum',     color: '#28a0f0' },
  { id: 'polygon',   name: 'Polygon',      color: '#8247e5' },
  { id: 'optimism',  name: 'Optimism',     color: '#ff0420' },
  { id: 'avalanche', name: 'Avalanche',    color: '#e84142' },
  { id: 'bsc',       name: 'BSC',          color: '#f0b90b' },
  { id: 'solana',    name: 'Solana',       color: '#9945ff' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number | undefined, prefix = '') {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return `${prefix}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(2)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

function fmtPrice(p: string | undefined) {
  if (!p) return '—';
  const n = parseFloat(p);
  if (isNaN(n)) return '—';
  if (n < 0.000001) return `$${n.toExponential(3)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function chainColor(chainId: string) {
  return CHAINS.find(c => c.id === chainId)?.color ?? '#94aac8';
}

// ── SortIcon (outside component to avoid static-components lint error) ─────
function SortIcon({ k, sortKey, sortAsc }: { k: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  if (sortKey !== k) return <ChevronDown size={11} className="text-[var(--subtle)] opacity-40" />;
  return sortAsc
    ? <ChevronUp size={11} className="text-[var(--accent)]" />
    : <ChevronDown size={11} className="text-[var(--accent)]" />;
}

// ── Main component ─────────────────────────────────────────────────────────
export function DexScreen() {
  const [tokens, setTokens] = useState<DexToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortAsc, setSortAsc] = useState(false);
  const [tf, setTf] = useState<TimeFrame>('h24');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [selected, setSelected] = useState<DexToken | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Fetch from DexScreener public API ──────────────────────────────────
  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch trending pairs across multiple chains via DexScreener
      const chains = ['ethereum', 'base', 'arbitrum', 'polygon', 'optimism', 'avalanche', 'bsc', 'arc'];
      const results = await Promise.allSettled(
        chains.map(c =>
          fetch(`https://api.dexscreener.com/latest/dex/search?q=USDC&chainIds=${c}`, {
            headers: { 'Accept': 'application/json' },
          }).then(r => r.json())
        )
      );

      const allPairs: DexToken[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        // DexScreener returns an untyped JSON blob; we parse it defensively below
        const resp = r.value as Record<string, unknown>;
        if (!Array.isArray(resp.pairs)) return;
        (resp.pairs as Record<string, unknown>[]).slice(0, 30).forEach(p => {
          const pc = (p.priceChange ?? {}) as Record<string, number>;
          const vol = (p.volume ?? {}) as Record<string, number>;
          const liq = (p.liquidity ?? {}) as Record<string, number>;
          const txns = (p.txns ?? { h24: {} }) as { h24: Record<string, number> };
          const base = (p.baseToken ?? { address: '', name: '', symbol: '' }) as DexToken['baseToken'];
          const quote = (p.quoteToken ?? { symbol: '' }) as DexToken['quoteToken'];
          const pairAddr = typeof p.pairAddress === 'string' ? p.pairAddress : '';
          allPairs.push({
            chainId: chains[i],
            chainName: CHAINS.find(c => c.id === chains[i])?.name ?? chains[i],
            dexId: typeof p.dexId === 'string' ? p.dexId : '',
            pairAddress: pairAddr,
            baseToken: base,
            quoteToken: quote,
            priceUsd: typeof p.priceUsd === 'string' ? p.priceUsd : '0',
            priceChange: { h1: pc.h1 ?? 0, h6: pc.h6 ?? 0, h24: pc.h24 ?? 0 },
            volume: { h24: vol.h24 ?? 0 },
            liquidity: { usd: liq.usd ?? 0 },
            txns: { h24: { buys: txns.h24.buys ?? 0, sells: txns.h24.sells ?? 0 } },
            url: typeof p.url === 'string' ? p.url : `https://dexscreener.com/${chains[i]}/${pairAddr}`,
            fdv: typeof p.fdv === 'number' ? p.fdv : undefined,
            marketCap: typeof p.marketCap === 'number' ? p.marketCap : undefined,
          });
        });
      });

      setTokens(allPairs);
      setLastUpdated(new Date());
    } catch {
      setError('Failed to fetch market data. DexScreener API may be rate-limiting — try again shortly.');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react/set-state-in-effect -- async fetch kicked off from mount effect is intentional
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  // ── Filter + sort (derived — no setState in effect) ────────────────────
  const filtered = useMemo(() => {
    let list = [...tokens];
    if (showWatchlist) list = list.filter(t => watchlist.has(t.pairAddress));
    if (chain !== 'all') list = list.filter(t => t.chainId === chain);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.baseToken.symbol.toLowerCase().includes(q) ||
        t.baseToken.name.toLowerCase().includes(q) ||
        t.pairAddress.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'volume')      { av = a.volume.h24; bv = b.volume.h24; }
      if (sortKey === 'liquidity')   { av = a.liquidity.usd; bv = b.liquidity.usd; }
      if (sortKey === 'price')       { av = parseFloat(a.priceUsd); bv = parseFloat(b.priceUsd); }
      if (sortKey === 'priceChange') { av = a.priceChange[tf]; bv = b.priceChange[tf]; }
      if (sortKey === 'txns')        { av = a.txns.h24.buys + a.txns.h24.sells; bv = b.txns.h24.buys + b.txns.h24.sells; }
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [tokens, chain, search, sortKey, sortAsc, tf, watchlist, showWatchlist]);

  const toggleWatch = (addr: string) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(addr)) { next.delete(addr); } else { next.add(addr); }
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  // ── Token detail panel ─────────────────────────────────────────────────
  if (selected) {
    const pct = selected.priceChange[tf];
    const up = pct >= 0;
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
          {/* Back */}
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 transition-colors"
          >
            ← Back to market
          </button>

          {/* Header */}
          <div className="glass-strong rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="display font-bold text-2xl text-[var(--ink)]">
                    {selected.baseToken.symbol}
                  </span>
                  <span className="text-sm text-[var(--muted)]">/{selected.quoteToken.symbol}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: chainColor(selected.chainId) + '22', color: chainColor(selected.chainId) }}
                  >
                    {selected.chainName}
                  </span>
                  <span className="text-xs text-[var(--subtle)] bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                    {selected.dexId}
                  </span>
                </div>
                <p className="text-sm text-[var(--muted)] mt-0.5">{selected.baseToken.name}</p>
              </div>
              <div className="text-right">
                <p className="display font-bold text-2xl text-[var(--ink)] tabular-nums">
                  {fmtPrice(selected.priceUsd)}
                </p>
                <p className={`text-sm font-semibold tabular-nums ${up ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {up ? '+' : ''}{pct.toFixed(2)}% ({tf})
                </p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Volume 24h', value: fmt(selected.volume.h24, '$') },
                { label: 'Liquidity', value: fmt(selected.liquidity.usd, '$') },
                { label: 'Buys 24h', value: selected.txns.h24.buys.toString() },
                { label: 'Sells 24h', value: selected.txns.h24.sells.toString() },
                { label: 'FDV', value: fmt(selected.fdv, '$') },
                { label: 'Mkt Cap', value: fmt(selected.marketCap, '$') },
                { label: '1h %', value: `${selected.priceChange.h1 >= 0 ? '+' : ''}${selected.priceChange.h1.toFixed(2)}%` },
                { label: '6h %', value: `${selected.priceChange.h6 >= 0 ? '+' : ''}${selected.priceChange.h6.toFixed(2)}%` },
              ].map(({ label, value }) => (
                <div key={label} className="glass rounded-xl px-3 py-3">
                  <p className="text-xs text-[var(--subtle)] mb-1">{label}</p>
                  <p className="display font-semibold text-sm text-[var(--ink)] tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {/* Addresses */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--subtle)]">Token</span>
                <span className="mono text-[var(--muted)] truncate max-w-[200px] sm:max-w-xs">{selected.baseToken.address}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--subtle)]">Pair</span>
                <span className="mono text-[var(--muted)] truncate max-w-[200px] sm:max-w-xs">{selected.pairAddress}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 flex-wrap">
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--accent)] text-[#070e1a] px-4 py-2 rounded-xl hover:bg-[var(--accent-hover)] transition-colors"
              >
                <ExternalLink size={12} />
                View on DexScreener
              </a>
              <button
                onClick={() => toggleWatch(selected.pairAddress)}
                className="flex items-center gap-1.5 text-xs font-medium border border-[var(--border)] text-[var(--muted)] px-4 py-2 rounded-xl hover:bg-[var(--surface)] transition-colors"
              >
                {watchlist.has(selected.pairAddress)
                  ? <><Star size={12} className="text-[var(--warning)]" /> Watching</>
                  : <><StarOff size={12} /> Watch</>
                }
              </button>
            </div>
          </div>

          {/* Embed chart via DexScreener iframe */}
          <div className="glass rounded-2xl overflow-hidden" style={{ height: 420 }}>
            <iframe
              src={`https://dexscreener.com/${selected.chainId}/${selected.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
              title="DexScreener Chart"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 px-3 sm:px-5 pt-4 pb-3 space-y-3 border-b border-[var(--border)]">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[var(--accent)]" />
            <span className="display font-semibold text-sm sm:text-base text-[var(--ink)]">DEX Markets</span>
            {lastUpdated && (
              <span className="text-xs text-[var(--subtle)] hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWatchlist(w => !w)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                showWatchlist
                  ? 'border-[var(--warning)] text-[var(--warning)] bg-[var(--warning)]/10'
                  : 'border-[var(--border)] text-[var(--subtle)] hover:text-[var(--muted)]'
              }`}
            >
              <Star size={11} />
              <span className="hidden sm:inline">Watchlist</span>
              {watchlist.size > 0 && <span>({watchlist.size})</span>}
            </button>
            <button
              onClick={() => void fetchTokens()}
              disabled={loading}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--subtle)] hover:text-[var(--muted)] hover:bg-[var(--surface)] transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search token, symbol, address…"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-9 pr-4 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          {/* Timeframe */}
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden shrink-0">
            {(['h1', 'h6', 'h24'] as TimeFrame[]).map(t => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`text-xs font-medium px-2.5 py-2 transition-colors ${
                  tf === t
                    ? 'bg-[var(--accent)] text-[#070e1a]'
                    : 'text-[var(--subtle)] hover:text-[var(--muted)] hover:bg-[var(--surface)]'
                }`}
              >
                {t === 'h1' ? '1H' : t === 'h6' ? '6H' : '24H'}
              </button>
            ))}
          </div>
        </div>

        {/* Chain filter — horizontal scroll */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {CHAINS.map(c => (
            <button
              key={c.id}
              onClick={() => setChain(c.id)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                chain === c.id
                  ? 'border-transparent text-[#070e1a] font-semibold'
                  : 'border-[var(--border)] text-[var(--subtle)] hover:text-[var(--muted)] hover:bg-[var(--surface)]'
              }`}
              style={chain === c.id ? { background: c.color } : {}}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Activity size={28} className="text-[var(--accent)] animate-pulse" />
            <p className="text-sm text-[var(--muted)]">Loading market data…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <Zap size={28} className="text-[var(--danger)]" />
            <p className="text-sm text-[var(--danger)]">{error}</p>
            <button
              onClick={() => void fetchTokens()}
              className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] underline"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Filter size={28} className="text-[var(--subtle)]" />
            <p className="text-sm text-[var(--muted)]">No pairs match your filters</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block min-w-full">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--bg)] border-b border-[var(--border)] z-10">
                  <tr>
                    <th className="w-8 px-3 py-2.5" />
                    <th className="px-3 py-2.5 text-left text-[var(--subtle)] font-medium">Token / Pair</th>
                    <th className="px-3 py-2.5 text-left text-[var(--subtle)] font-medium">Chain / DEX</th>
                    <th
                      className="px-3 py-2.5 text-right text-[var(--subtle)] font-medium cursor-pointer select-none hover:text-[var(--muted)] whitespace-nowrap"
                      onClick={() => toggleSort('price')}
                    >
                      Price <SortIcon k="price" sortKey={sortKey} sortAsc={sortAsc} />
                    </th>
                    <th
                      className="px-3 py-2.5 text-right text-[var(--subtle)] font-medium cursor-pointer select-none hover:text-[var(--muted)] whitespace-nowrap"
                      onClick={() => toggleSort('priceChange')}
                    >
                      {tf === 'h1' ? '1H' : tf === 'h6' ? '6H' : '24H'} % <SortIcon k="priceChange" sortKey={sortKey} sortAsc={sortAsc} />
                    </th>
                    <th
                      className="px-3 py-2.5 text-right text-[var(--subtle)] font-medium cursor-pointer select-none hover:text-[var(--muted)] whitespace-nowrap"
                      onClick={() => toggleSort('volume')}
                    >
                      Vol 24H <SortIcon k="volume" sortKey={sortKey} sortAsc={sortAsc} />
                    </th>
                    <th
                      className="px-3 py-2.5 text-right text-[var(--subtle)] font-medium cursor-pointer select-none hover:text-[var(--muted)] whitespace-nowrap"
                      onClick={() => toggleSort('liquidity')}
                    >
                      Liq <SortIcon k="liquidity" sortKey={sortKey} sortAsc={sortAsc} />
                    </th>
                    <th
                      className="px-3 py-2.5 text-right text-[var(--subtle)] font-medium cursor-pointer select-none hover:text-[var(--muted)] whitespace-nowrap"
                      onClick={() => toggleSort('txns')}
                    >
                      Txns 24H <SortIcon k="txns" sortKey={sortKey} sortAsc={sortAsc} />
                    </th>
                    <th className="px-3 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => {
                    const pct = t.priceChange[tf];
                    const up = pct >= 0;
                    return (
                      <tr
                        key={`${t.pairAddress}-${i}`}
                        onClick={() => setSelected(t)}
                        className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors group"
                      >
                        <td className="px-3 py-2.5 w-8">
                          <button
                            onClick={e => { e.stopPropagation(); toggleWatch(t.pairAddress); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {watchlist.has(t.pairAddress)
                              ? <Star size={12} className="text-[var(--warning)]" />
                              : <StarOff size={12} className="text-[var(--subtle)]" />
                            }
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: chainColor(t.chainId) + '33', color: chainColor(t.chainId) }}
                            >
                              {t.baseToken.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--ink)]">{t.baseToken.symbol}</p>
                              <p className="text-[var(--subtle)] text-[10px]">/{t.quoteToken.symbol}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p style={{ color: chainColor(t.chainId) }} className="font-medium">{t.chainName}</p>
                          <p className="text-[var(--subtle)] text-[10px] capitalize">{t.dexId}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-[var(--ink)] tabular-nums">
                          {fmtPrice(t.priceUsd)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${up ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          <span className="flex items-center justify-end gap-0.5">
                            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {up ? '+' : ''}{pct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[var(--muted)] tabular-nums">{fmt(t.volume.h24, '$')}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--muted)] tabular-nums">{fmt(t.liquidity.usd, '$')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <span className="text-[var(--success)]">{t.txns.h24.buys}</span>
                          <span className="text-[var(--subtle)]"> / </span>
                          <span className="text-[var(--danger)]">{t.txns.h24.sells}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--accent)]"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[var(--border)]">
              {filtered.map((t, i) => {
                const pct = t.priceChange[tf];
                const up = pct >= 0;
                return (
                  <div
                    key={`${t.pairAddress}-${i}`}
                    onClick={() => setSelected(t)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] cursor-pointer transition-colors active:bg-[var(--surface-hover)]"
                  >
                    {/* Token icon */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: chainColor(t.chainId) + '33', color: chainColor(t.chainId) }}
                    >
                      {t.baseToken.symbol.slice(0, 2)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-[var(--ink)]">{t.baseToken.symbol}</span>
                        <span className="text-[10px] text-[var(--subtle)]">/{t.quoteToken.symbol}</span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
                          style={{ background: chainColor(t.chainId) + '22', color: chainColor(t.chainId) }}
                        >
                          {t.chainName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--subtle)]">
                        <span>Vol {fmt(t.volume.h24, '$')}</span>
                        <span>·</span>
                        <span>Liq {fmt(t.liquidity.usd, '$')}</span>
                        <span>·</span>
                        <span className="capitalize">{t.dexId}</span>
                      </div>
                    </div>

                    {/* Price + change */}
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm text-[var(--ink)] tabular-nums">{fmtPrice(t.priceUsd)}</p>
                      <p className={`text-xs font-semibold tabular-nums flex items-center justify-end gap-0.5 ${up ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {up ? '+' : ''}{pct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer count */}
      {!loading && !error && (
        <div className="shrink-0 px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--subtle)] flex items-center gap-2">
          <span>{filtered.length.toLocaleString()} pairs</span>
          <span>·</span>
          <span>Powered by DexScreener</span>
          <a
            href="https://dexscreener.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline ml-auto flex items-center gap-1"
          >
            <ExternalLink size={10} />
            Open DexScreener
          </a>
        </div>
      )}
    </div>
  );
}
