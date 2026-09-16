/**
 * Admin store — localStorage-backed site configuration.
 * Holds site info, contract addresses, token deployments, and fee settings.
 * Access to this page should be gated behind an admin password in production.
 */

export interface SiteInfo {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string;  // data URL or external URL
  primaryColor: string;
  twitterUrl: string;
  discordUrl: string;
  websiteUrl: string;
  adminPassword: string; // hashed locally
}

export interface ContractEntry {
  id: string;
  name: string;
  address: string;
  chainId: number;
  type: 'launchpad' | 'token' | 'staking' | 'vesting' | 'factory' | 'other';
  deployedAt: number;
  txHash?: string;
  verified: boolean;
  notes?: string;
}

export interface TokenDeployment {
  id: string;
  name: string;
  symbol: string;
  address: string;
  chainId: number;
  decimals: number;
  totalSupply: string;
  creator: string;
  deployedAt: number;
  txHash?: string;
  logoUrl?: string;
  launchId?: string;
}

export interface PlatformFee {
  id: string;
  name: string;
  description: string;
  type: 'flat' | 'percent';
  value: string; // flat USDC or percent bps
  chainId: number;
  enabled: boolean;
}

export interface AdminStore {
  siteInfo: SiteInfo;
  contracts: ContractEntry[];
  tokenDeployments: TokenDeployment[];
  platformFees: PlatformFee[];
  isAuthenticated: boolean;
}

const STORE_KEY = 'gp_admin';

const DEFAULT: AdminStore = {
  siteInfo: {
    siteName: 'Glowpad',
    tagline: 'Launch. Trade. Build. On Arc.',
    description: 'The premier token launchpad and DeFi hub on Arc Mainnet.',
    logoUrl: '',
    primaryColor: '#4e9ff5',
    twitterUrl: '',
    discordUrl: '',
    websiteUrl: '',
    adminPassword: '',
  },
  contracts: [
    {
      id: 'arc-launchpad',
      name: 'ArcLaunchpad',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 5042,
      type: 'launchpad',
      deployedAt: Date.now(),
      verified: false,
      notes: 'Main launchpad contract — replace with deployed address.',
    },
  ],
  tokenDeployments: [],
  platformFees: [
    {
      id: 'platform-fee-1',
      name: 'Token Creation Fee',
      description: 'Flat fee charged when a new token launch is created',
      type: 'flat',
      value: '100',
      chainId: 5042,
      enabled: true,
    },
    {
      id: 'platform-fee-2',
      name: 'Success Fee',
      description: 'Percentage of raised funds taken when a launch succeeds',
      type: 'percent',
      value: '200', // 200 bps = 2%
      chainId: 5042,
      enabled: true,
    },
  ],
  isAuthenticated: false,
};

function load(): AdminStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<AdminStore>;
    return {
      siteInfo: { ...DEFAULT.siteInfo, ...(parsed.siteInfo ?? {}) },
      contracts: parsed.contracts ?? DEFAULT.contracts,
      tokenDeployments: parsed.tokenDeployments ?? DEFAULT.tokenDeployments,
      platformFees: parsed.platformFees ?? DEFAULT.platformFees,
      isAuthenticated: false,
    };
  } catch {
    return { ...DEFAULT };
  }
}

function save(store: AdminStore): void {
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...store, isAuthenticated: false }));
}

export function getAdminStore(): AdminStore {
  return load();
}

export function saveSiteInfo(info: SiteInfo): void {
  const store = load();
  save({ ...store, siteInfo: info });
}

export function saveContracts(contracts: ContractEntry[]): void {
  const store = load();
  save({ ...store, contracts });
}

export function addContract(entry: ContractEntry): void {
  const store = load();
  save({ ...store, contracts: [...store.contracts, entry] });
}

export function updateContract(id: string, updates: Partial<ContractEntry>): void {
  const store = load();
  save({
    ...store,
    contracts: store.contracts.map(c => c.id === id ? { ...c, ...updates } : c),
  });
}

export function removeContract(id: string): void {
  const store = load();
  save({ ...store, contracts: store.contracts.filter(c => c.id !== id) });
}

export function saveTokenDeployments(tokens: TokenDeployment[]): void {
  const store = load();
  save({ ...store, tokenDeployments: tokens });
}

export function addTokenDeployment(token: TokenDeployment): void {
  const store = load();
  save({ ...store, tokenDeployments: [...store.tokenDeployments, token] });
}

export function savePlatformFees(fees: PlatformFee[]): void {
  const store = load();
  save({ ...store, platformFees: fees });
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const store = load();
  if (!store.siteInfo.adminPassword) return true; // not set — first-time access
  const buf = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hash === store.siteInfo.adminPassword;
}

export async function hashPassword(password: string): Promise<string> {
  const buf = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
