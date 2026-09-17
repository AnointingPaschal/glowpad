/**
 * LeaderboardScreen — FOMO-style trader rankings
 * Ranked by P&L %. Follow traders, view profiles, see their public trades.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Trophy, TrendingUp, TrendingDown, UserPlus, UserMinus,
  ChevronRight, Activity, Star, Flame, RefreshCw,
} from 'lucide-react';
import {
  getLeaderboard, followTrader, unfollowTrader, getProfile, getFeed,
  upsertProfile, setMyAddress, getMyAddress,
  type TraderProfile,
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
function pnlColor(s: string) {
  if (s.startsWith('+')) return '#4ade80';
  if (s.startsWith('-')) return '#f87171';
  return 'rgba(255,255,255,0.6)';
}
function shortAddr(a: string) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''; }

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: avatarBg(name) }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

// ── Rank medal ─────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-xs font-bold text-white/30 w-6 text-center">#{rank}</span>;
}

// ── Trader profile panel ────────────────────────────────────────────────────
function ProfilePanel({
  profile, myAddress, isFollowing,
  onFollow, onBack,
}: {
  profile: TraderProfile; myAddress: string; isFollowing: boolean;
  onFollow: () => void; onBack: () => void;
}) {
  const trades = getFeed().filter(p => p.traderAddress === profile.address).slice(0, 10);

  return (
    <div className="flex flex-col h-full bg-[#060e1a] overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-white/[0.07] shrink-0">
        <button onClick={onBack} className="text-white/40 hover:text-white text-xl leading-none">←</button>
        <p className="text-sm font-bold text-white">{profile.name}</p>
        {profile.isVerified && <span className="text-[10px] text-[#4e9ff5] font-semibold bg-[#4e9ff5]/10 px-2 py-0.5 rounded-full">Verified</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile header */}
        <div className="px-4 pt-6 pb-4 text-center">
          <Avatar name={profile.name} size={64} />
          <p className="text-base font-extrabold text-white mt-3">{profile.name}</p>
          <p className="text-xs text-white/30 font-mono mt-0.5">{shortAddr(profile.address)}</p>
          {profile.bio && <p className="text-sm text-white/60 mt-2 leading-relaxed max-w-xs mx-auto">{profile.bio}</p>}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[
              { label: 'P&L', value: profile.totalPnlUsd, style: { color: pnlColor(profile.totalPnlUsd) } },
              { label: 'Return', value: profile.totalPnlPct, style: { color: pnlColor(profile.totalPnlPct) } },
              { label: 'Win Rate', value: profile.winRate, style: { color: 'white' } },
              { label: 'Trades', value: profile.tradeCount.toString(), style: { color: 'white' } },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.04] rounded-2xl py-3">
                <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                <p className="text-sm font-extrabold tabular-nums" style={s.style}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Follow counts */}
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <div className="text-center">
              <p className="font-extrabold text-white">{profile.followers.length}</p>
              <p className="text-[10px] text-white/30">Followers</p>
            </div>
            <div className="text-center">
              <p className="font-extrabold text-white">{profile.following.length}</p>
              <p className="text-[10px] text-white/30">Following</p>
            </div>
          </div>

          {/* Follow button */}
          {myAddress && myAddress !== profile.address && (
            <button onClick={onFollow}
              className={`mt-4 flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold mx-auto transition-all ${isFollowing ? 'border border-white/15 text-white/50' : 'text-white'}`}
              style={!isFollowing ? { background: 'linear-gradient(135deg,#4e9ff5,#7c3aed)' } : {}}>
              {isFollowing ? <><UserMinus size={15} />Unfollow</> : <><UserPlus size={15} />Follow</>}
            </button>
          )}
        </div>

        {/* Recent trades */}
        {trades.length > 0 && (
          <div className="px-4 pb-8">
            <p className="text-sm font-bold text-white mb-3">Recent Trades</p>
            <div className="space-y-2">
              {trades.map(t => (
                <div key={t.id} className="bg-white/[0.04] rounded-2xl px-4 py-3 border border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.side === 'buy' ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'}`}>
                        {t.side.toUpperCase()}
                      </span>
                      <span className="text-sm font-bold text-white">{t.tokenSymbol}</span>
                      <span className="text-xs text-white/40">{t.amount}</span>
                    </div>
                    {t.pnlUsd && (
                      <span className="text-xs font-bold tabular-nums" style={{ color: pnlColor(t.pnlUsd) }}>
                        {t.pnlUsd}
                      </span>
                    )}
                  </div>
                  {t.thesis && <p className="text-xs text-white/40 mt-1.5 leading-relaxed line-clamp-2">{t.thesis}</p>}
                  <p className="text-[10px] text-white/20 mt-1">{relTime(t.timestamp)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard row ─────────────────────────────────────────────────────────
function LeaderRow({
  profile, rank, myAddress, isFollowing, isMe,
  onFollow, onSelect,
}: {
  profile: TraderProfile; rank: number; myAddress: string; isFollowing: boolean; isMe: boolean;
  onFollow: (e: React.MouseEvent) => void; onSelect: () => void;
}) {
  const pnlUp = profile.totalPnlPct.startsWith('+');
  return (
    <button onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors text-left">
      {/* Rank */}
      <div className="w-8 flex items-center justify-center shrink-0">
        <RankBadge rank={rank} />
      </div>

      {/* Avatar */}
      <Avatar name={profile.name} size={40} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white truncate">{profile.name}</span>
          {profile.isVerified && <Star size={10} className="text-[#f59e0b] fill-[#f59e0b] shrink-0" />}
          {isMe && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#4e9ff5]/15 text-[#4e9ff5]">You</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/30">
          <span>{profile.tradeCount} trades</span>
          <span>·</span>
          <span className="text-[#4ade80]">{profile.winRate} WR</span>
          <span>·</span>
          <span>{profile.followers.length} followers</span>
        </div>
      </div>

      {/* P&L */}
      <div className="text-right shrink-0 mr-2">
        <div className="flex items-center gap-1 justify-end" style={{ color: pnlColor(profile.totalPnlPct) }}>
          {pnlUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span className="text-sm font-extrabold tabular-nums">{profile.totalPnlPct}</span>
        </div>
        <p className="text-[10px] tabular-nums mt-0.5" style={{ color: pnlColor(profile.totalPnlUsd) }}>{profile.totalPnlUsd}</p>
      </div>

      {/* Follow button */}
      {myAddress && myAddress !== profile.address && (
        <button onClick={onFollow}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${isFollowing ? 'text-white/25 border border-white/10' : 'text-[#4e9ff5] bg-[#4e9ff5]/10 border border-[#4e9ff5]/20'}`}>
          {isFollowing ? <UserMinus size={11} /> : <UserPlus size={11} />}
        </button>
      )}
      <ChevronRight size={13} className="text-white/15 shrink-0" />
    </button>
  );
}

// ── Stats banner ────────────────────────────────────────────────────────────
function StatsBanner({ leaders }: { leaders: TraderProfile[] }) {
  const topPnl = leaders[0];
  const totalTrades = leaders.reduce((s, l) => s + l.tradeCount, 0);
  const avgWinRate = leaders.length > 0
    ? (leaders.reduce((s, l) => s + parseFloat(l.winRate.replace('%', '')), 0) / leaders.length).toFixed(0) + '%'
    : '—';
  return (
    <div className="mx-4 my-3 rounded-2xl overflow-hidden border border-white/[0.07]"
      style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #0a1628 100%)' }}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} className="text-[#f59e0b]" />
          <span className="text-sm font-bold text-white">Leaderboard</span>
          <span className="text-[10px] text-white/30">· {leaders.length} traders</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Top Trader', value: topPnl?.name ?? '—', sub: topPnl ? topPnl.totalPnlPct : '' },
            { label: 'Avg Win Rate', value: avgWinRate, sub: 'of all traders' },
            { label: 'Total Trades', value: totalTrades.toString(), sub: 'across all' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-[10px] text-white/30 mb-0.5">{s.label}</p>
              <p className="text-sm font-extrabold text-white">{s.value}</p>
              {s.sub && <p className="text-[9px] text-white/25 mt-0.5">{s.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main LeaderboardScreen ─────────────────────────────────────────────────
type LbTab = 'all' | 'following';

export function LeaderboardScreen() {
  const walletCtx = useWalletContext();
  const myAddress = walletCtx?.activeWallet?.address ?? getMyAddress() ?? '';

  const [tab, setTab] = useState<LbTab>('all');
  const [leaders, setLeaders] = useState<TraderProfile[]>([]);
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<TraderProfile | null>(null);

  const load = useCallback(() => {
    if (myAddress && !getProfile(myAddress)) {
      setMyAddress(myAddress);
      upsertProfile({ address: myAddress, name: shortAddr(myAddress), totalPnlUsd: '$0', totalPnlPct: '0%', winRate: '0%', tradeCount: 0, followers: [], following: [], joinedAt: Date.now() });
    }
    const all = getLeaderboard();
    const me = myAddress ? getProfile(myAddress) : undefined;
    if (tab === 'following' && me) {
      const following = new Set(me.following);
      setLeaders(all.filter(t => following.has(t.address)));
    } else {
      setLeaders(all);
    }
    if (me) {
      const fm: Record<string, boolean> = {};
      all.forEach(t => { fm[t.address] = me.following.includes(t.address); });
      setFollowMap(fm);
    }
  }, [myAddress, tab]);

  // eslint-disable-next-line react/set-state-in-effect -- async fetch from external store is intentional
  useEffect(() => { load(); }, [load]);

  const handleFollow = (profile: TraderProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!myAddress) return;
    const isF = followMap[profile.address] ?? false;
    if (isF) { unfollowTrader(myAddress, profile.address); }
    else { followTrader(myAddress, profile.address); }
    setFollowMap(m => ({ ...m, [profile.address]: !isF }));
  };

  if (selected) {
    return (
      <ProfilePanel
        profile={selected}
        myAddress={myAddress}
        isFollowing={followMap[selected.address] ?? false}
        onFollow={() => {
          const isF = followMap[selected.address] ?? false;
          if (isF) { unfollowTrader(myAddress, selected.address); }
          else { followTrader(myAddress, selected.address); }
          setFollowMap(m => ({ ...m, [selected.address]: !isF }));
        }}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#060e1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-[#f59e0b]" />
          <span className="text-base font-bold text-white">Leaderboard</span>
        </div>
        <button onClick={load} className="p-1.5 rounded-xl bg-white/5 text-white/40 hover:text-white">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2 shrink-0">
        {([{ id: 'all' as LbTab, label: 'All Traders', icon: Activity }, { id: 'following' as LbTab, label: 'Following', icon: Flame }]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-2xl text-xs font-semibold transition-all ${tab === id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {leaders.length === 0 && tab === 'following' ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Trophy size={28} className="text-white/15" />
            <p className="text-sm text-white/30">Follow traders to see their rankings here</p>
          </div>
        ) : (
          <>
            <StatsBanner leaders={leaders} />
            {leaders.map((t, i) => (
              <LeaderRow
                key={t.address}
                profile={t}
                rank={i + 1}
                myAddress={myAddress}
                isFollowing={followMap[t.address] ?? false}
                isMe={t.address === myAddress}
                onFollow={e => handleFollow(t, e)}
                onSelect={() => setSelected(t)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
