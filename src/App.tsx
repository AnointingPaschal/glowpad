import { useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import {
  Code2, Cpu, Search, ChevronRight, Zap,
  BookOpen, ExternalLink, Menu, X, Rocket,
} from 'lucide-react';
import { NetworkArc } from '@web3icons/react';

import { SolidityIDE } from './components/ide/SolidityIDE';
import { ContractInteract } from './components/ide/ContractInteract';
import { LaunchpadHome } from './components/launchpad/LaunchpadHome';
import { TxExplorer } from './components/ide/TxExplorer';

// ── Navigation items ───────────────────────────────────────────────────────
type NavKey = 'launchpad' | 'ide' | 'interact' | 'explorer';

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV: NavItem[] = [
  { key: 'launchpad', label: 'Launchpad',      icon: Rocket,   badge: 'Live' },
  { key: 'ide',       label: 'Solidity IDE',   icon: Code2             },
  { key: 'interact',  label: 'Interact',        icon: Cpu               },
  { key: 'explorer',  label: 'Explorer',        icon: Search            },
];

// ── Sidebar ────────────────────────────────────────────────────────────────
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
      className="flex flex-col border-r border-[var(--border)] bg-[var(--surface-muted)] transition-all duration-200 shrink-0"
      style={{ width: collapsed ? '52px' : '200px' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-3 py-3.5 border-b border-[var(--border)] shrink-0 overflow-hidden"
        style={{ minHeight: 'var(--header-h)' }}
      >
        <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #4e9ff5 0%, #7c3aed 100%)' }}>
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
            href="https://explorer.testnet.arc.io"
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

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('launchpad');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const currentItem = NAV.find(n => n.key === activeNav)!;

  const renderContent = () => {
    switch (activeNav) {
      case 'launchpad': return <LaunchpadHome />;
      case 'ide':       return <SolidityIDE />;
      case 'interact':  return <ContractInteract />;
      case 'explorer':  return <TxExplorer />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* Sidebar */}
      <Sidebar active={activeNav} setActive={setActiveNav} collapsed={sidebarCollapsed} />

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Topbar */}
        <header
          className="flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--surface-muted)]/80 backdrop-blur shrink-0"
          style={{ height: 'var(--header-h)' }}
        >
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="p-1.5 rounded-lg text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
          >
            {sidebarCollapsed ? <Menu size={15} /> : <X size={15} />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--subtle)]">
            <NetworkArc size={12} variant="branded" />
            <span>Arc Testnet</span>
            <ChevronRight size={12} />
            <span className="text-[var(--ink)] font-medium">{currentItem.label}</span>
          </div>

          <div className="flex-1" />

          {/* Connect button */}
          <ConnectKitButton />
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
