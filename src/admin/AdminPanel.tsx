/**
 * Admin Panel — site info, contracts, token deployments, fees, and settings.
 * Password-gated for local protection.
 */
import { useState, useRef } from 'react';
import {
  ShieldAlert, Settings, Code2, Coins, DollarSign, Lock,
  Plus, Trash2, Eye, EyeOff, Check, AlertTriangle, Upload,
  ExternalLink, ToggleLeft, ToggleRight, ChevronDown, Save,
  X, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminStore, saveSiteInfo, addContract, updateContract, removeContract,
  addTokenDeployment, saveTokenDeployments, savePlatformFees,
  verifyAdminPassword, hashPassword,
  type SiteInfo, type ContractEntry, type TokenDeployment, type PlatformFee,
} from './adminStore';
import { ONCHAIN_CHAINS } from '@/onchain-facts';

type AdminTab = 'site' | 'contracts' | 'tokens' | 'fees' | 'security';

const CHAIN_OPTIONS = ONCHAIN_CHAINS.filter(c => !c.isTestnet).slice(0, 8);

const CONTRACT_TYPES: ContractEntry['type'][] = ['launchpad', 'token', 'staking', 'vesting', 'factory', 'other'];

// ── Auth gate ──────────────────────────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true); setError('');
    try {
      const ok = await verifyAdminPassword(pw);
      if (!ok) { setError('Incorrect password'); return; }
      onAuth();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 bg-[var(--bg)]">
      <div className="w-full max-w-xs">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-4">
            <ShieldAlert size={24} className="text-[var(--accent)]" />
          </div>
          <h1 className="display text-xl font-bold text-[var(--ink)]">Admin Panel</h1>
          <p className="text-xs text-[var(--subtle)] mt-1">Enter your admin password to continue</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              placeholder="Admin password (blank if not set)"
              value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handle(); }}
              autoFocus
            />
            <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
          <button
            onClick={() => { void handle(); }}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            <Lock size={14} /> Enter Admin
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Site Info tab ──────────────────────────────────────────────────────────────
function SiteInfoTab() {
  const [info, setInfo] = useState<SiteInfo>(() => getAdminStore().siteInfo);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setInfo(i => ({ ...i, logoUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    saveSiteInfo(info);
    await new Promise(r => setTimeout(r, 300));
    setSaving(false);
    toast.success('Site info saved');
  };

  const field = (label: string, key: keyof SiteInfo, placeholder?: string) => (
    <div>
      <label className="text-xs text-[var(--subtle)] mb-1.5 block">{label}</label>
      <input
        className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
        placeholder={placeholder ?? label}
        value={info[key]}
        onChange={e => setInfo(i => ({ ...i, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-4 overflow-y-auto h-full">
      {/* Logo uploader */}
      <div>
        <label className="text-xs text-[var(--subtle)] mb-2 block">Site Logo</label>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--accent)]/40 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {info.logoUrl ? (
              <img src={info.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <Upload size={20} className="text-[var(--subtle)]" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs font-medium text-[var(--accent)] hover:opacity-80 flex items-center gap-1"
            >
              <Upload size={12} /> Upload Logo
            </button>
            {info.logoUrl && (
              <button onClick={() => setInfo(i => ({ ...i, logoUrl: '' }))} className="text-xs text-[var(--subtle)] hover:text-[var(--danger)]">Remove</button>
            )}
            <p className="text-[10px] text-[var(--subtle)]">PNG/SVG, max 512KB</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
      </div>

      {field('Site Name', 'siteName', 'Glowpad')}
      {field('Tagline', 'tagline', 'Launch. Trade. Build.')}
      <div>
        <label className="text-xs text-[var(--subtle)] mb-1.5 block">Description</label>
        <textarea
          className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none"
          rows={3}
          placeholder="Site description"
          value={info.description}
          onChange={e => setInfo(i => ({ ...i, description: e.target.value }))}
        />
      </div>

      <div>
        <label className="text-xs text-[var(--subtle)] mb-1.5 block">Brand Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] cursor-pointer p-0.5"
            value={info.primaryColor}
            onChange={e => setInfo(i => ({ ...i, primaryColor: e.target.value }))}
          />
          <input
            className="flex-1 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm font-mono text-[var(--ink)] focus:outline-none"
            value={info.primaryColor}
            onChange={e => setInfo(i => ({ ...i, primaryColor: e.target.value }))}
            placeholder="#4e9ff5"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field('Twitter / X', 'twitterUrl', 'https://x.com/...')}
        {field('Discord', 'discordUrl', 'https://discord.gg/...')}
        {field('Website URL', 'websiteUrl', 'https://glowpad.io')}
      </div>

      <button
        onClick={() => { void save(); }}
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Save Site Info
      </button>
    </div>
  );
}

// ── Contracts tab ──────────────────────────────────────────────────────────────
function ContractsTab() {
  const [contracts, setContracts] = useState<ContractEntry[]>(() => getAdminStore().contracts);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ContractEntry>>({
    name: '', address: '', chainId: 5042, type: 'launchpad', verified: false, notes: '', txHash: '',
  });

  const refresh = () => setContracts(getAdminStore().contracts);

  const saveNew = () => {
    if (!form.name || !form.address) return;
    const entry: ContractEntry = {
      id: crypto.randomUUID(),
      name: form.name,
      address: form.address,
      chainId: form.chainId ?? 5042,
      type: form.type ?? 'other',
      deployedAt: +new Date(), // oxlint-disable-line react/purity
      verified: form.verified ?? false,
      notes: form.notes,
      txHash: form.txHash,
    };
    addContract(entry);
    refresh();
    setAdding(false);
    setForm({ name: '', address: '', chainId: 5042, type: 'launchpad', verified: false });
    toast.success(`${entry.name} added`);
  };

  const saveEdit = (id: string) => {
    updateContract(id, form);
    refresh();
    setEditing(null);
    toast.success('Contract updated');
  };

  const remove = (id: string) => {
    if (!confirm('Remove this contract?')) return;
    removeContract(id);
    refresh();
  };

  const startEdit = (c: ContractEntry) => {
    setForm({ ...c });
    setEditing(c.id);
  };

  const chain = (id: number) => CHAIN_OPTIONS.find(c => c.chainId === id)?.name ?? `Chain ${id}`;

  // Inline form shared between add and edit
  const renderForm = (isNew: boolean) => (
    <div className="space-y-3 bg-[var(--surface)] border border-[var(--accent)]/30 rounded-2xl p-4 mt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--subtle)] mb-1 block">Name</label>
          <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Contract name" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-[var(--subtle)] mb-1 block">Type</label>
          <div className="relative">
            <select className="w-full appearance-none bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] focus:outline-none capitalize" value={form.type ?? 'other'} onChange={e => setForm(f => ({ ...f, type: e.target.value as ContractEntry['type'] }))}>
              {CONTRACT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] pointer-events-none" />
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--subtle)] mb-1 block">Contract Address</label>
        <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="0x..." value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--subtle)] mb-1 block">Chain</label>
          <div className="relative">
            <select className="w-full appearance-none bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] focus:outline-none" value={form.chainId ?? 5042} onChange={e => setForm(f => ({ ...f, chainId: Number(e.target.value) }))}>
              {CHAIN_OPTIONS.map(c => <option key={c.chainId} value={c.chainId}>{c.name}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--subtle)] mb-1 block">Deploy Tx (optional)</label>
          <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="0x..." value={form.txHash ?? ''} onChange={e => setForm(f => ({ ...f, txHash: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--subtle)] mb-1 block">Notes</label>
        <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Optional notes" value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setForm(f => ({ ...f, verified: !f.verified }))} className={`text-xs font-medium flex items-center gap-1.5 ${form.verified ? 'text-[var(--success)]' : 'text-[var(--subtle)]'}`}>
          {form.verified ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} Source Verified
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { if (isNew) { setAdding(false); } else { setEditing(null); } }} className="flex-1 py-2 rounded-xl text-xs border border-[var(--border)] text-[var(--subtle)] hover:bg-[var(--surface-hover)]">Cancel</button>
        <button onClick={() => { if (isNew) { saveNew(); } else { saveEdit(editing!); } }} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90">{isNew ? 'Add Contract' : 'Save Changes'}</button>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider">Contracts ({contracts.length})</p>
        <button onClick={() => { setAdding(v => !v); setEditing(null); setForm({ name: '', address: '', chainId: 5042, type: 'launchpad', verified: false }); }} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80">
          {adding ? <X size={12} /> : <><Plus size={12} /> Add</>}
        </button>
      </div>

      {adding && renderForm(true)}

      {contracts.map(c => (
        <div key={c.id}>
          <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2 ${editing === c.id ? 'border-[var(--accent)]/40' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--ink)]">{c.name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${
                    c.type === 'launchpad' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' :
                    c.type === 'token' ? 'bg-[var(--success)]/15 text-[var(--success)]' :
                    'bg-[var(--surface-muted)] text-[var(--subtle)]'
                  }`}>{c.type}</span>
                  {c.verified && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--success)]/10 text-[var(--success)] flex items-center gap-0.5"><Check size={9} /> Verified</span>}
                </div>
                <p className="text-[10px] font-mono text-[var(--subtle)] mt-0.5 truncate">{c.address}</p>
                <p className="text-[10px] text-[var(--subtle)]">{chain(c.chainId)} · {new Date(c.deployedAt).toLocaleDateString()}</p>
                {c.notes && <p className="text-[10px] text-[var(--muted)] mt-1 italic">{c.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`https://explorer.arc.io/address/${c.address}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-[var(--subtle)] hover:text-[var(--accent)] rounded-lg hover:bg-[var(--surface-hover)]">
                  <ExternalLink size={12} />
                </a>
                <button onClick={() => startEdit(c)} className="p-1.5 text-[var(--subtle)] hover:text-[var(--ink)] rounded-lg hover:bg-[var(--surface-hover)]">
                  <Settings size={12} />
                </button>
                <button onClick={() => remove(c.id)} className="p-1.5 text-[var(--subtle)] hover:text-[var(--danger)] rounded-lg hover:bg-[var(--danger)]/10">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
          {editing === c.id && renderForm(false)}
        </div>
      ))}

      {contracts.length === 0 && !adding && (
        <p className="text-center text-xs text-[var(--subtle)] py-8">No contracts added. Click Add to start.</p>
      )}
    </div>
  );
}

// ── Tokens tab ─────────────────────────────────────────────────────────────────
function TokensTab() {
  const [tokens, setTokens] = useState<TokenDeployment[]>(() => getAdminStore().tokenDeployments);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<TokenDeployment>>({
    name: '', symbol: '', address: '', decimals: 18, totalSupply: '', creator: '', chainId: 5042,
  });

  const refresh = () => setTokens(getAdminStore().tokenDeployments);

  const save = () => {
    if (!form.name || !form.symbol || !form.address) return;
    const entry: TokenDeployment = {
      id: crypto.randomUUID(),
      name: form.name,
      symbol: form.symbol,
      address: form.address,
      chainId: form.chainId ?? 5042,
      decimals: form.decimals ?? 18,
      totalSupply: form.totalSupply ?? '0',
      creator: form.creator ?? '',
      deployedAt: +new Date(), // oxlint-disable-line react/purity
      txHash: form.txHash,
      logoUrl: form.logoUrl,
    };
    addTokenDeployment(entry);
    refresh();
    setAdding(false);
    setForm({ name: '', symbol: '', address: '', decimals: 18, totalSupply: '', creator: '', chainId: 5042 });
    toast.success(`${entry.symbol} registered`);
  };

  const remove = (id: string) => {
    if (!confirm('Remove token record?')) return;
    const updated = tokens.filter(t => t.id !== id);
    saveTokenDeployments(updated);
    setTokens(updated);
  };

  return (
    <div className="px-4 py-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider">Token Deployments ({tokens.length})</p>
        <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80">
          {adding ? <X size={12} /> : <><Plus size={12} /> Add</>}
        </button>
      </div>

      {adding && (
        <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Token Name</label>
              <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="My Token" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Symbol</label>
              <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="MTK" value={form.symbol ?? ''} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--subtle)] mb-1 block">Contract Address</label>
            <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="0x..." value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Total Supply</label>
              <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="1000000" value={form.totalSupply ?? ''} onChange={e => setForm(f => ({ ...f, totalSupply: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Decimals</label>
              <input type="number" className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] focus:outline-none" value={form.decimals ?? 18} onChange={e => setForm(f => ({ ...f, decimals: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--subtle)] mb-1 block">Creator Address</label>
            <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="0x..." value={form.creator ?? ''} onChange={e => setForm(f => ({ ...f, creator: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-[var(--subtle)] mb-1 block">Chain</label>
            <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] focus:outline-none" value={form.chainId ?? 5042} onChange={e => setForm(f => ({ ...f, chainId: Number(e.target.value) }))}>
              {CHAIN_OPTIONS.map(c => <option key={c.chainId} value={c.chainId}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-xl text-xs border border-[var(--border)] text-[var(--subtle)] hover:bg-[var(--surface-hover)]">Cancel</button>
            <button onClick={save} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90">Register Token</button>
          </div>
        </div>
      )}

      {tokens.map(t => (
        <div key={t.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--ink)]">{t.name}</span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">{t.symbol}</span>
              </div>
              <p className="text-[10px] font-mono text-[var(--subtle)] mt-0.5 truncate">{t.address}</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[10px] text-[var(--subtle)]">Supply: {Number(t.totalSupply).toLocaleString()}</span>
                <span className="text-[10px] text-[var(--subtle)]">Dec: {t.decimals}</span>
                <span className="text-[10px] text-[var(--subtle)]">{CHAIN_OPTIONS.find(c => c.chainId === t.chainId)?.name ?? t.chainId}</span>
              </div>
              {t.creator && <p className="text-[10px] font-mono text-[var(--subtle)] mt-0.5 truncate">Creator: {t.creator}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a href={`https://explorer.arc.io/address/${t.address}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-[var(--subtle)] hover:text-[var(--accent)] rounded-lg hover:bg-[var(--surface-hover)]">
                <ExternalLink size={12} />
              </a>
              <button onClick={() => remove(t.id)} className="p-1.5 text-[var(--subtle)] hover:text-[var(--danger)] rounded-lg hover:bg-[var(--danger)]/10">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {tokens.length === 0 && !adding && (
        <p className="text-center text-xs text-[var(--subtle)] py-8">No token deployments recorded.</p>
      )}
    </div>
  );
}

// ── Fees tab ───────────────────────────────────────────────────────────────────
function FeesTab() {
  const [fees, setFees] = useState<PlatformFee[]>(() => getAdminStore().platformFees);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<PlatformFee>>({
    name: '', description: '', type: 'flat', value: '0', chainId: 5042, enabled: true,
  });

  const save = () => {
    if (!form.name || !form.value) return;
    const entry: PlatformFee = {
      id: crypto.randomUUID(),
      name: form.name,
      description: form.description ?? '',
      type: form.type ?? 'flat',
      value: form.value,
      chainId: form.chainId ?? 5042,
      enabled: form.enabled ?? true,
    };
    const updated = [...fees, entry];
    setFees(updated);
    savePlatformFees(updated);
    setAdding(false);
    setForm({ name: '', description: '', type: 'flat', value: '0', chainId: 5042, enabled: true });
    toast.success('Fee added');
  };

  const toggle = (id: string) => {
    const updated = fees.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f);
    setFees(updated);
    savePlatformFees(updated);
  };

  const updateValue = (id: string, value: string) => {
    const updated = fees.map(f => f.id === id ? { ...f, value } : f);
    setFees(updated);
    savePlatformFees(updated);
    toast.success('Fee updated');
  };

  const remove = (id: string) => {
    const updated = fees.filter(f => f.id !== id);
    setFees(updated);
    savePlatformFees(updated);
  };

  return (
    <div className="px-4 py-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider">Platform Fees ({fees.length})</p>
        <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80">
          {adding ? <X size={12} /> : <><Plus size={12} /> Add</>}
        </button>
      </div>

      {adding && (
        <div className="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-2xl p-4 space-y-3">
          <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Fee name (e.g. Creation Fee)" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Description" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">Type</label>
              <select className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] focus:outline-none" value={form.type ?? 'flat'} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'flat' | 'percent' }))}>
                <option value="flat">Flat USDC</option>
                <option value="percent">Percent (bps)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--subtle)] mb-1 block">{form.type === 'percent' ? 'Basis Points' : 'USDC Amount'}</label>
              <input type="number" className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--ink)] focus:outline-none" placeholder={form.type === 'percent' ? '200' : '100'} value={form.value ?? ''} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-xl text-xs border border-[var(--border)] text-[var(--subtle)] hover:bg-[var(--surface-hover)]">Cancel</button>
            <button onClick={save} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90">Add Fee</button>
          </div>
        </div>
      )}

      {fees.map(fee => (
        <div key={fee.id} className={`bg-[var(--surface)] border rounded-2xl p-4 transition-opacity ${fee.enabled ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--ink)]">{fee.name}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${fee.enabled ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--surface-muted)] text-[var(--subtle)]'}`}>
                  {fee.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-[10px] text-[var(--subtle)] mt-0.5">{fee.description}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggle(fee.id)} className="p-1.5 text-[var(--subtle)] hover:text-[var(--ink)] rounded-lg hover:bg-[var(--surface-hover)]">
                {fee.enabled ? <ToggleRight size={16} className="text-[var(--success)]" /> : <ToggleLeft size={16} />}
              </button>
              <button onClick={() => remove(fee.id)} className="p-1.5 text-[var(--subtle)] hover:text-[var(--danger)] rounded-lg hover:bg-[var(--danger)]/10">
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-2 py-1">
              <input
                type="number"
                className="w-20 bg-transparent text-sm tabular-nums text-[var(--ink)] focus:outline-none"
                value={fee.value}
                onChange={e => updateValue(fee.id, e.target.value)}
              />
              <span className="text-[10px] text-[var(--subtle)]">{fee.type === 'percent' ? 'bps' : 'USDC'}</span>
            </div>
            {fee.type === 'percent' && (
              <span className="text-[10px] text-[var(--subtle)]">= {(Number(fee.value) / 100).toFixed(2)}%</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Security tab ───────────────────────────────────────────────────────────────
function SecurityTab({ onLogout }: { onLogout: () => void }) {
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changePw = async () => {
    if (newPw.length < 6) { setError('Min 6 characters'); return; }
    if (newPw !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true); setError('');
    try {
      const hash = await hashPassword(newPw);
      const store = getAdminStore();
      saveSiteInfo({ ...store.siteInfo, adminPassword: hash });
      toast.success('Admin password updated');
      setNewPw(''); setConfirm('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-5 overflow-y-auto h-full">
      <div>
        <p className="text-xs font-semibold text-[var(--subtle)] uppercase tracking-wider mb-3">Change Admin Password</p>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <div className="relative">
            <input type={show ? 'text' : 'password'} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="New password (min 6)" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]">{show ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          </div>
          <input type={show ? 'text' : 'password'} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {error && <p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
          <button onClick={() => { void changePw(); }} disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} /> Update Password
          </button>
        </div>
      </div>

      <div className="bg-[var(--warning)]/8 border border-[var(--warning)]/20 rounded-2xl p-4 text-xs text-[var(--warning)] space-y-1">
        <p className="font-semibold">Admin access is client-side only</p>
        <p>This password is stored as a SHA-256 hash in your browser. It is not a substitute for proper server-side auth in production.</p>
      </div>

      <button
        onClick={onLogout}
        className="w-full py-3 rounded-xl text-sm font-medium text-[var(--subtle)] border border-[var(--border)] hover:bg-[var(--surface-hover)] flex items-center justify-center gap-2"
      >
        <Lock size={14} /> Sign Out of Admin
      </button>
    </div>
  );
}

// ── Main AdminPanel ────────────────────────────────────────────────────────────
export function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<AdminTab>('site');

  if (!authenticated) {
    return <AuthGate onAuth={() => setAuthenticated(true)} />;
  }

  const TABS: Array<{ key: AdminTab; label: string; icon: React.ElementType }> = [
    { key: 'site',      label: 'Site Info',  icon: Settings },
    { key: 'contracts', label: 'Contracts',  icon: Code2 },
    { key: 'tokens',    label: 'Tokens',     icon: Coins },
    { key: 'fees',      label: 'Fees',       icon: DollarSign },
    { key: 'security',  label: 'Security',   icon: ShieldAlert },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-muted)]/60 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
            <ShieldAlert size={14} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Admin Panel</p>
            <p className="text-[10px] text-[var(--subtle)]">Manage site configuration, contracts, and fees</p>
          </div>
        </div>
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
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'site'      && <SiteInfoTab />}
        {tab === 'contracts' && <ContractsTab />}
        {tab === 'tokens'    && <TokensTab />}
        {tab === 'fees'      && <FeesTab />}
        {tab === 'security'  && <SecurityTab onLogout={() => setAuthenticated(false)} />}
      </div>
    </div>
  );
}
