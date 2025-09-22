// API Endpoints
export const TDX_SERVER_URL = 'http://127.0.0.1:8080'

// Smart Contract Addresses (update with actual deployed addresses)
export const REGISTRY_CONTRACT_ADDRESS = '0x...' // Update after deployment

// Hyperliquid Networks
export const HYPERLIQUID_NETWORKS = {
  testnet: {
    name: 'Hyperliquid Testnet',
    rpcUrl: 'https://rpc.hyperliquid-testnet.xyz/evm',
    chainId: 998,
  },
  mainnet: {
    name: 'Hyperliquid Mainnet', 
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
    chainId: 999,
  }
}

// Use mainnet by default
export const DEFAULT_NETWORK = 'mainnet'

// Application Steps
export const STEPS = {
  WELCOME: 'welcome',
  REGISTER: 'register',
  APPROVE: 'approve',
  VERIFY: 'verify', 
  DASHBOARD: 'dashboard',
  TRADING: 'trading'
}

// Demo Data
export const DEMO_AGENT = {
  address: '0x1234567890123456789012345678901234567890',
  apiKey: 'demo-api-key-12345',
  userId: 'demo-user',
  status: 'registered'
}

export const DEMO_ATTESTATION = {
  quote: '0xabcdef...',
  mrenclave: '0x1234567890abcdef...',
  mrsigner: '0xfedcba0987654321...',
  timestamp: Date.now()
}