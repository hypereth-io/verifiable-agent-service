import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { contractService, demoContractService } from '../../services/contracts'
import { DEFAULT_NETWORK } from '../../utils/constants'
import Card from '../Common/Card'
import Button from '../Common/Button'
import CopyButton from '../Common/CopyButton'

const VerifyOnChain = () => {
  const {
    agent,
    attestation,
    setCurrentStep,
    setIsVerified,
    loading,
    setLoading,
    error,
    setError,
    clearError,
    isDemoMode,
  } = useAppStore()

  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [txHash, setTxHash] = useState('')
  const [registrationStatus, setRegistrationStatus] = useState('pending') // pending, processing, completed

  useEffect(() => {
    if (!agent || !attestation) {
      setCurrentStep('register')
      return
    }
    
    // Auto-connect wallet if we have agent data and not in demo mode
    if (agent && !walletConnected && !isDemoMode) {
      setWalletConnected(true)
      setWalletAddress(agent.userId) // Agent.userId contains the wallet address from registration
    }
  }, [agent, attestation, setCurrentStep])

  const handleConnectWallet = async () => {
    clearError()
    setLoading('verification', true)

    try {
      const contractSvc = isDemoMode ? demoContractService : contractService
      const connectionInfo = await contractSvc.connect(DEFAULT_NETWORK)
      
      setWalletConnected(true)
      setWalletAddress(connectionInfo.address)
    } catch (err) {
      console.error('Failed to connect wallet:', err)
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setLoading('verification', false)
    }
  }

  const handleVerifyQuote = async () => {
    if (!attestation) return

    clearError()
    setLoading('verification', true)
    setRegistrationStatus('processing')

    try {
      const contractSvc = isDemoMode ? demoContractService : contractService
      
      // Ensure wallet is connected first
      if (!isDemoMode) {
        await contractSvc.connect(DEFAULT_NETWORK)
      }
      
      // Verify TDX quote directly using DCAP verifier
      const verificationResult = await contractSvc.verifyQuote(attestation.quote)
      
      if (verificationResult.isValid) {
        setRegistrationStatus('completed')
        setIsVerified(true)
        
        // Show verification results
        console.log('Quote verification successful:', {
          agentAddress: verificationResult.agentAddress,
          mrenclave: verificationResult.mrenclave,
          isValid: verificationResult.isValid
        })
        
        // Auto-advance to dashboard after a delay
        setTimeout(() => {
          setCurrentStep('dashboard')
        }, 3000)
      } else {
        throw new Error('Quote verification failed - invalid attestation')
      }
    } catch (err) {
      console.error('Verification failed:', err)
      setRegistrationStatus('pending')
      
      // Handle common error types
      let errorMessage = 'Failed to verify quote on-chain'
      
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        errorMessage = 'Transaction cancelled by user'
      } else if (err.message?.includes('user rejected')) {
        errorMessage = 'Transaction cancelled by user'
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for verification fee (0.001 ETH required)'
      } else if (err.message?.includes('network')) {
        errorMessage = 'Network error - please check your connection to Hyperliquid mainnet'
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error
      }
      
      setError(errorMessage)
    } finally {
      setLoading('verification', false)
    }
  }

  const handleSkipToNext = () => {
    setCurrentStep('dashboard')
  }

  if (!agent || !attestation) {
    return null
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold font-hyperwave">Quote Verification</h1>
        <p className="text-lg text-text-secondary font-light max-w-2xl mx-auto">
          Verify your TDX attestation quote using the on-chain DCAP verifier
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quote to be Verified */}
        <Card 
          title="TDX Quote Verification"
          subtitle="Quote ready for on-chain DCAP verification"
        >
          <div className="space-y-6">
            {/* Key Information */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <InfoIcon className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-blue-400">Quote Ready for Verification</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-text-secondary">TEE Type:</span>
                  <span className="font-medium text-blue-400">Intel TDX</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-text-secondary">Quote Version:</span>
                  <span className="font-mono text-text-primary">4</span>
                </div>
                <div className="space-y-2">
                  <span className="text-text-secondary">Agent Address:</span>
                  <div className="flex items-center gap-2 bg-border-primary p-2 rounded">
                    <span className="font-mono text-text-primary font-medium flex-1">
                      {agent.address}
                    </span>
                    <CopyButton text={agent.address} />
                  </div>
                </div>
              </div>
            </div>

            {/* Full Quote Data */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Raw TDX Quote</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">{Math.floor(attestation.quote.length / 2)} bytes</span>
                  <CopyButton text={attestation.quote} />
                </div>
              </div>
              <div className="p-3 bg-background rounded-lg border border-border-secondary h-40 overflow-y-auto">
                <div className="font-mono text-xs text-text-secondary break-all whitespace-pre-wrap leading-relaxed">
                  {attestation.quote}
                </div>
              </div>
              <p className="text-xs text-text-secondary">
                Complete TDX attestation quote. Scroll to view all {Math.floor(attestation.quote.length / 2)} bytes of cryptographic proof.
              </p>
            </div>
          </div>
        </Card>

        {/* Registration Process */}
        <Card 
          title="Blockchain Registration"
          subtitle="Register attestation on Hyperliquid"
        >
          <div className="space-y-6">
            {/* Direct Quote Verification */}
            <div className="space-y-3">
              <h3 className="font-medium">Verify TDX Quote</h3>
              <p className="text-sm text-text-secondary">
                This will call the Automata DCAP verifier contract on Hyperliquid to validate your TDX attestation.
              </p>
              {registrationStatus === 'pending' && (
                <Button
                  onClick={handleVerifyQuote}
                  loading={loading.verification}
                  className="w-full"
                >
                  Verify Quote with DCAP
                </Button>
              )}
              
              {registrationStatus === 'processing' && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 spinner border-blue-400"></div>
                    <span className="text-sm font-medium text-blue-400">Verifying Quote</span>
                  </div>
                  <p className="text-xs text-blue-400/80 mt-1">
                    Checking TDX attestation with DCAP verifier...
                  </p>
                </div>
              )}
              
              {registrationStatus === 'completed' && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Quote Verified</span>
                  </div>
                  <p className="text-xs text-green-400/80 mt-1">
                    TDX attestation is valid and agent is ready for trading
                  </p>
                </div>
              )}
            </div>

            {/* Verification Info */}
            <div className="p-3 bg-border-primary rounded-xl border border-border-secondary">
              <h4 className="text-sm font-medium mb-2">DCAP Verification</h4>
              <div className="text-sm text-text-secondary">
                <p className="mb-1">• Validates Intel TDX attestation</p>
                <p className="mb-1">• Extracts agent address from quote</p>
                <p>• Confirms TEE environment integrity</p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Demo Mode Notice */}
            {isDemoMode && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <InfoIcon className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">Demo Mode</span>
                </div>
                <p className="text-xs text-yellow-400/80 mt-1">
                  Simulated blockchain interaction - no real transaction
                </p>
              </div>
            )}

            {/* Skip Option */}
            <div className="pt-3 border-t border-border-primary">
              <Button
                variant="ghost"
                onClick={handleSkipToNext}
                className="w-full"
              >
                Skip to Dashboard →
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

export default VerifyOnChain