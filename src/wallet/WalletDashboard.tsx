/**
 * WalletDashboard — main wallet UI: balance, send, receive, swap, CCTP bridge,
 * history, custom tokens, and settings.
 */
import { useState, useEffect } from 'react';
import {
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Link2,
  Clock, Plus, Copy, Check, ExternalLink, Trash2,
  ChevronDown, Settings, Lock, RefreshCw, Eye,
  EyeOff, AlertTriangle, X, Loader2, Coins,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { AppKit } from '@circle-fin/app-kit';
// SwapChainIdentifier and BridgeChainIdentifier are internal to app-kit — use string
type SwapChainIdentifier = string;
type BridgeChainIdentifier = string;
import type { EIP1193Provider } from 'viem';
import { ethers } from 'ethers';
import type { UseWalletReturn } from './useWallet';
import { exportPrivateKey, exportMnemonic } from './walletStore';
import { ONCHAIN_CHAINS, buildTxExplorerUrl, requireChain } from '@/onchain-facts';
import type { CustomToken } from './walletStore';

const appKit = new AppKit();

const SWAP_CHAINS = [
  'Arc', 'Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Avalanche', 'Optimism',
] as const;

const SUPPORTED_TOKENS = ['USDC', 'USDT', 'WETH', 'NATIVE'] as const;

const DISPLAY_CHAINS = ONCHAIN_CHAINS.filter(c => !c.isTestnet).slice(0, 8);

type Tab = 'assets' | 'send' | 'receive' | 'swap' | 'bridge' | 'history' | 'settings';

function fmt(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}

function fmtNum(n: string | number, dp = 4) {
  const f = parseFloat(String(n));
  if (isNaN(f)) return '0.00';
  if (f === 0) return '0.00';
  return f.toFixed(dp);
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="p-1 rounded text-[var(--subtle)] hover:text-[var(--ink)] transition-colors">
      {copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
    </button>
  );
}

// ── Password modal ────────────────────────────────────────────────────────────
function PwModal({
  title,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  title: string;
  onConfirm: (pw: string) => void;
  onCancel: () => void;
  loading: boolean;
  error?: string;
}) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
          <button onClick={onCancel} className="text-[var(--subtle)] hover:text-[var(--ink)]"><X size={16} /></button>
        </div>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            placeholder="Wallet password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm(pw); }}
            autoFocus
          />
          <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]">
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
        <button
          onClick={() => onConfirm(pw)}
          disabled={loading || !pw}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          Confirm
        </button>
      </div>
    </div>
  );
}

// ── Assets tab ────────────────────────────────────────────────────────────────
function AssetsTab({ wallet }: { wallet: UseWalletReturn }) {
  const [addTokenMode, setAddTokenMode] = useState(false);
  const [tokenAddr, setTokenAddr] = useState('');
  const [fetchingToken, setFetchingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const lookupAndAddToken = async () => {
    if (!ethers.isAddress(tokenAddr)) { setTokenError('Invalid address'); return; }
    setFetchingToken(true); setTokenError('');
    try {
      const chain = requireChain(wallet.activeChainId);
      const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
      const contract = new ethers.Contract(tokenAddr, [
        'function symbol() view returns (string)',
        'function name() view returns (string)',
        'function decimals() view returns (uint8)',
      ], provider);
      const [symbol, name, decimals] = await Promise.all([
        contract.symbol() as Promise<string>,
        contract.name() as Promise<string>,
        contract.decimals() as Promise<number>,
      ]);
      const token: CustomToken = {
        chainId: wallet.activeChainId,
        address: tokenAddr,
        symbol,
        name,
        decimals,
      };
      wallet.addCustomToken(token);
      await wallet.refreshBalances();
      setAddTokenMode(false);
      setTokenAddr('');
      toast.success(`${symbol} added`);
    } catch {
      setTokenError('Failed to fetch token info. Check the address.');
    } finally {
      setFetchingToken(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider">Assets</p>
        <button onClick={() => { void wallet.refreshBalances(); }} className="p-1 text-[var(--subtle)] hover:text-[var(--ink)] transition-colors">
          <RefreshCw size={12} className={wallet.isLoadingBalances ? 'animate-spin' : ''} />
        </button>
      </div>

      {wallet.isLoadingBalances && wallet.balances.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
        </div>
      )}

      {wallet.balances.map(b => (
        <div key={b.address} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
          <div className="w-9 h-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0 text-xs font-bold text-[var(--accent)]">
            {b.symbol.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--ink)]">{b.symbol}</p>
            <p className="text-xs text-[var(--subtle)] truncate">{b.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-[var(--ink)]">{fmtNum(b.balance)}</p>
            {!b.isNative && (
              <button
                onClick={() => wallet.removeCustomToken(b.address, wallet.activeChainId)}
                className="text-[10px] text-[var(--subtle)] hover:text-[var(--danger)] transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}

      {wallet.balances.length === 0 && !wallet.isLoadingBalances && (
        <p className="text-center text-xs text-[var(--subtle)] py-6">No tokens. Connect to load balances.</p>
      )}

      {addTokenMode ? (
        <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--ink)]">Add Custom Token</p>
          <input
            className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none"
            placeholder="Token contract address (0x...)"
            value={tokenAddr}
            onChange={e => setTokenAddr(e.target.value)}
          />
          {tokenError && <p className="text-xs text-[var(--danger)]">{tokenError}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setAddTokenMode(false); setTokenAddr(''); setTokenError(''); }} className="flex-1 py-2 rounded-lg text-xs text-[var(--muted)] bg-[var(--surface-muted)] border border-[var(--border)]">Cancel</button>
            <button onClick={() => { void lookupAndAddToken(); }} disabled={fetchingToken} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1">
              {fetchingToken && <Loader2 size={12} className="animate-spin" />}
              Add Token
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddTokenMode(true)}
          className="w-full py-2.5 rounded-xl text-xs font-medium border border-dashed border-[var(--border)] text-[var(--subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus size={12} /> Add Custom Token
        </button>
      )}
    </div>
  );
}

// ── Send tab ──────────────────────────────────────────────────────────────────
function SendTab({ wallet }: { wallet: UseWalletReturn }) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [txHash, setTxHash] = useState('');
  const [showPwModal, setShowPwModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = selectedToken ? wallet.balances.find(b => b.address === selectedToken) : wallet.balances[0];

  const submit = async (pw: string) => {
    if (!to || !amount) { setError('Fill in all fields'); return; }
    if (!ethers.isAddress(to)) { setError('Invalid address'); return; }
    setLoading(true); setError('');
    try {
      let hash: string;
      if (!token || token.isNative) {
        hash = await wallet.sendNative(to, amount, pw);
      } else {
        hash = await wallet.sendToken(token.address, to, amount, token.decimals, pw);
      }
      setTxHash(hash);
      setShowPwModal(false);
      toast.success('Transaction sent');
      await wallet.refreshBalances();
      await wallet.refreshHistory();
    } catch (e) {
      setError((e as Error).message.slice(0, 80));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {showPwModal && (
        <PwModal
          title="Confirm Send"
          onConfirm={pw => { void submit(pw); }}
          onCancel={() => setShowPwModal(false)}
          loading={loading}
          error={error}
        />
      )}

      {txHash ? (
        <div className="bg-[var(--success)]/8 border border-[var(--success)]/20 rounded-2xl p-5 text-center space-y-3">
          <Check size={32} className="mx-auto text-[var(--success)]" />
          <p className="text-sm font-semibold text-[var(--ink)]">Transaction Sent!</p>
          <p className="text-xs font-mono text-[var(--subtle)] break-all">{txHash}</p>
          <a
            href={buildTxExplorerUrl(wallet.activeChainId, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-[var(--accent)] hover:opacity-80"
          >
            <ExternalLink size={12} /> View on Explorer
          </a>
          <button onClick={() => setTxHash('')} className="mt-2 text-xs text-[var(--subtle)] hover:text-[var(--ink)]">Send another</button>
        </div>
      ) : (
        <>
          <div>
            <label className="text-xs text-[var(--subtle)] mb-1.5 block">Token</label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                value={selectedToken ?? ''}
                onChange={e => setSelectedToken(e.target.value || null)}
              >
                {wallet.balances.map(b => (
                  <option key={b.address} value={b.address}>
                    {b.symbol} ({fmtNum(b.balance, 4)})
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--subtle)] mb-1.5 block">Recipient address</label>
            <input
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="0x..."
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[var(--subtle)]">Amount</label>
              {token && (
                <button
                  onClick={() => setAmount(fmtNum(token.balance, 6))}
                  className="text-[10px] text-[var(--accent)] hover:opacity-80"
                >
                  Max: {fmtNum(token.balance, 4)} {token.symbol}
                </button>
              )}
            </div>
            <input
              type="number"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}

          <button
            onClick={() => setShowPwModal(true)}
            disabled={!to || !amount || wallet.balances.length === 0}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <ArrowUpRight size={16} /> Send
          </button>
        </>
      )}
    </div>
  );
}

// ── Receive tab ───────────────────────────────────────────────────────────────
function ReceiveTab({ wallet }: { wallet: UseWalletReturn }) {
  if (!wallet.activeWallet) return null;
  const addr = wallet.activeWallet.address;

  return (
    <div className="flex flex-col items-center px-4 py-6 space-y-5">
      {/* QR placeholder — SVG-based, not an image */}
      <div className="w-48 h-48 bg-white rounded-2xl flex items-center justify-center border border-[var(--border)] p-3">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {/* Simple QR placeholder pattern */}
          <rect width="200" height="200" fill="white" />
          <rect x="10" y="10" width="60" height="60" fill="none" stroke="black" strokeWidth="8" />
          <rect x="30" y="30" width="20" height="20" fill="black" />
          <rect x="130" y="10" width="60" height="60" fill="none" stroke="black" strokeWidth="8" />
          <rect x="150" y="30" width="20" height="20" fill="black" />
          <rect x="10" y="130" width="60" height="60" fill="none" stroke="black" strokeWidth="8" />
          <rect x="30" y="150" width="20" height="20" fill="black" />
          <text x="100" y="108" textAnchor="middle" fontSize="9" fill="black" fontFamily="monospace">SCAN ADDRESS</text>
        </svg>
      </div>

      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-2">
        <p className="flex-1 text-xs font-mono text-[var(--ink)] break-all">{addr}</p>
        <CopyButton text={addr} />
      </div>

      <div className="w-full bg-[var(--accent)]/8 border border-[var(--accent)]/20 rounded-xl p-3 text-xs text-[var(--accent)] space-y-1">
        <p className="font-semibold">Only send compatible tokens</p>
        <p className="text-[var(--muted)]">Ensure the sender is on the correct chain: <strong>{requireChain(wallet.activeChainId).name}</strong></p>
      </div>
    </div>
  );
}

// ── Swap tab (via Circle AppKit) ──────────────────────────────────────────────
function SwapTab({ wallet: _wallet }: { wallet: UseWalletReturn }) {
  const { connector } = useAccount();
  const [fromChain, setFromChain] = useState<SwapChainIdentifier>('Arc');
  const [toChain, setToChain] = useState<SwapChainIdentifier>('Arc');
  const [tokenIn, setTokenIn] = useState<string>('USDT');
  const [tokenOut, setTokenOut] = useState<string>('USDC');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'estimating' | 'swapping' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState('');
  const [estimate, setEstimate] = useState<string>('');

  const isArcUsdcNativeSwap =
    (fromChain === 'Arc' || toChain === 'Arc') &&
    ((tokenIn === 'USDC' && tokenOut === 'NATIVE') || (tokenIn === 'NATIVE' && tokenOut === 'USDC'));

  const doEstimate = async () => {
    if (!connector || !amount) return;
    if (isArcUsdcNativeSwap) { setError('USDC and native are the same asset on Arc — no swap needed.'); return; }
    setStatus('estimating'); setError(''); setEstimate('');
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });
      // oxlint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-member-access
      const est = await (appKit as unknown as Record<string, (...a: unknown[]) => unknown>).estimateSwap({
        from: { adapter, chain: fromChain },
        tokenIn,
        tokenOut,
        amountIn: amount,
        ...(fromChain !== toChain ? { to: { chain: toChain } } : {}),
      }) as Record<string, unknown>;
      const outVal = est.estimatedOutput != null ? JSON.stringify(est.estimatedOutput) : '?';
      setEstimate(`~${outVal} ${tokenOut}`);
      setStatus('idle');
    } catch (e) {
      setError((e as Error).message.slice(0, 100));
      setStatus('error');
    }
  };

  const doSwap = async () => {
    if (!connector || !amount) return;
    if (isArcUsdcNativeSwap) { setError('USDC and native are the same asset on Arc — no swap needed.'); return; }
    setStatus('swapping'); setError('');
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });
      // oxlint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-member-access
      const swapResult = await (appKit as unknown as Record<string, (...a: unknown[]) => unknown>).swap({
        from: { adapter, chain: fromChain },
        tokenIn,
        tokenOut,
        amountIn: amount,
        ...(fromChain !== toChain ? { to: { chain: toChain } } : {}),
      }) as Record<string, string>;
      setResult(swapResult.txHash ?? '');
      setStatus('done');
      toast.success('Swap complete!');
    } catch (e) {
      setError((e as Error).message.slice(0, 100));
      setStatus('error');
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      <p className="text-[10px] text-[var(--subtle)] bg-[var(--surface-muted)] rounded-lg px-2 py-1.5">
        Swaps are routed through Circle App Kit (LiFi aggregator). Connect your browser wallet above to sign swap transactions.
      </p>

      {status === 'done' && result ? (
        <div className="bg-[var(--success)]/8 border border-[var(--success)]/20 rounded-2xl p-5 text-center space-y-3">
          <Check size={28} className="mx-auto text-[var(--success)]" />
          <p className="text-sm font-semibold text-[var(--ink)]">Swap Executed</p>
          <p className="text-xs font-mono text-[var(--subtle)] break-all">{result}</p>
          <button onClick={() => { setStatus('idle'); setResult(''); setEstimate(''); }} className="text-xs text-[var(--accent)]">Swap again</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">From chain</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-2 py-2 text-xs text-[var(--ink)] focus:outline-none" value={fromChain} onChange={e => setFromChain(e.target.value)}>
                {SWAP_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">To chain</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-2 py-2 text-xs text-[var(--ink)] focus:outline-none" value={toChain} onChange={e => setToChain(e.target.value)}>
                {SWAP_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Token in</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-2 py-2 text-xs text-[var(--ink)] focus:outline-none" value={tokenIn} onChange={e => setTokenIn(e.target.value)}>
                {SUPPORTED_TOKENS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Token out</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-2 py-2 text-xs text-[var(--ink)] focus:outline-none" value={tokenOut} onChange={e => setTokenOut(e.target.value)}>
                {SUPPORTED_TOKENS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--subtle)] mb-1.5 block">Amount</label>
            <input
              type="number"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {estimate && (
            <div className="bg-[var(--accent)]/8 border border-[var(--accent)]/20 rounded-lg px-3 py-2 text-xs text-[var(--accent)]">
              Estimate: <strong>{estimate}</strong>
            </div>
          )}

          {isArcUsdcNativeSwap && (
            <p className="text-xs text-[var(--warning)] flex items-center gap-1"><AlertTriangle size={12} />USDC and native are the same asset on Arc. No swap is needed.</p>
          )}

          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { void doEstimate(); }}
              disabled={status === 'estimating' || !connector || !amount || isArcUsdcNativeSwap}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-hover)] disabled:opacity-40 flex items-center justify-center gap-1"
            >
              {status === 'estimating' && <Loader2 size={12} className="animate-spin" />}
              Estimate
            </button>
            <button
              onClick={() => { void doSwap(); }}
              disabled={status === 'swapping' || !connector || !amount || isArcUsdcNativeSwap}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {status === 'swapping' && <Loader2 size={12} className="animate-spin" />}
              <ArrowLeftRight size={14} /> Swap
            </button>
          </div>

          {!connector && <p className="text-center text-xs text-[var(--subtle)]">Connect your browser wallet (top-right) to swap.</p>}
        </>
      )}
    </div>
  );
}

// ── CCTP Bridge tab ────────────────────────────────────────────────────────────
function BridgeTab() {
  const { connector } = useAccount();
  const [srcChain, setSrcChain] = useState<BridgeChainIdentifier>('Arc');
  const [dstChain, setDstChain] = useState<BridgeChainIdentifier>('Base');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'bridging' | 'done' | 'error'>('idle');
  const [steps, setSteps] = useState<Array<{ name: string; state: string; txHash?: string }>>([]);
  const [error, setError] = useState('');

  const BRIDGE_CHAINS = [
    'Arc', 'Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Avalanche', 'Optimism', 'Unichain',
  ];

  const doBridge = async () => {
    if (!connector || !amount) return;
    setStatus('bridging'); setError(''); setSteps([]);
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });

      // oxlint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-member-access
      const resultBridge = await (appKit as unknown as Record<string, (...a: unknown[]) => unknown>).bridge({
        from: { adapter, chain: srcChain },
        to: { adapter, chain: dstChain },
        amount,
      }) as { steps?: Array<{ name: string; state: string; txHash?: string }> };

      setSteps((resultBridge.steps ?? []).map((s: { name: string; state: string; txHash?: string }) => ({
        name: s.name,
        state: s.state,
        txHash: s.txHash,
      })));
      setStatus('done');
      toast.success('Bridge complete!');
    } catch (e) {
      setError((e as Error).message.slice(0, 100));
      setStatus('error');
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      <p className="text-[10px] text-[var(--subtle)] bg-[var(--surface-muted)] rounded-lg px-2 py-1.5">
        Bridge USDC across chains via Circle CCTP V2. Connect your browser wallet above to sign.
      </p>

      {status === 'done' ? (
        <div className="bg-[var(--success)]/8 border border-[var(--success)]/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Check size={20} className="text-[var(--success)]" />
            <p className="text-sm font-semibold text-[var(--ink)]">Bridge Complete</p>
          </div>
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full shrink-0 ${s.state === 'success' ? 'bg-[var(--success)]' : s.state === 'error' ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`} />
              <span className="capitalize text-[var(--ink)]">{s.name}</span>
              {s.txHash && <span className="font-mono text-[var(--subtle)] truncate">{s.txHash.slice(0, 14)}…</span>}
            </div>
          ))}
          <button onClick={() => { setStatus('idle'); setSteps([]); }} className="text-xs text-[var(--accent)]">Bridge again</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Source</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-2 py-2 text-xs text-[var(--ink)] focus:outline-none" value={srcChain} onChange={e => setSrcChain(e.target.value)}>
                {BRIDGE_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Destination</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-2 py-2 text-xs text-[var(--ink)] focus:outline-none" value={dstChain} onChange={e => setDstChain(e.target.value)}>
                {BRIDGE_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--subtle)] mb-1.5 block">USDC Amount</label>
            <input
              type="number"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}

          {status === 'bridging' && (
            <div className="flex items-center gap-2 text-xs text-[var(--accent)]">
              <Loader2 size={14} className="animate-spin" />
              Bridging via CCTP…
            </div>
          )}

          <button
            onClick={() => { void doBridge(); }}
            disabled={status === 'bridging' || !connector || !amount}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Link2 size={16} /> Bridge USDC
          </button>

          {!connector && <p className="text-center text-xs text-[var(--subtle)]">Connect your browser wallet (top-right) to bridge.</p>}
        </>
      )}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryTab({ wallet }: { wallet: UseWalletReturn }) {
  useEffect(() => {
    void wallet.refreshHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addr = wallet.activeWallet?.address.toLowerCase();

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider">History</p>
        <button onClick={() => { void wallet.refreshHistory(); }} className="p-1 text-[var(--subtle)] hover:text-[var(--ink)]">
          <RefreshCw size={12} className={wallet.isLoadingHistory ? 'animate-spin' : ''} />
        </button>
      </div>

      {wallet.isLoadingHistory && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
        </div>
      )}

      {!wallet.isLoadingHistory && wallet.txHistory.length === 0 && (
        <p className="text-center text-xs text-[var(--subtle)] py-8">No transactions found</p>
      )}

      {wallet.txHistory.map(tx => {
        const isSend = tx.from.toLowerCase() === addr;
        const fmtValue = ethers.formatUnits(tx.value, 18);
        return (
          <div key={tx.hash} className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSend ? 'bg-[var(--danger)]/10' : 'bg-[var(--success)]/10'}`}>
              {isSend ? <ArrowUpRight size={14} className="text-[var(--danger)]" /> : <ArrowDownLeft size={14} className="text-[var(--success)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--ink)]">{isSend ? 'Sent' : 'Received'}</span>
                <span className={`text-xs font-bold tabular-nums ${isSend ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                  {isSend ? '-' : '+'}{fmtNum(fmtValue, 4)}
                </span>
              </div>
              <p className="text-[10px] font-mono text-[var(--subtle)] truncate">{isSend ? tx.to ?? '—' : tx.from}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-[var(--subtle)]">{tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : '—'}</span>
                <a href={buildTxExplorerUrl(tx.chainId, tx.hash)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--accent)] hover:opacity-80 flex items-center gap-0.5">
                  <ExternalLink size={10} /> View
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────
function SettingsTab({ wallet }: { wallet: UseWalletReturn }) {
  const [revealMode, setRevealMode] = useState<'pk' | 'seed' | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPw, setAddPw] = useState('');
  const [addConfirm, setAddConfirm] = useState('');
  const [addSecret, setAddSecret] = useState('');
  const [addMode, setAddMode] = useState<'new' | 'import'>('new');
  const [addLoading, setAddLoading] = useState(false);

  const handleReveal = async (pw: string) => {
    if (!wallet.activeWallet) return;
    setLoading(true); setError('');
    try {
      if (revealMode === 'pk') {
        const pk = await exportPrivateKey(wallet.activeWallet, pw);
        setRevealed(pk);
      } else {
        const mn = await exportMnemonic(wallet.activeWallet, pw);
        setRevealed(mn ?? 'No seed phrase stored for this wallet.');
      }
    } catch {
      setError('Wrong password');
    } finally {
      setLoading(false);
    }
  };

  const addWallet = async () => {
    if (!addName || !addPw || addPw !== addConfirm) { return; }
    setAddLoading(true);
    try {
      if (addMode === 'new') {
        await wallet.createNew(addName, addPw);
        toast.success('Wallet created');
      } else {
        await wallet.importExisting(addName, addSecret, addPw);
        toast.success('Wallet imported');
      }
      setShowAdd(false); setAddName(''); setAddPw(''); setAddConfirm(''); setAddSecret('');
    } catch (e) {
      toast.error((e as Error).message.slice(0, 60));
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="overflow-y-auto h-full px-4 py-3 space-y-5">
      {revealMode && (
        <PwModal
          title={revealMode === 'pk' ? 'Reveal Private Key' : 'Reveal Seed Phrase'}
          onConfirm={pw => { void handleReveal(pw); }}
          onCancel={() => { setRevealMode(null); setRevealed(null); setError(''); }}
          loading={loading}
          error={error}
        />
      )}

      {/* Wallet list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider">Wallets</p>
          <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80">
            {showAdd ? <X size={12} /> : <><Plus size={12} /> Add</>}
          </button>
        </div>

        {showAdd && (
          <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-2xl p-4 space-y-3 mb-3">
            <div className="flex gap-2">
              {(['new', 'import'] as const).map(m => (
                <button key={m} onClick={() => setAddMode(m)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${addMode === m ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-muted)] text-[var(--muted)] border border-[var(--border)]'}`}>
                  {m === 'new' ? 'New' : 'Import'}
                </button>
              ))}
            </div>
            <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Wallet name" value={addName} onChange={e => setAddName(e.target.value)} />
            {addMode === 'import' && (
              <textarea className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none resize-none" rows={2} placeholder="Private key or seed phrase" value={addSecret} onChange={e => setAddSecret(e.target.value)} />
            )}
            <input type="password" className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Password (min 8)" value={addPw} onChange={e => setAddPw(e.target.value)} />
            <input type="password" className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Confirm password" value={addConfirm} onChange={e => setAddConfirm(e.target.value)} />
            <button onClick={() => { void addWallet(); }} disabled={addLoading || !addName || !addPw || addPw !== addConfirm} className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40">
              {addLoading ? 'Processing…' : (addMode === 'new' ? 'Create Wallet' : 'Import Wallet')}
            </button>
          </div>
        )}

        {wallet.wallets.map(w => (
          <div key={w.id} className={`flex items-center gap-2 bg-[var(--surface)] border rounded-xl p-3 mb-2 cursor-pointer transition-colors ${w.id === wallet.activeWallet?.id ? 'border-[var(--accent)]/40 bg-[var(--accent)]/4' : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'}`} onClick={() => wallet.selectWallet(w.id)}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)', color: 'white' }}>
              {w.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--ink)] truncate">{w.name}</p>
              <p className="text-[10px] font-mono text-[var(--subtle)] truncate">{fmt(w.address)}</p>
            </div>
            {w.id === wallet.activeWallet?.id && <Check size={12} className="text-[var(--accent)] shrink-0" />}
            <button
              onClick={e => { e.stopPropagation(); if (confirm('Remove wallet?')) wallet.removeWalletById(w.id); }}
              className="p-1 text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded transition-colors shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Chain selector */}
      <div>
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider mb-2">Active Chain</p>
        <div className="grid grid-cols-2 gap-2">
          {DISPLAY_CHAINS.map(c => (
            <button
              key={c.chainId}
              onClick={() => wallet.setActiveChainId(c.chainId)}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors ${wallet.activeChainId === c.chainId ? 'border-[var(--accent)]/40 bg-[var(--accent)]/8 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--subtle)] hover:bg-[var(--surface-hover)]'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Export section */}
      {wallet.activeWallet && (
        <div>
          <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider mb-2">Export Keys</p>
          {revealed ? (
            <div className="bg-[var(--danger)]/8 border border-[var(--danger)]/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--danger)]">{revealMode === 'pk' ? 'Private Key' : 'Seed Phrase'} — keep this secret!</p>
                <button onClick={() => { setRevealed(null); setRevealMode(null); }} className="text-[var(--subtle)] hover:text-[var(--ink)]"><X size={14} /></button>
              </div>
              <p className="text-xs font-mono text-[var(--ink)] break-all bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">{revealed}</p>
              <CopyButton text={revealed} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRevealMode('pk')} className="py-2.5 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-hover)] flex items-center justify-center gap-1">
                <Eye size={12} /> Private Key
              </button>
              <button onClick={() => setRevealMode('seed')} className="py-2.5 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-hover)] flex items-center justify-center gap-1">
                <Eye size={12} /> Seed Phrase
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lock */}
      <button
        onClick={wallet.lock}
        className="w-full py-3 rounded-xl text-sm font-medium text-[var(--subtle)] border border-[var(--border)] hover:bg-[var(--surface-hover)] flex items-center justify-center gap-2"
      >
        <Lock size={14} /> Lock Wallet
      </button>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function WalletDashboard({ wallet }: { wallet: UseWalletReturn }) {
  const [tab, setTab] = useState<Tab>('assets');

  const { address: connectedAddress } = useAccount();
  const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: 'assets',   label: 'Assets',   icon: Coins },
    { key: 'send',     label: 'Send',     icon: ArrowUpRight },
    { key: 'receive',  label: 'Receive',  icon: ArrowDownLeft },
    { key: 'swap',     label: 'Swap',     icon: ArrowLeftRight },
    { key: 'bridge',   label: 'Bridge',   icon: Link2 },
    { key: 'history',  label: 'History',  icon: Clock },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const chain = requireChain(wallet.activeChainId);
  const usdcBalance = wallet.balances.find(b => !b.isNative);
  const totalUsdcDisplay = usdcBalance ? fmtNum(usdcBalance.balance, 2) : '—';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hero balance */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] bg-[var(--surface-muted)]/50 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          {/* Wallet selector */}
          <div>
            <p className="text-[10px] text-[var(--subtle)] mb-0.5">Active Wallet</p>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)', color: 'white' }}>
                {wallet.activeWallet?.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-[var(--ink)] max-w-[120px] truncate">{wallet.activeWallet?.name}</span>
            </div>
            {wallet.activeWallet && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-mono text-[var(--subtle)]">{fmt(wallet.activeWallet.address)}</span>
                <CopyButton text={wallet.activeWallet.address} />
              </div>
            )}
          </div>

          {/* Balance */}
          <div className="text-right">
            <p className="text-[10px] text-[var(--subtle)]">{chain.name} Balance</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--ink)] tracking-tight">{totalUsdcDisplay}</p>
            <p className="text-[10px] text-[var(--subtle)]">USDC</p>
          </div>
        </div>

        {connectedAddress && (
          <div className="flex items-center gap-1.5 mt-1 px-2 py-1 bg-[var(--success)]/8 border border-[var(--success)]/20 rounded-lg text-[10px] text-[var(--success)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            Browser wallet connected: {fmt(connectedAddress)}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] bg-[var(--surface-muted)] shrink-0 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
              tab === key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--subtle)] hover:text-[var(--muted)]'
            }`}
          >
            <Icon size={13} className="shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'assets'   && <AssetsTab wallet={wallet} />}
        {tab === 'send'     && <SendTab wallet={wallet} />}
        {tab === 'receive'  && <ReceiveTab wallet={wallet} />}
        {tab === 'swap'     && <SwapTab wallet={wallet} />}
        {tab === 'bridge'   && <BridgeTab />}
        {tab === 'history'  && <HistoryTab wallet={wallet} />}
        {tab === 'settings' && <SettingsTab wallet={wallet} />}
      </div>
    </div>
  );
}
