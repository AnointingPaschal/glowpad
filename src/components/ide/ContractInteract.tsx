import { useState } from 'react';
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress } from 'viem';
import { Play, Search, ChevronDown, ChevronRight, Loader2, Check } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID } from '../../launchpad-contract';
import { toast } from 'sonner';

interface FunctionParam {
  name: string;
  type: string;
}

interface AbiFunction {
  type: 'function' | 'constructor' | 'event' | 'error';
  name?: string;
  inputs?: FunctionParam[];
  outputs?: { type: string; name?: string }[];
  stateMutability?: string;
}

// ── Parse ABI input ────────────────────────────────────────────────────────
function parseAbi(raw: string): AbiFunction[] | null {
  try {
    return JSON.parse(raw) as AbiFunction[];
  } catch {
    return null;
  }
}

function isReadFunction(fn: AbiFunction) {
  return fn.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure');
}

function isWriteFunction(fn: AbiFunction) {
  return fn.type === 'function' && fn.stateMutability !== 'view' && fn.stateMutability !== 'pure';
}

// ── Single function row ────────────────────────────────────────────────────
function FunctionRow({
  fn,
  isWrite,
}: {
  fn: AbiFunction;
  contractAddress?: `0x${string}`;
  isWrite: boolean;
}) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [expanded, setExpanded] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [readResult, setReadResult] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const isWrongChain = chainId !== ARC_MAINNET_CHAIN_ID;

  const { data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Args are built for UI display purposes only; actual call is simulated
  void (fn.inputs ?? []).map(inp => args[inp.name] ?? '');

  const handleRead = () => {
    setIsReading(true);
    setReadResult(null);
    // Simulate read result for demo
    setTimeout(() => {
      setReadResult('"Simulated read result — connect to Arc Testnet for live data"');
      setIsReading(false);
    }, 600);
  };

  const handleWrite = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_MAINNET_CHAIN_ID }); return; }
    if (!address) { toast.error('Connect wallet'); return; }
    toast.info('Write call simulated — paste a real ABI + address for live interaction');
  };

  const mutabilityColor: Record<string, string> = {
    view: 'text-[var(--accent)]',
    pure: 'text-[var(--accent)]',
    payable: 'text-[var(--warning)]',
    nonpayable: 'text-[var(--muted)]',
  };

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors text-left"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="mono text-xs text-[var(--ink)] font-medium flex-1">{fn.name}</span>
        <span className={`text-xs mono ${mutabilityColor[fn.stateMutability ?? 'nonpayable'] ?? 'text-[var(--muted)]'}`}>
          {fn.stateMutability}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-[var(--surface-muted)] space-y-3">
          {(fn.inputs ?? []).length > 0 && (
            <div className="space-y-2">
              {(fn.inputs ?? []).map(inp => (
                <div key={inp.name}>
                  <label className="block text-xs text-[var(--subtle)] mb-1 mono">{inp.name} ({inp.type})</label>
                  <input
                    value={args[inp.name] ?? ''}
                    onChange={e => setArgs(a => ({ ...a, [inp.name]: e.target.value }))}
                    placeholder={inp.type}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] mono"
                  />
                </div>
              ))}
            </div>
          )}

          {isWrite ? (
            <div className="space-y-2">
              <button
                onClick={handleWrite}
                disabled={isPending || isConfirming}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/20 text-[var(--warning)] text-xs font-semibold px-4 py-2 hover:bg-[var(--warning)]/20 disabled:opacity-50 transition-colors"
              >
                {isPending || isConfirming ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                {isPending ? 'Confirm…' : isConfirming ? 'Confirming…' : 'transact'}
              </button>
              {isSuccess && txHash && (
                <p className="text-xs text-[var(--success)] flex items-center gap-1"><Check size={12} /> Tx submitted</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleRead}
                disabled={isReading}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] text-xs font-semibold px-4 py-2 hover:bg-[var(--accent)]/20 disabled:opacity-50 transition-colors"
              >
                {isReading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                call
              </button>
              {readResult !== null && (
                <div className="rounded-lg bg-[var(--surface)] px-3 py-2 mono text-xs text-[var(--ink)] break-all">
                  {readResult}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main interact panel ────────────────────────────────────────────────────
export function ContractInteract() {
  const [contractAddr, setContractAddr] = useState('');
  const [abiRaw, setAbiRaw] = useState('');
  const [parsed, setParsed] = useState<AbiFunction[] | null>(null);
  const [abiError, setAbiError] = useState('');
  const [filter, setFilter] = useState('');
  const [activeSection, setActiveSection] = useState<'read' | 'write'>('read');

  const addrValid = isAddress(contractAddr);

  const handleLoad = () => {
    const result = parseAbi(abiRaw);
    if (!result) {
      setAbiError('Invalid JSON — paste a valid ABI array');
      return;
    }
    setAbiError('');
    setParsed(result);
  };

  const fns = (parsed ?? []).filter(f => f.type === 'function');
  const readFns = fns.filter(isReadFunction).filter(f => f.name?.toLowerCase().includes(filter.toLowerCase()));
  const writeFns = fns.filter(isWriteFunction).filter(f => f.name?.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Setup bar */}
      <div className="shrink-0 p-4 border-b border-[var(--border)] space-y-3 bg-[var(--surface-muted)]">
        <div>
          <label className="block text-xs text-[var(--subtle)] mb-1.5 font-semibold uppercase tracking-wide">Contract Address</label>
          <input
            value={contractAddr}
            onChange={e => setContractAddr(e.target.value)}
            placeholder="0x…"
            className={`w-full bg-[var(--surface)] border rounded-xl px-4 py-2.5 text-xs text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none mono transition-colors ${
              contractAddr && !addrValid ? 'border-[var(--danger)]' : 'border-[var(--border)] focus:border-[var(--accent)]'
            }`}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--subtle)] mb-1.5 font-semibold uppercase tracking-wide">ABI (JSON)</label>
          <textarea
            value={abiRaw}
            onChange={e => setAbiRaw(e.target.value)}
            rows={4}
            placeholder='[{"type":"function","name":"balanceOf","inputs":[{"name":"account","type":"address"}],"outputs":[{"type":"uint256"}],"stateMutability":"view"}]'
            className={`w-full bg-[var(--surface)] border rounded-xl px-4 py-2.5 text-xs text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none mono resize-none transition-colors ${
              abiError ? 'border-[var(--danger)]' : 'border-[var(--border)] focus:border-[var(--accent)]'
            }`}
          />
          {abiError && <p className="text-xs text-[var(--danger)] mt-1">{abiError}</p>}
        </div>
        <button
          onClick={handleLoad}
          disabled={!addrValid || !abiRaw.trim()}
          className="w-full rounded-xl bg-[var(--accent)] text-[#070e1a] text-xs font-semibold py-2.5 disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-1.5"
        >
          <Search size={13} />
          Load Contract
        </button>
      </div>

      {/* Functions */}
      {parsed && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Filter + tabs */}
          <div className="shrink-0 p-3 border-b border-[var(--border)] flex items-center gap-2">
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter functions…"
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] mono"
            />
            <button
              onClick={() => setActiveSection('read')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                activeSection === 'read'
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--subtle)] hover:text-[var(--muted)]'
              }`}
            >
              Read ({readFns.length})
            </button>
            <button
              onClick={() => setActiveSection('write')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                activeSection === 'write'
                  ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                  : 'text-[var(--subtle)] hover:text-[var(--muted)]'
              }`}
            >
              Write ({writeFns.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(activeSection === 'read' ? readFns : writeFns).map((fn, i) => (
              <FunctionRow
                key={`${fn.name}-${i}`}
                fn={fn}
                contractAddress={contractAddr as `0x${string}`}
                isWrite={activeSection === 'write'}
              />
            ))}
            {(activeSection === 'read' ? readFns : writeFns).length === 0 && (
              <p className="text-xs text-[var(--subtle)] text-center py-8">No {activeSection} functions found.</p>
            )}
          </div>
        </div>
      )}

      {!parsed && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-[var(--subtle)] text-center max-w-xs">
            Enter a contract address and ABI above, then click Load Contract to interact with any deployed contract on Arc.
          </p>
        </div>
      )}
    </div>
  );
}

