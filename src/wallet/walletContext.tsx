import { createContext, useContext } from 'react';
import type { UseWalletReturn } from './useWallet';
export const WalletContext = createContext<UseWalletReturn | null>(null);
export function useWalletContext(): UseWalletReturn | null {
  return useContext(WalletContext);
}
