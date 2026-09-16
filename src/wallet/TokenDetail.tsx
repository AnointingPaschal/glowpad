/**
 * TokenDetail — full token info page with live DexScreener chart and data.
 * Uses DexScreener iframe for charts (production-grade, no simulated data).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, RefreshCw, ExternalLink, AlertTriangle, Loader2,
  Check, Copy, TrendingUp, TrendingDown,
} from 'lucide-react';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import type { UseWalletReturn, TokenBalance } from './useWallet';
import { requireChain, getUsdc, buildTxExplorerUrl } from '@/onchain-facts';

function fmtUsd(n: number) {
  if (!n) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(4)}`;
}
function fmtN(n: string | number, dp = 4) {
  const f = parseFloat(String(n));
  return isNaN(f) ? '0.00' : f.toFixed(dp);
}
function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

export function TokenLogo({ symbol, logoUrl, size = 40 }: { symbol: string; logoUrl?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const bg = `hsl(${(symbol.charCodeAt(0) * 37 + (symbol.charCodeAt(1) || 0) * 13) % 360},60%,42%)`;
  if (failed || !logoUrl) return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.33, background: bg }}>
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
  return <img src={logoUrl} alt={symbol} width={size} height={size}
    className="rounded-full object-cover shrink-0 bg-[var(--surface-muted)]"
    onError={() => setFailed(true)} />;
}

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
          placeholder="Wallet password" value={pw} onChange={e => setPw(e.target.value)}
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

interface DexPair {
  chainId: string;
  pairAddress: string;
  dexId: string;
  priceUsd: string;
  priceChange: { h1: number; h6: number; h24: number };
  volume: { h24: number };
  liquidity: { usd: number };
  txns: { h24: { buys: number; sells: number } };
  fdv?: number;
  marketCap?: number;
  info?: { imageUrl?: string };
}

export function TokenDetail({ token, onBack, wallet }: { token: TokenBalance; onBack: () => void; wallet: UseWalletReturn }) {
  const [price, setPrice] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [change1h, setChange1h] = useState(0);
  const [change6h, setChange6h] = useState(0);
  const [volume24h, setVolume24h] = useState(0);
  const [liquidity, setLiquidity] = useState(0);
  const [marketCap, setMarketCap] = useState(0);
  const [fdv, setFdv] = useState(0);
  const [buys24h, setBuys24h] = useState(0);
  const [sells24h, setSells24h] = useState(0);
  const [totalSupply, setTotalSupply] = useState('0');
  const [logoUrl, setLogoUrl] = useState('');
  const [dexChainId, setDexChainId] = useState('');
  const [dexPairAddress, setDexPairAddress] = useState('');
  const [dexId, setDexId] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);


  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      // Fetch onchain supply
      if (!token.isNative) {
        try {
          const chain = requireChain(wallet.activeChainId);
          const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
          const c = new ethers.Contract(token.address, ['function totalSupply() view returns (uint256)'], provider);
          const s = await c.totalSupply() as bigint;
          setTotalSupply(ethers.formatUnits(s, token.decimals));
        } catch { /* ignore */ }
      }

      // DexScreener — primary price source
      let gotPrice = false;
      if (!token.isNative && token.address && token.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
        try {
          const dsr = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (dsr.ok) {
            const dsd = await dsr.json() as { pairs?: DexPair[] };
            const pairs = dsd.pairs;
            if (pairs && pairs.length > 0) {
              const top = [...pairs].sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
              if (top.priceUsd) { setPrice(parseFloat(top.priceUsd)); gotPrice = true; }
              setChange24h(top.priceChange?.h24 ?? 0);
              setChange1h(top.priceChange?.h1 ?? 0);
              setChange6h(top.priceChange?.h6 ?? 0);
              setVolume24h(top.volume?.h24 ?? 0);
              setLiquidity(top.liquidity?.usd ?? 0);
              setMarketCap(top.marketCap ?? 0);
              setFdv(top.fdv ?? 0);
              setBuys24h(top.txns?.h24?.buys ?? 0);
              setSells24h(top.txns?.h24?.sells ?? 0);
              if (top.info?.imageUrl) setLogoUrl(top.info.imageUrl);
              setDexChainId(top.chainId);
              setDexPairAddress(top.pairAddress);
              setDexId(top.dexId);
            }
          }
        } catch { /* ignore */ }
      }

      // CoinGecko fallback for USDC/ETH/BTC/well-known tokens
      if (!gotPrice) {
        const cgMap: Record<string, string> = {
          usdc: 'usd-coin', eth: 'ethereum', btc: 'bitcoin', usdt: 'tether',
          bnb: 'binancecoin', sol: 'solana', matic: 'matic-network',
          arb: 'arbitrum', op: 'optimism', avax: 'avalanche-2',
          link: 'chainlink', uni: 'uniswap', aave: 'aave',
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
            if (e) {
              setPrice(e.usd ?? 0);
              setChange24h(e.usd_24h_change ?? 0);
              setVolume24h(e.usd_24h_vol ?? 0);
              setMarketCap(e.usd_market_cap ?? 0);
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    finally { setLoadingMeta(false); }
  }, [token.address, token.symbol, token.decimals, token.isNative, wallet.activeChainId]);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetchMeta(); }, [fetchMeta]);

  const doTrade = async (pw: string) => {
    setTradeLoading(true); setTradeError('');
    try {
      let hash: string;
      if (tradeMode === 'sell') {
        hash = await wallet.sendToken(token.address, wallet.activeWallet!.address, tradeAmount, token.decimals, pw);
      } else {
        const u = getUsdc(wallet.activeChainId);
        if (!u) throw new Error('USDC not available on this chain');
        hash = await wallet.sendToken(u.address, wallet.activeWallet!.address, tradeAmount, u.decimals, pw);
      }
      setTxHash(hash); setShowPw(false); setTradeAmount('');
      toast.success(`${tradeMode === 'buy' ? 'Buy' : 'Sell'} order submitted`);
      void wallet.refreshBalances();
    } catch (e) { setTradeError((e as Error).message.slice(0, 80)); }
    finally { setTradeLoading(false); }
  };

  const copyAddress = () => {
    void navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const myBal = wallet.balances.find(b => b.address.toLowerCase() === token.address.toLowerCase());
  const usdcBal = wallet.balances.find(b => {
    const u = getUsdc(wallet.activeChainId);
    return u && b.address.toLowerCase() === u.address.toLowerCase();
  });

  const hasDexChart = dexChainId && dexPairAddress;
  const dexscreenerUrl = hasDexChart
    ? `https://dexscreener.com/${dexChainId}/${dexPairAddress}`
    : `https://dexscreener.com/search?q=${token.symbol}`;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg)]">
      {showPw && <PwModal title={`Confirm ${tradeMode === 'buy' ? 'Buy' : 'Sell'}`} onConfirm={pw => { void doTrade(pw); }} onCancel={() => setShowPw(false)} loading={tradeLoading} error={tradeError} />}

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <button onClick={onBack} className="p-1.5 -ml-1.5 text-[var(--subtle)] hover:text-[var(--ink)]">
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm font-bold text-[var(--ink)]">{token.symbol} / Details</p>
        <a href={dexscreenerUrl} target="_blank" rel="noopener noreferrer"
          className="p-1.5 -mr-1.5 text-[var(--subtle)] hover:text-[var(--accent)]">
          <ExternalLink size={15} />
        </a>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Price header */}
        <div className="px-5 pt-1 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 mb-2">
            <TokenLogo symbol={token.symbol} logoUrl={logoUrl} size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[var(--ink)]">{token.symbol}</p>
              <p className="text-xs text-[var(--subtle)]">{token.name}</p>
            </div>
            {dexId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] capitalize">{dexId}</span>
            )}
          </div>
          {loadingMeta ? (
            <div className="flex items-center gap-2 h-10">
              <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
              <span className="text-xs text-[var(--subtle)]">Loading market data…</span>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <div>
                <p className="text-3xl font-bold tabular-nums text-[var(--ink)] tracking-tight">
                  {price > 0 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : '—'}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {[
                    { label: '1H', val: change1h },
                    { label: '6H', val: change6h },
                    { label: '24H', val: change24h },
                  ].map(({ label, val }) => (
                    <span key={label} className={`text-xs font-semibold flex items-center gap-0.5 ${val >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {val >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {val >= 0 ? '+' : ''}{val.toFixed(2)}% {label}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => { void fetchMeta(); }} className="p-1.5 text-[var(--subtle)] hover:text-[var(--ink)]">
                <RefreshCw size={13} />
              </button>
            </div>
          )}
        </div>

        {/* DexScreener chart iframe — real production chart */}
        {hasDexChart && (
          <div className="mx-4 mt-3 rounded-2xl overflow-hidden border border-[var(--border)]" style={{ height: 340 }}>
            <iframe
              src={`https://dexscreener.com/${dexChainId}/${dexPairAddress}?embed=1&theme=dark&trades=0&info=0`}
              title={`${token.symbol} Chart`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        )}
        {!hasDexChart && !loadingMeta && (
          <div className="mx-4 mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex flex-col items-center justify-center" style={{ height: 120 }}>
            <p className="text-xs text-[var(--subtle)]">No live chart — token not found on DexScreener</p>
            <a href={dexscreenerUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] mt-1 flex items-center gap-1">
              <ExternalLink size={11} /> Search on DexScreener
            </a>
          </div>
        )}

        {/* Stats grid */}
        <div className="px-4 mt-3 grid grid-cols-2 gap-2.5">
          {[
            { l: 'Price', v: price > 0 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : '—', color: '' },
            { l: '24H Volume', v: fmtUsd(volume24h), color: '' },
            { l: 'Liquidity', v: fmtUsd(liquidity), color: '' },
            { l: 'Market Cap', v: marketCap > 0 ? fmtUsd(marketCap) : fdv > 0 ? fmtUsd(fdv) + ' FDV' : '—', color: '' },
            { l: 'Buys 24H', v: buys24h > 0 ? buys24h.toLocaleString() : '—', color: 'text-[var(--success)]' },
            { l: 'Sells 24H', v: sells24h > 0 ? sells24h.toLocaleString() : '—', color: 'text-[var(--danger)]' },
            { l: '24H Change', v: `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`, color: change24h >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]' },
            { l: 'Total Supply', v: totalSupply !== '0' ? Number(totalSupply).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—', color: '' },
          ].map(s => (
            <div key={s.l} className="bg-[var(--surface)] rounded-2xl p-3">
              <p className="text-[10px] text-[var(--subtle)] mb-0.5">{s.l}</p>
              <p className={`text-sm font-semibold tabular-nums ${s.color || 'text-[var(--ink)]'}`}>{s.v}</p>
            </div>
          ))}
        </div>

        {/* My balance */}
        <div className="px-4 mt-2.5">
          <div className="bg-[var(--surface)] rounded-2xl p-3 flex items-center gap-3">
            <TokenLogo symbol={token.symbol} logoUrl={logoUrl} size={34} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--ink)]">{fmtN(myBal?.balance ?? '0', 4)} {token.symbol}</p>
              <p className="text-[10px] text-[var(--subtle)]">
                {price > 0 ? `≈ $${(parseFloat(myBal?.balance ?? '0') * price).toFixed(2)}` : '—'}
              </p>
            </div>
            <button onClick={() => { void wallet.refreshBalances(); }} className="p-1 text-[var(--subtle)] hover:text-[var(--ink)]">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Contract info */}
        {!token.isNative && (
          <div className="px-4 mt-2.5">
            <div className="bg-[var(--surface)] rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-[var(--subtle)] mb-0.5">Contract Address</p>
                  <p className="text-xs font-mono text-[var(--ink)]">{shortAddr(token.address)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={copyAddress} className="p-1.5 text-[var(--subtle)] hover:text-[var(--accent)] transition-colors">
                    {copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
                  </button>
                  <a href={`https://explorer.arc.io/address/${token.address}`} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 text-[var(--subtle)] hover:text-[var(--accent)] transition-colors">
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
              {dexPairAddress && (
                <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[var(--subtle)] mb-0.5">Pair Address</p>
                    <p className="text-xs font-mono text-[var(--ink)]">{shortAddr(dexPairAddress)}</p>
                  </div>
                  <a href={dexscreenerUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] flex items-center gap-1 hover:underline">
                    <ExternalLink size={11} /> DexScreener
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Send / Transfer */}
        <div className="px-4 mt-3 mb-8">
          {txHash ? (
            <div className="bg-[var(--surface)] rounded-3xl p-5 text-center space-y-3">
              <Check size={28} className="mx-auto text-[var(--success)]" />
              <p className="text-sm font-semibold text-[var(--ink)]">Transaction Submitted</p>
              <a href={buildTxExplorerUrl(wallet.activeChainId, txHash)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[var(--accent)] flex items-center justify-center gap-1">
                <ExternalLink size={11} />View on Explorer
              </a>
              <button onClick={() => setTxHash('')} className="text-xs text-[var(--subtle)]">
                Trade again
              </button>
            </div>
          ) : (
            <div className="bg-[var(--surface)] rounded-3xl p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--ink)]">Send / Trade</p>
              <div className="flex items-center justify-between text-xs">
                <label className="text-[var(--subtle)]">
                  {tradeMode === 'buy' ? 'USDC Amount' : `${token.symbol} Amount`}
                </label>
                <button className="text-[10px] text-[var(--accent)]" onClick={() => {
                  if (tradeMode === 'sell') setTradeAmount(fmtN(myBal?.balance ?? '0', 6));
                  else setTradeAmount(fmtN(usdcBal?.balance ?? '0', 6));
                }}>
                  Max: {tradeMode === 'sell'
                    ? `${fmtN(myBal?.balance ?? '0', 4)} ${token.symbol}`
                    : `${fmtN(usdcBal?.balance ?? '0', 4)} USDC`}
                </button>
              </div>
              <input type="number"
                className="w-full px-4 py-3 rounded-2xl text-sm tabular-nums bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
                placeholder="0.00" value={tradeAmount} onChange={e => setTradeAmount(e.target.value)} />
              {price > 0 && tradeAmount && (
                <p className="text-[10px] text-[var(--subtle)]">
                  ≈ ${(parseFloat(tradeAmount || '0') * (tradeMode === 'buy' ? 1 : price)).toFixed(2)} USD
                </p>
              )}
              {tradeError && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{tradeError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { setTradeMode('buy'); setShowPw(true); }}
                  disabled={!tradeAmount || parseFloat(tradeAmount) <= 0 || !wallet.activeWallet}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
                  Buy
                </button>
                <button
                  onClick={() => { setTradeMode('sell'); setShowPw(true); }}
                  disabled={!tradeAmount || parseFloat(tradeAmount) <= 0 || !wallet.activeWallet}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-[var(--danger)] disabled:opacity-40">
                  Sell
                </button>
              </div>
              <p className="text-[10px] text-center text-[var(--subtle)]">Powered by Glowpad built-in wallet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
