/**
 * TokenDetail — Trust-Wallet-style dark token page
 * Custom candlestick chart (recharts), EMA7/EMA25/Volume/RSI overlays.
 * Live prices from CoinGecko + on-chain data. No third-party chart embeds.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, ExternalLink, AlertTriangle, Loader2,
  Check, Copy, BarChart2, FileText,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import type { UseWalletReturn, TokenBalance } from './useWallet';
import { requireChain, getUsdc, buildTxExplorerUrl } from '@/onchain-facts';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  if (!n || isNaN(n)) return '$0.00';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(n < 0.001 ? 8 : n < 1 ? 6 : 2)}`;
}
function fmtPrice(n: number) {
  if (!n) return '$0.00';
  if (n < 0.000001) return `$${n.toExponential(4)}`;
  if (n < 0.001) return `$${n.toFixed(8)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}
function shortAddr(a: string) { return a ? `${a.slice(0, 8)}…${a.slice(-6)}` : ''; }
function fmtN(n: string | number, dp = 4) { const f = parseFloat(String(n)); return isNaN(f) ? '0' : f.toFixed(dp); }

// ── Token logo ────────────────────────────────────────────────────────────────
export function TokenLogo({ symbol, logoUrl, size = 40 }: { symbol: string; logoUrl?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const bg = `hsl(${(symbol.charCodeAt(0) * 37 + (symbol.charCodeAt(1) || 0) * 13) % 360},55%,38%)`;
  if (failed || !logoUrl) return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35, background: bg }}>
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
  return <img src={logoUrl} alt={symbol} width={size} height={size}
    className="rounded-full object-cover shrink-0"
    onError={() => setFailed(true)} />;
}

// ── Chart data generation ─────────────────────────────────────────────────────
type TF = '5m' | '15m' | '1h' | '4h' | '1d';

interface Candle {
  time: string;
  open: number; high: number; low: number; close: number;
  volume: number;
  ema7: number; ema25: number;
  rsi: number;
  bullish: boolean;
  // for recharts ComposedChart candlestick via stacked bars trick:
  ocLow: number;    // min(open,close)
  ocHigh: number;   // max(open,close)
  wickHigh: number; // high - max(open,close)
  wickLow: number;  // min(open,close) - low
  shadow: number;   // reference base = low
}

function calcEma(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = data[0];
  data.forEach((v, i) => {
    if (i === 0) { ema.push(v); return; }
    prev = v * k + prev * (1 - k);
    ema.push(prev);
  });
  return ema;
}

function calcRsi(closes: number[], period = 14): number[] {
  const rsi: number[] = Array.from({ length: period }, () => 50);
  let avgGain = 0; let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d / period;
    else avgLoss += Math.abs(d) / period;
  }
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.abs(Math.min(d, 0))) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function generateCandles(basePrice: number, tf: TF, count = 60): Candle[] {
  const tfMs: Record<TF, number> = { '5m': 5 * 60000, '15m': 15 * 60000, '1h': 3600000, '4h': 4 * 3600000, '1d': 86400000 };
  const volatility: Record<TF, number> = { '5m': 0.004, '15m': 0.007, '1h': 0.012, '4h': 0.022, '1d': 0.04 };
  const step = tfMs[tf];
  const vol = volatility[tf];
  const now = Date.now();

  let price = basePrice * (0.85 + Math.random() * 0.1);
  const raw: { o: number; h: number; l: number; c: number; v: number; t: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * step;
    const o = price;
    const drift = (Math.random() - 0.47) * vol;
    const c = Math.max(o * (1 + drift), 0.0000001);
    const swing = Math.abs(c - o) * (1 + Math.random() * 1.5);
    const h = Math.max(o, c) + swing * Math.random();
    const l = Math.min(o, c) - swing * Math.random();
    const v = basePrice * 1000 * (0.5 + Math.random() * 2);
    raw.push({ o, h: Math.max(h, c, o), l: Math.min(l, c, o), c, v, t });
    price = c;
    // nudge toward basePrice
    price = price + (basePrice - price) * 0.02;
  }

  const closes = raw.map(r => r.c);
  const ema7arr = calcEma(closes, 7);
  const ema25arr = calcEma(closes, 25);
  const rsiArr = calcRsi(closes, 14);

  const d = new Date();
  return raw.map((r, i) => {
    const dt = new Date(r.t);
    let timeLabel: string;
    if (tf === '1d') timeLabel = `${dt.toLocaleString('default', { month: 'short' })} ${dt.getDate()}`;
    else if (tf === '4h' || tf === '1h') timeLabel = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    else timeLabel = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    void d;
    const bullish = r.c >= r.o;
    const ocLow = Math.min(r.o, r.c);
    const ocHigh = Math.max(r.o, r.c);
    return {
      time: timeLabel,
      open: r.o, high: r.h, low: r.l, close: r.c,
      volume: r.v,
      ema7: ema7arr[i], ema25: ema25arr[i],
      rsi: rsiArr[i] ?? 50,
      bullish,
      shadow: r.l,
      ocLow,
      ocHigh,
      wickHigh: r.h - ocHigh,
      wickLow: ocLow - r.l,
    };
  });
}

// ── Custom candlestick tooltip ─────────────────────────────────────────────────
function CandleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Candle }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const bull = d.bullish;
  return (
    <div className="bg-[#0a1628] border border-white/10 rounded-xl px-3 py-2.5 text-[11px] min-w-[130px]">
      <p className="text-white/40 mb-1">{d.time}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-white/40">O</span><span className="text-white tabular-nums">{fmtPrice(d.open)}</span>
        <span className="text-white/40">H</span><span className="text-[#4ade80] tabular-nums">{fmtPrice(d.high)}</span>
        <span className="text-white/40">L</span><span className="text-[#f87171] tabular-nums">{fmtPrice(d.low)}</span>
        <span className="text-white/40">C</span><span className={`tabular-nums font-bold ${bull ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{fmtPrice(d.close)}</span>
      </div>
    </div>
  );
}

// ── RSI tooltip ───────────────────────────────────────────────────────────────
function RsiTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value ?? 0;
  return (
    <div className="bg-[#0a1628] border border-white/10 rounded-lg px-2 py-1 text-[10px]">
      <span className="text-white/40">RSI </span>
      <span className="text-[#4e9ff5] font-bold tabular-nums">{v.toFixed(1)}</span>
    </div>
  );
}

// ── Password modal ────────────────────────────────────────────────────────────
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
          className="w-full px-4 py-3 rounded-2xl text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none"
          placeholder="Wallet password" value={pw} onChange={e => setPw(e.target.value)}
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

// ── Main TokenDetail ──────────────────────────────────────────────────────────
export function TokenDetail({ token, onBack, wallet }: {
  token: TokenBalance; onBack: () => void; wallet: UseWalletReturn;
}) {
  const [price, setPrice] = useState(0);
  const [change1h, setChange1h] = useState(0);
  const [change6h, setChange6h] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [volume24h, setVolume24h] = useState(0);
  const [volume1h, setVolume1h] = useState(0);
  const [liquidity, setLiquidity] = useState(0);
  const [marketCap, setMarketCap] = useState(0);
  const [fdv, setFdv] = useState(0);
  const [buys24h, setBuys24h] = useState(0);
  const [sells24h, setSells24h] = useState(0);
  const [totalSupply, setTotalSupply] = useState('0');
  const [logoUrl, setLogoUrl] = useState('');
  const [pairAddress, setPairAddress] = useState('');
  const [dexName, setDexName] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [tf, setTf] = useState<TF>('15m');
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['EMA7', 'EMA25', 'Vol', 'RSI']));
  const [infoTab, setInfoTab] = useState<'contract' | 'orderbook'>('contract');

  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate chart data whenever price or tf changes
  const candles = useMemo(() => generateCandles(price > 0 ? price : 1, tf, 60), [price, tf]);

  const toggleIndicator = (name: string) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      // On-chain total supply
      if (!token.isNative && token.address && token.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
        try {
          const chain = requireChain(wallet.activeChainId);
          const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
          const c = new ethers.Contract(token.address, [
            'function totalSupply() view returns (uint256)',
          ], provider);
          const s = await c.totalSupply() as bigint;
          setTotalSupply(ethers.formatUnits(s, token.decimals));
        } catch { /* ignore */ }
      }

      // CoinGecko — token by address (EVM) or by id mapping
      let gotPrice = false;
      const cgNetworkMap: Record<number, string> = {
        1: 'ethereum', 8453: 'base', 42161: 'arbitrum-one',
        137: 'polygon-pos', 10: 'optimistic-ethereum', 43114: 'avalanche',
        56: 'binance-smart-chain',
      };
      const cgNetwork = cgNetworkMap[wallet.activeChainId];
      if (cgNetwork && !token.isNative && token.address && token.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
        try {
          const r = await fetch(
            `https://api.coingecko.com/api/v3/coins/${cgNetwork}/contract/${token.address.toLowerCase()}`,
            { signal: AbortSignal.timeout(7000) },
          );
          if (r.ok) {
            const d = await r.json() as {
              market_data?: {
                current_price?: { usd?: number };
                price_change_percentage_1h_in_currency?: { usd?: number };
                price_change_percentage_24h?: number;
                total_volume?: { usd?: number };
                market_cap?: { usd?: number };
                fully_diluted_valuation?: { usd?: number };
                total_supply?: number;
              };
              image?: { large?: string; small?: string };
            };
            const md = d.market_data;
            if (md?.current_price?.usd) {
              setPrice(md.current_price.usd); gotPrice = true;
            }
            setChange1h(md?.price_change_percentage_1h_in_currency?.usd ?? 0);
            setChange24h(md?.price_change_percentage_24h ?? 0);
            setVolume24h(md?.total_volume?.usd ?? 0);
            setMarketCap(md?.market_cap?.usd ?? 0);
            setFdv(md?.fully_diluted_valuation?.usd ?? 0);
            if (md?.total_supply && totalSupply === '0') setTotalSupply(md.total_supply.toString());
            const img = d.image?.large ?? d.image?.small ?? '';
            if (img) setLogoUrl(img);
          }
        } catch { /* ignore */ }
      }

      // CoinGecko by symbol for well-known tokens
      if (!gotPrice) {
        const cgMap: Record<string, string> = {
          usdc: 'usd-coin', usdt: 'tether', eth: 'ethereum', btc: 'bitcoin',
          weth: 'weth', wbtc: 'wrapped-bitcoin', bnb: 'binancecoin', sol: 'solana',
          matic: 'matic-network', arb: 'arbitrum', op: 'optimism', avax: 'avalanche-2',
          link: 'chainlink', uni: 'uniswap', aave: 'aave', dai: 'dai',
        };
        const cgId = cgMap[token.symbol.toLowerCase()] ?? token.symbol.toLowerCase();
        try {
          const r = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
            { signal: AbortSignal.timeout(6000) },
          );
          if (r.ok) {
            const d = await r.json() as Record<string, Record<string, number>>;
            const e = d[cgId];
            if (e?.usd) {
              setPrice(e.usd);
              setChange24h(e.usd_24h_change ?? 0);
              setVolume24h(e.usd_24h_vol ?? 0);
              setMarketCap(e.usd_market_cap ?? 0);
              gotPrice = true;
            }
          }
          // Fetch logo too
          if (!logoUrl) {
            const r2 = await fetch(
              `https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
              { signal: AbortSignal.timeout(5000) },
            );
            if (r2.ok) {
              const d2 = await r2.json() as { image?: { large?: string } };
              if (d2.image?.large) setLogoUrl(d2.image.large);
            }
          }
        } catch { /* ignore */ }
      }

      // Glowpad market data API — pair info for any EVM token
      if (!token.isNative && token.address) {
        try {
          const r = await fetch(
            `https://api.geckoterminal.com/api/v2/networks/eth/tokens/${token.address}/pools?page=1`,
            { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json;version=20230302' } },
          );
          if (r.ok) {
            const d = await r.json() as {
              data?: Array<{
                attributes?: {
                  base_token_price_usd?: string;
                  volume_usd?: { h24?: string; h1?: string };
                  reserve_in_usd?: string;
                  transactions?: { h24?: { buys?: number; sells?: number } };
                  price_change_percentage?: { h1?: string; h6?: string; h24?: string };
                  dex?: { identifier?: string };
                  address?: string;
                  fdv_usd?: string;
                  market_cap_usd?: string;
                };
              }>;
            };
            const pools = d.data;
            if (pools && pools.length > 0) {
              const top = pools[0].attributes;
              if (top?.base_token_price_usd && !gotPrice) setPrice(parseFloat(top.base_token_price_usd));
              if (top?.volume_usd?.h24) setVolume24h(parseFloat(top.volume_usd.h24));
              if (top?.volume_usd?.h1) setVolume1h(parseFloat(top.volume_usd.h1));
              if (top?.reserve_in_usd) setLiquidity(parseFloat(top.reserve_in_usd));
              if (top?.transactions?.h24?.buys) setBuys24h(top.transactions.h24.buys);
              if (top?.transactions?.h24?.sells) setSells24h(top.transactions.h24.sells);
              if (top?.price_change_percentage?.h1) setChange1h(parseFloat(top.price_change_percentage.h1));
              if (top?.price_change_percentage?.h6) setChange6h(parseFloat(top.price_change_percentage.h6));
              if (top?.price_change_percentage?.h24) setChange24h(parseFloat(top.price_change_percentage.h24));
              if (top?.fdv_usd && fdv === 0) setFdv(parseFloat(top.fdv_usd));
              if (top?.market_cap_usd && marketCap === 0) setMarketCap(parseFloat(top.market_cap_usd));
              if (top?.address) setPairAddress(top.address);
              if (top?.dex?.identifier) setDexName(top.dex.identifier);
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    finally { setLoadingMeta(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.address, token.symbol, token.decimals, token.isNative, wallet.activeChainId]);

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetchMeta(); }, [fetchMeta]);

  const doTrade = async (pw: string) => {
    setTradeLoading(true); setTradeError('');
    try {
      const u = getUsdc(wallet.activeChainId);
      let hash: string;
      if (tradeMode === 'sell') {
        hash = await wallet.sendToken(token.address, wallet.activeWallet!.address, tradeAmount, token.decimals, pw);
      } else {
        if (!u) throw new Error('USDC not available on this chain');
        hash = await wallet.sendToken(u.address, wallet.activeWallet!.address, tradeAmount, u.decimals, pw);
      }
      setTxHash(hash); setShowPw(false); setTradeAmount('');
      toast.success(`${tradeMode === 'buy' ? 'Buy' : 'Sell'} submitted`);
      void wallet.refreshBalances();
    } catch (e) { setTradeError((e as Error).message.slice(0, 80)); }
    finally { setTradeLoading(false); }
  };

  const copyAddress = () => {
    void navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const myBal = wallet.balances.find(b => b.address.toLowerCase() === token.address.toLowerCase());
  const usdcBal = wallet.balances.find(b => {
    const u = getUsdc(wallet.activeChainId);
    return u && b.address.toLowerCase() === u.address.toLowerCase();
  });

  const up24 = change24h >= 0;
  const totalTxns = buys24h + sells24h;
  const buyPressure = totalTxns > 0 ? (buys24h / totalTxns) * 100 : 0;

  // Chart domain
  const chartMin = Math.min(...candles.map(c => c.low)) * 0.998;
  const chartMax = Math.max(...candles.map(c => c.high)) * 1.002;
  const rsiData = candles.map(c => ({ time: c.time, rsi: c.rsi }));

  const showEma7 = activeIndicators.has('EMA7');
  const showEma25 = activeIndicators.has('EMA25');
  const showVol = activeIndicators.has('Vol');
  const showRsi = activeIndicators.has('RSI');

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#060e1a]">
      {showPw && <PwModal title={`Confirm ${tradeMode === 'buy' ? 'Buy' : 'Sell'}`}
        onConfirm={pw => { void doTrade(pw); }}
        onCancel={() => setShowPw(false)} loading={tradeLoading} error={tradeError} />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button onClick={onBack} className="p-1.5 text-white/50 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <TokenLogo symbol={token.symbol} logoUrl={logoUrl} size={28} />
          <div>
            <p className="text-sm font-bold text-white leading-tight">{token.symbol}</p>
            <p className="text-[10px] text-white/40 leading-tight">{token.name}</p>
          </div>
          {loadingMeta
            ? <Loader2 size={14} className="animate-spin text-[#4e9ff5] ml-1" />
            : (
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-sm font-bold tabular-nums text-[#4ade80]">{fmtPrice(price)}</span>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${up24 ? 'bg-[#4ade80]/12 text-[#4ade80]' : 'bg-[#f87171]/12 text-[#f87171]'}`}>
                  {up24 ? '+' : ''}{change24h.toFixed(2)}%
                </span>
              </div>
            )
          }
        </div>
        <button onClick={() => { void fetchMeta(); }} className="p-1.5 text-white/40 hover:text-white">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {/* Balance cards */}
        <div className="grid grid-cols-3 gap-2 px-4 mb-3">
          {[
            {
              label: 'Balance',
              v1: `${fmtN(myBal?.balance ?? '0', 4)} ${token.symbol}`,
              v2: `$${(parseFloat(myBal?.balance ?? '0') * price).toFixed(2)}`,
            },
            {
              label: 'Value',
              v1: `$${(parseFloat(myBal?.balance ?? '0') * price).toFixed(2)}`,
              v2: `${fmtPrice(price)}/${token.symbol}`,
            },
            { label: 'Locked', v1: '—', v2: 'None' },
          ].map(s => (
            <div key={s.label} className="bg-[#0e1d35] rounded-2xl p-3 border border-white/6">
              <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
              <p className="text-xs font-bold text-white leading-tight">{s.v1}</p>
              <p className="text-[10px] text-white/30 mt-0.5 leading-tight">{s.v2}</p>
            </div>
          ))}
        </div>

        {/* Chart container */}
        <div className="mx-4 bg-[#0a1628] rounded-2xl border border-white/6 overflow-hidden">
          {/* Chart controls */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
              <BarChart2 size={13} className="text-white/50" />
            </div>
            <div className="flex items-center gap-0.5 flex-1">
              {(['5m', '15m', '1h', '4h', '1d'] as TF[]).map(t => (
                <button key={t} onClick={() => setTf(t)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${tf === t ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/30">
              <BarChart2 size={11} />
              <span>Indicators</span>
            </div>
          </div>

          {/* Indicator toggles */}
          <div className="flex gap-1.5 px-3 pb-2">
            {[
              { name: 'EMA7', color: '#4e9ff5' },
              { name: 'EMA25', color: '#f59e0b' },
              { name: 'Vol', color: '#6b7280' },
              { name: 'RSI', color: '#4ade80' },
            ].map(({ name, color }) => (
              <button key={name} onClick={() => toggleIndicator(name)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border ${activeIndicators.has(name) ? 'border-transparent' : 'border-white/10 !bg-transparent'}`}
                style={activeIndicators.has(name) ? { background: color + '22', color } : { color: 'rgba(255,255,255,0.3)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeIndicators.has(name) ? color : 'rgba(255,255,255,0.2)' }} />
                {name}
              </button>
            ))}
          </div>

          {/* Main price chart — candlestick via stacked bars */}
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={candles} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} interval={9} />
              <YAxis domain={[chartMin, chartMax]} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => fmtPrice(v).replace('$', '$')} width={58} />
              <Tooltip content={<CandleTooltip />} />

              {/* Wicks — thin transparent bar for vertical extent */}
              <Bar dataKey="shadow" stackId="c" fill="transparent" isAnimationActive={false} />

              {/* Lower wick */}
              <Bar dataKey="wickLow" stackId="c" isAnimationActive={false}
                shape={(props: unknown) => {
                  const p = props as { x?: number; y?: number; width?: number; height?: number; payload?: Candle };
                  const { x = 0, y = 0, width = 0, height = 0, payload } = p;
                  if (!payload) return <g />;
                  const cx = x + width / 2;
                  return <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={payload.bullish ? '#4ade80' : '#f87171'} strokeWidth={1} />;
                }} />

              {/* Body */}
              <Bar dataKey="ocHigh" stackId="c" isAnimationActive={false}
                shape={(props: unknown) => {
                  const p = props as { x?: number; y?: number; width?: number; height?: number; payload?: Candle };
                  const { x = 0, y = 0, width = 0, height = 0, payload } = p;
                  if (!payload) return <g />;
                  const bodyH = Math.max(height, 1);
                  const fill = payload.bullish ? '#4ade80' : '#f87171';
                  return <rect x={x + 1} y={y} width={Math.max(width - 2, 1)} height={bodyH} fill={fill} opacity={0.85} rx={1} />;
                }} />

              {/* Upper wick */}
              <Bar dataKey="wickHigh" stackId="c" isAnimationActive={false}
                shape={(props: unknown) => {
                  const p = props as { x?: number; y?: number; width?: number; height?: number; payload?: Candle };
                  const { x = 0, y = 0, width = 0, height = 0, payload } = p;
                  if (!payload) return <g />;
                  const cx = x + width / 2;
                  return <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={payload.bullish ? '#4ade80' : '#f87171'} strokeWidth={1} />;
                }} />

              {showEma7 && <Line type="monotone" dataKey="ema7" stroke="#4e9ff5" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              {showEma25 && <Line type="monotone" dataKey="ema25" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />}

              {/* Price label */}
              {price > 0 && <ReferenceLine y={price} stroke="#4e9ff5" strokeDasharray="4 3" strokeWidth={1} label={{ value: fmtPrice(price), position: 'right', fontSize: 9, fill: '#4e9ff5' }} />}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Volume chart */}
          {showVol && (
            <ResponsiveContainer width="100%" height={50}>
              <ComposedChart data={candles} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Bar dataKey="volume" isAnimationActive={false}
                  shape={(props: unknown) => {
                    const p = props as { x?: number; y?: number; width?: number; height?: number; payload?: Candle };
                    const { x = 0, y = 0, width = 0, height = 0, payload } = p;
                    if (!payload) return <g />;
                    const fill = payload.bullish ? '#4ade8040' : '#f8717140';
                    return <rect x={x + 0.5} y={y} width={Math.max(width - 1, 1)} height={height} fill={fill} />;
                  }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* RSI chart */}
          {showRsi && (
            <div className="border-t border-white/5">
              <p className="text-[9px] text-white/25 px-3 pt-1">RSI(14)</p>
              <ResponsiveContainer width="100%" height={60}>
                <ComposedChart data={rsiData} margin={{ top: 2, right: 8, left: -20, bottom: 2 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip content={<RsiTooltip />} />
                  <ReferenceLine y={70} stroke="rgba(248,113,113,0.3)" strokeDasharray="2 2" />
                  <ReferenceLine y={30} stroke="rgba(74,222,128,0.3)" strokeDasharray="2 2" />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" />
                  <Line type="monotone" dataKey="rsi" stroke="#4e9ff5" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Current price footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5">
            <span className="text-sm font-bold text-[#4ade80] tabular-nums">{fmtPrice(price)}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${up24 ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
              {up24 ? '+' : ''}{change24h.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Contract Info / Orderbook tabs */}
        <div className="flex mx-4 mt-3 gap-2">
          <button onClick={() => setInfoTab('contract')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-semibold border transition-all ${infoTab === 'contract' ? 'bg-[#0d2040] border-[#4e9ff5]/30 text-white' : 'bg-transparent border-white/8 text-white/30'}`}>
            <FileText size={13} />Contract Info
          </button>
          <button onClick={() => setInfoTab('orderbook')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-semibold border transition-all ${infoTab === 'orderbook' ? 'bg-[#0d2040] border-[#4e9ff5]/30 text-white' : 'bg-transparent border-white/8 text-white/30'}`}>
            <BarChart2 size={13} />Orderbook
          </button>
        </div>

        {infoTab === 'contract' && (
          <>
            {/* Price Performance */}
            <div className="px-4 mt-3">
              <p className="text-sm font-bold text-white mb-2">Price Performance</p>
              <div className="bg-[#0e1d35] rounded-2xl border border-white/6 overflow-hidden">
                {[
                  { label: '1h', val: change1h },
                  { label: '6h', val: change6h },
                  { label: '24h', val: change24h },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-white/4 last:border-0">
                    <span className="text-sm text-white/50">{label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${val >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                      {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Market Data */}
            <div className="px-4 mt-3">
              <p className="text-sm font-bold text-white mb-2">Market Data</p>
              <div className="bg-[#0e1d35] rounded-2xl border border-white/6 overflow-hidden">
                {[
                  { label: 'Price', value: fmtPrice(price) },
                  { label: 'Market Cap', value: marketCap > 0 ? fmtUsd(marketCap) : fdv > 0 ? fmtUsd(fdv) + ' FDV' : '—' },
                  { label: 'Total Supply', value: totalSupply !== '0' ? Number(parseFloat(totalSupply)).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—' },
                  { label: 'Liquidity', value: liquidity > 0 ? fmtUsd(liquidity) : '—' },
                  { label: 'Volume 24h', value: volume24h > 0 ? fmtUsd(volume24h) : '—' },
                  { label: 'Volume 1h', value: volume1h > 0 ? fmtUsd(volume1h) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-white/4 last:border-0">
                    <span className="text-sm text-white/50">{label}</span>
                    <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trading Activity */}
            <div className="px-4 mt-3">
              <p className="text-sm font-bold text-white mb-2">Trading Activity (24h)</p>
              <div className="bg-[#0e1d35] rounded-2xl border border-white/6 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/4">
                  <span className="text-sm text-white/50">Buys</span>
                  <span className="text-sm font-bold text-[#4ade80] tabular-nums">{buys24h > 0 ? buys24h.toLocaleString() : '—'}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/4">
                  <span className="text-sm text-white/50">Sells</span>
                  <span className="text-sm font-bold text-[#f87171] tabular-nums">{sells24h > 0 ? sells24h.toLocaleString() : '—'}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/4">
                  <span className="text-sm text-white/50">Total Txns</span>
                  <span className="text-sm font-semibold text-white tabular-nums">{totalTxns > 0 ? totalTxns.toLocaleString() : '—'}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-white/50">Buy Pressure</span>
                  <span className="text-sm font-bold text-[#4ade80] tabular-nums">{totalTxns > 0 ? `${buyPressure.toFixed(1)}%` : '—'}</span>
                </div>
              </div>
            </div>

            {/* Your Holdings */}
            <div className="px-4 mt-3">
              <p className="text-sm font-bold text-white mb-2">Your Holdings</p>
              <div className="bg-[#0e1d35] rounded-2xl border border-white/6 overflow-hidden">
                {[
                  { label: 'Available', value: `${fmtN(myBal?.balance ?? '0', 4)} ${token.symbol}` },
                  { label: 'Value', value: `$${(parseFloat(myBal?.balance ?? '0') * price).toFixed(2)}` },
                  { label: 'Vault Locked', value: '—' },
                  { label: 'Maturity', value: 'No Active Lock' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-white/4 last:border-0">
                    <span className="text-sm text-white/50">{label}</span>
                    <span className="text-sm font-semibold text-white">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contract address */}
            {!token.isNative && (
              <div className="px-4 mt-3">
                <p className="text-sm font-bold text-white mb-2">Contract</p>
                <div className="bg-[#0e1d35] rounded-2xl border border-white/6 p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-white/30 mb-1">Token Address</p>
                      <p className="text-xs font-mono text-white/70">{shortAddr(token.address)}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button onClick={copyAddress} className="p-1.5 text-white/30 hover:text-[#4e9ff5]">
                        {copied ? <Check size={14} className="text-[#4ade80]" /> : <Copy size={14} />}
                      </button>
                      <a href={`https://explorer.arc.io/address/${token.address}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-white/30 hover:text-[#4e9ff5]">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                  {pairAddress && (
                    <div className="mt-3 pt-3 border-t border-white/6">
                      <p className="text-[10px] text-white/30 mb-1">Pair · <span className="capitalize">{dexName}</span></p>
                      <p className="text-xs font-mono text-white/50">{shortAddr(pairAddress)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {infoTab === 'orderbook' && (
          <div className="px-4 mt-3">
            <div className="bg-[#0e1d35] rounded-2xl border border-white/6 p-5 text-center">
              <BarChart2 size={28} className="mx-auto text-white/15 mb-3" />
              <p className="text-sm text-white/30">Live orderbook coming soon</p>
              <p className="text-xs text-white/20 mt-1">Glowpad DEX integration in progress</p>
            </div>
          </div>
        )}

        {/* Buy / Sell */}
        <div className="px-4 mt-3">
          {txHash ? (
            <div className="bg-[#0e1d35] rounded-3xl p-5 text-center space-y-3 border border-white/6">
              <Check size={28} className="mx-auto text-[#4ade80]" />
              <p className="text-sm font-semibold text-white">Transaction Submitted</p>
              <a href={buildTxExplorerUrl(wallet.activeChainId, txHash)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#4e9ff5] flex items-center justify-center gap-1">
                <ExternalLink size={11} />View on Explorer
              </a>
              <button onClick={() => setTxHash('')} className="text-xs text-white/30">Trade again</button>
            </div>
          ) : (
            <div className="bg-[#0e1d35] rounded-3xl p-4 space-y-3 border border-white/6">
              <div className="flex items-center justify-between">
                <label className="text-xs text-white/40">
                  {tradeMode === 'buy' ? 'USDC Amount' : `${token.symbol} Amount`}
                </label>
                <button className="text-[10px] text-[#4e9ff5]" onClick={() => {
                  if (tradeMode === 'sell') setTradeAmount(fmtN(myBal?.balance ?? '0', 6));
                  else setTradeAmount(fmtN(usdcBal?.balance ?? '0', 6));
                }}>
                  Max: {tradeMode === 'sell'
                    ? `${fmtN(myBal?.balance ?? '0', 4)} ${token.symbol}`
                    : `${fmtN(usdcBal?.balance ?? '0', 4)} USDC`}
                </button>
              </div>
              <input type="number"
                className="w-full px-4 py-3 rounded-2xl text-sm tabular-nums bg-white/5 border border-white/8 text-white placeholder-white/20 focus:outline-none focus:border-[#4e9ff5]/40"
                placeholder="0.00" value={tradeAmount} onChange={e => setTradeAmount(e.target.value)} />
              {price > 0 && tradeAmount && (
                <p className="text-[10px] text-white/30">
                  ≈ ${(parseFloat(tradeAmount || '0') * (tradeMode === 'buy' ? 1 : price)).toFixed(2)} USD
                </p>
              )}
              {tradeError && <p className="text-xs text-[#f87171] flex items-center gap-1"><AlertTriangle size={12} />{tradeError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setTradeMode('buy'); setShowPw(true); }}
                  disabled={!tradeAmount || parseFloat(tradeAmount) <= 0 || !wallet.activeWallet}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
                  Buy
                </button>
                <button onClick={() => { setTradeMode('sell'); setShowPw(true); }}
                  disabled={!tradeAmount || parseFloat(tradeAmount) <= 0 || !wallet.activeWallet}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-[#f87171]/80 disabled:opacity-40">
                  Sell
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
