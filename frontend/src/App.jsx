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
    <div className="max-w-5xl mx-auto text-center space-y-12 py-8">
      <div className="space-y-6">
        <h1 className="text-6xl font-bold font-hyperwave bg-gradient-to-r from-white to-text-secondary bg-clip-text text-transparent leading-tight">
          HyperETH Agent Demo
        </h1>
        <p className="text-xl text-text-secondary font-light max-w-3xl mx-auto leading-relaxed">
          Experience secure Hyperliquid trading with agent wallets hosted in Intel TDX environments. 
          Your private keys never leave the trusted execution environment.
        </p>
      </div>

      {/* Feature highlights - balanced spacing */}
      <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        <div className="p-6 glass-card text-center">
          <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-xl mb-4 mx-auto flex items-center justify-center">
            <ShieldIcon className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-semibold mb-3 text-lg">Zero Local Storage</h3>
          <p className="text-text-secondary text-sm leading-relaxed">
            Agent keys generated and secured entirely within Intel TDX environment
          </p>
        </div>
        
        <div className="p-6 glass-card text-center">
          <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-xl mb-4 mx-auto flex items-center justify-center">
            <CheckIcon className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-semibold mb-3 text-lg">Verifiable Security</h3>
          <p className="text-text-secondary text-sm leading-relaxed">
            TDX attestation reports verified on-chain for transparent security
          </p>
        </div>
        
        <div className="p-6 glass-card text-center">
          <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-xl mb-4 mx-auto flex items-center justify-center">
            <KeyIcon className="w-8 h-8 text-white" />
          </div>
          <h3 className="font-semibold mb-3 text-lg">API Access</h3>
          <p className="text-text-secondary text-sm leading-relaxed">
            Trade using secure API keys without handling private keys
          </p>
        </div>
      </div>

      {/* Call to action */}
      <div className="space-y-6">
        <div className="flex gap-6 justify-center">
          <Button
            onClick={() => setCurrentStep('register')}
            size="lg"
            className="px-8 py-4 text-lg"
          >
            Start Demo
          </Button>
          {agent && (
            <Button
              variant="secondary"
              onClick={() => setCurrentStep('dashboard')}
              size="lg" 
              className="px-8 py-4 text-lg"
            >
              Continue to Dashboard →
            </Button>
          )}
        </div>

        {/* Demo mode indicator */}
        {isDemoMode && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl max-w-lg mx-auto">
            <div className="flex items-center gap-3 justify-center">
              <InfoIcon className="w-5 h-5 text-yellow-400" />
              <span className="text-yellow-400 font-medium">Demo Mode Active</span>
            </div>
            <p className="text-yellow-400/80 text-sm mt-2 text-center">
              All operations will be simulated for demonstration purposes
            </p>
          </div>
        )}
      </div>
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
      d="M6 12l4 4 8-8"
      stroke="currentColor"
      strokeWidth="2.5"
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