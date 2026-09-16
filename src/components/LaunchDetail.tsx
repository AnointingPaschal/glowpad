import { useState } from 'react';
import {
  useReadContract, useWriteContract, useWaitForTransactionReceipt,
  useAccount, useSwitchChain,
} from 'wagmi';
import { erc20Abi } from 'viem';
import { ArrowLeft, ExternalLink, Check } from 'lucide-react';
import {
  LAUNCHPAD_ADDRESS, LAUNCHPAD_ABI, ARC_MAINNET_CHAIN_ID, USDC_ADDRESS,
  LaunchData, getLaunchStatus, formatUsdc, parseUsdc, formatToken, formatCountdown,
  progressPct, formatAddress,
} from '../launchpad-contract';

interface LaunchDetailProps {
  launchId: number;
  onBack: () => void;
}

const statusLabels: Record<string, string> = {
  upcoming: 'Upcoming',
  active: 'Live',
  ended: 'Awaiting Finalization',
  'finalized-success': 'Successful',
  'finalized-failed': 'Failed — Refunds Available',
};

export function LaunchDetail({ launchId, onBack }: LaunchDetailProps) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [contributeAmount, setContributeAmount] = useState('');

  const { data: launch } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'launches',
    args: [BigInt(launchId)],
    chainId: ARC_MAINNET_CHAIN_ID,
  }) as { data: LaunchData | undefined; refetch: () => void };

  const { data: userContribution } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'contributions',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint | undefined };

  const { data: tokensPurchased } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'tokensPurchased',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint | undefined };

  const { data: tokenClaimed } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'tokenClaimed',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: boolean | undefined };

  const { data: refundClaimed } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'refundClaimed',
    args: address ? [BigInt(launchId), address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: boolean | undefined };

  const { data: creatorProceeds } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'creatorProceeds',
    args: [BigInt(launchId)],
    chainId: ARC_MAINNET_CHAIN_ID,
  }) as { data: bigint | undefined };

  const { data: usdcAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, LAUNCHPAD_ADDRESS] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint | undefined };

  // Approve USDC
  const {
    writeContract: approve,
    data: approveHash,
    isPending: isApprovePending,
  } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Contribute
  const {
    writeContract: contribute,
    data: contributeHash,
    isPending: isContributePending,
  } = useWriteContract();
  const { isLoading: isContributeConfirming, isSuccess: isContributeSuccess } =
    useWaitForTransactionReceipt({ hash: contributeHash });

  // Finalize
  const {
    writeContract: finalize,
    data: finalizeHash,
    isPending: isFinalizePending,
  } = useWriteContract();
  const { isLoading: isFinalizeConfirming, isSuccess: isFinalizeSuccess } =
    useWaitForTransactionReceipt({ hash: finalizeHash });

  // Claim tokens
  const {
    writeContract: claimTokens,
    data: claimHash,
    isPending: isClaimPending,
  } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // Claim refund
  const {
    writeContract: claimRefund,
    data: refundHash,
    isPending: isRefundPending,
  } = useWriteContract();
  const { isLoading: isRefundConfirming, isSuccess: isRefundSuccess } =
    useWaitForTransactionReceipt({ hash: refundHash });

  // Claim proceeds (creator)
  const {
    writeContract: claimProceeds,
    data: proceedsHash,
    isPending: isProceedsPending,
  } = useWriteContract();
  const { isLoading: isProceedsConfirming, isSuccess: isProceedsSuccess } =
    useWaitForTransactionReceipt({ hash: proceedsHash });

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
  const isWrongChain = chainId !== ARC_MAINNET_CHAIN_ID;

  let parsedAmount = 0n;
  let amountError = '';
  try {
    if (contributeAmount) {
      parsedAmount = parseUsdc(contributeAmount);
      if (parsedAmount === 0n) amountError = 'Amount must be greater than 0';
      else if (parsedAmount % launch.pricePerToken !== 0n)
        amountError = `Must be a multiple of ${formatUsdc(launch.pricePerToken)} USDC (1 token)`;
    }
  } catch {
    amountError = 'Invalid amount';
  }

  const needsApproval = !usdcAllowance || (parsedAmount > 0n && usdcAllowance < parsedAmount);
  const isCreator = address?.toLowerCase() === launch.creator.toLowerCase();

  const handleApprove = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    approve({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [LAUNCHPAD_ADDRESS, parsedAmount],
      chainId: ARC_MAINNET_CHAIN_ID,
    });
  };

  const handleContribute = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    if (amountError || parsedAmount === 0n) return;
    contribute({
      address: LAUNCHPAD_ADDRESS,
      abi: LAUNCHPAD_ABI,
      functionName: 'contribute',
      args: [BigInt(launchId), parsedAmount],
      chainId: ARC_MAINNET_CHAIN_ID,
    });
  };

  const handleFinalize = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    finalize({
      address: LAUNCHPAD_ADDRESS,
      abi: LAUNCHPAD_ABI,
      functionName: 'finalize',
      args: [BigInt(launchId)],
      chainId: ARC_MAINNET_CHAIN_ID,
    });
  };

  const handleClaimTokens = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    claimTokens({
      address: LAUNCHPAD_ADDRESS,
      abi: LAUNCHPAD_ABI,
      functionName: 'claimTokens',
      args: [BigInt(launchId)],
      chainId: ARC_MAINNET_CHAIN_ID,
    });
  };

  const handleClaimRefund = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    claimRefund({
      address: LAUNCHPAD_ADDRESS,
      abi: LAUNCHPAD_ABI,
      functionName: 'claimRefund',
      args: [BigInt(launchId)],
      chainId: ARC_MAINNET_CHAIN_ID,
    });
  };

  const handleClaimProceeds = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    claimProceeds({
      address: LAUNCHPAD_ADDRESS,
      abi: LAUNCHPAD_ABI,
      functionName: 'claimProceeds',
      args: [BigInt(launchId)],
      chainId: ARC_MAINNET_CHAIN_ID,
    });
  };

  const explorerBase = 'https://explorer.testnet.arc.io';

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[var(--subtle)] hover:text-[var(--ink)] transition-colors"
      >
        <ArrowLeft size={15} />
        All launches
      </button>

      {/* Hero card */}
      <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-strong)] p-6">
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
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--accent)' }}
            />
          </div>
          <div className="flex justify-between text-xs text-[var(--subtle)] mt-1.5">
            <span>Soft cap: ${formatUsdc(launch.softCap)}</span>
            <span className="tabular-nums">{pct.toFixed(1)}% filled</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Price per token', value: `$${formatUsdc(launch.pricePerToken)}` },
            { label: 'Total supply', value: formatToken(launch.totalSupply, 18) },
            { label: 'Creator', value: formatAddress(launch.creator) },
            {
              label: status === 'active' ? 'Ends in' : status === 'upcoming' ? 'Starts in' : 'Duration',
              value: status === 'active'
                ? formatCountdown(launch.endTime)
                : status === 'upcoming'
                ? formatCountdown(launch.startTime)
                : 'Ended',
            },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs text-[var(--subtle)] mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-[var(--ink)] mono tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Token address (post-finalize success) */}
      {status === 'finalized-success' && launch.tokenAddress !== '0x0000000000000000000000000000000000000000' && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div>
            <p className="text-xs text-[var(--subtle)]">Token contract</p>
            <p className="mono text-sm text-[var(--ink)]">{formatAddress(launch.tokenAddress)}</p>
          </div>
          <a
            href={`${explorerBase}/address/${launch.tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      )}

      {/* Action area */}
      {!address ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <p className="text-sm text-[var(--subtle)]">Connect your wallet to participate</p>
        </div>
      ) : isWrongChain ? (
        <button
          onClick={() => switchChain({ chainId: ARC_MAINNET_CHAIN_ID })}
          className="w-full rounded-xl bg-[var(--accent)] text-[#0d1b2f] font-semibold py-3 hover:bg-[var(--accent-hover)] transition-colors"
        >
          Switch to Arc Testnet
        </button>
      ) : (
        <>
          {/* Creator — claim proceeds */}
          {isCreator && status === 'finalized-success' && (creatorProceeds ?? 0n) > 0n && (
            <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Your proceeds</p>
              <p className="display text-2xl font-semibold text-[var(--success)] tabular-nums mb-4">
                ${formatUsdc(creatorProceeds ?? 0n)}
              </p>
              {isProceedsSuccess ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm">
                  <Check size={16} /> Proceeds claimed
                </div>
              ) : (
                <button
                  onClick={handleClaimProceeds}
                  disabled={isProceedsPending || isProceedsConfirming}
                  className="w-full rounded-xl bg-[var(--success)] text-[#0d1b2f] font-semibold py-3 disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {isProceedsPending ? 'Confirm in wallet…' : isProceedsConfirming ? 'Confirming…' : 'Claim Proceeds'}
                </button>
              )}
            </div>
          )}

          {/* Contributor — active sale */}
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
                <input
                  type="number"
                  min="0"
                  step={formatUsdc(launch.pricePerToken)}
                  value={contributeAmount}
                  onChange={e => setContributeAmount(e.target.value)}
                  placeholder={`${formatUsdc(launch.pricePerToken)} min`}
                  className="w-full rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] px-8 py-3 text-[var(--ink)] placeholder-[var(--subtle)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtle)] text-xs">USDC</span>
              </div>

              {amountError && (
                <p className="text-xs text-[var(--danger)]">{amountError}</p>
              )}

              {isContributeSuccess || isApproveSuccess ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm">
                  <Check size={16} />
                  {isContributeSuccess ? 'Contribution confirmed!' : 'Approved — now contribute'}
                </div>
              ) : needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApprovePending || isApproveConfirming || parsedAmount === 0n || !!amountError}
                  className="w-full rounded-xl font-semibold py-3 disabled:opacity-50 transition-all bg-[var(--surface-muted)] text-[var(--ink)] border border-[var(--border)] hover:border-[var(--accent)]"
                >
                  {isApprovePending ? 'Confirm in wallet…' : isApproveConfirming ? 'Approving…' : 'Approve USDC'}
                </button>
              ) : (
                <button
                  onClick={handleContribute}
                  disabled={isContributePending || isContributeConfirming || parsedAmount === 0n || !!amountError}
                  className="w-full rounded-xl bg-[var(--accent)] text-[#0d1b2f] font-semibold py-3 disabled:opacity-50 hover:bg-[var(--accent-hover)] transition-colors"
                >
                  {isContributePending ? 'Confirm in wallet…' : isContributeConfirming ? 'Confirming…' : 'Contribute'}
                </button>
              )}
            </div>
          )}

          {/* Finalize — anyone can call after endTime */}
          {status === 'ended' && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-sm text-[var(--muted)] mb-4">
                This sale has ended. Finalize it to distribute tokens or enable refunds.
              </p>
              {isFinalizeSuccess ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm">
                  <Check size={16} /> Finalized successfully
                </div>
              ) : (
                <button
                  onClick={handleFinalize}
                  disabled={isFinalizePending || isFinalizeConfirming}
                  className="w-full rounded-xl bg-[var(--accent)] text-[#0d1b2f] font-semibold py-3 disabled:opacity-50 hover:bg-[var(--accent-hover)] transition-colors"
                >
                  {isFinalizePending ? 'Confirm in wallet…' : isFinalizeConfirming ? 'Finalizing…' : 'Finalize Launch'}
                </button>
              )}
            </div>
          )}

          {/* Claim tokens */}
          {status === 'finalized-success' && (tokensPurchased ?? 0n) > 0n && !tokenClaimed && (
            <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Your tokens</p>
              <p className="display text-2xl font-semibold text-[var(--success)] tabular-nums mb-4">
                {formatToken(tokensPurchased ?? 0n, 18)} {launch.symbol}
              </p>
              {isClaimSuccess ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm">
                  <Check size={16} /> Tokens claimed
                </div>
              ) : (
                <button
                  onClick={handleClaimTokens}
                  disabled={isClaimPending || isClaimConfirming}
                  className="w-full rounded-xl bg-[var(--success)] text-[#0d1b2f] font-semibold py-3 disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {isClaimPending ? 'Confirm in wallet…' : isClaimConfirming ? 'Claiming…' : `Claim ${launch.symbol} Tokens`}
                </button>
              )}
            </div>
          )}

          {/* Already claimed tokens */}
          {status === 'finalized-success' && tokenClaimed && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
              <Check size={16} /> Tokens already claimed
            </div>
          )}

          {/* Claim refund */}
          {status === 'finalized-failed' && (userContribution ?? 0n) > 0n && !refundClaimed && (
            <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Your refund</p>
              <p className="display text-2xl font-semibold text-[var(--danger)] tabular-nums mb-4">
                ${formatUsdc(userContribution ?? 0n)} USDC
              </p>
              {isRefundSuccess ? (
                <div className="flex items-center gap-2 text-[var(--success)] text-sm">
                  <Check size={16} /> Refund claimed
                </div>
              ) : (
                <button
                  onClick={handleClaimRefund}
                  disabled={isRefundPending || isRefundConfirming}
                  className="w-full rounded-xl bg-[var(--danger)] text-white font-semibold py-3 disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {isRefundPending ? 'Confirm in wallet…' : isRefundConfirming ? 'Confirming…' : 'Claim Refund'}
                </button>
              )}
            </div>
          )}

          {/* Already claimed refund */}
          {status === 'finalized-failed' && refundClaimed && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
              <Check size={16} /> Refund already claimed
            </div>
          )}
        </>
      )}
    </div>
  );
}
