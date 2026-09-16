import { useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import {
  Play, Save, Copy, Check, ChevronDown,
  FileCode, AlertTriangle, AlertCircle, Info,
  Loader2, Package,
} from 'lucide-react';
import { ethers } from 'ethers';
import { useWalletContext } from '../../wallet/walletContext';
import { ARC_MAINNET_CHAIN_ID } from '../../launchpad-contract';
import { toast } from 'sonner';

// ── Starter templates ──────────────────────────────────────────────────────
const TEMPLATES: Record<string, { name: string; code: string }> = {
  erc20: {
    name: 'ERC-20 Token',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000 * 10 ** 18;

    constructor(address initialOwner)
        ERC20("My Token", "MTK")
        Ownable(initialOwner)
    {
        _mint(initialOwner, 100_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
}`,
  },
  nft: {
    name: 'ERC-721 NFT',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    uint256 public constant MINT_PRICE = 1e6; // 1 USDC (6 decimals)
    uint256 public constant MAX_SUPPLY = 10_000;

    constructor(address initialOwner)
        ERC721("My NFT", "MNFT")
        Ownable(initialOwner)
    {}

    function safeMint(address to) external payable {
        require(msg.value >= MINT_PRICE, "Insufficient payment");
        require(_nextTokenId < MAX_SUPPLY, "Max supply reached");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}`,
  },
  counter: {
    name: 'Simple Counter',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;
    address public owner;

    event Incremented(address indexed by, uint256 newCount);
    event Reset(address indexed by);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function increment() external {
        count += 1;
        emit Incremented(msg.sender, count);
    }

    function incrementBy(uint256 n) external {
        count += n;
        emit Incremented(msg.sender, count);
    }

    function reset() external onlyOwner {
        count = 0;
        emit Reset(msg.sender);
    }
}`,
  },
  escrow: {
    name: 'USDC Escrow',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Simple two-party USDC escrow on Arc
contract USDCEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    enum State { AWAITING_PAYMENT, COMPLETE, REFUNDED }

    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        State state;
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public nextId;

    event EscrowCreated(uint256 id, address payer, address payee, uint256 amount);
    event EscrowReleased(uint256 id);
    event EscrowRefunded(uint256 id);

    // Arc Testnet USDC
    constructor() {
        usdc = IERC20(0x3600000000000000000000000000000000000000);
    }

    function create(address payee, uint256 amount) external nonReentrant returns (uint256 id) {
        require(payee != address(0), "Zero payee");
        require(amount > 0, "Zero amount");
        id = nextId++;
        escrows[id] = Escrow(msg.sender, payee, amount, State.AWAITING_PAYMENT);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowCreated(id, msg.sender, payee, amount);
    }

    function release(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(msg.sender == e.payer, "Not payer");
        require(e.state == State.AWAITING_PAYMENT, "Not active");
        e.state = State.COMPLETE;
        usdc.safeTransfer(e.payee, e.amount);
        emit EscrowReleased(id);
    }

    function refund(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(msg.sender == e.payer, "Not payer");
        require(e.state == State.AWAITING_PAYMENT, "Not active");
        e.state = State.REFUNDED;
        usdc.safeTransfer(e.payer, e.amount);
        emit EscrowRefunded(id);
    }
}`,
  },
};

// ── Simulated compile result ───────────────────────────────────────────────
interface CompileError {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
}
interface CompileResult {
  success: boolean;
  errors: CompileError[];
  abi: object[];
  bytecode: string;
  contractName?: string;
}

function simulateCompile(code: string): CompileResult {
  const errors: CompileError[] = [];

  if (!code.trim()) {
    return { success: false, errors: [{ severity: 'error', message: 'Empty source file.' }], abi: [], bytecode: '0x' };
  }
  if (!code.includes('pragma solidity')) {
    errors.push({ severity: 'warning', message: 'No pragma directive found. Specify a compiler version.' });
  }
  if (!code.includes('SPDX-License-Identifier')) {
    errors.push({ severity: 'warning', message: 'SPDX-License-Identifier missing.' });
  }
  const contractMatch = code.match(/contract\s+(\w+)/);
  if (!contractMatch) {
    return { success: false, errors: [{ severity: 'error', message: 'No contract definition found.' }], abi: [], bytecode: '0x' };
  }
  const contractName = contractMatch[1];

  // Fake ABI & bytecode for demo
  const abi = [
    { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  ];
  const bytecode = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  errors.push({ severity: 'info', message: `Compiled ${contractName} successfully (simulated).` });
  return { success: true, errors, abi, bytecode, contractName };
}

// ── Main IDE Component ─────────────────────────────────────────────────────
function PwModal({ onConfirm, onCancel, loading, error }: {
  onConfirm: (pw: string) => void; onCancel: () => void; loading: boolean; error?: string;
}) {
  const [pw, setPw] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">Enter wallet password to deploy</p>
        <input type="password" autoFocus
          className="w-full px-4 py-3 rounded-2xl text-sm bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
          placeholder="Wallet password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(pw); }} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-sm text-[var(--subtle)] border border-[var(--border)]">Cancel</button>
          <button onClick={() => onConfirm(pw)} disabled={loading || !pw}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[var(--accent)] disabled:opacity-40 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}Deploy
          </button>
        </div>
      </div>
    </div>
  );
}

export function SolidityIDE() {
  const walletCtx = useWalletContext();
  const address = walletCtx?.activeWallet?.address;

  const [code, setCode] = useState(TEMPLATES.erc20.code);
  const [activeTemplate, setActiveTemplate] = useState('erc20');
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [activeTab, setActiveTab] = useState<'compile' | 'deploy' | 'abi'>('compile');
  const [constructorArgs, setConstructorArgs] = useState('');
  const [copied, setCopied] = useState<'bytecode' | 'abi' | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [deployedAddress, setDeployedAddress] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isDeployPending, setIsDeployPending] = useState(false);
  const [deployError, setDeployError] = useState('');

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleCompile = useCallback(() => {
    setIsCompiling(true);
    setCompileResult(null);
    // Simulate compile delay
    setTimeout(() => {
      const result = simulateCompile(code);
      setCompileResult(result);
      setIsCompiling(false);
      if (result.success) {
        setActiveTab('deploy');
        toast.success(`Compiled ${result.contractName}`);
      } else {
        toast.error('Compilation failed — see output panel');
      }
    }, 900);
  }, [code]);

  const handleCopy = (what: 'bytecode' | 'abi') => {
    const text = what === 'bytecode'
      ? (compileResult?.bytecode ?? '')
      : JSON.stringify(compileResult?.abi, null, 2);
    void navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleSave = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${compileResult?.contractName ?? 'contract'}.sol`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Contract saved');
  };

  const handleDeploy = () => {
    if (!compileResult?.success) { toast.error('Compile first'); return; }
    if (!address) { toast.error('Set up your wallet first'); return; }
    setDeployError('');
    setShowPw(true);
  };

  const doDeploy = async (password: string) => {
    if (!walletCtx || !compileResult) return;
    setIsDeployPending(true);
    setDeployError('');
    try {
      const { bytecode, abi } = compileResult;
      // Parse constructor args if provided
      const iface = new ethers.Interface(abi);
      const constructorFrag = iface.fragments.find(f => f.type === 'constructor');
      let encodedArgs = '';
      if (constructorArgs.trim() && constructorFrag) {
        const argValues = constructorArgs.split(',').map(a => a.trim());
        encodedArgs = ethers.AbiCoder.defaultAbiCoder()
          .encode(constructorFrag.inputs.map(i => i.type), argValues)
          .slice(2);
      }
      const deployBytecode = bytecode + encodedArgs;

      // Deploy via internal wallet
      const signer = await (await import('../../wallet/walletStore')).decryptWallet(walletCtx.activeWallet!, password);
      const { requireChain } = await import('../../onchain-facts');
      const chain = requireChain(ARC_MAINNET_CHAIN_ID);
      const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
      const connected = signer.connect(provider);
      const tx = await connected.sendTransaction({ data: deployBytecode });
      const receipt = await tx.wait();
      const addr = receipt?.contractAddress ?? '';
      setDeployedAddress(addr);
      setShowPw(false);
      toast.success(`Deployed at ${addr.slice(0, 10)}…`);
    } catch (e) {
      setDeployError((e as Error).message.slice(0, 120));
    } finally {
      setIsDeployPending(false);
    }
  };

  const severityIcon = (s: CompileError['severity']) => {
    if (s === 'error') return <AlertCircle size={13} className="text-[var(--danger)] shrink-0 mt-0.5" />;
    if (s === 'warning') return <AlertTriangle size={13} className="text-[var(--warning)] shrink-0 mt-0.5" />;
    return <Info size={13} className="text-[var(--accent)] shrink-0 mt-0.5" />;
  };

  return (
    <div className="flex flex-col h-full">
      {showPw && (
        <PwModal
          onConfirm={pw => { void doDeploy(pw); }}
          onCancel={() => { setShowPw(false); setDeployError(''); }}
          loading={isDeployPending}
          error={deployError}
        />
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-muted)] shrink-0">
        {/* Template picker */}
        <div className="relative">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
          >
            <FileCode size={13} />
            Templates
            <ChevronDown size={12} />
          </button>
          {showTemplates && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--surface-muted)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => {
                    setCode(t.code);
                    setActiveTemplate(key);
                    setCompileResult(null);
                    setShowTemplates(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs hover:bg-[var(--surface-hover)] transition-colors ${
                    activeTemplate === key ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
        >
          <Save size={13} />
          Save
        </button>

        <button
          onClick={handleCompile}
          disabled={isCompiling}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#070e1a] bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg px-4 py-1.5 transition-colors disabled:opacity-60"
        >
          {isCompiling ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {isCompiling ? 'Compiling…' : 'Compile'}
        </button>
      </div>

      {/* Editor + Panel split */}
      <div className="flex flex-1 min-h-0">
        {/* Monaco Editor */}
        <div className="flex-1 min-w-0">
          <Editor
            height="100%"
            defaultLanguage="sol"
            language="sol"
            value={code}
            onChange={v => setCode(v ?? '')}
            onMount={editor => { editorRef.current = editor; }}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', Menlo, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              padding: { top: 12 },
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 4,
              bracketPairColorization: { enabled: true },
              smoothScrolling: true,
            }}
          />
        </div>

        {/* Right panel */}
        <div className="w-80 shrink-0 border-l border-[var(--border)] flex flex-col bg-[var(--surface-muted)]">
          {/* Panel tabs */}
          <div className="flex border-b border-[var(--border)] shrink-0">
            {(['compile', 'deploy', 'abi'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--subtle)] hover:text-[var(--muted)]'
                }`}
              >
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-t" />
                )}
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Compile tab */}
            {activeTab === 'compile' && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--subtle)]">
                  Write Solidity and click Compile to check for errors. The editor supports full IntelliSense.
                </p>
                {!compileResult && !isCompiling && (
                  <button
                    onClick={handleCompile}
                    className="w-full rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] text-xs font-semibold py-2.5 hover:bg-[var(--accent)]/20 transition-colors"
                  >
                    Run Compiler
                  </button>
                )}
                {isCompiling && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <Loader2 size={13} className="animate-spin" /> Compiling…
                  </div>
                )}
                {compileResult && (
                  <div className="space-y-2">
                    <div className={`text-xs font-semibold flex items-center gap-1.5 ${
                      compileResult.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                    }`}>
                      {compileResult.success ? <Check size={13} /> : <AlertCircle size={13} />}
                      {compileResult.success ? `Compiled: ${compileResult.contractName}` : 'Compilation failed'}
                    </div>
                    {compileResult.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-[var(--muted)] bg-[var(--surface)] rounded-lg p-2.5">
                        {severityIcon(e.severity)}
                        <span className="leading-relaxed">{e.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Deploy tab */}
            {activeTab === 'deploy' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wide mb-2">Network</p>
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
                    <span className="w-2 h-2 rounded-full pulse-dot bg-[var(--success)]" />
                    <span className="text-[var(--muted)]">Arc Mainnet</span>
                    {address && (
                      <span className="ml-auto mono text-[var(--subtle)]">{address.slice(0,6)}…{address.slice(-4)}</span>
                    )}
                  </div>
                </div>

                {!compileResult?.success ? (
                  <div className="rounded-lg bg-[var(--surface)] p-3 text-xs text-[var(--subtle)]">
                    Compile successfully before deploying.
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wide mb-2">
                        Constructor Args
                      </p>
                      <input
                        value={constructorArgs}
                        onChange={e => setConstructorArgs(e.target.value)}
                        placeholder='e.g. "0xYourAddress"'
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] mono"
                      />
                      <p className="text-xs text-[var(--subtle)] mt-1">Comma-separated values</p>
                    </div>

                    {deployedAddress ? (
                      <div className="rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 p-3 space-y-1">
                        <p className="text-xs font-semibold text-[var(--success)]">Deployed on Arc Mainnet</p>
                        <p className="mono text-xs text-[var(--ink)] break-all">{deployedAddress}</p>
                        <a
                          href={`https://explorer.arc.io/address/${deployedAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          View on Arc Explorer ↗
                        </a>
                      </div>
                    ) : (
                      <>
                        {deployError && <p className="text-xs text-red-400">{deployError}</p>}
                        <button
                          onClick={handleDeploy}
                          disabled={!address || isDeployPending}
                          className="w-full rounded-lg bg-[var(--accent)] text-[#070e1a] text-xs font-semibold py-2.5 hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isDeployPending ? (
                            <><Loader2 size={13} className="animate-spin" /> Deploying…</>
                          ) : !address ? (
                            <><Package size={13} /> Set up wallet to deploy</>
                          ) : (
                            <><Package size={13} /> Deploy to Arc Mainnet</>
                          )}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ABI tab */}
            {activeTab === 'abi' && (
              <div className="space-y-3">
                {!compileResult?.abi ? (
                  <p className="text-xs text-[var(--subtle)]">Compile a contract to see its ABI.</p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy('abi')}
                        className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
                      >
                        {copied === 'abi' ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} />}
                        Copy ABI
                      </button>
                      <button
                        onClick={() => handleCopy('bytecode')}
                        className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
                      >
                        {copied === 'bytecode' ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} />}
                        Copy Bytecode
                      </button>
                    </div>
                    <pre className="text-xs text-[var(--muted)] bg-[var(--surface)] rounded-lg p-3 overflow-x-auto max-h-96 mono">
                      {JSON.stringify(compileResult.abi, null, 2)}
                    </pre>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
