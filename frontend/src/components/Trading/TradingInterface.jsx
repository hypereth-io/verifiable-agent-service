import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { hyperliquidAPI, demoAPI } from '../../services/api'
import Card from '../Common/Card'
import Button from '../Common/Button'
import OrderForm from './OrderForm'

const TradingInterface = () => {
  const {
    agent,
    apiKey,
    setCurrentStep,
    loading,
    setLoading,
    error,
    setError,
    clearError,
    isDemoMode,
  } = useAppStore()

  const [userState, setUserState] = useState(null)
  const [openOrders, setOpenOrders] = useState([])
  const [recentTrades, setRecentTrades] = useState([])
  const [marketData, setMarketData] = useState({})
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!agent || !apiKey) {
      setCurrentStep('register')
      return
    }
    
    loadTradingData()
    
    // Set up periodic refresh
    const interval = setInterval(loadTradingData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [agent, apiKey])

  const loadTradingData = async () => {
    if (!agent) return

    setRefreshing(true)
    clearError()

    try {
      const api = isDemoMode ? demoAPI : hyperliquidAPI

      // Load user state, open orders, and market data in parallel
      const [userStateRes, openOrdersRes, marketDataRes] = await Promise.allSettled([
        api.getUserState(agent.address),
        api.getOpenOrders ? api.getOpenOrders(agent.address) : Promise.resolve([]),
        api.getAllMids(),
      ])

      if (userStateRes.status === 'fulfilled') {
        setUserState(userStateRes.value)
      }

      if (openOrdersRes.status === 'fulfilled') {
        setOpenOrders(openOrdersRes.value || [])
      }

      if (marketDataRes.status === 'fulfilled') {
        setMarketData(marketDataRes.value || {})
      }

      // Load recent trades if available
      if (api.getUserFills) {
        try {
          const fills = await api.getUserFills(agent.address)
          setRecentTrades(fills?.slice(0, 10) || [])
        } catch (err) {
          console.warn('Failed to load trade history:', err)
        }
      }
    } catch (err) {
      console.error('Failed to load trading data:', err)
      setError('Failed to load trading data')
    } finally {
      setRefreshing(false)
    }
  }

  const handleOrderPlaced = (order) => {
    // Refresh data after placing order
    setTimeout(loadTradingData, 1000)
  }

  const handleCancelOrder = async (orderId) => {
    if (!apiKey) return

    setLoading('trading', true)
    clearError()

    try {
      const api = isDemoMode ? demoAPI : hyperliquidAPI
      await api.cancelOrder(orderId)
      
      // Remove from open orders list
      setOpenOrders(prev => prev.filter(order => order.oid !== orderId))
      
      // Refresh data
      loadTradingData()
    } catch (err) {
      console.error('Failed to cancel order:', err)
      setError('Failed to cancel order')
    } finally {
      setLoading('trading', false)
    }
  }

  const handleCancelAllOrders = async () => {
    if (!apiKey || openOrders.length === 0) return

    setLoading('trading', true)
    clearError()

    try {
      const api = isDemoMode ? demoAPI : hyperliquidAPI
      await api.cancelAllOrders()
      
      setOpenOrders([])
      loadTradingData()
    } catch (err) {
      console.error('Failed to cancel all orders:', err)
      setError('Failed to cancel all orders')
    } finally {
      setLoading('trading', false)
    }
  }

  if (!agent || !apiKey) {
    return null
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-hyperwave">Trading Terminal</h1>
          <p className="text-lg text-text-secondary font-light mt-1">
            Execute trades using your TEE-secured agent wallet
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={loadTradingData}
            loading={refreshing}
            size="sm"
          >
            <RefreshIcon className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => setCurrentStep('dashboard')}
            size="sm"
          >
            ← Dashboard
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Order Form */}
        <div className="lg:col-span-1">
          <OrderForm onOrderPlaced={handleOrderPlaced} />
        </div>

        {/* Account & Positions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Summary */}
          <Card
            title="Account Summary"
            subtitle="Current portfolio status"
          >
            {userState ? (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-border-primary rounded-lg border border-border-secondary">
                  <div className="text-2xl font-bold">
                    ${userState.marginSummary?.accountValue || '0.00'}
                  </div>
                  <div className="text-sm text-text-secondary">Account Value</div>
                </div>
                <div className="text-center p-4 bg-border-primary rounded-lg border border-border-secondary">
                  <div className="text-2xl font-bold">
                    ${userState.marginSummary?.totalNtlPos || '0.00'}
                  </div>
                  <div className="text-sm text-text-secondary">Position Value</div>
                </div>
                <div className="text-center p-4 bg-border-primary rounded-lg border border-border-secondary">
                  <div className="text-2xl font-bold">
                    ${userState.marginSummary?.totalRawUsd || '0.00'}
                  </div>
                  <div className="text-sm text-text-secondary">Available</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-6 h-6 spinner mx-auto mb-2"></div>
                <p className="text-text-secondary text-sm">Loading account data...</p>
              </div>
            )}
          </Card>

          {/* Open Orders */}
          <Card
            title="Open Orders"
            subtitle={`${openOrders.length} active orders`}
            headerAction={
              openOrders.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelAllOrders}
                  loading={loading.trading}
                >
                  Cancel All
                </Button>
              )
            }
          >
            {openOrders.length > 0 ? (
              <div className="space-y-3">
                {openOrders.map((order) => (
                  <div key={order.oid} className="flex items-center justify-between p-4 bg-border-primary rounded-lg border border-border-secondary">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          order.side === 'B' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {order.side === 'B' ? 'BUY' : 'SELL'}
                        </span>
                        <span className="font-medium">{order.coin}</span>
                        <span className="text-text-secondary">
                          {order.sz} @ ${order.limitPx}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {order.orderType}
                        </span>
                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        {new Date(order.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCancelOrder(order.oid)}
                      loading={loading.trading}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-text-secondary">
                No open orders
              </div>
            )}
          </Card>

          {/* Current Positions */}
          {userState?.assetPositions?.length > 0 && (
            <Card
              title="Current Positions"
              subtitle={`${userState.assetPositions.length} active positions`}
            >
              <div className="space-y-3">
                {userState.assetPositions.map((position, index) => {
                  const pos = position.position
                  const unrealizedPnl = parseFloat(pos.unrealizedPnl)
                  const marketPrice = marketData[pos.coin]
                  
                  return (
                    <div key={index} className="p-4 bg-border-primary rounded-lg border border-border-secondary">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4">
                            <span className="font-medium text-lg">{pos.coin}</span>
                            <span className="text-text-secondary">
                              Size: {pos.positionValue}
                            </span>
                            <span className="text-text-secondary">
                              Entry: ${pos.entryPx}
                            </span>
                            {marketPrice && (
                              <span className="text-text-secondary">
                                Mark: ${marketPrice}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-medium ${
                            unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl}
                          </div>
                          <div className="text-sm text-text-secondary">
                            Unrealized PnL
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Recent Trades */}
          {recentTrades.length > 0 && (
            <Card
              title="Recent Trades"
              subtitle="Last 10 fills"
            >
              <div className="space-y-2">
                {recentTrades.map((trade, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-background rounded-lg text-sm">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        trade.side === 'B' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.side === 'B' ? 'BUY' : 'SELL'}
                      </span>
                      <span>{trade.coin}</span>
                      <span className="text-text-secondary">
                        {trade.sz} @ ${trade.px}
                      </span>
                    </div>
                    <span className="text-text-secondary text-xs">
                      {new Date(trade.time).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {error && (
        <Card>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400">{error}</p>
          </div>
        </Card>
      )}
    </div>
  )
}

// Icon component
const RefreshIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8.002 8.002 0 0115.356 2M15 15v5h-.582M3.642 9A8.001 8.001 0 0015.418 15m0 0V15a8.002 8.002 0 01-15.356-2"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default TradingInterface