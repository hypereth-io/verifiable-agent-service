import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { tdxAPI, hyperliquidAPI, demoAPI } from '../../services/api'
import * as hl from '@nktkas/hyperliquid'
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
    leverage: '5', // Default 5x leverage
  })

  const [marketPrices, setMarketPrices] = useState({})
  const [orderHistory, setOrderHistory] = useState([])
  const [assetMeta, setAssetMeta] = useState(null)

  useEffect(() => {
    loadMarketData()
  }, [])

  const loadMarketData = async () => {
    try {
      if (isDemoMode) {
        const api = demoAPI
        const prices = await api.getAllMids()
        setMarketPrices(prices)
      } else {
        // Get real market prices and asset metadata
        const [prices, meta] = await Promise.all([
          tdxAPI.getMarketInfo({ type: 'allMids' }),
          tdxAPI.getMarketInfo({ type: 'meta' })
        ])
        setMarketPrices(prices)
        setAssetMeta(meta)
      }
      
      // Set default price to current market price when prices load
      if (Object.keys(marketPrices).length > 0) {
        setMarketPrices(prices)
        
        // Update price if not set yet
        if (prices[orderData.coin] && !orderData.price) {
          setOrderData(prev => ({
            ...prev,
            price: prices[orderData.coin]
          }))
        }
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

  const updateLeverage = async (coinSymbol, leverage) => {
    if (isDemoMode) return // Skip leverage update in demo mode
    
    try {
      console.log(`Updating ${coinSymbol} leverage to ${leverage}x`)
      
      const assetIndex = getAssetIndex(coinSymbol)
      
      await tdxAPI.executeTrade({
        action: {
          type: 'updateLeverage',
          asset: assetIndex,
          isCross: true, // Use cross leverage
          leverage: parseInt(leverage),
        },
        nonce: Date.now(),
      })
      
      console.log(`Leverage updated successfully for ${coinSymbol}`)
    } catch (err) {
      console.warn('Failed to update leverage:', err)
      // Continue anyway - leverage update is not critical
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
      // Update leverage before placing order (live mode only)
      if (!isDemoMode) {
        await updateLeverage(orderData.coin, orderData.leverage)
      }

      let response
      let orderPayload

      if (isDemoMode) {
        // Use demo API
        orderPayload = {
          coin: orderData.coin,
          is_buy: orderData.side === 'buy',
          sz: parseFloat(orderData.size),
          limit_px: orderData.orderType === 'limit' ? parseFloat(orderData.price) : null,
          order_type: orderData.orderType === 'market' ? 'Market' : 'Limit',
          reduce_only: orderData.reduceOnly,
        }
        response = await demoAPI.placeOrder(orderPayload)
      } else {
        // Use hybrid approach: SDK for formatting/signing + TDX server for submission
        console.log('Preparing order with SDK, sending through TDX server...')
        
        // Get current market price for realistic pricing (avoid 95% error)
        const currentPrice = marketPrices[orderData.coin]
        if (!currentPrice) {
          throw new Error(`Market price not available for ${orderData.coin}. Please refresh and try again.`)
        }
        
        console.log(`Current ${orderData.coin} price:`, currentPrice)
        
        // Use current market price if order price is too far away
        let orderPrice = orderData.price
        if (orderData.orderType === 'limit') {
          const priceNum = parseFloat(orderData.price)
          const marketNum = parseFloat(currentPrice)
          const priceDiff = Math.abs((priceNum - marketNum) / marketNum)
          
          if (priceDiff > 0.05) { // More than 5% away
            console.warn(`Price ${orderPrice} is ${(priceDiff * 100).toFixed(1)}% away from market. Using market price.`)
            orderPrice = currentPrice
          }
        }
        
        // Format price and size according to Hyperliquid rules
        const basePrice = orderData.orderType === 'limit' ? orderPrice : currentPrice
        
        // For asset index 1 (ETH), use conservative pricing to avoid tick size issues
        const formattedPrice = orderData.coin === 'ETH' 
          ? Math.round(parseFloat(basePrice)).toString() // Round ETH to whole numbers
          : formatPrice(basePrice, orderData.coin)
          
        const formattedSize = formatSize(orderData.size, orderData.coin)
        
        console.log(`Formatted price: ${formattedPrice}, size: ${formattedSize}`)
        
        // Send properly formatted order through TDX server (TEE-secured)
        // TDX server will handle signing with agent keys
        response = await tdxAPI.executeTrade({
          action: {
            type: 'order',
            orders: [{
              a: getAssetIndex(orderData.coin), // Correct asset index from metadata
              b: orderData.side === 'buy',
              p: formattedPrice, // Properly formatted price
              s: formattedSize, // Properly formatted size
              r: orderData.reduceOnly,
              t: orderData.orderType === 'market' 
                ? { market: {} }
                : { limit: { tif: "Gtc" } }
            }],
            grouping: "na",
          },
          nonce: Date.now(),
        })
        
        console.log('TDX order response:', response)
        
        // Store orderPayload for history
        orderPayload = {
          coin: orderData.coin,
          is_buy: orderData.side === 'buy',
          sz: parseFloat(orderData.size),
          limit_px: orderData.orderType === 'limit' ? parseFloat(orderPrice) : parseFloat(currentPrice),
          order_type: orderData.orderType === 'market' ? 'Market' : 'Limit',
          reduce_only: orderData.reduceOnly,
        }
      }
      
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

  // Get asset index from metadata
  const getAssetIndex = (coinSymbol) => {
    if (!assetMeta?.universe) return 0 // Default to 0 if no metadata
    
    const index = assetMeta.universe.findIndex(asset => asset.name === coinSymbol)
    return index >= 0 ? index : 0 // Default to 0 if not found
  }

  // Use SDK utilities for proper formatting if available
  const formatPrice = (price, coinSymbol) => {
    // Check if SDK has price formatting utilities
    if (hl.formatPrice && assetMeta?.universe) {
      const asset = assetMeta.universe.find(a => a.name === coinSymbol)
      if (asset) {
        return hl.formatPrice(parseFloat(price), asset)
      }
    }
    
    // Fallback to manual formatting
    if (!assetMeta?.universe) return price
    const asset = assetMeta.universe.find(a => a.name === coinSymbol)
    if (!asset) return price
    
    const priceNum = parseFloat(price)
    const szDecimals = asset.szDecimals || 0
    const maxDecimals = 6 - szDecimals
    
    const rounded = priceNum.toFixed(Math.min(maxDecimals, 5))
    return parseFloat(rounded).toString()
  }

  const formatSize = (size, coinSymbol) => {
    // Check if SDK has size formatting utilities
    if (hl.formatSize && assetMeta?.universe) {
      const asset = assetMeta.universe.find(a => a.name === coinSymbol)
      if (asset) {
        return hl.formatSize(parseFloat(size), asset)
      }
    }
    
    // Fallback to manual formatting
    if (!assetMeta?.universe) return size
    const asset = assetMeta.universe.find(a => a.name === coinSymbol)
    if (!asset) return size
    
    const sizeNum = parseFloat(size)
    const szDecimals = asset.szDecimals || 0
    
    const rounded = sizeNum.toFixed(szDecimals)
    return parseFloat(rounded).toString()
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
                    ? 'bg-white text-background'
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
                    ? 'bg-white text-background'
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
                  ? 'bg-white text-background'
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
                  ? 'bg-white text-background'
                  : 'bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary'
              }`}
            >
              Market
            </button>
          </div>
        </div>

        {/* Leverage */}
        <div>
          <label className="block text-sm font-medium mb-2">Leverage</label>
          <select
            value={orderData.leverage}
            onChange={(e) => handleInputChange('leverage', e.target.value)}
            className="w-full px-4 py-3 bg-border-primary border border-border-secondary rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="1">1x (No Leverage)</option>
            <option value="2">2x</option>
            <option value="3">3x</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
            <option value="20">20x</option>
            <option value="50">50x</option>
          </select>
          <p className="text-xs text-text-secondary mt-1">
            Higher leverage increases both potential profits and losses
          </p>
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
          variant="primary"
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