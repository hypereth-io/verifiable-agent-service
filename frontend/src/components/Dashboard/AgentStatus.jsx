import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { hyperliquidAPI, demoAPI } from '../../services/api'
import { contractService, demoContractService } from '../../services/contracts'
import Card from '../Common/Card'
import Button from '../Common/Button'

const AgentStatus = () => {
  const {
    agent,
    apiKey,
    attestation,
    setCurrentStep,
    isVerified,
    loading,
    setLoading,
    error,
    setError,
    clearError,
    isDemoMode,
  } = useAppStore()

  const [userState, setUserState] = useState(null)
  const [marketPrices, setMarketPrices] = useState({})
  const [agentInfo, setAgentInfo] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!agent) {
      setCurrentStep('register')
      return
    }
    
    loadDashboardData()
  }, [agent])

  const loadDashboardData = async () => {
    if (!agent) return

    setRefreshing(true)
    clearError()

    try {
      // Load user state, market prices, and agent info in parallel
      const api = isDemoMode ? demoAPI : hyperliquidAPI
      const contractSvc = isDemoMode ? demoContractService : contractService

      const [userStateRes, marketPricesRes, agentInfoRes] = await Promise.allSettled([
        api.getUserState ? api.getUserState(agent.address) : Promise.resolve(null),
        api.getAllMids(),
        contractSvc.getAgentInfo ? contractSvc.getAgentInfo(agent.address) : Promise.resolve(null),
      ])

      if (userStateRes.status === 'fulfilled') {
        setUserState(userStateRes.value)
      }

      if (marketPricesRes.status === 'fulfilled') {
        setMarketPrices(marketPricesRes.value)
      }

      if (agentInfoRes.status === 'fulfilled') {
        setAgentInfo(agentInfoRes.value)
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
      setError('Failed to load some dashboard data')
    } finally {
      setRefreshing(false)
    }
  }

  const handleStartTrading = () => {
    setCurrentStep('trading')
  }

  if (!agent) {
    return null
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold font-hyperwave">Agent Dashboard</h1>
          <p className="text-xl text-text-secondary font-light mt-2">
            Monitor your TEE-secured agent wallet status and activity
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={loadDashboardData}
            loading={refreshing}
            size="sm"
          >
            <RefreshIcon className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleStartTrading}
            disabled={!apiKey}
          >
            Start Trading
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Agent Information */}
        <Card
          title="Agent Information"
          subtitle="TEE-generated wallet details"
          className="lg:col-span-2"
        >
          <div className="space-y-6">
            {/* Status Overview */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-border-primary rounded-lg border border-border-secondary">
                <div className="flex items-center gap-2 mb-3">
                  {isVerified ? (
                    <CheckIcon className="w-5 h-5 text-green-400" />
                  ) : (
                    <PendingIcon className="w-5 h-5 text-yellow-400" />
                  )}
                  <span className={`font-medium ${
                    isVerified ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {isVerified ? 'Verified & Active' : 'Pending Verification'}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  {isVerified 
                    ? 'Agent is registered on-chain and ready for trading'
                    : 'Complete on-chain verification to enable trading'
                  }
                </p>
              </div>

              <div className="p-4 bg-border-primary rounded-lg border border-border-secondary">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldIcon className="w-5 h-5 text-accent" />
                  <span className="font-medium text-accent">TEE Protected</span>
                </div>
                <p className="text-sm text-text-secondary">
                  Private keys secured in Intel TDX environment
                </p>
              </div>
            </div>

            {/* Agent Details */}
            <div className="space-y-4">
              <h3 className="font-medium">Agent Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border-primary">
                  <span className="text-text-secondary">Agent Address</span>
                  <span className="font-mono text-sm">{agent.address}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border-primary">
                  <span className="text-text-secondary">User ID</span>
                  <span>{agent.userId}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border-primary">
                  <span className="text-text-secondary">Created</span>
                  <span>{new Date(agent.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border-primary">
                  <span className="text-text-secondary">API Key</span>
                  <span className="font-mono text-sm">
                    {apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'Not available'}
                  </span>
                </div>
              </div>
            </div>

            {/* On-chain Information */}
            {agentInfo && (
              <div className="space-y-4">
                <h3 className="font-medium">On-chain Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border-primary">
                    <span className="text-text-secondary">Owner</span>
                    <span className="font-mono text-sm">{agentInfo.owner}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border-primary">
                    <span className="text-text-secondary">Registered</span>
                    <span>{new Date(agentInfo.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-text-secondary">MRENCLAVE</span>
                    <span className="font-mono text-xs">
                      {agentInfo.mrenclave.slice(0, 10)}...{agentInfo.mrenclave.slice(-6)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Account Summary */}
        <Card
          title="Account Summary"
          subtitle="Current portfolio status"
        >
          {userState ? (
            <div className="space-y-4">
              <div className="text-center p-4 bg-border-primary rounded-lg border border-border-secondary">
                <div className="text-2xl font-bold">
                  ${userState.marginSummary?.accountValue || '0.00'}
                </div>
                <div className="text-sm text-text-secondary">Total Account Value</div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Position Value</span>
                  <span>${userState.marginSummary?.totalNtlPos || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Available Balance</span>
                  <span>${userState.marginSummary?.totalRawUsd || '0.00'}</span>
                </div>
              </div>

              {userState.assetPositions?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Positions</h4>
                  {userState.assetPositions.map((pos, index) => (
                    <div key={index} className="p-3 bg-background rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{pos.position.coin}</span>
                        <span className={`${
                          parseFloat(pos.position.unrealizedPnl) >= 0 
                            ? 'text-green-400' 
                            : 'text-red-400'
                        }`}>
                          {parseFloat(pos.position.unrealizedPnl) >= 0 ? '+' : ''}
                          ${pos.position.unrealizedPnl}
                        </span>
                      </div>
                      <div className="text-sm text-text-secondary">
                        Entry: ${pos.position.entryPx} | Value: ${pos.position.positionValue}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 spinner mx-auto mb-4"></div>
              <p className="text-text-secondary">Loading account data...</p>
            </div>
          )}
        </Card>
      </div>

      {/* TEE Attestation Details */}
      {attestation && (
        <Card
          title="TEE Attestation Details"
          subtitle="Intel TDX security measurements"
        >
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium">Security Measurements</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    MRENCLAVE (Code Measurement)
                  </label>
                  <div className="p-3 bg-background rounded-lg font-mono text-xs break-all">
                    {attestation.mrenclave}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    MRSIGNER (Authority)
                  </label>
                  <div className="p-3 bg-background rounded-lg font-mono text-xs break-all">
                    {attestation.mrsigner}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="font-medium">Verification Status</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-medium text-green-400">Attestation Valid</div>
                    <div className="text-sm text-green-400/80">
                      Generated at {new Date(attestation.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-border-primary rounded-lg border border-border-secondary">
                  <div className="text-sm">
                    <strong>What this means:</strong> The attestation cryptographically proves that your agent keys were generated in a genuine Intel TDX environment and have never been exposed outside the secure enclave.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

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

// Icon components
const CheckIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M6 10l2 2 6-6"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const PendingIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M10 6v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const ShieldIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M10 2L3 6v4.5c0 4.5 6 8.5 7 8.5s7-4 7-8.5V6l-7-4Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
)

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

export default AgentStatus