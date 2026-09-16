import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { ArrowLeft, ExternalLink, Check, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import {
  LAUNCHPAD_ADDRESS, LAUNCHPAD_ABI, ARC_MAINNET_CHAIN_ID, USDC_ADDRESS,
  LaunchData, getLaunchStatus, formatUsdc, parseUsdc, formatToken, formatCountdown,
  progressPct, formatAddress,
} from '../launchpad-contract';
import { getAdminStore } from '../admin/adminStore';
import { useWalletContext } from '../wallet/walletContext';

interface LaunchDetailProps {
  launchId: number;
  onBack: () => void;
  onNavigateToWallet?: () => void;
}

const statusLabels: Record<string, string> = {
  upcoming: 'Upcoming',
  active: 'Live',
  ended: 'Awaiting Finalization',
  'finalized-success': 'Successful',
  'finalized-failed': 'Failed — Refunds Available',
};

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

type PendingAction = 'approve' | 'contribute' | 'finalize' | 'claimTokens' | 'claimRefund' | 'claimProceeds' | null;

export function LaunchDetail({ launchId, onBack, onNavigateToWallet }: LaunchDetailProps) {
  const walletCtx = useWalletContext();
  const address = walletCtx?.activeWallet?.address as `0x${string}` | undefined;

  const effectiveLaunchpad = (() => {
    const override = getAdminStore().siteInfo.launchpadAddress;
    return (override && override !== '0x0000000000000000000000000000000000000000')
      ? override as `0x${string}`
      : LAUNCHPAD_ADDRESS;
  })();

  const [contributeAmount, setContributeAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successMap, setSuccessMap] = useState<Record<string, boolean>>({});

  // ── Read hooks (wagmi reads Arc RPC directly, no wallet needed) ────────────
  const { data: launch, refetch: refetchLaunch } = useReadContract({
    address: effectiveLaunchpad,
    abi: LAUNCHPAD_ABI,
    functionName: 'launches',
    args: [BigInt(launchId)],
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  }) as { data: LaunchData | undefined; refetch: () => void };

  const { data: userContribution, refetch: refetchContrib } = useReadContract({
    address: effectiveLaunchpad,
    abi: LAUNCHPAD_ABI,
    functionName: 'contributions',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: tokensPurchased, refetch: refetchTokens } = useReadContract({
    address: effectiveLaunchpad,
    abi: LAUNCHPAD_ABI,
    functionName: 'tokensPurchased',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: tokenClaimed } = useReadContract({
    address: effectiveLaunchpad,
    abi: LAUNCHPAD_ABI,
    functionName: 'tokenClaimed',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: boolean | undefined };

  const { data: refundClaimed } = useReadContract({
    address: effectiveLaunchpad,
    abi: LAUNCHPAD_ABI,
    functionName: 'refundClaimed',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: boolean | undefined };

  const { data: creatorProceeds } = useReadContract({
    address: effectiveLaunchpad,
    abi: LAUNCHPAD_ABI,
    functionName: 'creatorProceeds',
    args: [BigInt(launchId)],
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  }) as { data: bigint | undefined };

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, effectiveLaunchpad] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint | undefined; refetch: () => void };

  // ── Internal-wallet write helper ───────────────────────────────────────────
  const doAction = async (
    action: PendingAction,
    abi: ethers.InterfaceAbi,
    fn: string,
    args: unknown[],
    pw: string,
    contract = effectiveLaunchpad,
  ) => {
    if (!walletCtx) return;
    setActionLoading(true);
    setActionError('');
    try {
      const hash = await walletCtx.callContract(contract, abi, fn, args, pw);
      toast.success(`${fn} sent: ${hash.slice(0, 10)}…`);
      setSuccessMap(m => ({ ...m, [action!]: true }));
      setPendingAction(null);
      // Refresh read data
      void refetchLaunch();
      void refetchContrib();
      void refetchTokens();
      void refetchAllowance();
    } catch (e) {
      setActionError((e as Error).message.slice(0, 140));
    } finally {
      setActionLoading(false);
    }
  };

  if (!launch) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-xl bg-[var(--surface)]" />
        ))}
      </div>
    );
  }

  const status = getLaunchStatus(launch);
  const pct = progressPct(launch.raised, launch.hardCap);
  const isCreator = address?.toLowerCase() === launch.creator.toLowerCase();

  let parsedAmount = 0n;
  let amountError = '';
  try {
    if (contributeAmount) {
      parsedAmount = parseUsdc(contributeAmount);
      if (parsedAmount === 0n) amountError = 'Amount must be greater than 0';
      else if (parsedAmount % launch.pricePerToken !== 0n)
        amountError = `Must be a multiple of ${formatUsdc(launch.pricePerToken)} USDC (1 token)`;
    }
  } catch { amountError = 'Invalid amount'; }

  const needsApproval = !usdcAllowance || (parsedAmount > 0n && usdcAllowance < parsedAmount);
  const explorerBase = 'https://explorer.arc.io';

  return (
    <div className="space-y-4">
      {/* Password modal */}
      {pendingAction && (
        <PwModal
          title={`Confirm ${pendingAction}`}
          onConfirm={pw => {
            if (pendingAction === 'approve') {
              void doAction('approve', erc20Abi, 'approve',
                [effectiveLaunchpad, parsedAmount], pw, USDC_ADDRESS);
            } else if (pendingAction === 'contribute') {
              void doAction('contribute', LAUNCHPAD_ABI, 'contribute',
                [BigInt(launchId), parsedAmount], pw);
            } else if (pendingAction === 'finalize') {
              void doAction('finalize', LAUNCHPAD_ABI, 'finalize',
                [BigInt(launchId)], pw);
            } else if (pendingAction === 'claimTokens') {
              void doAction('claimTokens', LAUNCHPAD_ABI, 'claimTokens',
                [BigInt(launchId)], pw);
            } else if (pendingAction === 'claimRefund') {
              void doAction('claimRefund', LAUNCHPAD_ABI, 'claimRefund',
                [BigInt(launchId)], pw);
            } else if (pendingAction === 'claimProceeds') {
              void doAction('claimProceeds', LAUNCHPAD_ABI, 'claimProceeds',
                [BigInt(launchId)], pw);
            }
          }}
          onCancel={() => { setPendingAction(null); setActionError(''); }}
          loading={actionLoading}
          error={actionError}
        />
      )}

      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[var(--subtle)] hover:text-[var(--ink)] transition-colors">
        <ArrowLeft size={15} /> All launches
      </button>

      {/* Hero card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="display font-semibold text-2xl text-[var(--ink)]">{launch.name}</h1>
            <p className="mono text-sm text-[var(--subtle)] mt-0.5">{launch.symbol}</p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
            {statusLabels[status]}
          </span>
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">{launch.description}</p>

        {/* Progress */}
        <div className="mb-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[var(--ink)] font-medium tabular-nums">${formatUsdc(launch.raised)} raised</span>
            <span className="text-[var(--subtle)] tabular-nums">of ${formatUsdc(launch.hardCap)}</span>
          </div>
          <div className="h-2 bg-[var(--surface-muted)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--accent)' }} />
          </div>
          <div className="flex justify-between text-xs text-[var(--subtle)] mt-1.5">
            <span>Soft cap: ${formatUsdc(launch.softCap)}</span>
            <span className="tabular-nums">{pct.toFixed(1)}% filled</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Price per token', value: `$${formatUsdc(launch.pricePerToken)}` },
            { label: 'Total supply', value: formatToken(launch.totalSupply, 18) },
            { label: 'Creator', value: formatAddress(launch.creator) },
            {
              label: status === 'active' ? 'Ends in' : status === 'upcoming' ? 'Starts in' : 'Status',
              value: status === 'active' ? formatCountdown(launch.endTime)
                : status === 'upcoming' ? formatCountdown(launch.startTime) : 'Ended',
            },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs text-[var(--subtle)] mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-[var(--ink)] mono tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Token contract */}
      {status === 'finalized-success' && launch.tokenAddress !== '0x0000000000000000000000000000000000000000' && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div>
            <p className="text-xs text-[var(--subtle)]">Token contract</p>
            <p className="mono text-sm text-[var(--ink)]">{formatAddress(launch.tokenAddress)}</p>
          </div>
          <a href={`${explorerBase}/address/${launch.tokenAddress}`} target="_blank" rel="noopener noreferrer"
            className="text-[var(--accent)]"><ExternalLink size={16} /></a>
        </div>
      )}

      {/* Actions */}
      {!address ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--subtle)]">
            <Wallet size={16} /> Set up your wallet to participate
          </div>
          {onNavigateToWallet && (
            <button onClick={onNavigateToWallet}
              className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90">
              Open Wallet →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Creator proceeds */}
          {isCreator && status === 'finalized-success' && (creatorProceeds ?? 0n) > 0n && (
            <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Your proceeds</p>
              <p className="display text-2xl font-semibold text-[var(--success)] tabular-nums mb-4">
                ${formatUsdc(creatorProceeds ?? 0n)}
              </p>
              {successMap['claimProceeds'] ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm"><Check size={16} /> Proceeds claimed</div>
              ) : (
                <button onClick={() => setPendingAction('claimProceeds')}
                  className="w-full rounded-xl bg-[var(--success)] text-white font-semibold py-3 hover:opacity-90 transition-opacity">
                  Claim Proceeds
                </button>
              )}
            </div>
          )}

          {/* Contribute */}
          {status === 'active' && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
              <p className="text-sm font-semibold text-[var(--ink)]">Contribute USDC</p>
              {userContribution !== undefined && userContribution > 0n && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--subtle)]">Your contribution</span>
                  <span className="tabular-nums text-[var(--ink)] mono">${formatUsdc(userContribution)}</span>
                </div>
              )}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtle)] text-sm">$</span>
                <input type="number" min="0" step={formatUsdc(launch.pricePerToken)}
                  value={contributeAmount} onChange={e => setContributeAmount(e.target.value)}
                  placeholder={`${formatUsdc(launch.pricePerToken)} min`}
                  className="w-full rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] px-8 py-3 text-[var(--ink)] placeholder-[var(--subtle)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors tabular-nums" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtle)] text-xs">USDC</span>
              </div>
              {amountError && <p className="text-xs text-[var(--danger)]">{amountError}</p>}
              {successMap['contribute'] ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm"><Check size={16} /> Contribution confirmed!</div>
              ) : successMap['approve'] ? (
                <button onClick={() => setPendingAction('contribute')}
                  disabled={parsedAmount === 0n || !!amountError}
                  className="w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-3 disabled:opacity-50 hover:opacity-90 transition-opacity">
                  Contribute
                </button>
              ) : needsApproval ? (
                <button onClick={() => setPendingAction('approve')}
                  disabled={parsedAmount === 0n || !!amountError}
                  className="w-full rounded-xl font-semibold py-3 disabled:opacity-50 transition-all bg-[var(--surface-muted)] text-[var(--ink)] border border-[var(--border)] hover:border-[var(--accent)]">
                  Approve USDC
                </button>
              ) : (
                <button onClick={() => setPendingAction('contribute')}
                  disabled={parsedAmount === 0n || !!amountError}
                  className="w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-3 disabled:opacity-50 hover:opacity-90 transition-opacity">
                  Contribute
                </button>
              )}
            </div>
          )}

          {/* Finalize */}
          {status === 'ended' && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm text-[var(--muted)] mb-4">This sale has ended. Finalize it to distribute tokens or enable refunds.</p>
              {successMap['finalize'] ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm"><Check size={16} /> Finalized</div>
              ) : (
                <button onClick={() => setPendingAction('finalize')}
                  className="w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-3 hover:opacity-90 transition-opacity">
                  Finalize Launch
                </button>
              )}
            </div>
          )}

          {/* Claim tokens */}
          {status === 'finalized-success' && (tokensPurchased ?? 0n) > 0n && !tokenClaimed && !successMap['claimTokens'] && (
            <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Your tokens</p>
              <p className="display text-2xl font-semibold text-[var(--success)] tabular-nums mb-4">
                {formatToken(tokensPurchased ?? 0n, 18)} {launch.symbol}
              </p>
              <button onClick={() => setPendingAction('claimTokens')}
                className="w-full rounded-xl bg-[var(--success)] text-white font-semibold py-3 hover:opacity-90 transition-opacity">
                Claim {launch.symbol} Tokens
              </button>
            </div>
          )}
          {(tokenClaimed || successMap['claimTokens']) && status === 'finalized-success' && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
              <Check size={16} /> Tokens claimed
            </div>
          )}

          {/* Claim refund */}
          {status === 'finalized-failed' && (userContribution ?? 0n) > 0n && !refundClaimed && !successMap['claimRefund'] && (
            <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Your refund</p>
              <p className="display text-2xl font-semibold text-[var(--danger)] tabular-nums mb-4">
                ${formatUsdc(userContribution ?? 0n)} USDC
              </p>
              <button onClick={() => setPendingAction('claimRefund')}
                className="w-full rounded-xl bg-[var(--danger)] text-white font-semibold py-3 hover:opacity-90 transition-opacity">
                Claim Refund
              </button>
            </div>
          )}
          {(refundClaimed || successMap['claimRefund']) && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
              <Check size={16} /> Refund claimed
            </div>
          )}
        </>
      )}
    </div>
  );
}
