/**
 * FeedScreen — FOMO-style social trading feed for Glowpad
 * Live trade posts, thesis, comments, likes, follow, alerts tab
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Flame, Heart, MessageCircle, UserPlus, UserMinus,
  TrendingUp, TrendingDown, Bell, BellDot, RefreshCw,
  Send, Check, AlertTriangle, ChevronRight, Plus,
} from 'lucide-react';
import {
  getFeed, addPost, toggleLike, addComment, followTrader, unfollowTrader,
  getProfile, upsertProfile, setMyAddress, getMyAddress,
  getAlerts, markAlertsRead,
  type TradePost, type TraderProfile, type PostComment,
} from './socialStore';
import { useWalletContext } from '@/wallet/walletContext';

// ── helpers ───────────────────────────────────────────────────────────────
function avatarBg(seed: string) {
  const h = seed.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
  return `hsl(${Math.abs(h) % 360},60%,40%)`;
}
function relTime(ts: number) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}
function shortAddr(a: string) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''; }
function pnlColor(s: string) {
  if (s.startsWith('+')) return '#4ade80';
  if (s.startsWith('-')) return '#f87171';
  return 'rgba(255,255,255,0.6)';
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarBg(name) }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

// ── Chain badge ────────────────────────────────────────────────────────────
const CHAIN_COLORS: Record<string, string> = {
  arc: '#4e9ff5', ethereum: '#627eea', base: '#0052ff',
  arbitrum: '#28a0f0', solana: '#9945ff', polygon: '#8247e5',
};
function ChainBadge({ chainId, chainName }: { chainId: string; chainName: string }) {
  const c = CHAIN_COLORS[chainId] ?? '#94a3b8';
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ background: c + '22', color: c }}>{chainName}</span>
  );
}

// ── Comments panel ──────────────────────────────────────────────────────────
function CommentsPanel({ post, myAddress, myName, onClose }: {
  post: TradePost; myAddress: string; myName: string; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [comments, setComments] = useState<PostComment[]>(post.comments);

  const submit = () => {
    if (!text.trim() || !myAddress) return;
    const c: PostComment = {
      id: `c_${Date.now()}`,
      author: myAddress,
      authorName: myName || shortAddr(myAddress),
      text: text.trim(),
      timestamp: Date.now(),
    };
    addComment(post.id, c);
    setComments(prev => [...prev, c]);
    setText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#060e1a]">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-white/[0.08]">
        <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">←</button>
        <p className="text-sm font-bold text-white">Comments</p>
        <span className="text-xs text-white/30">{comments.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4 pb-4">
        {comments.length === 0 && (
          <p className="text-center text-sm text-white/30 py-8">No comments yet. Be the first.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="flex gap-3">
            <Avatar name={c.authorName} size={32} />
            <div className="flex-1 bg-white/[0.04] rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-white">{c.authorName}</span>
                <span className="text-[10px] text-white/30">{relTime(c.timestamp)}</span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      {myAddress && (
        <div className="border-t border-white/[0.08] px-4 py-3 flex gap-2">
          <input className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#4e9ff5]/40"
            placeholder="Add a comment…" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
          <button onClick={submit} disabled={!text.trim()}
            className="p-2.5 rounded-2xl text-white disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
            <Send size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── New Trade Post modal ────────────────────────────────────────────────────
function NewPostModal({ myAddress, myName, onClose }: {
  myAddress: string; myName: string; onClose: () => void;
}) {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [thesis, setThesis] = useState('');
  const [done, setDone] = useState(false);

  const submit = () => {
    if (!symbol || !amount) return;
    const post: TradePost = {
      id: `post_${Date.now()}`,
      traderAddress: myAddress,
      traderName: myName,
      tokenSymbol: symbol.toUpperCase(),
      tokenAddress: '0x0',
      tokenName: symbol.toUpperCase(),
      chainId: 'arc',
      chainName: 'Arc',
      side,
      amount: amount.startsWith('$') ? amount : `$${amount}`,
      tokenAmount: '—',
      price: price ? (price.startsWith('$') ? price : `$${price}`) : '—',
      thesis: thesis || undefined,
      timestamp: Date.now(),
      likes: [],
      comments: [],
      isPublic: true,
    };
    addPost(post);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-4 bg-[#0b1827] border border-white/10">
        {done ? (
          <div className="text-center py-4 space-y-2">
            <Check size={28} className="mx-auto text-[#4ade80]" />
            <p className="text-sm font-bold text-white">Trade posted!</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold text-white">Post a Trade</p>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none uppercase"
                placeholder="Token (e.g. ETH)" value={symbol} onChange={e => setSymbol(e.target.value)} />
              <button onClick={() => setSide('buy')}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${side === 'buy' ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30' : 'border border-white/10 text-white/40'}`}>
                BUY
              </button>
              <button onClick={() => setSide('sell')}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${side === 'sell' ? 'bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/30' : 'border border-white/10 text-white/40'}`}>
                SELL
              </button>
            </div>
            <div className="flex gap-2">
              <input type="number" className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none"
                placeholder="Amount ($)" value={amount} onChange={e => setAmount(e.target.value)} />
              <input type="number" className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none"
                placeholder="Price ($)" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <textarea className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none resize-none leading-relaxed"
              placeholder="Add your thesis (optional)…" rows={3} value={thesis} onChange={e => setThesis(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm text-white/50 border border-white/10">Cancel</button>
              <button onClick={submit} disabled={!symbol || !amount}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
                Post Trade
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Post card ──────────────────────────────────────────────────────────────
function PostCard({
  post, myAddress, onLike, onComment, onFollow, isFollowing, showFollowBtn,
}: {
  post: TradePost; myAddress: string;
  onLike: () => void; onComment: () => void;
  onFollow: () => void; isFollowing: boolean; showFollowBtn: boolean;
}) {
  const liked = post.likes.includes(myAddress);
  const up = post.side === 'buy';
  const hasPnl = !!post.pnlUsd;

  return (
    <div className="px-4 py-4 border-b border-white/[0.06]">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={post.traderName} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-white">{post.traderName}</span>
            <span className="text-[10px] text-white/30">{relTime(post.timestamp)}</span>
            <ChainBadge chainId={post.chainId} chainName={post.chainName} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${up ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'}`}>
              {post.side.toUpperCase()}
            </span>
            <span className="text-sm font-extrabold text-white">{post.tokenSymbol}</span>
            <span className="text-xs text-white/40">{post.amount}</span>
            <span className="text-xs text-white/30">@ {post.price}</span>
          </div>
        </div>
        {showFollowBtn && myAddress !== post.traderAddress && (
          <button onClick={onFollow}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all shrink-0 ${isFollowing ? 'text-white/30 border border-white/10' : 'text-[#4e9ff5] bg-[#4e9ff5]/10 border border-[#4e9ff5]/20'}`}>
            {isFollowing ? <UserMinus size={12} /> : <UserPlus size={12} />}
            {isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        )}
      </div>

      {/* P&L badge */}
      {hasPnl && (
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: pnlColor(post.pnlUsd!) + '18', color: pnlColor(post.pnlUsd!) }}>
            {post.pnlUsd!.startsWith('+') ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {post.pnlUsd} ({post.pnlPct})
          </span>
          <span className="text-[10px] text-white/20">Realized</span>
        </div>
      )}

      {/* Thesis */}
      {post.thesis && (
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl px-4 py-3 mb-3">
          <p className="text-xs text-white/30 mb-1 font-medium uppercase tracking-wide">Thesis</p>
          <p className="text-sm text-white/80 leading-relaxed">{post.thesis}</p>
        </div>
      )}

      {/* Reactions */}
      <div className="flex items-center gap-4 mt-1">
        <button onClick={onLike}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: liked ? '#f87171' : 'rgba(255,255,255,0.3)' }}>
          <Heart size={14} fill={liked ? '#f87171' : 'none'} strokeWidth={2} />
          {post.likes.length > 0 && post.likes.length}
        </button>
        <button onClick={onComment}
          className="flex items-center gap-1.5 text-xs font-medium text-white/30 hover:text-white/60 transition-colors">
          <MessageCircle size={14} />
          {post.comments.length > 0 && post.comments.length}
        </button>
        {post.comments.length > 0 && (
          <button onClick={onComment} className="text-[11px] text-white/20 hover:text-white/50 flex items-center gap-0.5">
            View {post.comments.length} comment{post.comments.length > 1 ? 's' : ''}
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Alerts panel ────────────────────────────────────────────────────────────
function AlertsPanel({ myAddress }: { myAddress: string }) {
  const alerts = getAlerts(myAddress);
  useEffect(() => { markAlertsRead(); }, []);

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Bell size={28} className="text-white/15" />
          <p className="text-sm text-white/30">No notifications yet</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {alerts.map(a => (
            <div key={a.id} className={`flex items-start gap-3 px-4 py-3.5 ${!a.read ? 'bg-[#4e9ff5]/5' : ''}`}>
              <Avatar name={a.fromName} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 leading-snug">{a.message}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{relTime(a.timestamp)}</p>
              </div>
              {!a.read && <span className="w-2 h-2 rounded-full bg-[#4e9ff5] shrink-0 mt-1.5" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main FeedScreen ─────────────────────────────────────────────────────────
type FeedTab = 'all' | 'following' | 'alerts';

export function FeedScreen() {
  const walletCtx = useWalletContext();
  const myAddress = walletCtx?.activeWallet?.address ?? getMyAddress() ?? '';

  const [tab, setTab] = useState<FeedTab>('all');
  const [posts, setPosts] = useState<TradePost[]>([]);
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const [myProfile, setMyProfile] = useState<TraderProfile | null>(null);
  const [commentPost, setCommentPost] = useState<TradePost | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  const loadPosts = useCallback(() => {
    const all = getFeed();
    if (tab === 'following' && myAddress) {
      const me = getProfile(myAddress);
      if (!me) { setPosts([]); return; }
      const following = new Set(me.following);
      setPosts(all.filter(p => following.has(p.traderAddress)));
    } else {
      setPosts(all);
    }
  }, [tab, myAddress]);

  // eslint-disable-next-line react/set-state-in-effect -- reads external localStorage system, not derived state
  useEffect(() => {
    if (myAddress) {
      setMyAddress(myAddress);
      if (!getProfile(myAddress)) {
        const name = `${myAddress.slice(0, 6)}…${myAddress.slice(-4)}`;
        upsertProfile({ address: myAddress, name, totalPnlUsd: '$0', totalPnlPct: '0%', winRate: '0%', tradeCount: 0, followers: [], following: [], joinedAt: Date.now() });
      }
      setMyProfile(getProfile(myAddress) ?? null); // eslint-disable-line react/set-state-in-effect
      setUnreadAlerts(getAlerts(myAddress).filter(a => !a.read).length); // eslint-disable-line react/set-state-in-effect
    }
    loadPosts();
  }, [myAddress, loadPosts]);

  useEffect(() => {
    loadPosts(); // eslint-disable-line react/set-state-in-effect -- reads external localStorage
    // update follow map
    if (myAddress) {
      const me = getProfile(myAddress);
      if (me) {
        const fm: Record<string, boolean> = {};
        getFeed().forEach(p => { fm[p.traderAddress] = me.following.includes(p.traderAddress); });
        setFollowMap(fm);
      }
    }
  }, [tab, loadPosts, myAddress]);

  const handleLike = (post: TradePost) => {
    if (!myAddress) return;
    toggleLike(post.id, myAddress);
    setPosts(prev => prev.map(p =>
      p.id !== post.id ? p : {
        ...p,
        likes: p.likes.includes(myAddress)
          ? p.likes.filter(a => a !== myAddress)
          : [...p.likes, myAddress],
      }
    ));
  };

  const handleFollow = (post: TradePost) => {
    if (!myAddress) return;
    const isF = followMap[post.traderAddress] ?? false;
    if (isF) { unfollowTrader(myAddress, post.traderAddress); }
    else { followTrader(myAddress, post.traderAddress); }
    setFollowMap(m => ({ ...m, [post.traderAddress]: !isF }));
  };

  if (commentPost) {
    return <CommentsPanel
      post={commentPost} myAddress={myAddress}
      myName={myProfile?.name ?? shortAddr(myAddress)}
      onClose={() => { setCommentPost(null); loadPosts(); }} />;
  }

  return (
    <div className="flex flex-col h-full bg-[#060e1a] overflow-hidden">
      {showNewPost && myAddress && (
        <NewPostModal
          myAddress={myAddress}
          myName={myProfile?.name ?? shortAddr(myAddress)}
          onClose={() => { setShowNewPost(false); loadPosts(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2">
          <Flame size={18} className="text-[#f59e0b]" />
          <span className="text-base font-bold text-white">Social Feed</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadPosts()} className="p-1.5 rounded-xl bg-white/5 text-white/40 hover:text-white">
            <RefreshCw size={13} />
          </button>
          {myAddress && (
            <button onClick={() => setShowNewPost(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' }}>
              <Plus size={13} />Post Trade
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-2 pb-2 shrink-0">
        {([
          { id: 'all' as FeedTab, label: 'All' },
          { id: 'following' as FeedTab, label: 'Following' },
          { id: 'alerts' as FeedTab, label: 'Alerts', badge: unreadAlerts },
        ]).map(({ id, label, badge }) => (
          <button key={id} onClick={() => { setTab(id); if (id === 'alerts') setUnreadAlerts(0); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-semibold transition-all ${tab === id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
            {id === 'alerts' && unreadAlerts > 0
              ? <BellDot size={13} className="text-[#4e9ff5]" />
              : id === 'alerts' ? <Bell size={13} /> : null}
            {label}
            {badge ? <span className="w-4 h-4 rounded-full bg-[#4e9ff5] text-[9px] font-bold text-white flex items-center justify-center">{badge > 9 ? '9+' : badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'alerts' ? (
        <AlertsPanel myAddress={myAddress} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* No wallet CTA */}
          {!myAddress && (
            <div className="flex items-center gap-3 mx-4 mt-4 bg-[#4e9ff5]/10 border border-[#4e9ff5]/20 rounded-2xl px-4 py-3">
              <AlertTriangle size={16} className="text-[#4e9ff5] shrink-0" />
              <p className="text-xs text-[#4e9ff5]">Open your wallet to post trades, like, follow traders.</p>
            </div>
          )}

          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Flame size={32} className="text-white/15" />
              <p className="text-sm text-white/30">
                {tab === 'following' ? 'Follow traders to see their trades here.' : 'No trades yet.'}
              </p>
              {myAddress && (
                <button onClick={() => setShowNewPost(true)}
                  className="text-xs text-[#4e9ff5] font-semibold mt-1 flex items-center gap-1">
                  <Plus size={12} />Post your first trade
                </button>
              )}
            </div>
          ) : (
            posts.map(p => (
              <PostCard
                key={p.id}
                post={p}
                myAddress={myAddress}
                onLike={() => handleLike(p)}
                onComment={() => setCommentPost(p)}
                onFollow={() => handleFollow(p)}
                isFollowing={followMap[p.traderAddress] ?? false}
                showFollowBtn={tab === 'all'}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
