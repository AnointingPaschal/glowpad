/**
 * Wallet store — localStorage-backed, ethers.js encrypted keystores.
 * Each wallet entry stores:
 *   - id, name, address (unencrypted for display)
 *   - encryptedKeystore: ethers encrypted JSON keystore (AES-128-CTR, scrypt)
 *   - encryptedMnemonic: optional, same password, JSON keystore of the mnemonic wallet
 */
import { ethers } from 'ethers';

export interface WalletEntry {
  id: string;
  name: string;
  address: string;
  encryptedKeystore: string;
  /** If wallet was created from seed phrase, the mnemonic is also encrypted here */
  encryptedMnemonic?: string;
}

export interface CustomToken {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface WalletStore {
  wallets: WalletEntry[];
  activeWalletId: string | null;
  customTokens: CustomToken[];
}

const STORE_KEY = 'gp_wallets';
const SESSION_KEY = 'gp_wallet_session';

function loadStore(): WalletStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { wallets: [], activeWalletId: null, customTokens: [] };
    return JSON.parse(raw) as WalletStore;
  } catch {
    return { wallets: [], activeWalletId: null, customTokens: [] };
  }
}

function saveStore(store: WalletStore): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export function getStore(): WalletStore {
  return loadStore();
}

export function getWallets(): WalletEntry[] {
  return loadStore().wallets;
}

export function getActiveWalletId(): string | null {
  return loadStore().activeWalletId;
}

export function setActiveWallet(id: string): void {
  const store = loadStore();
  saveStore({ ...store, activeWalletId: id });
}

/** Create a brand-new HD wallet and encrypt it */
export async function createWallet(name: string, password: string): Promise<WalletEntry> {
  const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16));
  const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
  const wallet = hdWallet.deriveChild(0);

  const [keystore, _mnemonicKeystore] = await Promise.all([
    wallet.encrypt(password),
    wallet.encrypt(password), // same password — stores PK; we'll keep mnemonic separately
  ]);

  // Encrypt mnemonic as a separate entry
  const mnemonicWallet = ethers.Wallet.fromPhrase(mnemonic);
  const encMnemonic = await mnemonicWallet.encrypt(password);

  const entry: WalletEntry = {
    id: crypto.randomUUID(),
    name,
    address: wallet.address,
    encryptedKeystore: keystore,
    encryptedMnemonic: encMnemonic,
  };

  const store = loadStore();
  const newStore: WalletStore = {
    ...store,
    wallets: [...store.wallets, entry],
    activeWalletId: store.activeWalletId ?? entry.id,
  };
  saveStore(newStore);
  return entry;
}

/** Import from private key or mnemonic phrase */
export async function importWallet(
  name: string,
  secret: string,
  password: string,
): Promise<WalletEntry> {
  let wallet: ethers.Wallet | ethers.HDNodeWallet;
  let encMnemonic: string | undefined;

  const trimmed = secret.trim();
  if (trimmed.split(' ').length >= 12) {
    // Mnemonic
    const hdWallet = ethers.HDNodeWallet.fromPhrase(trimmed);
    wallet = new ethers.Wallet(hdWallet.deriveChild(0).privateKey);
    const mnemonicWallet = ethers.Wallet.fromPhrase(trimmed);
    encMnemonic = await mnemonicWallet.encrypt(password);
  } else {
    // Private key
    wallet = new ethers.Wallet(trimmed);
  }

  const keystore = await wallet.encrypt(password);
  const entry: WalletEntry = {
    id: crypto.randomUUID(),
    name,
    address: wallet.address,
    encryptedKeystore: keystore,
    encryptedMnemonic: encMnemonic,
  };

  const store = loadStore();
  const newStore: WalletStore = {
    ...store,
    wallets: [...store.wallets, entry],
    activeWalletId: store.activeWalletId ?? entry.id,
  };
  saveStore(newStore);
  return entry;
}

/** Decrypt and return a wallet signer (use for transactions) */
export async function decryptWallet(
  entry: WalletEntry,
  password: string,
): Promise<ethers.Wallet | ethers.HDNodeWallet> {
  const wallet = await ethers.Wallet.fromEncryptedJson(entry.encryptedKeystore, password);
  return wallet;
}

/** Export plain private key (requires password) */
export async function exportPrivateKey(
  entry: WalletEntry,
  password: string,
): Promise<string> {
  const wallet = await decryptWallet(entry, password);
  return wallet.privateKey;
}

/** Export mnemonic phrase (requires password, only works if wallet was created from mnemonic) */
export async function exportMnemonic(
  entry: WalletEntry,
  password: string,
): Promise<string | null> {
  if (!entry.encryptedMnemonic) return null;
  const wallet = await ethers.Wallet.fromEncryptedJson(entry.encryptedMnemonic, password);
  return (wallet as ethers.HDNodeWallet).mnemonic?.phrase ?? null;
}

/** Store a valid session password hash in sessionStorage */
export async function storeSession(password: string): Promise<void> {
  const buf = new TextEncoder().encode(password + '_session');
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(SESSION_KEY, hash);
}

/** Verify session is still valid */
export async function verifySession(password: string): Promise<boolean> {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return false;
  const buf = new TextEncoder().encode(password + '_session');
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hash === stored;
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function hasSession(): boolean {
  return !!sessionStorage.getItem(SESSION_KEY);
}

export function removeWallet(id: string): void {
  const store = loadStore();
  const wallets = store.wallets.filter(w => w.id !== id);
  const activeWalletId = store.activeWalletId === id
    ? (wallets[0]?.id ?? null)
    : store.activeWalletId;
  saveStore({ ...store, wallets, activeWalletId });
}

export function addCustomToken(token: CustomToken): void {
  const store = loadStore();
  const exists = store.customTokens.some(
    t => t.address.toLowerCase() === token.address.toLowerCase() && t.chainId === token.chainId,
  );
  if (!exists) {
    saveStore({ ...store, customTokens: [...store.customTokens, token] });
  }
}

export function removeCustomToken(address: string, chainId: number): void {
  const store = loadStore();
  saveStore({
    ...store,
    customTokens: store.customTokens.filter(
      t => !(t.address.toLowerCase() === address.toLowerCase() && t.chainId === chainId),
    ),
  });
}

export function getCustomTokens(): CustomToken[] {
  return loadStore().customTokens;
}
