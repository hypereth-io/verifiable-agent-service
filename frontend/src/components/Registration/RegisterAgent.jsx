import React, { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { tdxAPI, demoAPI } from '../../services/api'
import Card from '../Common/Card'
import Button from '../Common/Button'

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

  const [localUserId, setLocalUserId] = useState(userId || '')

  const handleRegister = async () => {
    if (!localUserId.trim()) {
      setError('Please enter a user ID')
      return
    }

    clearError()
    setLoading('registration', true)

    try {
      // Use demo API if in demo mode, otherwise use real TDX server
      const api = isDemoMode ? demoAPI : tdxAPI
      const response = await api.registerAgent(localUserId.trim())

      // Store the results
      setUserId(localUserId.trim())
      setAgent({
        address: response.agent_address,
        userId: localUserId.trim(),
        createdAt: Date.now(),
      })
      setApiKey(response.api_key)
      setAttestation(response.attestation_report)

      // Store API key in session storage for subsequent requests
      sessionStorage.setItem('hypereth-api-key', response.api_key)

      // Move to next step
      setCurrentStep('verify')
    } catch (err) {
      console.error('Registration failed:', err)
      setError(
        err.response?.data?.message || 
        err.message || 
        'Failed to register agent. Please try again.'
      )
    } finally {
      setLoading('registration', false)
    }
  }

  const handleSkipToDemo = () => {
    // Pre-fill with demo data for quick testing
    setLocalUserId('demo-user-' + Date.now())
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Welcome Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold font-hyperwave">TEE-Secured Agent Wallet</h1>
        <p className="text-xl text-text-secondary font-light max-w-lg mx-auto">
          Register your agent wallet in a Trusted Execution Environment. Your private keys never leave the secure enclave.
        </p>
      </div>

      {/* Registration Card */}
      <Card 
        title="Register New Agent"
        subtitle="Create a secure agent wallet hosted in Intel TDX"
      >
        <div className="space-y-6">
          {/* Benefits */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-border-primary border border-border-secondary">
              <div className="w-8 h-8 bg-accent rounded-lg mb-3 flex items-center justify-center">
                <ShieldIcon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-medium mb-2">Zero Local Storage</h3>
              <p className="text-sm text-text-secondary">
                Private keys generated and stored only in TEE
              </p>
            </div>
            <div className="p-4 rounded-lg bg-border-primary border border-border-secondary">
              <div className="w-8 h-8 bg-accent rounded-lg mb-3 flex items-center justify-center">
                <CheckIcon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-medium mb-2">Verifiable Security</h3>
              <p className="text-sm text-text-secondary">
                Intel TDX attestation verified on-chain
              </p>
            </div>
            <div className="p-4 rounded-lg bg-border-primary border border-border-secondary">
              <div className="w-8 h-8 bg-accent rounded-lg mb-3 flex items-center justify-center">
                <KeyIcon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-medium mb-2">API Access</h3>
              <p className="text-sm text-text-secondary">
                Trade using API keys, not private keys
              </p>
            </div>
          </div>

          {/* Registration Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                User Identifier
              </label>
              <input
                type="text"
                value={localUserId}
                onChange={(e) => setLocalUserId(e.target.value)}
                placeholder="Enter your unique user ID"
                className="w-full px-4 py-3 bg-border-primary border border-border-secondary rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                disabled={loading.registration}
              />
              <p className="text-xs text-text-secondary mt-1">
                This identifier will be associated with your agent wallet
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleRegister}
                loading={loading.registration}
                disabled={!localUserId.trim()}
                className="flex-1"
              >
                {loading.registration ? 'Creating Agent...' : 'Register Agent'}
              </Button>
              
              {!isDemoMode && (
                <Button
                  variant="secondary"
                  onClick={handleSkipToDemo}
                  disabled={loading.registration}
                >
                  Use Demo Data
                </Button>
              )}
            </div>
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