import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { Rocket, Plus, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { TokenUSDC } from '@web3icons/react';
import { LAUNCHPAD_ADDRESS, LAUNCHPAD_ABI, ARC_MAINNET_CHAIN_ID, formatUsdc } from '../../launchpad-contract';
import { LaunchCard } from '../LaunchCard';
import { LaunchDetail } from '../LaunchDetail';
import { CreateLaunch } from '../CreateLaunch';

type SubView = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'create' };

export function LaunchpadHome() {
  const [view, setView] = useState<SubView>({ kind: 'list' });

  const { data: launchCount, refetch: refetchCount } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'getLaunchCount',
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { refetchInterval: 12_000 },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: accFees } = useReadContract({
    address: LAUNCHPAD_ADDRESS,
    abi: LAUNCHPAD_ABI,
    functionName: 'accumulatedFees',
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { refetchInterval: 30_000 },
  }) as { data: bigint | undefined };

  const count = Number(launchCount ?? 0n);
  const launchIds = Array.from({ length: count }, (_, i) => i).reverse();

  if (view.kind === 'detail') {
    return (
      <LaunchDetail
        launchId={view.id}
        onBack={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'create') {
    return (
      <CreateLaunch
        onBack={() => setView({ kind: 'list' })}
        onCreated={() => { refetchCount(); setView({ kind: 'list' }); }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Hero */}
        <div
          className="rounded-2xl p-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0d1b2f 0%, #0f2547 60%, #0d1b2f 100%)',
            border: '1px solid rgba(78,159,245,0.2)',
          }}
        >
          {/* Glow blob */}
          <div
            className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, #4e9ff5, transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/25 flex items-center justify-center">
                <Rocket size={16} className="text-[var(--accent)]" />
              </div>
              <span className="display font-bold text-xl text-[var(--ink)]">Glowpad</span>
              <span className="text-xs text-[var(--subtle)] bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 rounded-full flex items-center gap-1">
                <TokenUSDC variant="branded" size={11} />
                Arc Testnet
              </span>
            </div>
            <h1 className="display font-bold text-2xl text-[var(--ink)] mb-2 text-balance leading-tight">
              Launch tokens with<br />
              <span className="gradient-text">USDC on Arc</span>
            </h1>
            <p className="text-sm text-[var(--muted)] mb-5 max-w-md text-pretty">
              Create fixed-price token sales, contribute USDC to projects you believe in, and claim tokens — all with sub-second finality and stable gas fees.
            </p>
            <button
              onClick={() => setView({ kind: 'create' })}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent)] text-[#070e1a] font-semibold px-5 py-2.5 hover:bg-[var(--accent-hover)] transition-colors text-sm"
            >
              <Plus size={15} />
              Create a launch
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Activity, label: 'Total launches', value: count.toString(), color: 'text-[var(--accent)]' },
            { icon: DollarSign, label: 'Platform fees earned', value: `$${formatUsdc(accFees ?? 0n)}`, color: 'text-[var(--success)]' },
            { icon: TrendingUp, label: 'Contract', value: 'Deployed', color: 'text-[var(--muted)]' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="glass rounded-xl px-4 py-3">
              <Icon size={14} className={`${color} mb-2`} />
              <p className="text-xs text-[var(--subtle)] mb-0.5">{label}</p>
              <p className={`display font-semibold text-sm tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Launches */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="display font-semibold text-sm text-[var(--ink)]">
              {count > 0 ? `${count} launch${count === 1 ? '' : 'es'}` : 'No launches yet'}
            </h2>
            {count > 0 && (
              <button
                onClick={() => setView({ kind: 'create' })}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 transition-colors"
              >
                <Plus size={12} />
                New
              </button>
            )}
          </div>

          {count === 0 ? (
            <div className="glass rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/15 flex items-center justify-center mx-auto">
                <Rocket size={24} className="text-[var(--accent)]" />
              </div>
              <p className="text-sm text-[var(--muted)]">Be the first to launch a token on Arc.</p>
              <button
                onClick={() => setView({ kind: 'create' })}
                className="rounded-xl border border-[var(--border-strong)] text-[var(--ink)] text-xs font-medium px-5 py-2 hover:bg-[var(--surface-strong)] transition-colors"
              >
                Create the first launch
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {launchIds.map(id => (
                <LaunchCard
                  key={id}
                  launchId={id}
                  onSelect={id => setView({ kind: 'detail', id })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
