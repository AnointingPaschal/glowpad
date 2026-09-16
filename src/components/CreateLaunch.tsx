import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi';
import { ArrowLeft, Check } from 'lucide-react';
import { LAUNCHPAD_ADDRESS, LAUNCHPAD_ABI, ARC_TESTNET_CHAIN_ID } from '../launchpad-contract';

interface CreateLaunchProps {
  onBack: () => void;
  onCreated: () => void;
}

export function CreateLaunch({ onBack, onCreated }: CreateLaunchProps) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [form, setForm] = useState({
    name: '',
    symbol: '',
    description: '',
    totalSupply: '',
    pricePerToken: '',
    softCap: '',
    hardCap: '',
    startOffsetHours: '1',
    durationHours: '24',
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return; }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const startTime = now + BigInt(Math.round(parseFloat(form.startOffsetHours) * 3600));
    const endTime = startTime + BigInt(Math.round(parseFloat(form.durationHours) * 3600));
    const totalSupply = BigInt(form.totalSupply) * 10n ** 18n;
    const pricePerToken = BigInt(Math.round(parseFloat(form.pricePerToken) * 1_000_000));
    const softCap = BigInt(Math.round(parseFloat(form.softCap) * 1_000_000));
    const hardCap = BigInt(Math.round(parseFloat(form.hardCap) * 1_000_000));

    writeContract({
      address: LAUNCHPAD_ADDRESS,
      abi: LAUNCHPAD_ABI,
      functionName: 'createLaunch',
      args: [
        form.name,
        form.symbol.toUpperCase(),
        form.description,
        totalSupply,
        pricePerToken,
        softCap,
        hardCap,
        startTime,
        endTime,
      ],
      chainId: ARC_TESTNET_CHAIN_ID,
    });
  };

  const inputClass =
    'w-full rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] px-4 py-3 text-[var(--ink)] placeholder-[var(--subtle)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors';
  const labelClass = 'block text-xs font-semibold text-[var(--subtle)] uppercase tracking-wide mb-1.5';

  if (isSuccess) {
    return (
      <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/5 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[var(--success)]/20 flex items-center justify-center mx-auto">
          <Check size={24} className="text-[var(--success)]" />
        </div>
        <div>
          <p className="display font-semibold text-xl text-[var(--ink)]">Launch created!</p>
          <p className="text-sm text-[var(--muted)] mt-1">Your token launch is live on Arc Testnet.</p>
        </div>
        <button
          onClick={() => { reset(); onCreated(); }}
          className="rounded-xl bg-[var(--accent)] text-[#0d1b2f] font-semibold px-6 py-3 hover:bg-[var(--accent-hover)] transition-colors"
        >
          View all launches
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[var(--subtle)] hover:text-[var(--ink)] transition-colors"
      >
        <ArrowLeft size={15} />
        Back
      </button>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="display font-semibold text-xl text-[var(--ink)] mb-5">Create a launch</h2>

        {!address ? (
          <p className="text-sm text-[var(--subtle)] text-center py-6">Connect your wallet to create a launch</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Token info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Token name</label>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={set('name')}
                  placeholder="My Token"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Symbol</label>
                <input
                  className={inputClass}
                  value={form.symbol}
                  onChange={set('symbol')}
                  placeholder="MTK"
                  maxLength={8}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={3}
                value={form.description}
                onChange={set('description')}
                placeholder="A short description of your project"
                required
              />
            </div>

            {/* Tokenomics */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Total supply</label>
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  value={form.totalSupply}
                  onChange={set('totalSupply')}
                  placeholder="1000000"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Price per token (USDC)</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={form.pricePerToken}
                  onChange={set('pricePerToken')}
                  placeholder="0.01"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Soft cap (USDC)</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={form.softCap}
                  onChange={set('softCap')}
                  placeholder="5000"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Hard cap (USDC)</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={form.hardCap}
                  onChange={set('hardCap')}
                  placeholder="10000"
                  required
                />
              </div>
            </div>

            {/* Timing */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Starts in (hours)</label>
                <input
                  className={inputClass}
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.startOffsetHours}
                  onChange={set('startOffsetHours')}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Duration (hours)</label>
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  step="1"
                  value={form.durationHours}
                  onChange={set('durationHours')}
                  required
                />
              </div>
            </div>

            {/* Fee notice */}
            <p className="text-xs text-[var(--subtle)]">
              A 2% platform fee is deducted from successful raises.
            </p>

            {isWrongChain ? (
              <button
                type="button"
                onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
                className="w-full rounded-xl bg-[var(--accent)] text-[#0d1b2f] font-semibold py-3 hover:bg-[var(--accent-hover)] transition-colors"
              >
                Switch to Arc Testnet
              </button>
            ) : (
              <button
                type="submit"
                disabled={isPending || isConfirming}
                className="w-full rounded-xl bg-[var(--accent)] text-[#0d1b2f] font-semibold py-3 disabled:opacity-50 hover:bg-[var(--accent-hover)] transition-colors"
              >
                {isPending ? 'Confirm in wallet…' : isConfirming ? 'Creating…' : 'Create Launch'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
