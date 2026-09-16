import { useState } from 'react';
import {
  Code2, Cpu, Search, ChevronRight, Zap,
  BookOpen, ExternalLink, Menu, X, Rocket,
  BarChart2, Wallet, ShieldAlert,
} from 'lucide-react';
import { NetworkArc } from '@web3icons/react';

import { SolidityIDE } from './components/ide/SolidityIDE';
import { ContractInteract } from './components/ide/ContractInteract';
import { LaunchpadHome } from './components/launchpad/LaunchpadHome';
import { TxExplorer } from './components/ide/TxExplorer';
import { DexScreen } from './components/dex/DexScreen';
import { WalletPage } from './wallet/WalletPage';
import { AdminPanel } from './admin/AdminPanel';
import { useWallet } from './wallet/useWallet';
import { WalletContext } from './wallet/walletContext';

// ── Navigation items ───────────────────────────────────────────────────────
type NavKey = 'launchpad' | 'dex' | 'ide' | 'interact' | 'explorer' | 'wallet' | 'admin';

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV: NavItem[] = [
  { key: 'launchpad', label: 'Launchpad',    icon: Rocket,    badge: 'Live' },
  { key: 'dex',       label: 'DEX Markets',  icon: BarChart2               },
  { key: 'wallet',    label: 'Wallet',       icon: Wallet                  },
  { key: 'ide',       label: 'Solidity IDE', icon: Code2                   },
  { key: 'interact',  label: 'Interact',     icon: Cpu                     },
  { key: 'explorer',  label: 'Explorer',     icon: Search                  },
  { key: 'admin',     label: 'Admin',        icon: ShieldAlert             },
];

// ── Desktop Sidebar ────────────────────────────────────────────────────────
function Sidebar({
  active,
  setActive,
  collapsed,
}: {
  active: NavKey;
  setActive: (k: NavKey) => void;
  collapsed: boolean;
}) {
  return (
    <aside
      className="hidden md:flex flex-col border-r border-[var(--border)] bg-[var(--surface-muted)] transition-all duration-200 shrink-0"
      style={{ width: collapsed ? '52px' : '200px' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-3 py-3.5 border-b border-[var(--border)] shrink-0 overflow-hidden"
        style={{ minHeight: 'var(--header-h)' }}
      >
        <div
          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)' }}
        >
          <Zap size={14} className="text-white" />
        </div>
        {!collapsed && (
          <span className="display font-bold text-[var(--ink)] text-sm whitespace-nowrap">Glowpad</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-hidden">
        {NAV.map(({ key, label, icon: Icon, badge }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium transition-all duration-150 relative overflow-hidden ${
                isActive
                  ? 'text-[var(--accent)] bg-[var(--accent)]/8'
                  : 'text-[var(--subtle)] hover:text-[var(--muted)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--accent)] rounded-r" />
              )}
              <Icon size={15} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left whitespace-nowrap">{label}</span>
                  {badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] pulse-dot">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer links */}
      {!collapsed && (
        <div className="border-t border-[var(--border)] p-3 space-y-0.5">
          <a
            href="https://explorer.arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-[var(--subtle)] hover:text-[var(--muted)] py-1.5 transition-colors"
          >
            <ExternalLink size={12} />
            Arc Explorer
          </a>
          <a
            href="https://docs.arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-[var(--subtle)] hover:text-[var(--muted)] py-1.5 transition-colors"
          >
            <BookOpen size={12} />
            Docs
          </a>
        </div>
      )}
    </aside>
  );
}

// ── Mobile Bottom Nav ──────────────────────────────────────────────────────
function BottomNav({
  active,
  setActive,
}: {
  active: NavKey;
  setActive: (k: NavKey) => void;
}) {
  return (
    <nav className="md:hidden flex items-center justify-around border-t border-[var(--border)] bg-[var(--surface-muted)] shrink-0 safe-bottom">
      {NAV.map(({ key, icon: Icon, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`flex flex-col items-center gap-0.5 px-2 py-2.5 min-w-0 flex-1 transition-colors ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--subtle)]'
            }`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="text-[10px] font-medium leading-tight truncate w-full text-center">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('launchpad');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const walletCtx = useWallet();

  const currentItem = NAV.find(n => n.key === activeNav)!;

  const handleNav = (k: NavKey) => {
    setActiveNav(k);
    setMobileMenuOpen(false);
  };

  const renderContent = () => {
    switch (activeNav) {
      case 'launchpad': return <LaunchpadHome onNavigateToWallet={() => handleNav('wallet')} />;
      case 'dex':       return <DexScreen />;
      case 'wallet':    return <WalletPage />;
      case 'ide':       return <SolidityIDE />;
      case 'interact':  return <ContractInteract />;
      case 'explorer':  return <TxExplorer />;
      case 'admin':     return <AdminPanel />;
    }
  };

  return (
    <WalletContext.Provider value={walletCtx}>
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--bg)]">
      {/* Desktop sidebar */}
      <Sidebar active={activeNav} setActive={handleNav} collapsed={sidebarCollapsed} />

      {/* Mobile slide-in menu overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="w-56 h-full flex flex-col bg-[var(--surface-muted)] border-r border-[var(--border)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[var(--border)]">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)' }}
              >
                <Zap size={14} className="text-white" />
              </div>
              <span className="display font-bold text-[var(--ink)] text-sm">Glowpad</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="ml-auto p-1 rounded text-[var(--subtle)]"
              >
                <X size={16} />
              </button>
            </div>
            {/* Nav items */}
            <nav className="flex-1 py-2">
              {NAV.map(({ key, label, icon: Icon, badge }) => (
                <button
                  key={key}
                  onClick={() => handleNav(key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all relative ${
                    activeNav === key
                      ? 'text-[var(--accent)] bg-[var(--accent)]/8'
                      : 'text-[var(--subtle)] hover:text-[var(--muted)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {activeNav === key && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent)] rounded-r" />
                  )}
                  <Icon size={16} />
                  <span className="flex-1 text-left">{label}</span>
                  {badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)]">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="border-t border-[var(--border)] p-4 space-y-1">
              <a href="https://explorer.arc.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-[var(--subtle)] hover:text-[var(--muted)] py-1.5">
                <ExternalLink size={12} /> Arc Explorer
              </a>
              <a href="https://docs.arc.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-[var(--subtle)] hover:text-[var(--muted)] py-1.5">
                <BookOpen size={12} /> Docs
              </a>
            </div>
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Topbar */}
        <header
          className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-b border-[var(--border)] bg-[var(--surface-muted)]/80 backdrop-blur shrink-0"
          style={{ height: 'var(--header-h)' }}
        >
          {/* Mobile: hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
          >
            <Menu size={16} />
          </button>

          {/* Desktop: collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="hidden md:block p-1.5 rounded-lg text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
          >
            {sidebarCollapsed ? <Menu size={15} /> : <X size={15} />}
          </button>

          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-1.5">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)' }}
            >
              <Zap size={11} className="text-white" />
            </div>
            <span className="display font-bold text-[var(--ink)] text-sm">Glowpad</span>
          </div>

          {/* Breadcrumb — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--subtle)]">
            <NetworkArc size={12} variant="branded" />
            <span>Arc Mainnet</span>
            <ChevronRight size={12} />
            <span className="text-[var(--ink)] font-medium">{currentItem.label}</span>
          </div>

          <div className="flex-1" />

          {/* Wallet address pill */}
          {walletCtx?.activeWallet && (
            <button onClick={() => handleNav('wallet')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono text-[var(--subtle)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition-colors">
              <Wallet size={11} />
              {walletCtx.activeWallet.address.slice(0,6)}…{walletCtx.activeWallet.address.slice(-4)}
            </button>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav active={activeNav} setActive={handleNav} />
      </div>
    </div>
    </WalletContext.Provider>
  );
}
