import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { hyperliquidAPI, demoAPI } from '../../services/api'
import Card from '../Common/Card'
import Button from '../Common/Button'

const OrderForm = ({ onOrderPlaced }) => {
  const {
    agent,
    apiKey,
    loading,
    setLoading,
    error,
    setError,
    clearError,
    isDemoMode,
  } = useAppStore()

  const [orderData, setOrderData] = useState({
    coin: 'ETH',
    side: 'buy', // buy or sell
    size: '',
    price: '',
    orderType: 'limit', // limit or market
    reduceOnly: false,
  })

  const [marketPrices, setMarketPrices] = useState({})
  const [orderHistory, setOrderHistory] = useState([])

  useEffect(() => {
    loadMarketData()
  }, [])

  const loadMarketData = async () => {
    try {
      const api = isDemoMode ? demoAPI : hyperliquidAPI
      const prices = await api.getAllMids()
      setMarketPrices(prices)
      
      // Set default price to current market price
      if (prices[orderData.coin] && !orderData.price) {
        setOrderData(prev => ({
          ...prev,
          price: prices[orderData.coin]
        }))
      }
    } catch (err) {
      console.error('Failed to load market data:', err)
    }
  }

  const handleInputChange = (field, value) => {
    setOrderData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Update price when coin changes
    if (field === 'coin' && marketPrices[value]) {
      setOrderData(prev => ({
        ...prev,
        price: marketPrices[value]
      }))
    }
  }

  const handleSubmitOrder = async (e) => {
    e.preventDefault()
    
    if (!apiKey) {
      setError('API key not available. Please register an agent first.')
      return
    }

    if (!orderData.size || (!orderData.price && orderData.orderType === 'limit')) {
      setError('Please fill in all required fields')
      return
    }

    clearError()
    setLoading('trading', true)

    try {
      const api = isDemoMode ? demoAPI : hyperliquidAPI
      
      // Prepare order data for Hyperliquid format
      const orderPayload = {
        coin: orderData.coin,
        is_buy: orderData.side === 'buy',
        sz: parseFloat(orderData.size),
        limit_px: orderData.orderType === 'limit' ? parseFloat(orderData.price) : null,
        order_type: orderData.orderType === 'market' ? 'Market' : 'Limit',
        reduce_only: orderData.reduceOnly,
      }

      const response = await api.placeOrder(orderPayload)
      
      if (response.status === 'ok') {
        // Add to order history
        const newOrder = {
          id: Date.now(),
          ...orderPayload,
          timestamp: Date.now(),
          status: 'submitted',
        }
        setOrderHistory(prev => [newOrder, ...prev])
        
        // Reset form
        setOrderData(prev => ({
          ...prev,
          size: '',
          price: marketPrices[prev.coin] || '',
        }))
        
        // Notify parent component
        if (onOrderPlaced) {
          onOrderPlaced(newOrder)
        }
      } else {
        throw new Error('Order submission failed')
      }
    } catch (err) {
      console.error('Order failed:', err)
      setError(
        err.response?.data?.message || 
        err.message || 
        'Failed to place order. Please try again.'
      )
    } finally {
      setLoading('trading', false)
    }
  }

  const calculateNotional = () => {
    const size = parseFloat(orderData.size) || 0
    const price = parseFloat(orderData.price) || 0
    return (size * price).toFixed(2)
  }

  const coins = ['ETH', 'BTC', 'SOL', 'AVAX', 'MATIC']

  return (
    <Card 
      title="Place Order"
      subtitle="Execute trades using your TEE-secured agent"
    >
      <form onSubmit={handleSubmitOrder} className="space-y-6">
        {/* Coin Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Asset</label>
            <select
              value={orderData.coin}
              onChange={(e) => handleInputChange('coin', e.target.value)}
              className="w-full px-4 py-3 bg-border-primary border border-border-secondary rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {coins.map(coin => (
                <option key={coin} value={coin}>
                  {coin}
                </option>
              ))}
            </select>
            {marketPrices[orderData.coin] && (
              <p className="text-xs text-text-secondary mt-1">
                Market: ${marketPrices[orderData.coin]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Side</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleInputChange('side', 'buy')}
                className={`px-4 py-3 rounded-xl font-medium transition-colors ${
                  orderData.side === 'buy'
                    ? 'bg-green-500 text-white'
                    : 'bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary'
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => handleInputChange('side', 'sell')}
                className={`px-4 py-3 rounded-xl font-medium transition-colors ${
                  orderData.side === 'sell'
                    ? 'bg-red-500 text-white'
                    : 'bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary'
                }`}
              >
                Sell
              </button>
            </div>
          </div>
        </div>

        {/* Order Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Order Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleInputChange('orderType', 'limit')}
              className={`px-4 py-3 rounded-xl font-medium transition-colors ${
                orderData.orderType === 'limit'
                  ? 'bg-accent text-white'
                  : 'bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary'
              }`}
            >
              Limit
            </button>
            <button
              type="button"
              onClick={() => handleInputChange('orderType', 'market')}
              className={`px-4 py-3 rounded-xl font-medium transition-colors ${
                orderData.orderType === 'market'
                  ? 'bg-accent text-white'
                  : 'bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary'
              }`}
            >
              Market
            </button>
          </div>
        </div>

        {/* Size and Price */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Size ({orderData.coin})
            </label>
            <input
              type="number"
              step="0.001"
              value={orderData.size}
              onChange={(e) => handleInputChange('size', e.target.value)}
              placeholder="0.000"
              className="w-full px-4 py-3 bg-border-primary border border-border-secondary rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
              required
            />
          </div>

          {orderData.orderType === 'limit' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.price}
                onChange={(e) => handleInputChange('price', e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-border-primary border border-border-secondary rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
                required
              />
            </div>
          )}
        </div>

        {/* Order Summary */}
        {orderData.size && (orderData.price || orderData.orderType === 'market') && (
          <div className="p-4 bg-border-primary rounded-lg border border-border-secondary">
            <h3 className="font-medium mb-3">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Side:</span>
                <span className={`font-medium ${
                  orderData.side === 'buy' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {orderData.side.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Size:</span>
                <span>{orderData.size} {orderData.coin}</span>
              </div>
              {orderData.orderType === 'limit' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Price:</span>
                    <span>${orderData.price}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Notional:</span>
                    <span>${calculateNotional()}</span>
                  </div>
                </>
              )}
              {orderData.orderType === 'market' && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Est. Price:</span>
                  <span>${marketPrices[orderData.coin] || 'Loading...'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reduce Only Option */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="reduceOnly"
            checked={orderData.reduceOnly}
            onChange={(e) => handleInputChange('reduceOnly', e.target.checked)}
            className="w-4 h-4 text-accent bg-border-primary border-border-secondary rounded focus:ring-accent/50"
          />
          <label htmlFor="reduceOnly" className="text-sm text-text-secondary">
            Reduce only (close existing position)
          </label>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Demo Mode Notice */}
        {isDemoMode && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <div className="flex items-center gap-2">
              <InfoIcon className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">Demo Mode</span>
            </div>
            <p className="text-xs text-yellow-400/80 mt-1">
              Orders will be simulated - no real trades will be executed
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          loading={loading.trading}
          disabled={!apiKey || !orderData.size || (orderData.orderType === 'limit' && !orderData.price)}
          className="w-full"
          variant={orderData.side === 'buy' ? 'accent' : 'primary'}
        >
          {loading.trading ? 'Placing Order...' : `Place ${orderData.side.toUpperCase()} Order`}
        </Button>

        {!apiKey && (
          <p className="text-center text-sm text-text-secondary">
            API key required to place orders
          </p>
        )}
      </form>
    </Card>
  )
}

// Icon component
const InfoIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M10 14v-4M10 6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export default OrderForm