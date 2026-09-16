/**
 * useWallet — React hook managing the wallet system state.
 */
import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getStore,
  getWallets,
  createWallet,
  importWallet,
  decryptWallet,
  removeWallet,
  addCustomToken,
  removeCustomToken,
  getCustomTokens,
  setActiveWallet,
  storeSession,
  clearSession,
  hasSession,
  type WalletEntry,
  type CustomToken,
} from './walletStore';
import { requireChain, getUsdc } from '@/onchain-facts';

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  isNative: boolean;
  usdValue?: string;
  change24h?: string;
  watchlisted?: boolean;
}

export interface TxRecord {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp: number;
  chainId: number;
  label?: string;
}

export type WalletScreen = 'setup' | 'locked' | 'unlocked';

export interface UseWalletReturn {
  screen: WalletScreen;
  wallets: WalletEntry[];
  activeWallet: WalletEntry | null;
  balances: TokenBalance[];
  history: TxRecord[];
  txHistory: TxRecord[];
  customTokens: CustomToken[];
  isLoadingBalances: boolean;
  isLoadingHistory: boolean;
  balancesLoaded: boolean;
  activeChainId: number;
  setup: (name: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  createNew: (name: string, password: string) => Promise<void>;
  importExisting: (name: string, secret: string, password: string) => Promise<void>;
  selectWallet: (id: string) => void;
  setActiveWallet: (idx: number) => void;
  removeWalletById: (id: string) => void;
  addCustomToken: (address: string, symbol: string, name: string, decimals: number) => void;
  removeCustomToken: (address: string, chainId: number) => void;
  lookupToken: (address: string) => Promise<{ symbol: string; name: string; decimals: number }>;
  refreshBalances: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  sendNative: (to: string, amount: string, password: string) => Promise<string>;
  sendToken: (tokenAddress: string, to: string, amount: string, decimals: number, password: string) => Promise<string>;
  setActiveChainId: (id: number) => void;
  exportPrivateKey: (password: string) => Promise<string>;
  exportMnemonic: (password: string) => Promise<string>;
  callContract: (
    contractAddress: string,
    abi: ethers.InterfaceAbi,
    functionName: string,
    args: unknown[],
    password: string,
    value?: bigint,
  ) => Promise<string>;
}

export function useWallet(): UseWalletReturn {
  const [screen, setScreen] = useState<WalletScreen>(() => {
    const store = getStore();
    if (store.wallets.length === 0) return 'setup';
    if (!hasSession()) return 'locked';
    return 'unlocked';
  });
  const [wallets, setWallets] = useState<WalletEntry[]>(() => getWallets());
  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(() => getStore().activeWalletId);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [balancesLoaded, setBalancesLoaded] = useState(false);
  const [activeChainId, setActiveChainId] = useState(5042); // Arc Mainnet
  const [_sessionPw, setSessionPw] = useState(''); // held in memory during session

  const activeWallet = wallets.find(w => w.id === activeWalletId) ?? wallets[0] ?? null;

  // ── Balances ────────────────────────────────────────────────────────────────
  const refreshBalances = useCallback(async () => {
    if (!activeWallet) return;
    setIsLoadingBalances(true);
    try {
      const chain = requireChain(activeChainId);
      const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
      const results: TokenBalance[] = [];

      // USDC ERC-20 balance (the one true balance on Arc)
      const usdcFact = getUsdc(activeChainId);
      if (usdcFact) {
        const contract = new ethers.Contract(
          usdcFact.address,
          ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)', 'function name() view returns (string)'],
          provider,
        );
        const [bal, symbol, name] = await Promise.all([
          contract.balanceOf(activeWallet.address) as Promise<bigint>,
          contract.symbol() as Promise<string>,
          contract.name() as Promise<string>,
        ]);
        results.push({
          address: usdcFact.address,
          symbol,
          name,
          decimals: usdcFact.decimals,
          balance: ethers.formatUnits(bal, usdcFact.decimals),
          isNative: false,
        });
      } else {
        // Non-Arc chain: show native balance
        const bal = await provider.getBalance(activeWallet.address);
        const nc = chain.nativeCurrency;
        results.push({
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: nc.symbol,
          name: nc.symbol,
          decimals: nc.decimals,
          balance: ethers.formatUnits(bal, nc.decimals),
          isNative: true,
        });
      }

      // Custom tokens for this chain
      const custom = getCustomTokens().filter(t => t.chainId === activeChainId);
      await Promise.allSettled(
        custom.map(async t => {
          try {
            const c = new ethers.Contract(
              t.address,
              ['function balanceOf(address) view returns (uint256)'],
              provider,
            );
            const bal = await c.balanceOf(activeWallet.address) as bigint;
            results.push({
              address: t.address,
              symbol: t.symbol,
              name: t.name,
              decimals: t.decimals,
              balance: ethers.formatUnits(bal, t.decimals),
              isNative: false,
            });
          } catch { /* skip failed token reads */ }
        }),
      );

      // ── Live USD price enrichment ──────────────────────────────────────────
      // Run after on-chain reads so balances appear instantly while prices load.
      try {
        // Known symbol → CoinGecko ID map for stable / major tokens
        const cgIdMap: Record<string, string> = {
          usdc: 'usd-coin', usdt: 'tether', eth: 'ethereum', weth: 'weth',
          btc: 'bitcoin', wbtc: 'wrapped-bitcoin', bnb: 'binancecoin',
          sol: 'solana', matic: 'matic-network', arb: 'arbitrum',
          op: 'optimism', avax: 'avalanche-2', link: 'chainlink',
          uni: 'uniswap', aave: 'aave', dai: 'dai',
        };

        await Promise.allSettled(results.map(async (token, idx) => {
          // USDC on Arc is always $1.00
          if (token.symbol.toUpperCase() === 'USDC') {
            results[idx] = { ...token, usdValue: token.balance, change24h: '0' };
            return;
          }

          // 1. Try DexScreener by contract address (works for any EVM token)
          if (!token.isNative && token.address && token.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
            try {
              const r = await fetch(
                `https://api.dexscreener.com/latest/dex/tokens/${token.address}`,
                { signal: AbortSignal.timeout(5000) },
              );
              if (r.ok) {
                const d = await r.json() as { pairs?: Array<{ priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number } }> };
                if (d.pairs && d.pairs.length > 0) {
                  const top = d.pairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
                  if (top.priceUsd) {
                    const price = parseFloat(top.priceUsd);
                    const bal = parseFloat(token.balance);
                    results[idx] = {
                      ...token,
                      usdValue: (bal * price).toFixed(4),
                      change24h: String(top.priceChange?.h24 ?? 0),
                    };
                    return;
                  }
                }
              }
            } catch { /* ignore */ }
          }

          // 2. Fallback: CoinGecko by symbol for major tokens
          const cgId = cgIdMap[token.symbol.toLowerCase()];
          if (cgId) {
            try {
              const r = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true`,
                { signal: AbortSignal.timeout(5000) },
              );
              if (r.ok) {
                const d = await r.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
                const e = d[cgId];
                if (e?.usd) {
                  const price = e.usd;
                  const bal = parseFloat(token.balance);
                  results[idx] = {
                    ...token,
                    usdValue: (bal * price).toFixed(4),
                    change24h: String(e.usd_24h_change ?? 0),
                  };
                }
              }
            } catch { /* ignore */ }
          }
        }));
      } catch { /* price enrichment is best-effort */ }

      setBalances(results);
      setBalancesLoaded(true);
    } catch (e) {
      console.error('Balance fetch failed:', e);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [activeWallet, activeChainId]);

  // ── History ─────────────────────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    if (!activeWallet) return;
    setIsLoadingHistory(true);
    try {
      const chain = requireChain(activeChainId);
      const explorerBase = chain.explorerBase;
      // Use explorer API if available (Blockscout-style)
      const url = `${explorerBase}/api?module=account&action=txlist&address=${activeWallet.address}&sort=desc&page=1&offset=25`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Explorer fetch failed');
      const data = await resp.json() as { result: Array<Record<string, string>> };
      if (!Array.isArray(data.result)) { setTxHistory([]); return; }
      const records: TxRecord[] = data.result.slice(0, 25).map(tx => ({
        hash: tx.hash ?? '',
        from: tx.from ?? '',
        to: tx.to ?? null,
        value: tx.value ?? '0',
        timestamp: Number(tx.timeStamp ?? 0),
        chainId: activeChainId,
      }));
      setTxHistory(records);
    } catch {
      setTxHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [activeWallet, activeChainId]);

  // ── Auto-refresh on unlock / chain switch ──────────────────────────────────
  useEffect(() => {
    if (screen === 'unlocked' && activeWallet) {
      // Intentional async data fetch pattern: external system → setState
      void refreshBalances(); // oxlint-disable-line react/set-state-in-effect
      void refreshHistory();  // oxlint-disable-line react/set-state-in-effect
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeWallet?.id, activeChainId]);

  // ── Setup ───────────────────────────────────────────────────────────────────
  const setup = useCallback(async (name: string, password: string) => {
    const entry = await createWallet(name, password);
    await storeSession(password);
    setSessionPw(password);
    setWallets([entry]);
    setActiveWalletIdState(entry.id);
    setScreen('unlocked');
  }, []);

  // ── Unlock ──────────────────────────────────────────────────────────────────
  const unlock = useCallback(async (password: string) => {
    const store = getStore();
    const first = store.wallets[0];
    if (!first) throw new Error('No wallets found');
    // Verify password by attempting to decrypt
    await decryptWallet(first, password);
    await storeSession(password);
    setSessionPw(password);
    setWallets(store.wallets);
    setActiveWalletIdState(store.activeWalletId ?? first.id);
    setScreen('unlocked');
  }, []);

  // ── Lock ────────────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    clearSession();
    setSessionPw('');
    setBalances([]);
    setTxHistory([]);
    setScreen('locked');
  }, []);

  // ── Create new wallet ───────────────────────────────────────────────────────
  const createNew = useCallback(async (name: string, password: string) => {
    const entry = await createWallet(name, password);
    setWallets(getWallets());
    setActiveWalletIdState(entry.id);
  }, []);

  // ── Import existing ─────────────────────────────────────────────────────────
  const importExisting = useCallback(async (name: string, secret: string, password: string) => {
    const entry = await importWallet(name, secret, password);
    setWallets(getWallets());
    setActiveWalletIdState(entry.id);
  }, []);

  // ── Select wallet ───────────────────────────────────────────────────────────
  const selectWallet = useCallback((id: string) => {
    setActiveWallet(id);
    setActiveWalletIdState(id);
    setBalances([]);
  }, []);

  // ── Remove wallet ────────────────────────────────────────────────────────────
  const removeWalletById = useCallback((id: string) => {
    removeWallet(id);
    const updated = getWallets();
    setWallets(updated);
    if (updated.length === 0) {
      clearSession();
      setScreen('setup');
    } else {
      setActiveWalletIdState(updated[0]?.id ?? null);
    }
  }, []);

  // ── Custom tokens ────────────────────────────────────────────────────────────

  const removeToken = useCallback((address: string, chainId: number) => {
    removeCustomToken(address, chainId);
  }, []);

  // ── Send native / ERC-20 ─────────────────────────────────────────────────────
  const sendNative = useCallback(async (to: string, amount: string, password: string): Promise<string> => {
    if (!activeWallet) throw new Error('No active wallet');
    const signer = await decryptWallet(activeWallet, password);
    const chain = requireChain(activeChainId);
    const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
    const connected = signer.connect(provider);
    const tx = await connected.sendTransaction({
      to,
      value: ethers.parseEther(amount),
    });
    return tx.hash;
  }, [activeWallet, activeChainId]);

  const sendToken = useCallback(async (
    tokenAddress: string,
    to: string,
    amount: string,
    decimals: number,
    password: string,
  ): Promise<string> => {
    if (!activeWallet) throw new Error('No active wallet');
    const signer = await decryptWallet(activeWallet, password);
    const chain = requireChain(activeChainId);
    const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
    const connected = signer.connect(provider);
    const contract = new ethers.Contract(
      tokenAddress,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      connected,
    );
    const tx = await (contract.transfer(to, ethers.parseUnits(amount, decimals)) as Promise<ethers.TransactionResponse>);
    return tx.hash;
  }, [activeWallet, activeChainId]);

  // ── setActiveWallet by index ─────────────────────────────────────────────────
  const setActiveWalletByIndex = useCallback((idx: number) => {
    const w = wallets[idx];
    if (w) { setActiveWallet(w.id); setActiveWalletIdState(w.id); setBalances([]); setBalancesLoaded(false); }
  }, [wallets]);

  // ── addCustomToken (flat signature for dashboard) ────────────────────────────
  const addTokenFlat = useCallback((address: string, symbol: string, name: string, decimals: number) => {
    addCustomToken({ address, symbol, name, decimals, chainId: activeChainId });
  }, [activeChainId]);

  // ── lookupToken ──────────────────────────────────────────────────────────────
  const lookupToken = useCallback(async (address: string) => {
    const chain = requireChain(activeChainId);
    const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
    const c = new ethers.Contract(address, [
      'function symbol() view returns (string)',
      'function name() view returns (string)',
      'function decimals() view returns (uint8)',
    ], provider);
    const [symbol, name, decimals] = await Promise.all([
      c.symbol() as Promise<string>,
      c.name() as Promise<string>,
      c.decimals() as Promise<number>,
    ]);
    return { symbol, name, decimals };
  }, [activeChainId]);

  // ── exportPrivateKey ─────────────────────────────────────────────────────────
  const exportPrivateKey = useCallback(async (password: string) => {
    if (!activeWallet) throw new Error('No active wallet');
    const signer = await decryptWallet(activeWallet, password);
    if (!('privateKey' in signer)) throw new Error('Cannot export private key from this wallet type');
    return signer.privateKey;
  }, [activeWallet]);

  // ── exportMnemonic ───────────────────────────────────────────────────────────
  const exportMnemonic = useCallback(async (password: string) => {
    if (!activeWallet) throw new Error('No active wallet');
    const signer = await decryptWallet(activeWallet, password);
    const phrase = (signer as ethers.HDNodeWallet).mnemonic?.phrase;
    if (!phrase) throw new Error('No mnemonic for this wallet (imported via private key)');
    return phrase;
  }, [activeWallet]);

  // ── callContract — generic write to any contract ─────────────────────────────
  const callContract = useCallback(async (
    contractAddress: string,
    abi: ethers.InterfaceAbi,
    functionName: string,
    args: unknown[],
    password: string,
    value?: bigint,
  ): Promise<string> => {
    if (!activeWallet) throw new Error('No active wallet');
    const signer = await decryptWallet(activeWallet, password);
    const chain = requireChain(activeChainId);
    const provider = new ethers.JsonRpcProvider(chain.rpcUrls[0]);
    const connected = signer.connect(provider);
    const contract = new ethers.Contract(contractAddress, abi, connected);
    const fn = contract[functionName];
    if (typeof fn !== 'function') throw new Error(`Function ${functionName} not found in ABI`);
    const tx = await (fn(...args, ...(value !== undefined ? [{ value }] : [])) as Promise<ethers.TransactionResponse>);
    return tx.hash;
  }, [activeWallet, activeChainId]);

  const customTokens = getCustomTokens();

  return {
    screen,
    wallets,
    activeWallet,
    balances,
    history: txHistory,
    customTokens,
    txHistory,
    isLoadingBalances,
    isLoadingHistory,
    balancesLoaded,
    activeChainId,
    setup,
    unlock,
    lock,
    createNew,
    importExisting,
    selectWallet,
    setActiveWallet: setActiveWalletByIndex,
    removeWalletById,
    addCustomToken: addTokenFlat,
    removeCustomToken: removeToken,
    lookupToken,
    refreshBalances,
    refreshHistory,
    sendNative,
    sendToken,
    setActiveChainId,
    exportPrivateKey,
    exportMnemonic,
    callContract,
  };
}
