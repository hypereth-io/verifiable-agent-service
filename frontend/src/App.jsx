import React, { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import Layout from './components/Layout/Layout'
import RegisterAgent from './components/Registration/RegisterAgent'
import VerifyOnChain from './components/Registration/VerifyOnChain'
import AgentStatus from './components/Dashboard/AgentStatus'
import TradingInterface from './components/Trading/TradingInterface'
import Button from './components/Common/Button'

function App() {
  const { 
    currentStep, 
    setCurrentStep, 
    agent, 
    error, 
    clearError,
    reset,
    isDemoMode 
  } = useAppStore()

  // Clear errors when step changes
  useEffect(() => {
    clearError()
  }, [currentStep, clearError])

  // Welcome screen
  const WelcomeScreen = () => (
    <div className="max-w-4xl mx-auto text-center space-y-6">
      <div className="space-y-4">
        <h1 className="text-6xl font-bold font-hyperwave bg-gradient-to-r from-white to-text-secondary bg-clip-text text-transparent">
          HyperETH
        </h1>
        <p className="text-2xl text-text-secondary font-light">
          TEE-Secured Agent Wallet Demo
        </p>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto">
          Experience secure Hyperliquid trading with agent wallets hosted in Intel TDX environments. 
          Your private keys never leave the trusted execution environment.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <div className="p-4 glass-card">
          <div className="w-12 h-12 bg-accent rounded-xl mb-4 mx-auto flex items-center justify-center">
            <ShieldIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold mb-2">Zero Local Storage</h3>
          <p className="text-text-secondary text-sm">
            Agent keys generated and secured entirely within Intel TDX environment
          </p>
        </div>
        
        <div className="p-4 glass-card">
          <div className="w-12 h-12 bg-accent rounded-xl mb-4 mx-auto flex items-center justify-center">
            <CheckIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold mb-2">Verifiable Security</h3>
          <p className="text-text-secondary text-sm">
            TDX attestation reports verified on-chain for transparent security
          </p>
        </div>
        
        <div className="p-4 glass-card">
          <div className="w-12 h-12 bg-accent rounded-xl mb-4 mx-auto flex items-center justify-center">
            <KeyIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold mb-2">API Access</h3>
          <p className="text-text-secondary text-sm">
            Trade using secure API keys without handling private keys
          </p>
        </div>
      </div>

      {/* Demo flow steps */}
      <div className="mt-8 p-4 glass-card text-left max-w-2xl mx-auto">
        <h3 className="font-semibold mb-4 text-center">Demo Flow</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-accent rounded-full text-white text-sm flex items-center justify-center font-medium">1</div>
            <span>Register agent wallet in TEE environment</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-border-dashed border border-border-dashed rounded-full text-text-secondary text-sm flex items-center justify-center">2</div>
            <span className="text-text-secondary">Verify TDX attestation on-chain</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-border-dashed border border-border-dashed rounded-full text-text-secondary text-sm flex items-center justify-center">3</div>
            <span className="text-text-secondary">Monitor agent status and attestation</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-border-dashed border border-border-dashed rounded-full text-text-secondary text-sm flex items-center justify-center">4</div>
            <span className="text-text-secondary">Execute trades using API key</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 justify-center mt-6">
        <Button
          onClick={() => setCurrentStep('register')}
          size="lg"
        >
          Start Demo
        </Button>
        {agent && (
          <Button
            variant="secondary"
            onClick={() => setCurrentStep('dashboard')}
            size="lg"
          >
            Continue to Dashboard
          </Button>
        )}
      </div>

      {/* Demo mode indicator */}
      {isDemoMode && (
        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl max-w-md mx-auto">
          <div className="flex items-center gap-2 justify-center">
            <InfoIcon className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-400 font-medium">Demo Mode Active</span>
          </div>
          <p className="text-yellow-400/80 text-sm mt-1 text-center">
            All operations will be simulated for demonstration
          </p>
        </div>
      )}
    </div>
  )

  // Error boundary
  const ErrorDisplay = () => (
    <div className="max-w-2xl mx-auto">
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
        <h3 className="font-semibold text-red-400 mb-2">An error occurred</h3>
        <p className="text-red-400/80 mb-4">{error}</p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={clearError}
          >
            Dismiss
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearError()
              setCurrentStep('welcome')
            }}
          >
            Start Over
          </Button>
        </div>
      </div>
    </div>
  )

  // Step progress indicator
  const StepIndicator = () => {
    const steps = [
      { key: 'welcome', label: 'Welcome', icon: '🏠' },
      { key: 'register', label: 'Register', icon: '📝' },
      { key: 'verify', label: 'Verify', icon: '✅' },
      { key: 'dashboard', label: 'Dashboard', icon: '📊' },
      { key: 'trading', label: 'Trading', icon: '💱' }
    ]

    const currentIndex = steps.findIndex(step => step.key === currentStep)

    return (
      <div className="flex justify-center mb-4">
        <div className="flex items-center gap-2 p-2 glass-card">
          {steps.map((step, index) => (
            <React.Fragment key={step.key}>
              <button
                onClick={() => setCurrentStep(step.key)}
                disabled={index > currentIndex + 1}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  step.key === currentStep
                    ? 'bg-accent text-white'
                    : index <= currentIndex
                    ? 'text-text-primary hover:bg-border-primary'
                    : 'text-text-secondary cursor-not-allowed'
                }`}
              >
                <span className="mr-2">{step.icon}</span>
                {step.label}
              </button>
              {index < steps.length - 1 && (
                <div className="w-2 h-px bg-border-primary"></div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    )
  }


  // Render current step
  const renderCurrentStep = () => {
    if (error) {
      return <ErrorDisplay />
    }

    switch (currentStep) {
      case 'welcome':
        return <WelcomeScreen />
      case 'register':
        return <RegisterAgent />
      case 'verify':
        return <VerifyOnChain />
      case 'dashboard':
        return <AgentStatus />
      case 'trading':
        return <TradingInterface />
      default:
        return <WelcomeScreen />
    }
  }

  return (
    <Layout>
      {currentStep !== 'welcome' && <StepIndicator />}
      {renderCurrentStep()}
    </Layout>
  )
}

// Icon components
const ShieldIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4Z"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
  </svg>
)

const CheckIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      d="M9 12l2 2 4-4"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const KeyIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
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

export default App