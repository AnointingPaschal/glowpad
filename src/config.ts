/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, type Chain } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Arc Mainnet — USDC is the native gas token
export const arcMainnet = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
    public: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
} as const satisfies Chain

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcMainnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
