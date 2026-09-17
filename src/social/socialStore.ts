/**
 * socialStore — localStorage-backed social trading data store.
 * Manages: trade posts, trader profiles, follows, likes, comments, alerts.
 */

export interface PostComment {
  id: string;
  author: string;
  authorName: string;
  text: string;
  timestamp: number;
}

export interface TradePost {
  id: string;
  traderAddress: string;
  traderName: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenName: string;
  chainId: string;
  chainName: string;
  side: 'buy' | 'sell';
  amount: string;        // USD amount e.g. "$1,200"
  tokenAmount: string;   // token quantity e.g. "0.42"
  price: string;         // entry price e.g. "$2,850"
  pnlUsd?: string;       // realized P&L e.g. "+$240"
  pnlPct?: string;       // e.g. "+18.5%"
  thesis?: string;
  txHash?: string;
  timestamp: number;
  likes: string[];       // addresses that liked
  comments: PostComment[];
  isPublic: boolean;
}

export interface TraderProfile {
  address: string;
  name: string;
  bio?: string;
  isVerified?: boolean;
  totalPnlUsd: string;
  totalPnlPct: string;
  winRate: string;
  tradeCount: number;
  followers: string[];
  following: string[];
  joinedAt: number;
  avatarSeed?: string;
}

export interface Alert {
  id: string;
  type: 'trade' | 'follow' | 'like' | 'comment';
  fromAddress: string;
  fromName: string;
  toAddress: string;
  message: string;
  timestamp: number;
  read: boolean;
  postId?: string;
}

// ── Storage keys ────────────────────────────────────────────────────────────
const FEED_KEY = 'glow_feed_v1';
const PROFILES_KEY = 'glow_profiles_v1';
const ALERTS_KEY = 'glow_alerts_v1';
const MY_ADDR_KEY = 'glow_my_addr';

// ── Seed demo data so the feed isn't empty on first launch ──────────────────
const DEMO_TRADERS: TraderProfile[] = [
  {
    address: '0xDEMO1000000000000000000000000000000000001',
    name: 'ArcWhale',
    bio: 'Degen trader on Arc. USDC-native since 2025.',
    isVerified: true,
    totalPnlUsd: '+$42,800',
    totalPnlPct: '+312%',
    winRate: '68%',
    tradeCount: 147,
    followers: [],
    following: [],
    joinedAt: Date.now() - 90 * 86400000,
  },
  {
    address: '0xDEMO2000000000000000000000000000000000002',
    name: 'SolanaKid',
    bio: 'Multi-chain. Solana + Arc. Thesis-driven.',
    totalPnlUsd: '+$18,200',
    totalPnlPct: '+189%',
    winRate: '61%',
    tradeCount: 89,
    followers: [],
    following: [],
    joinedAt: Date.now() - 60 * 86400000,
  },
  {
    address: '0xDEMO3000000000000000000000000000000000003',
    name: 'BaseMaxi',
    bio: 'Base ecosystem believer. Always long ETH.',
    totalPnlUsd: '+$7,400',
    totalPnlPct: '+94%',
    winRate: '55%',
    tradeCount: 52,
    followers: [],
    following: [],
    joinedAt: Date.now() - 30 * 86400000,
  },
  {
    address: '0xDEMO4000000000000000000000000000000000004',
    name: 'StablePete',
    bio: 'Risk-managed. 2-5% per trade. Consistency.',
    totalPnlUsd: '+$3,100',
    totalPnlPct: '+31%',
    winRate: '74%',
    tradeCount: 203,
    followers: [],
    following: [],
    joinedAt: Date.now() - 120 * 86400000,
  },
  {
    address: '0xDEMO5000000000000000000000000000000000005',
    name: 'MemeKing',
    totalPnlUsd: '-$1,200',
    totalPnlPct: '-34%',
    winRate: '38%',
    tradeCount: 320,
    followers: [],
    following: [],
    joinedAt: Date.now() - 45 * 86400000,
  },
];

const DEMO_POSTS: TradePost[] = [
  {
    id: 'post_demo_1',
    traderAddress: DEMO_TRADERS[0].address,
    traderName: DEMO_TRADERS[0].name,
    tokenSymbol: 'ETH',
    tokenAddress: '0x0',
    tokenName: 'Ethereum',
    chainId: 'arc',
    chainName: 'Arc',
    side: 'buy',
    amount: '$5,000',
    tokenAmount: '1.75',
    price: '$2,857',
    pnlUsd: '+$840',
    pnlPct: '+16.8%',
    thesis: 'ETH consolidating above $2,800 support. EIP-4844 tailwinds, institutional accumulation. Target $3,400 within 3 weeks.',
    timestamp: Date.now() - 2 * 3600000,
    likes: ['0xDEMO2000000000000000000000000000000000002'],
    comments: [
      { id: 'c1', author: DEMO_TRADERS[1].address, authorName: DEMO_TRADERS[1].name, text: 'Agreed, strong setup.', timestamp: Date.now() - 1.5 * 3600000 },
    ],
    isPublic: true,
  },
  {
    id: 'post_demo_2',
    traderAddress: DEMO_TRADERS[1].address,
    traderName: DEMO_TRADERS[1].name,
    tokenSymbol: 'SOL',
    tokenAddress: '0x0',
    tokenName: 'Solana',
    chainId: 'arc',
    chainName: 'Arc',
    side: 'buy',
    amount: '$2,400',
    tokenAmount: '14.2',
    price: '$169',
    thesis: 'SOL DeFi TVL hitting ATH. Monad competition is overhyped — Solana ecosystem moat is real. Holding to $220.',
    timestamp: Date.now() - 5 * 3600000,
    likes: [],
    comments: [],
    isPublic: true,
  },
  {
    id: 'post_demo_3',
    traderAddress: DEMO_TRADERS[2].address,
    traderName: DEMO_TRADERS[2].name,
    tokenSymbol: 'ARB',
    tokenAddress: '0x0',
    tokenName: 'Arbitrum',
    chainId: 'arc',
    chainName: 'Arc',
    side: 'sell',
    amount: '$1,800',
    tokenAmount: '2000',
    price: '$0.90',
    pnlUsd: '+$360',
    pnlPct: '+25%',
    thesis: 'Taking profit after the ARB ecosystem grant announcement pump. Will re-enter on pullback to $0.72.',
    timestamp: Date.now() - 12 * 3600000,
    likes: ['0xDEMO1000000000000000000000000000000000001', '0xDEMO4000000000000000000000000000000000004'],
    comments: [],
    isPublic: true,
  },
  {
    id: 'post_demo_4',
    traderAddress: DEMO_TRADERS[3].address,
    traderName: DEMO_TRADERS[3].name,
    tokenSymbol: 'BTC',
    tokenAddress: '0x0',
    tokenName: 'Bitcoin',
    chainId: 'arc',
    chainName: 'Arc',
    side: 'buy',
    amount: '$500',
    tokenAmount: '0.0085',
    price: '$58,800',
    thesis: 'Small size — 2% of portfolio. Adding on weekly close above $58k. Risk defined.',
    timestamp: Date.now() - 24 * 3600000,
    likes: [],
    comments: [],
    isPublic: true,
  },
];

// ── Initialise ──────────────────────────────────────────────────────────────
function initStore() {
  if (typeof window === 'undefined') return;
  if (!localStorage.getItem(PROFILES_KEY)) {
    const profileMap: Record<string, TraderProfile> = {};
    DEMO_TRADERS.forEach(t => { profileMap[t.address] = t; });
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profileMap));
  }
  if (!localStorage.getItem(FEED_KEY)) {
    localStorage.setItem(FEED_KEY, JSON.stringify(DEMO_POSTS));
  }
  if (!localStorage.getItem(ALERTS_KEY)) {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([]));
  }
}

initStore();

// ── Feed ────────────────────────────────────────────────────────────────────
export function getFeed(): TradePost[] {
  try {
    return JSON.parse(localStorage.getItem(FEED_KEY) ?? '[]') as TradePost[];
  } catch { return []; }
}

export function saveFeed(posts: TradePost[]): void {
  localStorage.setItem(FEED_KEY, JSON.stringify(posts));
}

export function addPost(post: TradePost): void {
  const posts = getFeed();
  saveFeed([post, ...posts]);
  // Update trader profile stats
  const profile = getProfile(post.traderAddress);
  if (profile) {
    upsertProfile({ ...profile, tradeCount: profile.tradeCount + 1 });
  }
}

export function getFollowingFeed(address: string): TradePost[] {
  const me = getProfile(address);
  if (!me) return [];
  const following = new Set(me.following);
  return getFeed().filter(p => following.has(p.traderAddress));
}

export function toggleLike(postId: string, address: string): void {
  const posts = getFeed();
  const idx = posts.findIndex(p => p.id === postId);
  if (idx === -1) return;
  const post = posts[idx];
  const likes = post.likes.includes(address)
    ? post.likes.filter(a => a !== address)
    : [...post.likes, address];
  posts[idx] = { ...post, likes };
  saveFeed(posts);
}

export function addComment(postId: string, comment: PostComment): void {
  const posts = getFeed();
  const idx = posts.findIndex(p => p.id === postId);
  if (idx === -1) return;
  const post = posts[idx];
  posts[idx] = { ...post, comments: [...post.comments, comment] };
  saveFeed(posts);
}

// ── Profiles ────────────────────────────────────────────────────────────────
export function getProfiles(): Record<string, TraderProfile> {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '{}') as Record<string, TraderProfile>;
  } catch { return {}; }
}

export function saveProfiles(profiles: Record<string, TraderProfile>): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getProfile(address: string): TraderProfile | undefined {
  if (!address) return undefined;
  return getProfiles()[address];
}

export function upsertProfile(profile: TraderProfile): void {
  const profiles = getProfiles();
  profiles[profile.address] = profile;
  saveProfiles(profiles);
}

export function getLeaderboard(): TraderProfile[] {
  return Object.values(getProfiles())
    .sort((a, b) => {
      const pa = parseFloat(a.totalPnlPct.replace(/[+%]/g, '')) || 0;
      const pb = parseFloat(b.totalPnlPct.replace(/[+%]/g, '')) || 0;
      return pb - pa;
    });
}

// ── Follow / unfollow ───────────────────────────────────────────────────────
export function followTrader(myAddress: string, targetAddress: string): void {
  const profiles = getProfiles();
  const me = profiles[myAddress];
  const target = profiles[targetAddress];
  if (!me || !target) return;
  if (!me.following.includes(targetAddress)) {
    profiles[myAddress] = { ...me, following: [...me.following, targetAddress] };
  }
  if (!target.followers.includes(myAddress)) {
    profiles[targetAddress] = { ...target, followers: [...target.followers, myAddress] };
  }
  saveProfiles(profiles);
  // Create alert for target
  pushAlert({
    id: `alert_follow_${Date.now()}`,
    type: 'follow',
    fromAddress: myAddress,
    fromName: me.name,
    toAddress: targetAddress,
    message: `${me.name} started following you`,
    timestamp: Date.now(),
    read: false,
  });
}

export function unfollowTrader(myAddress: string, targetAddress: string): void {
  const profiles = getProfiles();
  const me = profiles[myAddress];
  const target = profiles[targetAddress];
  if (!me || !target) return;
  profiles[myAddress] = { ...me, following: me.following.filter(a => a !== targetAddress) };
  profiles[targetAddress] = { ...target, followers: target.followers.filter(a => a !== myAddress) };
  saveProfiles(profiles);
}

// ── Alerts ──────────────────────────────────────────────────────────────────
export function getAlerts(address: string): Alert[] {
  try {
    const all = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? '[]') as Alert[];
    return all.filter(a => a.toAddress === address);
  } catch { return []; }
}

export function pushAlert(alert: Alert): void {
  try {
    const all = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? '[]') as Alert[];
    all.unshift(alert);
    localStorage.setItem(ALERTS_KEY, JSON.stringify(all.slice(0, 100)));
  } catch { /* ignore */ }
}

export function markAlertsRead(): void {
  try {
    const all = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? '[]') as Alert[];
    localStorage.setItem(ALERTS_KEY, JSON.stringify(all.map(a => ({ ...a, read: true }))));
  } catch { /* ignore */ }
}

// ── My address ──────────────────────────────────────────────────────────────
export function getMyAddress(): string {
  return localStorage.getItem(MY_ADDR_KEY) ?? '';
}

export function setMyAddress(address: string): void {
  localStorage.setItem(MY_ADDR_KEY, address);
}
