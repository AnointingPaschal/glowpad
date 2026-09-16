import artifact from '../contracts/out/ArcLaunchpad.sol/ArcLaunchpad.json';

export const LAUNCHPAD_ADDRESS = '0x1669b59175941b07072b2984ec98889068085249' as const;
export const LAUNCHPAD_ABI = artifact.abi;

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

export interface LaunchData {
  creator: string;
  name: string;
  symbol: string;
  description: string;
  totalSupply: bigint;
  pricePerToken: bigint;
  softCap: bigint;
  hardCap: bigint;
  startTime: bigint;
  endTime: bigint;
  raised: bigint;
  tokenAddress: string;
  finalized: boolean;
  succeeded: boolean;
}

export type LaunchStatus = 'upcoming' | 'active' | 'ended' | 'finalized-success' | 'finalized-failed';

export function getLaunchStatus(launch: LaunchData): LaunchStatus {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (launch.finalized) {
    return launch.succeeded ? 'finalized-success' : 'finalized-failed';
  }
  if (now < launch.startTime) return 'upcoming';
  if (now <= launch.endTime) return 'active';
  return 'ended';
}

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

export function parseUsdc(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  const fracPadded = frac.slice(0, 6).padEnd(6, '0');
  return BigInt(whole || '0') * 1_000_000n + BigInt(fracPadded);
}

export function formatToken(amount: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  return whole.toLocaleString();
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatCountdown(endTimeSec: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (endTimeSec <= now) return 'Ended';
  const secs = Number(endTimeSec - now);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function progressPct(raised: bigint, hardCap: bigint): number {
  if (hardCap === 0n) return 0;
  return Math.min(100, Number((raised * 10000n) / hardCap) / 100);
}
