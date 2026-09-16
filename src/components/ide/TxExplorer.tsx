import { useState } from 'react';
import { useAccount, useReadContract, useBalance } from 'wagmi';
import { isAddress } from 'viem';
import { erc20Abi } from 'viem';
import { Search, ExternalLink, Copy, Check, Wallet, Activity, RefreshCw } from 'lucide-react';
import { ARC_TESTNET_CHAIN_ID, USDC_ADDRESS, formatUsdc } from '../../launchpad-contract';
import { NetworkArc } from '@web3icons/react';

const EXPLORER = 'https://explorer.testnet.arc.io';

export function TxExplorer() {
  const { address: connectedAddr } = useAccount();
  const [searchAddr, setSearchAddr] = useState('');
  const [queried, setQueried] = useState('');
  const [copiedAddr, setCopiedAddr] = useState(false);

  const targetAddr = (queried || connectedAddr) as `0x${string}` | undefined;
  const isValid = targetAddr ? isAddress(targetAddr) : false;

  const { data: nativeBal, refetch: refetchNative, isLoading: loadingNative } = useBalance({
    address: targetAddr,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isValid },
  });

  const { data: usdcBal, refetch: refetchUsdc, isLoading: loadingUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: targetAddr ? [targetAddr] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isValid },
  }) as { data: bigint | undefined; refetch: () => void; isLoading: boolean };

  const handleSearch = () => {
    if (isAddress(searchAddr)) setQueried(searchAddr);
  };

  const handleCopy = () => {
    if (!targetAddr) return;
    void navigator.clipboard.writeText(targetAddr);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 1800);
  };

  const handleRefresh = () => {
    void refetchNative();
    void refetchUsdc();
  };

  const isLoading = loadingNative || loadingUsdc;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="display font-semibold text-lg text-[var(--ink)] mb-1">Explorer</h2>
          <p className="text-xs text-[var(--subtle)]">Look up any address on Arc Testnet</p>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input
            value={searchAddr}
            onChange={e => setSearchAddr(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Enter an address (0x…)"
            className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] mono transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={!isAddress(searchAddr)}
            className="rounded-xl bg-[var(--accent)] text-[#070e1a] font-semibold px-4 py-2.5 disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 text-sm"
          >
            <Search size={14} />
            Look up
          </button>
        </div>

        {/* Connected wallet shortcut */}
        {connectedAddr && !queried && (
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Wallet size={16} className="text-[var(--accent)] shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--subtle)] mb-0.5">Connected wallet</p>
              <p className="mono text-sm text-[var(--ink)] truncate">{connectedAddr}</p>
            </div>
          </div>
        )}

        {/* Address info card */}
        {targetAddr && isValid && (
          <div className="glass-strong rounded-2xl overflow-hidden">
            {/* Address header */}
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-[var(--subtle)] mb-1">Address</p>
                <p className="mono text-sm text-[var(--ink)] break-all">{targetAddr}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-[var(--surface)] transition-colors">
                  {copiedAddr ? <Check size={14} className="text-[var(--success)]" /> : <Copy size={14} className="text-[var(--subtle)]" />}
                </button>
                <button onClick={handleRefresh} disabled={isLoading} className="p-2 rounded-lg hover:bg-[var(--surface)] transition-colors">
                  <RefreshCw size={14} className={`text-[var(--subtle)] ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <a
                  href={`${EXPLORER}/address/${targetAddr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
                >
                  <ExternalLink size={14} className="text-[var(--accent)]" />
                </a>
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
              <div className="px-5 py-4">
                <p className="text-xs text-[var(--subtle)] mb-1 flex items-center gap-1">
                  <NetworkArc size={12} variant="branded" />
                  USDC Balance
                </p>
                {isLoading ? (
                  <div className="h-5 w-24 bg-[var(--surface)] rounded animate-pulse" />
                ) : (
                  <p className="display font-semibold text-lg text-[var(--ink)] tabular-nums">
                    ${formatUsdc(usdcBal ?? 0n)}
                  </p>
                )}
                <p className="text-xs text-[var(--subtle)] mt-0.5">ERC-20 (6 dec)</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-[var(--subtle)] mb-1">Native (Gas)</p>
                {isLoading ? (
                  <div className="h-5 w-24 bg-[var(--surface)] rounded animate-pulse" />
                ) : (
                  <p className="display font-semibold text-lg text-[var(--ink)] tabular-nums">
                    {nativeBal ? parseFloat(nativeBal.formatted).toFixed(4) : '0.0000'}
                  </p>
                )}
                <p className="text-xs text-[var(--subtle)] mt-0.5">18 dec · same pool as USDC</p>
              </div>
            </div>

            {/* Links */}
            <div className="px-5 py-3 border-t border-[var(--border)] flex gap-3">
              <a
                href={`${EXPLORER}/address/${targetAddr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
              >
                <Activity size={12} />
                Transactions
              </a>
              <a
                href={`${EXPLORER}/address/${targetAddr}#tokentransfers`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
              >
                <ExternalLink size={12} />
                Token transfers
              </a>
            </div>
          </div>
        )}

        {targetAddr && !isValid && (
          <div className="glass rounded-xl px-4 py-3 text-sm text-[var(--danger)]">
            Invalid address format
          </div>
        )}

        {/* Arc info box */}
        <div className="glass rounded-xl px-4 py-4 space-y-2">
          <p className="text-xs font-semibold text-[var(--accent)]">About Arc Testnet</p>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            On Arc, USDC <em>is</em> the native gas token — one balance pool exposed two ways.
            The ERC-20 view (6 decimals) is used for transfers and display.
            The native view (18 decimals) is used for gas only.
            Never sum or display both — that double-counts the same funds.
          </p>
          <div className="pt-1 flex flex-wrap gap-3">
            <a href="https://explorer.testnet.arc.io" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              <ExternalLink size={11} /> Explorer
            </a>
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              <ExternalLink size={11} /> Faucet
            </a>
            <a href="https://docs.arc.io" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              <ExternalLink size={11} /> Docs
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
