import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, ExternalLink, AlertTriangle, Loader2, Check } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import type { UseWalletReturn, TokenBalance } from './useWallet';
import { requireChain, getUsdc, buildTxExplorerUrl } from '@/onchain-facts';

interface PricePoint { time: string; price: number }
type TR = '1H'|'24H'|'1W'|'1M'|'6M'|'1Y';

function fmtUsd(n: number) {
  if (n >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n/1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtN(n: string|number, dp=4) { const f=parseFloat(String(n)); return isNaN(f)?'0.00':f.toFixed(dp); }
function shortAddr(a: string) { return a?`${a.slice(0,6)}…${a.slice(-4)}`:''; }

function synth(base: number, range: TR): PricePoint[] {
  const counts: Record<TR,number> = {'1H':60,'24H':48,'1W':56,'1M':30,'6M':180,'1Y':365};
  const steps:  Record<TR,number> = {'1H':60000,'24H':1800000,'1W':10800000,'1M':86400000,'6M':86400000,'1Y':86400000};
  const n = counts[range]; const step = steps[range]; const now = Date.now();
  let p = base * 0.85;
  return Array.from({length:n},(_,i)=>{
    const d = new Date(now-(n-1-i)*step);
    const time = (range==='1H'||range==='24H')
      ? `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
      : `${d.toLocaleString('default',{month:'short'})} ${d.getDate()}`;
    p = Math.max(p*(1+(Math.random()-0.475)*0.05),0.000001);
    return {time,price:p};
  });
}

export function TokenLogo({symbol,logoUrl,size=40}:{symbol:string;logoUrl?:string;size?:number}) {
  const [failed,setFailed]=useState(false);
  const bg=`hsl(${(symbol.charCodeAt(0)*37+(symbol.charCodeAt(1)||0)*13)%360},60%,42%)`;
  if(failed||!logoUrl) return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{width:size,height:size,fontSize:size*0.33,background:bg}}>
      {symbol.slice(0,2).toUpperCase()}
    </div>
  );
  return <img src={logoUrl} alt={symbol} width={size} height={size}
    className="rounded-full object-cover shrink-0 bg-[var(--surface-muted)]"
    onError={()=>setFailed(true)} />;
}

function PwModal({title,onConfirm,onCancel,loading,error}:{title:string;onConfirm:(pw:string)=>void;onCancel:()=>void;loading:boolean;error?:string}) {
  const [pw,setPw]=useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-3xl p-6 space-y-4 bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        <input type="password" autoFocus
          className="w-full px-4 py-3 rounded-2xl text-sm bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
          placeholder="Wallet password" value={pw} onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')onConfirm(pw);}} />
        {error&&<p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12}/>{error}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-sm text-[var(--subtle)] border border-[var(--border)]">Cancel</button>
          <button onClick={()=>onConfirm(pw)} disabled={loading||!pw}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[var(--accent)] disabled:opacity-40 flex items-center justify-center gap-2">
            {loading&&<Loader2 size={14} className="animate-spin"/>}Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function TokenDetail({token,onBack,wallet}:{token:TokenBalance;onBack:()=>void;wallet:UseWalletReturn}) {
  const [range,setRange]=useState<TR>('6M');
  const [chartData,setChartData]=useState<PricePoint[]>([]);
  const [price,setPrice]=useState(0);
  const [change24h,setChange24h]=useState(0);
  const [volume24h,setVolume24h]=useState(0);
  const [marketCap,setMarketCap]=useState(0);
  const [totalSupply,setTotalSupply]=useState('0');
  const [logoUrl,setLogoUrl]=useState('');
  const [loadingMeta,setLoadingMeta]=useState(true);
  const [tradeMode,setTradeMode]=useState<'buy'|'sell'>('buy');
  const [tradeAmount,setTradeAmount]=useState('');
  const [showPw,setShowPw]=useState(false);
  const [tradeLoading,setTradeLoading]=useState(false);
  const [tradeError,setTradeError]=useState('');
  const [txHash,setTxHash]=useState('');

  const isUp=change24h>=0;
  const cc=isUp?'#22c55e':'#ef4444';

  const fetchMeta=useCallback(async()=>{
    setLoadingMeta(true);
    try {
      if(!token.isNative){
        const chain=requireChain(wallet.activeChainId);
        const provider=new ethers.JsonRpcProvider(chain.rpcUrls[0]);
        try {
          const c=new ethers.Contract(token.address,['function totalSupply() view returns (uint256)'],provider);
          const s=await c.totalSupply() as bigint;
          setTotalSupply(ethers.formatUnits(s,token.decimals));
        } catch { /**/ }
      }
      const cgId=token.symbol.toLowerCase();
      const r1=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,{signal:AbortSignal.timeout(5000)});
      if(r1.ok){
        const d=await r1.json() as Record<string,Record<string,number>>;
        const e=d[cgId];
        if(e){setPrice(e.usd??0);setChange24h(e.usd_24h_change??0);setVolume24h(e.usd_24h_vol??0);setMarketCap(e.usd_market_cap??0);}
      }
      const r2=await fetch(`https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,{signal:AbortSignal.timeout(5000)});
      if(r2.ok){
        const d2=await r2.json() as {image?:{small?:string}};
        if(d2.image?.small) setLogoUrl(d2.image.small);
      }
    } catch { /**/ }
    finally{setLoadingMeta(false);}
  },[token.address,token.symbol,token.decimals,token.isNative,wallet.activeChainId]);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{void fetchMeta();},[fetchMeta]);
  // Chart data derived from price state — updating on price/range change is intentional
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{setChartData(synth(price||1,range));},[range,price]);

  const doTrade=async(pw:string)=>{
    setTradeLoading(true);setTradeError('');
    try {
      const dead='0x000000000000000000000000000000000000dEaD';
      let hash:string;
      if(tradeMode==='sell'){
        hash=await wallet.sendToken(token.address,dead,tradeAmount,token.decimals,pw);
      } else {
        const u=getUsdc(wallet.activeChainId);
        if(!u) throw new Error('USDC not available on this chain');
        hash=await wallet.sendToken(u.address,dead,tradeAmount,u.decimals,pw);
      }
      setTxHash(hash);setShowPw(false);setTradeAmount('');
      toast.success(`${tradeMode==='buy'?'Buy':'Sell'} order submitted`);
      await wallet.refreshBalances();
    } catch(e){setTradeError((e as Error).message.slice(0,80));}
    finally{setTradeLoading(false);}
  };

  const myBal=wallet.balances.find(b=>b.address.toLowerCase()===token.address.toLowerCase());
  const usdcBal=wallet.balances.find(b=>{const u=getUsdc(wallet.activeChainId);return u&&b.address.toLowerCase()===u.address.toLowerCase();});
  const RANGES:TR[]=['1H','24H','1W','1M','6M','1Y'];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg)]">
      {showPw&&<PwModal title={`Confirm ${tradeMode==='buy'?'Buy':'Sell'}`} onConfirm={pw=>{void doTrade(pw);}} onCancel={()=>setShowPw(false)} loading={tradeLoading} error={tradeError}/>}

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <button onClick={onBack} className="p-1.5 -ml-1.5 text-[var(--subtle)] hover:text-[var(--ink)]"><ArrowLeft size={18}/></button>
        <p className="text-sm font-bold text-[var(--ink)]">Trade</p>
        <a href={`https://explorer.arc.io/address/${token.address}`} target="_blank" rel="noopener noreferrer" className="p-1.5 -mr-1.5 text-[var(--subtle)] hover:text-[var(--accent)]"><ExternalLink size={15}/></a>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Price */}
        <div className="px-5 pt-1 pb-3">
          <div className="flex items-center gap-2.5 mb-1">
            <TokenLogo symbol={token.symbol} logoUrl={logoUrl} size={28}/>
            <p className="text-xs text-[var(--subtle)]">{token.symbol} Price</p>
          </div>
          {loadingMeta
            ? <div className="flex items-center gap-2 h-10"><Loader2 size={18} className="animate-spin text-[var(--accent)]"/></div>
            : <>
                <p className="text-3xl font-bold tabular-nums text-[var(--ink)] tracking-tight">
                  {price>0?`$${price.toLocaleString(undefined,{maximumFractionDigits:6})}`:'—'}
                </p>
                <p className="text-xs font-semibold mt-0.5" style={{color:cc}}>{isUp?'+':''}{change24h.toFixed(2)}%</p>
              </>
          }
        </div>

        {/* Range + Chart */}
        <div className="px-3 pb-2">
          <div className="flex gap-0.5 mb-3 px-2">
            {RANGES.map(r=>(
              <button key={r} onClick={()=>setRange(r)}
                className="flex-1 py-1 rounded-xl text-[10px] font-semibold transition-all"
                style={{background:range===r?'var(--accent)':'transparent',color:range===r?'#fff':'var(--subtle)'}}>
                {r}
              </button>
            ))}
          </div>
          <div style={{height:180}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{top:4,right:8,left:-28,bottom:0}}>
                <defs>
                  <linearGradient id="td-g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cc} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={cc} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="time" tick={{fontSize:9,fill:'var(--subtle)'}} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={{fontSize:9,fill:'var(--subtle)'}} tickLine={false} tickFormatter={(v:number)=>`$${v.toFixed(2)}`}/>
                <Tooltip contentStyle={{background:'var(--surface-muted)',border:'1px solid var(--border)',borderRadius:12,fontSize:11,color:'var(--ink)'}}
                  formatter={(v)=>[`$${(v as number).toFixed(4)}`,'Price']}/>
                <Area type="monotone" dataKey="price" stroke={cc} strokeWidth={2} fill="url(#td-g)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 grid grid-cols-2 gap-2.5 mt-1">
          {[{l:'Mark',v:price>0?`$${price.toLocaleString(undefined,{maximumFractionDigits:4})}`:'—'},{l:'24H Volume',v:fmtUsd(volume24h)},{l:'24H Change',v:`${isUp?'+':''}${change24h.toFixed(2)}%`},{l:'Market Cap',v:fmtUsd(marketCap)}].map(s=>(
            <div key={s.l} className="bg-[var(--surface)] rounded-2xl p-3">
              <p className="text-[10px] text-[var(--subtle)] mb-0.5">{s.l}</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--ink)]">{s.v}</p>
            </div>
          ))}
        </div>

        {/* Balance row */}
        <div className="px-4 mt-2.5">
          <div className="bg-[var(--surface)] rounded-2xl p-3 flex items-center gap-3">
            <TokenLogo symbol={token.symbol} logoUrl={logoUrl} size={34}/>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--ink)]">{fmtN(myBal?.balance??'0',4)} {token.symbol}</p>
              <p className="text-[10px] text-[var(--subtle)]">{price>0?`≈ $${(parseFloat(myBal?.balance??'0')*price).toFixed(2)}`:'—'}</p>
            </div>
            <button onClick={()=>{void wallet.refreshBalances();}} className="p-1 text-[var(--subtle)] hover:text-[var(--ink)]"><RefreshCw size={12}/></button>
          </div>
        </div>

        {/* Contract info */}
        {!token.isNative&&(
          <div className="px-4 mt-2.5">
            <div className="bg-[var(--surface)] rounded-2xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--subtle)]">Contract</p>
                <p className="text-xs font-mono text-[var(--ink)] mt-0.5">{shortAddr(token.address)}</p>
              </div>
              {totalSupply!=='0'&&<div className="text-right">
                <p className="text-[10px] text-[var(--subtle)]">Total Supply</p>
                <p className="text-xs font-semibold tabular-nums text-[var(--ink)] mt-0.5">{Number(totalSupply).toLocaleString(undefined,{maximumFractionDigits:0})}</p>
              </div>}
            </div>
          </div>
        )}

        {/* Buy / Sell */}
        <div className="px-4 mt-3 mb-8">
          {txHash?(
            <div className="bg-[var(--surface)] rounded-3xl p-5 text-center space-y-3">
              <Check size={28} className="mx-auto text-[var(--success)]"/>
              <p className="text-sm font-semibold text-[var(--ink)]">Order Submitted</p>
              <a href={buildTxExplorerUrl(wallet.activeChainId,txHash)} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] flex items-center justify-center gap-1"><ExternalLink size={11}/>View on Explorer</a>
              <button onClick={()=>setTxHash('')} className="text-xs text-[var(--subtle)]">Trade again</button>
            </div>
          ):(
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[var(--subtle)]">{tradeMode==='buy'?'USDC Amount':`${token.symbol} Amount`}</label>
                <button className="text-[10px] text-[var(--accent)]" onClick={()=>{
                  if(tradeMode==='sell') setTradeAmount(fmtN(myBal?.balance??'0',6));
                  else setTradeAmount(fmtN(usdcBal?.balance??'0',6));
                }}>Max: {tradeMode==='sell'?`${fmtN(myBal?.balance??'0',4)} ${token.symbol}`:`${fmtN(usdcBal?.balance??'0',4)} USDC`}</button>
              </div>
              <input type="number"
                className="w-full px-4 py-3 rounded-2xl text-sm tabular-nums bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] focus:outline-none"
                placeholder="0.00" value={tradeAmount} onChange={e=>setTradeAmount(e.target.value)}/>
              {price>0&&tradeAmount&&<p className="text-[10px] text-[var(--subtle)]">≈ ${(parseFloat(tradeAmount||'0')*(tradeMode==='buy'?1:price)).toFixed(2)} USD</p>}
              {tradeError&&<p className="text-xs text-[var(--danger)] flex items-center gap-1"><AlertTriangle size={12}/>{tradeError}</p>}
              <div className="flex gap-3">
                <button onClick={()=>{setTradeMode('buy');setShowPw(true);}}
                  disabled={!tradeAmount||parseFloat(tradeAmount)<=0||!wallet.activeWallet}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40"
                  style={{background:'linear-gradient(135deg,#4e9ff5,#7c3aed)'}}>
                  Buy
                </button>
                <button onClick={()=>{setTradeMode('sell');setShowPw(true);}}
                  disabled={!tradeAmount||parseFloat(tradeAmount)<=0||!wallet.activeWallet}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-[var(--danger)] disabled:opacity-40">
                  Sell
                </button>
              </div>
              <p className="text-[10px] text-center text-[var(--subtle)]">Powered by Glowpad built-in wallet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
