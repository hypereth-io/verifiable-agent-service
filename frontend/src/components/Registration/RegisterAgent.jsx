import React, { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { tdxAPI, demoAPI } from '../../services/api'
import { ethers } from 'ethers'
import Card from '../Common/Card'
import Button from '../Common/Button'

// Helper functions to extract data from TDX quote
const extractMrenclave = (quoteHex) => {
  // MRENCLAVE is at bytes 112-144 (32 bytes) in TDX quote structure
  // Each byte is 2 hex chars, so position 224-288 in hex string
  if (quoteHex.length < 288) return 'Invalid quote length'
  return '0x' + quoteHex.slice(224, 288)
}

const extractMrsigner = (quoteHex) => {
  // MRSIGNER is at bytes 176-208 (32 bytes) in TDX quote structure  
  // Each byte is 2 hex chars, so position 352-416 in hex string
  if (quoteHex.length < 416) return 'Invalid quote length'
  return '0x' + quoteHex.slice(352, 416)
}

const RegisterAgent = () => {
  const {
    userId,
    setUserId,
    setAgent,
    setApiKey,
    setAttestation,
    setCurrentStep,
    loading,
    setLoading,
    error,
    setError,
    clearError,
    isDemoMode,
  } = useAppStore()

  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')

  const handleConnectWallet = async () => {
    clearError()
    setLoading('registration', true)

    try {
      if (isDemoMode) {
        // Demo mode - simulate wallet connection
        setWalletConnected(true)
        setWalletAddress('0x742d35Cc6639C0532fEb5003cd2F8C3bB6e6b63')
        setUserId('demo-user-' + Date.now())
      } else {
        // Connect to MetaMask with ethers.js
        if (!window.ethereum) {
          throw new Error('MetaMask is not installed')
        }

        const provider = new ethers.BrowserProvider(window.ethereum)
        await provider.send('eth_requestAccounts', [])
        const signer = await provider.getSigner()
        const address = await signer.getAddress()

        setWalletConnected(true)
        setWalletAddress(address)
        setUserId(address)
      }
    } catch (err) {
      console.error('Wallet connection failed:', err)
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setLoading('registration', false)
    }
  }

  const handleRegister = async () => {
    if (!walletConnected) {
      setError('Please connect your wallet first')
      return
    }

    clearError()
    setLoading('registration', true)

    try {
      if (isDemoMode) {
        // Use demo API
        const response = await demoAPI.registerAgent(walletAddress)
        
        setAgent({
          address: response.agent_address,
          userId: walletAddress,
          createdAt: Date.now(),
        })
        setApiKey(response.api_key)
        setAttestation(response.attestation_report)
        sessionStorage.setItem('hypereth-api-key', response.api_key)
      } else {
        // Real SIWE authentication flow (simplified to avoid ethers/SIWE import issues)
        console.log('Creating SIWE message for wallet:', walletAddress)
        
        // Create SIWE message manually following the API spec format
        const domain = window.location.host
        const uri = window.location.origin
        const nonce = Math.random().toString(36).substring(2, 15)
        const issuedAt = new Date().toISOString()
        
        const message = `${domain} wants you to sign in with your Ethereum account:
${walletAddress}

Generate agent wallet for TEE-secured trading.

URI: ${uri}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}`

        console.log('SIWE message created:', message)
        
        // Sign the message using MetaMask directly
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, walletAddress],
        })
        console.log('Message signed, calling TDX server...')
        
        // Send to TDX server for authentication
        const loginResponse = await tdxAPI.agentsLogin(message, signature)
        
        if (loginResponse.success) {
          console.log('SIWE login successful:', loginResponse)
          
          // Store agent data from SIWE response
          setAgent({
            address: loginResponse.agent_address,
            userId: loginResponse.user_address,
            createdAt: Date.now(),
          })
          setApiKey(loginResponse.api_key)
          
          // Use TDX quote from login response
          setAttestation({
            quote: loginResponse.tdx_quote_hex,
            mrenclave: extractMrenclave(loginResponse.tdx_quote_hex),
            mrsigner: extractMrsigner(loginResponse.tdx_quote_hex), 
            timestamp: Date.now(),
          })

          // Store real API key for trading
          sessionStorage.setItem('hypereth-api-key', loginResponse.api_key)
          console.log('Stored real API key from SIWE login:', loginResponse.api_key)
        } else {
          throw new Error(loginResponse.message || 'SIWE authentication failed')
        }
      }

      // Move to next step (approve agent)
      setCurrentStep('approve')
    } catch (err) {
      console.error('Registration failed:', err)
      setError(
        err.response?.data?.error || 
        err.message || 
        'Failed to register agent. Please try again.'
      )
    } finally {
      setLoading('registration', false)
    }
  }


  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Welcome Section */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold font-hyperwave">TEE-Secured Agent Wallet</h1>
        <p className="text-lg text-text-secondary font-light max-w-lg mx-auto">
          Register your agent wallet in a Trusted Execution Environment. Your private keys never leave the secure enclave.
        </p>
      </div>

      {/* Registration Card */}
      <Card 
        title="Register New Agent"
        subtitle="Create a secure agent wallet hosted in Intel TDX"
      >
        <div className="space-y-6">

          {/* Wallet Connection & Registration */}
          <div className="space-y-6">
            {/* Step 1: Connect Wallet */}
            <div className="space-y-3">
              <h3 className="font-medium">1. Connect Ethereum Wallet</h3>
              {!walletConnected ? (
                <Button
                  onClick={handleConnectWallet}
                  loading={loading.registration && !walletConnected}
                  className="w-full"
                >
                  Connect MetaMask Wallet
                </Button>
              ) : (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Wallet Connected</span>
                  </div>
                  <p className="text-xs text-green-400/80 mt-1 font-mono">
                    {walletAddress}
                  </p>
                </div>
              )}
            </div>

            {/* Step 2: Create Agent */}
            <div className="space-y-3">
              <h3 className="font-medium">2. Create TEE Agent</h3>
              <Button
                onClick={handleRegister}
                loading={loading.registration && walletConnected}
                disabled={!walletConnected}
                className="w-full"
              >
                {loading.registration && walletConnected ? 'Creating Agent...' : 'Sign & Create Agent'}
              </Button>
              <p className="text-xs text-text-secondary">
                You will be asked to sign a message to authenticate with the TEE server
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Demo Mode Notice */}
          {isDemoMode && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <InfoIcon className="w-5 h-5 text-yellow-400" />
                <p className="text-yellow-400 text-sm font-medium">Demo Mode Active</p>
              </div>
              <p className="text-yellow-400/80 text-sm mt-1">
                This will create a simulated agent with mock attestation data for testing purposes.
              </p>
            </div>
          )}

          {/* Process Steps */}
          <div className="pt-4 border-t border-border-primary">
            <h3 className="font-medium mb-3">Registration Process</h3>
            <div className="space-y-2 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full"></div>
                <span>Generate agent keys in Intel TDX environment</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-border-dashed border border-border-dashed rounded-full"></div>
                <span>Create TDX attestation report</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-border-dashed border border-border-dashed rounded-full"></div>
                <span>Register attestation on-chain</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-border-dashed border border-border-dashed rounded-full"></div>
                <span>Receive API key for trading</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// Icon components
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

const KeyIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 11v6l-3-3h3Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
)

const InfoIcon = ({ className }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M10 14v-4M10 6h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export default RegisterAgent