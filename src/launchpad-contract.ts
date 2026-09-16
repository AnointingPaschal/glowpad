// IMPORTANT: Replace this with the ArcLaunchpad address you deploy to Arc Mainnet.
// The testnet contract at 0x1669b59175941b07072b2984ec98889068085249 is NOT valid on mainnet.
export const LAUNCHPAD_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export const LAUNCHPAD_ABI = [
  {"type":"constructor","inputs":[{"name":"usdcToken","type":"address","internalType":"address"}],"stateMutability":"nonpayable"},
  {"type":"function","name":"BPS_DENOMINATOR","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"PLATFORM_FEE_BPS","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"accumulatedFees","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"claimProceeds","inputs":[{"name":"launchId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"claimRefund","inputs":[{"name":"launchId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"claimTokens","inputs":[{"name":"launchId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"contribute","inputs":[{"name":"launchId","type":"uint256","internalType":"uint256"},{"name":"usdcAmount","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"contributions","inputs":[{"name":"","type":"uint256","internalType":"uint256"},{"name":"","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"createLaunch","inputs":[{"name":"name","type":"string","internalType":"string"},{"name":"symbol","type":"string","internalType":"string"},{"name":"description","type":"string","internalType":"string"},{"name":"totalSupply","type":"uint256","internalType":"uint256"},{"name":"pricePerToken","type":"uint256","internalType":"uint256"},{"name":"softCap","type":"uint256","internalType":"uint256"},{"name":"hardCap","type":"uint256","internalType":"uint256"},{"name":"startTime","type":"uint256","internalType":"uint256"},{"name":"endTime","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"launchId","type":"uint256","internalType":"uint256"}],"stateMutability":"nonpayable"},
  {"type":"function","name":"creatorProceeds","inputs":[{"name":"","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"finalize","inputs":[{"name":"launchId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"getLaunchCount","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"launches","inputs":[{"name":"","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"creator","type":"address","internalType":"address"},{"name":"name","type":"string","internalType":"string"},{"name":"symbol","type":"string","internalType":"string"},{"name":"description","type":"string","internalType":"string"},{"name":"totalSupply","type":"uint256","internalType":"uint256"},{"name":"pricePerToken","type":"uint256","internalType":"uint256"},{"name":"softCap","type":"uint256","internalType":"uint256"},{"name":"hardCap","type":"uint256","internalType":"uint256"},{"name":"startTime","type":"uint256","internalType":"uint256"},{"name":"endTime","type":"uint256","internalType":"uint256"},{"name":"raised","type":"uint256","internalType":"uint256"},{"name":"tokenAddress","type":"address","internalType":"address"},{"name":"finalized","type":"bool","internalType":"bool"},{"name":"succeeded","type":"bool","internalType":"bool"}],"stateMutability":"view"},
  {"type":"function","name":"owner","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},
  {"type":"function","name":"refundClaimed","inputs":[{"name":"","type":"uint256","internalType":"uint256"},{"name":"","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},
  {"type":"function","name":"renounceOwnership","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"tokenClaimed","inputs":[{"name":"","type":"uint256","internalType":"uint256"},{"name":"","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},
  {"type":"function","name":"tokensPurchased","inputs":[{"name":"","type":"uint256","internalType":"uint256"},{"name":"","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"totalTokensSold","inputs":[{"name":"","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"transferOwnership","inputs":[{"name":"newOwner","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"usdc","inputs":[],"outputs":[{"name":"","type":"address","internalType":"contract IERC20"}],"stateMutability":"view"},
  {"type":"function","name":"withdrawFees","inputs":[{"name":"to","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"event","name":"Contributed","inputs":[{"name":"launchId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"contributor","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},
  {"type":"event","name":"LaunchCreated","inputs":[{"name":"launchId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"creator","type":"address","indexed":true,"internalType":"address"},{"name":"name","type":"string","indexed":false,"internalType":"string"},{"name":"symbol","type":"string","indexed":false,"internalType":"string"}],"anonymous":false},
  {"type":"event","name":"LaunchFinalized","inputs":[{"name":"launchId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"succeeded","type":"bool","indexed":false,"internalType":"bool"},{"name":"raised","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},
  {"type":"event","name":"OwnershipTransferred","inputs":[{"name":"previousOwner","type":"address","indexed":true,"internalType":"address"},{"name":"newOwner","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},
  {"type":"event","name":"ProceedsClaimed","inputs":[{"name":"launchId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"recipient","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},
  {"type":"event","name":"RefundClaimed","inputs":[{"name":"launchId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"contributor","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},
  {"type":"event","name":"TokensClaimed","inputs":[{"name":"launchId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"contributor","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},
  {"type":"error","name":"AlreadyClaimed","inputs":[]},
  {"type":"error","name":"AlreadyFinalized","inputs":[]},
  {"type":"error","name":"HardCapReached","inputs":[]},
  {"type":"error","name":"InvalidAddress","inputs":[]},
  {"type":"error","name":"InvalidCaps","inputs":[]},
  {"type":"error","name":"InvalidContributionAmount","inputs":[]},
  {"type":"error","name":"InvalidLaunch","inputs":[]},
  {"type":"error","name":"InvalidTimeRange","inputs":[]},
  {"type":"error","name":"LaunchFailed","inputs":[]},
  {"type":"error","name":"LaunchNotActive","inputs":[]},
  {"type":"error","name":"LaunchSucceeded","inputs":[]},
  {"type":"error","name":"NotContributor","inputs":[]},
  {"type":"error","name":"NotFinalized","inputs":[]},
  {"type":"error","name":"OwnableInvalidOwner","inputs":[{"name":"owner","type":"address","internalType":"address"}]},
  {"type":"error","name":"OwnableUnauthorizedAccount","inputs":[{"name":"account","type":"address","internalType":"address"}]},
  {"type":"error","name":"ReentrancyGuardReentrantCall","inputs":[]},
  {"type":"error","name":"SafeERC20FailedOperation","inputs":[{"name":"token","type":"address","internalType":"address"}]},
  {"type":"error","name":"Unauthorized","inputs":[]},
  {"type":"error","name":"ZeroAmount","inputs":[]}
] as const;

export const ARC_MAINNET_CHAIN_ID = 5042;
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
