import axios from 'axios'
import { TDX_SERVER_URL } from '../utils/constants'

// Create axios instance with base configuration
const api = axios.create({
  baseURL: TDX_SERVER_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for API key authentication
api.interceptors.request.use(
  (config) => {
    // Add API key to headers if available
    const apiKey = sessionStorage.getItem('hypereth-api-key')
    if (apiKey && config.url?.includes('/exchange')) {
      config.headers['X-API-Key'] = apiKey
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear API key on unauthorized
      sessionStorage.removeItem('hypereth-api-key')
    }
    return Promise.reject(error)
  }
)

// TDX Server API functions
export const tdxAPI = {
  // Health check
  async healthCheck() {
    const response = await api.get('/health')
    return response.data
  },

  // Register new agent in TEE (fallback to debug endpoint for now)
  async registerAgent(userId) {
    try {
      const response = await api.post('/register-agent', { user_id: userId })
      return response.data
    } catch (error) {
      if (error.response?.status === 404) {
        // Fallback: use existing debug endpoint
        console.warn('Register endpoint not available, using debug endpoint')
        const debugResponse = await this.getAgentAddress()
        return {
          agent_address: debugResponse.agent_address,
          api_key: debugResponse.api_key || 'test-key',
          attestation_report: {
            quote: '0x' + Buffer.from('mock-tdx-quote-for-' + debugResponse.agent_address).toString('hex'),
            mrenclave: '0x' + Buffer.from('mock-mrenclave-measurement-hash').toString('hex'),
            mrsigner: '0x' + Buffer.from('mock-mrsigner-authority-hash').toString('hex'),
            timestamp: Date.now(),
          }
        }
      }
      throw error
    }
  },

  // Get agent address (debug endpoint)
  async getAgentAddress() {
    const response = await api.get('/debug/agent-address')
    return response.data
  },

  // Proxy info requests (market data)
  async getMarketInfo(payload) {
    const response = await api.post('/info', payload)
    return response.data
  },

  // Execute trades via exchange endpoint (requires API key)
  async executeTrade(tradeData) {
    const response = await api.post('/exchange', tradeData)
    return response.data
  },
}

// Hyperliquid-specific API helpers
export const hyperliquidAPI = {
  // Get user state
  async getUserState(address) {
    return tdxAPI.getMarketInfo({
      type: 'clearinghouseState',
      user: address,
    })
  },

  // Get all mids (market prices)
  async getAllMids() {
    return tdxAPI.getMarketInfo({
      type: 'allMids',
    })
  },

  // Get open orders
  async getOpenOrders(address) {
    return tdxAPI.getMarketInfo({
      type: 'openOrders',
      user: address,
    })
  },

  // Get user fills (trade history)
  async getUserFills(address) {
    return tdxAPI.getMarketInfo({
      type: 'userFills',
      user: address,
    })
  },

  // Place order
  async placeOrder(orderData) {
    return tdxAPI.executeTrade({
      action: {
        type: 'order',
        orders: [orderData],
        grouping: 'na',
      },
      nonce: Date.now(),
    })
  },

  // Cancel order
  async cancelOrder(orderId) {
    return tdxAPI.executeTrade({
      action: {
        type: 'cancel',
        cancels: [orderId],
      },
      nonce: Date.now(),
    })
  },

  // Cancel all orders
  async cancelAllOrders() {
    return tdxAPI.executeTrade({
      action: {
        type: 'cancelByCloid',
        cancels: [],
      },
      nonce: Date.now(),
    })
  },
}

// Demo mode API (returns mock data)
export const demoAPI = {
  async registerAgent(userId) {
    await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate delay
    return {
      agent_address: '0x1234567890123456789012345678901234567890',
      api_key: 'demo-api-key-12345',
      attestation_report: {
        quote: '0xabcdef1234567890...',
        mrenclave: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        mrsigner: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        timestamp: Date.now(),
      },
    }
  },

  async getAgentAddress() {
    return {
      agent_address: '0x1234567890123456789012345678901234567890',
      api_key: 'demo-api-key-12345',
      note: 'Demo mode - Master wallet must approve this agent address before trading',
    }
  },

  async getUserState() {
    return {
      marginSummary: {
        accountValue: '1250.00',
        totalNtlPos: '500.00',
        totalRawUsd: '1250.00',
      },
      assetPositions: [
        {
          position: {
            coin: 'ETH',
            entryPx: '3100.0',
            positionValue: '500.0',
            unrealizedPnl: '50.0',
          },
        },
      ],
    }
  },

  async getAllMids() {
    return {
      'ETH': '3150.5',
      'BTC': '67250.0',
      'SOL': '145.75',
    }
  },

  async getOpenOrders() {
    return [
      {
        oid: 123456,
        coin: 'ETH',
        side: 'B',
        sz: '0.1',
        limitPx: '3100.0',
        orderType: 'Limit',
        timestamp: Date.now() - 3600000,
      },
    ]
  },

  async placeOrder(orderData) {
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate delay
    return {
      status: 'ok',
      response: {
        type: 'order',
        data: {
          statuses: ['success'],
        },
      },
    }
  },
}

export default api