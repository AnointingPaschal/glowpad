/**
 * ContractInteract — read/write any EVM contract using the built-in wallet.
 * No wagmi ConnectKit dependency — uses walletContext (ethers.js).
 */
import { useState } from 'react';
import { ethers } from 'ethers';
import { isAddress } from 'viem';
import { Play, Search, ChevronDown, ChevronRight, Loader2, Check, AlertTriangle } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID } from '../../launchpad-contract';
import { requireChain } from '@/onchain-facts';
import { useWalletContext } from '../../wallet/walletContext';
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

// ── PwModal ────────────────────────────────────────────────────────────────
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

// ── Single function row ────────────────────────────────────────────────────
function FunctionRow({
  fn,
  contractAddress,
  isWrite,
}: {
  fn: AbiFunction;
  contractAddress: string;
  isWrite: boolean;
}) {
  const walletCtx = useWalletContext();
  const [expanded, setExpanded] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [readResult, setReadResult] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');

  const chainId = walletCtx?.activeChainId ?? ARC_MAINNET_CHAIN_ID;
  const address = walletCtx?.activeWallet?.address;

  const handleRead = async () => {
    setIsReading(true);
    setReadResult(null);
    try {
      const chain = requireChain(chainId);
      const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
      const contract = new ethers.Contract(contractAddress, [fn], provider);
      const fnName = fn.name!;
      const argValues = (fn.inputs ?? []).map(inp => args[inp.name] ?? '');
      const result = await contract[fnName](...argValues) as unknown;
      setReadResult(JSON.stringify(result, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v as unknown, 2));
    } catch (e) {
      setReadResult(`Error: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      setIsReading(false);
    }
  };

  const handleWrite = () => {
    if (!address) { toast.error('Set up your Glowpad wallet first'); return; }
    setTxError('');
    setShowPw(true);
  };

  const doWrite = async (password: string) => {
    if (!walletCtx) return;
    setTxLoading(true);
    setTxError('');
    try {
      const argValues = (fn.inputs ?? []).map(inp => args[inp.name] ?? '');
      const hash = await walletCtx.callContract(
        contractAddress,
        [fn],
        fn.name!,
        argValues,
        password,
      );
      setTxHash(hash);
      setShowPw(false);
      toast.success('Tx submitted: ' + hash.slice(0, 10) + '…');
    } catch (e) {
      setTxError((e as Error).message.slice(0, 140));
    } finally {
      setTxLoading(false);
    }
  };

  const mutabilityColor: Record<string, string> = {
    view: 'text-[var(--accent)]',
    pure: 'text-[var(--accent)]',
    payable: 'text-[var(--warning)]',
    nonpayable: 'text-[var(--muted)]',
  };

  return (
    <>
      {showPw && (
        <PwModal
          title={`Sign ${fn.name ?? 'call'}`}
          onConfirm={pw => { void doWrite(pw); }}
          onCancel={() => { setShowPw(false); setTxError(''); }}
          loading={txLoading}
          error={txError}
        />
      )}
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
                  disabled={txLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/20 text-[var(--warning)] text-xs font-semibold px-4 py-2 hover:bg-[var(--warning)]/20 disabled:opacity-50 transition-colors"
                >
                  {txLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  transact
                </button>
                {txHash && (
                  <p className="text-xs text-[var(--success)] flex items-center gap-1"><Check size={12} /> {txHash.slice(0, 20)}…</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => { void handleRead(); }}
                  disabled={isReading}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] text-xs font-semibold px-4 py-2 hover:bg-[var(--accent)]/20 disabled:opacity-50 transition-colors"
                >
                  {isReading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  call
                </button>
                {readResult !== null && (
                  <div className="rounded-lg bg-[var(--surface)] px-3 py-2 mono text-xs text-[var(--ink)] break-all whitespace-pre-wrap">
                    {readResult}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main interact panel ────────────────────────────────────────────────────
export function ContractInteract() {
  const walletCtx = useWalletContext();
  const [contractAddr, setContractAddr] = useState('');
  const [abiRaw, setAbiRaw] = useState('');
  const [parsed, setParsed] = useState<AbiFunction[] | null>(null);
  const [abiError, setAbiError] = useState('');
  const [filter, setFilter] = useState('');
  const [activeSection, setActiveSection] = useState<'read' | 'write'>('read');

  const addrValid = isAddress(contractAddr);
  const hasWallet = !!walletCtx?.activeWallet;

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
        {!hasWallet && (
          <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-xl px-3 py-2 text-xs text-[var(--warning)] flex items-center gap-2">
            <AlertTriangle size={12} />
            Set up your Glowpad wallet (Wallet tab) to sign write transactions.
          </div>
        )}
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

      {parsed && (
        <div className="flex-1 min-h-0 flex flex-col">
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
                contractAddress={contractAddr}
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
            Enter a contract address and ABI above, then click Load Contract to interact with any deployed contract on Arc or EVM chains.
          </p>
        </div>
      )}
    </div>
  );
}
