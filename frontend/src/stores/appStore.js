import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set, get) => ({
      // Current step in the flow
      currentStep: 'welcome',
      setCurrentStep: (step) => set({ currentStep: step }),

      // Agent data
      agent: null,
      setAgent: (agent) => set({ agent }),
      
      // API key (stored securely in session)
      apiKey: null,
      setApiKey: (apiKey) => set({ apiKey }),
      
      // User ID
      userId: null,
      setUserId: (userId) => set({ userId }),
      
      // Attestation data
      attestation: null,
      setAttestation: (attestation) => set({ attestation }),
      
      // Registration status
      isRegistered: false,
      setIsRegistered: (status) => set({ isRegistered: status }),
      
      // On-chain verification status
      isVerified: false,
      setIsVerified: (status) => set({ isVerified: status }),
      
      // Loading states
      loading: {
        registration: false,
        verification: false,
        trading: false,
      },
      setLoading: (key, value) => set((state) => ({
        loading: { ...state.loading, [key]: value }
      })),
      
      // Error handling
      error: null,
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
      
      // Demo mode
      isDemoMode: false,
      setDemoMode: (enabled) => set({ isDemoMode: enabled }),
      
      // Reset function
      reset: () => set({
        currentStep: 'welcome',
        agent: null,
        apiKey: null,
        userId: null,
        attestation: null,
        isRegistered: false,
        isVerified: false,
        loading: {
          registration: false,
          verification: false,
          trading: false,
        },
        error: null,
        isDemoMode: false,
      }),
    }),
    {
      name: 'hypereth-app-storage',
      partialize: (state) => ({
        // Only persist non-sensitive data
        currentStep: state.currentStep,
        userId: state.userId,
        isRegistered: state.isRegistered,
        isVerified: state.isVerified,
        isDemoMode: state.isDemoMode,
      }),
    }
  )
)