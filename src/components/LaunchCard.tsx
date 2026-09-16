import { useReadContract } from 'wagmi';
import {
  LAUNCHPAD_ADDRESS, LAUNCHPAD_ABI, ARC_MAINNET_CHAIN_ID,
  LaunchData, getLaunchStatus, formatUsdc, formatCountdown, progressPct, formatAddress,
} from '../launchpad-contract';

interface LaunchCardProps {
  launchId: number;
  onSelect: (id: number) => void;
}

const statusColors: Record<string, string> = {
  upcoming: 'text-[var(--accent)] bg-[var(--accent)]/10',
  active: 'text-[var(--success)] bg-[var(--success)]/10',
  ended: 'text-[var(--subtle)] bg-[var(--subtle)]/10',
  'finalized-success': 'text-[var(--success)] bg-[var(--success)]/10',
  'finalized-failed': 'text-[var(--danger)] bg-[var(--danger)]/10',
};

const statusLabels: Record<string, string> = {
  upcoming: 'Upcoming',
  active: 'Live',
  ended: 'Ended',
  'finalized-success': 'Success',
  'finalized-failed': 'Failed',
};

export function LaunchCard({ launchId, onSelect }: LaunchCardProps) {
  const { data: launch } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'launches',
    args: [BigInt(launchId)],
    chainId: ARC_MAINNET_CHAIN_ID,
  }) as { data: LaunchData | undefined };

  if (!launch) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 animate-pulse h-44" />
    );
  }

  const status = getLaunchStatus(launch);
  const pct = progressPct(launch.raised, launch.hardCap);

  return (
    <button
      onClick={() => onSelect(launchId)}
      className="w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-strong)] hover:border-[var(--border-strong)] transition-all duration-200 p-5 group focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="display font-semibold text-[var(--ink)] truncate text-lg leading-tight">{launch.name}</p>
          <p className="text-sm text-[var(--subtle)] font-medium mt-0.5 mono">{launch.symbol}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--muted)] line-clamp-2 mb-4 min-h-[2.5rem]">{launch.description}</p>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[var(--subtle)] mb-1.5">
          <span className="tabular-nums">${formatUsdc(launch.raised)} raised</span>
          <span className="tabular-nums">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-[var(--surface-muted)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: status === 'finalized-failed' ? 'var(--danger)' : 'var(--accent)',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-[var(--subtle)]">
        <span className="mono">{formatAddress(launch.creator)}</span>
        {(status === 'active' || status === 'upcoming') && (
          <span>{formatCountdown(status === 'active' ? launch.endTime : launch.startTime)}</span>
        )}
        {status === 'finalized-success' && (
          <span className="text-[var(--success)]">Tokens claimable</span>
        )}
        {status === 'finalized-failed' && (
          <span className="text-[var(--danger)]">Refunds available</span>
        )}
      </div>
    </button>
  );
}
