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
    console.log('API Interceptor - URL:', config.url, 'API Key:', apiKey ? 'present' : 'missing')
    
    if (apiKey && config.url?.includes('/exchange')) {
      config.headers['X-API-Key'] = apiKey
      console.log('Added X-API-Key header to exchange request')
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

  // Agent authentication with SIWE
  async agentsLogin(message, signature) {
    const response = await api.post('/agents/login', { 
      message, 
      signature 
    })
    return response.data
  },

  // Get TDX quote data
  async agentsQuote() {
    const response = await api.get('/agents/quote')
    return response.data
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
    // Convert frontend format to Hyperliquid API format
    const hyperliquidOrder = {
      a: 0, // Asset index (0 for ETH, would need mapping for other coins)
      b: orderData.is_buy, // true = buy, false = sell
      p: orderData.limit_px ? orderData.limit_px.toString() : "0", // Price as string
      s: orderData.sz.toString(), // Size as string
      r: orderData.reduce_only || false, // Reduce only flag
      t: orderData.order_type === 'Market' ? { market: {} } : { limit: { tif: "Gtc" } }
    }

    return tdxAPI.executeTrade({
      action: {
        type: 'order',
        orders: [hyperliquidOrder],
        grouping: 'na',
      },
      nonce: Date.now(),
    })
  },

  // Cancel order
  async cancelOrder(orderId, assetIndex = 0) {
    return tdxAPI.executeTrade({
      action: {
        type: 'cancel',
        cancels: [{
          a: assetIndex, // Asset index required
          o: orderId,    // Order ID
        }],
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