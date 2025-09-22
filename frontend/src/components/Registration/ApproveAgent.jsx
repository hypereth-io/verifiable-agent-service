import React, { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { tdxAPI, hyperliquidAPI, demoAPI } from '../../services/api'
import * as hl from '@nktkas/hyperliquid'
import Card from '../Common/Card'
import Button from '../Common/Button'
import CopyButton from '../Common/CopyButton'

const ApproveAgent = () => {
  const {
    agent,
    setCurrentStep,
    loading,
    setLoading,
    error,
    setError,
    clearError,
    isDemoMode,
  } = useAppStore()

  const [approvalStatus, setApprovalStatus] = useState('pending') // pending, processing, completed

  const handleApproveAgent = async () => {
    if (!agent) return

    clearError()
    setLoading('verification', true)
    setApprovalStatus('processing')

    try {
      if (isDemoMode) {
        // Simulate approval delay
        await new Promise(resolve => setTimeout(resolve, 3000))
        setApprovalStatus('completed')
      } else {
        // Use SDK with OneKey wallet integration
        console.log('Approving agent wallet using Hyperliquid SDK with OneKey:', agent.address)
        console.log('Master wallet:', agent.userId)
        
        // First ensure we're on Hyperliquid mainnet (chain ID 999)
        try {
          const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
          console.log('Current chain ID:', currentChainId)
          
          if (currentChainId !== '0x3e7') { // 999 in hex
            console.log('Switching to Hyperliquid mainnet...')
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x3e7' }], // 999 in hex
              })
            } catch (switchError) {
              // If network doesn't exist, add it
              if (switchError.code === 4902) {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0x3e7',
                    chainName: 'Hyperliquid Mainnet',
                    rpcUrls: ['https://rpc.hyperliquid.xyz/evm'],
                    nativeCurrency: {
                      name: 'Ethereum',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                  }],
                })
              } else {
                throw switchError
              }
            }
          }
        } catch (networkError) {
          console.error('Network switch failed:', networkError)
          throw new Error('Please switch to Hyperliquid mainnet in your wallet')
        }
        
        // Create wallet adapter for OneKey
        const walletAdapter = {
          address: agent.userId,
          signTypedData: async (typedData) => {
            return await window.ethereum.request({
              method: 'eth_signTypedData_v4',
              params: [agent.userId, JSON.stringify(typedData)],
            })
          }
        }
        
        // Create Hyperliquid exchange client with OneKey wallet adapter
        const exchClient = new hl.ExchangeClient({
          wallet: walletAdapter,
          transport: new hl.HttpTransport({
            url: 'https://api.hyperliquid.xyz/exchange',
          }),
          chainId: 999, // Set to Hyperliquid mainnet
          signatureChainId: '0x3e7', // Chain ID for signing
        })
        
        console.log('Calling SDK approveAgent with OneKey wallet...')
        
        // Use SDK's approveAgent method
        const approvalData = await exchClient.approveAgent({ 
          agentAddress: agent.address 
        })
        
        console.log('Agent approval response:', approvalData)
        
        if (approvalData.status === 'ok') {
          setApprovalStatus('completed')
          console.log('Agent approval successful')
        } else {
          throw new Error('Agent approval failed')
        }
      }

      // Auto-advance to verification after approval
      setTimeout(() => {
        setCurrentStep('verify')
      }, 2000)
    } catch (err) {
      console.error('Approval failed:', err)
      setApprovalStatus('pending')
      setError(
        err.response?.data?.error || 
        err.message || 
        'Failed to approve agent. Please try again.'
      )
    } finally {
      setLoading('verification', false)
    }
  }

  const handleSkipToNext = () => {
    setCurrentStep('verify')
  }

  if (!agent) {
    setCurrentStep('register')
    return null
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold font-hyperwave">Approve Agent Wallet</h1>
        <p className="text-lg text-text-secondary font-light max-w-2xl mx-auto">
          Approve the TEE-generated agent wallet with your master wallet on Hyperliquid
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Agent Details */}
        <Card 
          title="Agent Wallet Details"
          subtitle="TEE-generated signing wallet"
        >
          <div className="space-y-6">
            {/* Agent Information */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <InfoIcon className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-blue-400">Agent Wallet Created</span>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary text-sm">Agent Address:</span>
                    <CopyButton text={agent.address} />
                  </div>
                  <div className="flex items-center gap-2 bg-border-primary p-3 rounded">
                    <span className="font-mono text-text-primary font-medium flex-1 text-sm">
                      {agent.address}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Master Wallet:</span>
                  <span className="font-mono text-text-primary">{agent.userId}</span>
                </div>
              </div>
            </div>

            {/* Why Approval is Needed */}
            <div className="space-y-3">
              <h3 className="font-medium">Why Approval is Required</h3>
              <div className="space-y-2 text-sm text-text-secondary">
                <p>• Agent wallet needs permission to trade on your behalf</p>
                <p>• Approval links your master wallet to the agent wallet</p>
                <p>• This is a security feature to prevent unauthorized trading</p>
                <p>• Only approved agents can execute trades for your account</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Approval Process */}
        <Card 
          title="Agent Approval"
          subtitle="Authorize agent for trading"
        >
          <div className="space-y-6">
            {/* Approval Instructions */}
            <div className="space-y-4">
              <h3 className="font-medium">Approval Process</h3>
              
              {approvalStatus === 'pending' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="flex items-start gap-3">
                      <InfoIcon className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-400 mb-2">Ready for Approval</h4>
                        <div className="text-sm text-blue-400/80 space-y-1">
                          <p>Click below to automatically approve the agent wallet on Hyperliquid.</p>
                          <p>This will authorize the agent to trade on your behalf.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    onClick={handleApproveAgent}
                    loading={loading.verification}
                    className="w-full"
                  >
                    {isDemoMode ? 'Simulate Agent Approval' : 'Approve Agent on Hyperliquid'}
                  </Button>
                </div>
              )}

              {approvalStatus === 'processing' && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 spinner border-blue-400"></div>
                    <span className="text-sm font-medium text-blue-400">Verifying Approval</span>
                  </div>
                  <p className="text-xs text-blue-400/80 mt-1">
                    Checking if agent has been approved on Hyperliquid...
                  </p>
                </div>
              )}

              {approvalStatus === 'completed' && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Agent Approved</span>
                  </div>
                  <p className="text-xs text-green-400/80 mt-1">
                    Agent wallet is now authorized for trading
                  </p>
                </div>
              )}
            </div>

            {/* Demo Mode Note */}
            {isDemoMode && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <InfoIcon className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">Demo Mode</span>
                </div>
                <p className="text-xs text-yellow-400/80 mt-1">
                  Agent approval will be simulated for demonstration
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Skip Option */}
            <div className="pt-3 border-t border-border-primary">
              <Button
                variant="ghost"
                onClick={handleSkipToNext}
                className="w-full"
              >
                Skip to Quote Verification →
              </Button>
            </div>
          </div>
        </Card>
      </div>
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

const InfoIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M10 14v-4M10 6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const WarningIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M10 2L3 17h14L10 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    />
    <path d="M10 8v4M10 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export default ApproveAgent