/** Top-level wallet page — routes to setup / lock / dashboard */
import { useWallet } from './useWallet';
import { WalletSetup } from './WalletSetup';
import { WalletLock } from './WalletLock';
import { WalletDashboard } from './WalletDashboard';

export function WalletPage() {
  const wallet = useWallet();

  if (wallet.screen === 'setup') return <WalletSetup wallet={wallet} />;
  if (wallet.screen === 'locked') return <WalletLock wallet={wallet} />;
  return <WalletDashboard wallet={wallet} />;
}
