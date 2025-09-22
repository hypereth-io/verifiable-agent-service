import { ethers } from 'ethers'
import { REGISTRY_CONTRACT_ADDRESS, HYPERLIQUID_NETWORKS, DEFAULT_NETWORK } from '../utils/constants'

// Automata DCAP Attestation contract
const DCAP_ATTESTATION_ADDRESS = '0xaDdeC7e85c2182202b66E331f2a4A0bBB2cEEa1F'

// DCAP contract ABI for quote verification
const DCAP_ABI = [
  "function verifyAndAttestOnChain(bytes calldata rawQuote) external payable returns (bool success, bytes memory output)"
]

// Registry contract ABI (simplified - update with actual ABI after deployment)
const REGISTRY_ABI = [
  "function registerAgent(bytes calldata quote) external payable",
  "function isAgentRegistered(address agent) external view returns (bool)",
  "function getAgentInfo(address agent) external view returns (tuple(address agent, address owner, uint256 timestamp, bytes32 mrenclave))",
  "function verifyQuote(bytes calldata quote) external view returns (bool, address, bytes32)",
  "event AgentRegistered(address indexed agent, address indexed owner, bytes32 mrenclave)",
]

class ContractService {
  constructor() {
    this.provider = null
    this.signer = null
    this.registryContract = null
    this.dcapContract = null
    this.network = DEFAULT_NETWORK // default to mainnet
  }

  // Initialize connection to Hyperliquid network
  async connect(network = DEFAULT_NETWORK) {
    try {
      this.network = network
      const networkConfig = HYPERLIQUID_NETWORKS[network]
      
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`)
      }

      // Check if MetaMask is available
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask is not installed')
      }

      // Create provider
      this.provider = new ethers.BrowserProvider(window.ethereum)

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' })

      // Get signer
      this.signer = await this.provider.getSigner()

      // Check if we're on the correct network
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
      const targetChainId = `0x${networkConfig.chainId.toString(16)}`

      if (currentChainId !== targetChainId) {
        // Try to switch network
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetChainId }],
          })
        } catch (switchError) {
          // If network doesn't exist, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: targetChainId,
                chainName: networkConfig.name,
                rpcUrls: [networkConfig.rpcUrl],
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

      // Initialize DCAP contract (always available)
      this.dcapContract = new ethers.Contract(
        DCAP_ATTESTATION_ADDRESS,
        DCAP_ABI,
        this.signer
      )

      // Initialize registry contract
      if (REGISTRY_CONTRACT_ADDRESS && REGISTRY_CONTRACT_ADDRESS !== '0x...') {
        this.registryContract = new ethers.Contract(
          REGISTRY_CONTRACT_ADDRESS,
          REGISTRY_ABI,
          this.signer
        )
      }

      return {
        address: await this.signer.getAddress(),
        network: networkConfig.name,
        chainId: networkConfig.chainId,
      }
    } catch (error) {
      console.error('Failed to connect to network:', error)
      throw error
    }
  }

  // Register agent on-chain with TDX attestation
  async registerAgent(attestationQuote, value = '0.01') {
    if (!this.registryContract) {
      throw new Error('Registry contract not initialized. Please connect first.')
    }

    try {
      const valueWei = ethers.parseEther(value)
      const tx = await this.registryContract.registerAgent(attestationQuote, {
        value: valueWei,
      })

      return {
        hash: tx.hash,
        wait: () => tx.wait(),
      }
    } catch (error) {
      console.error('Failed to register agent:', error)
      throw error
    }
  }

  // Check if agent is registered
  async isAgentRegistered(agentAddress) {
    if (!this.registryContract) {
      throw new Error('Registry contract not initialized. Please connect first.')
    }

    try {
      return await this.registryContract.isAgentRegistered(agentAddress)
    } catch (error) {
      console.error('Failed to check agent registration:', error)
      throw error
    }
  }

  // Get agent information
  async getAgentInfo(agentAddress) {
    if (!this.registryContract) {
      throw new Error('Registry contract not initialized. Please connect first.')
    }

    try {
      const info = await this.registryContract.getAgentInfo(agentAddress)
      return {
        agent: info[0],
        owner: info[1], 
        timestamp: Number(info[2]),
        mrenclave: info[3],
      }
    } catch (error) {
      console.error('Failed to get agent info:', error)
      throw error
    }
  }

  // Verify attestation quote using Automata DCAP contract
  async verifyQuote(attestationQuote) {
    if (!this.dcapContract) {
      throw new Error('DCAP contract not initialized. Please connect first.')
    }

    try {
      console.log('Starting DCAP verification...')
      console.log('DCAP contract address:', DCAP_ATTESTATION_ADDRESS)
      console.log('Network:', await this.provider.getNetwork())
      console.log('Quote length:', attestationQuote.length)
      
      // Convert hex string to bytes if needed
      const quoteBytes = attestationQuote.startsWith('0x') 
        ? attestationQuote 
        : '0x' + attestationQuote

      console.log('Formatted quote:', quoteBytes.substring(0, 100) + '...')
      
      // Try to estimate gas first to catch issues early
      try {
        const gasEstimate = await this.dcapContract.verifyAndAttestOnChain.estimateGas(quoteBytes)
        console.log('Gas estimate successful:', gasEstimate.toString())
      } catch (gasError) {
        console.error('Gas estimation failed:', gasError)
        throw new Error(`DCAP verification setup failed: ${gasError.message}`)
      }

      // Call the real Automata DCAP verifier
      console.log('Calling DCAP contract...')
      const result = await this.dcapContract.verifyAndAttestOnChain(quoteBytes, {
        gasLimit: 7000000 // High gas limit required for DCAP verification
      })
      
      console.log('Transaction sent, waiting for confirmation...')
      
      // Wait for transaction
      const receipt = await result.wait()
      
      if (receipt.status === 1) {
        console.log('DCAP verification successful:', receipt)
        
        return {
          isValid: true,
          agentAddress: '0x' + attestationQuote.slice(-40), // Extract from quote
          mrenclave: 'Verified via DCAP',
          transactionHash: receipt.transactionHash,
        }
      } else {
        throw new Error('DCAP verification transaction failed')
      }
    } catch (error) {
      console.error('Failed to verify quote with DCAP:', error)
      throw error
    }
  }

  // Get current wallet address
  async getAddress() {
    if (!this.signer) {
      throw new Error('Wallet not connected')
    }
    return await this.signer.getAddress()
  }

  // Get network info
  getNetworkInfo() {
    return HYPERLIQUID_NETWORKS[this.network]
  }

  // Disconnect
  disconnect() {
    this.provider = null
    this.signer = null
    this.registryContract = null
  }
}

// Demo contract service (returns mock data)
export class DemoContractService {
  async connect() {
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate delay
    return {
      address: '0x742d35Cc6639C0532fEb5003cd2F8C3bB6e6b63',
      network: 'Hyperliquid Testnet (Demo)',
      chainId: 998,
    }
  }

  async registerAgent(attestationQuote) {
    await new Promise(resolve => setTimeout(resolve, 3000)) // Simulate delay
    return {
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      wait: async () => ({
        status: 1,
        blockNumber: 12345,
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      }),
    }
  }

  async isAgentRegistered() {
    await new Promise(resolve => setTimeout(resolve, 500))
    return true
  }

  async getAgentInfo() {
    await new Promise(resolve => setTimeout(resolve, 500))
    return {
      agent: '0x1234567890123456789012345678901234567890',
      owner: '0x742d35Cc6639C0532fEb5003cd2F8C3bB6e6b63',
      timestamp: Date.now() - 3600000,
      mrenclave: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    }
  }

  async verifyQuote() {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return {
      isValid: true,
      agentAddress: '0x1234567890123456789012345678901234567890',
      mrenclave: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    }
  }

  async getAddress() {
    return '0x742d35Cc6639C0532fEb5003cd2F8C3bB6e6b63'
  }

  getNetworkInfo() {
    return {
      name: 'Hyperliquid Mainnet (Demo)',
      chainId: 999,
    }
  }

  disconnect() {
    // No-op for demo
  }
}

// Export singleton instance
export const contractService = new ContractService()
export const demoContractService = new DemoContractService()

export default contractService