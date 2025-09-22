# Deployment Guide

## Contract Addresses

### HyperEVM (Hyperliquid EVM)

#### Automata DCAP Attestation Contracts (v1.1)

**Mainnet & Testnet Addresses:**
- **AutomataDcapAttestationFee**: [`0xaDdeC7e85c2182202b66E331f2a4A0bBB2cEEa1F`](https://hyperevmscan.io/address/0xaDdeC7e85c2182202b66E331f2a4A0bBB2cEEa1F)
- **V4QuoteVerifier** (TDX): [`0x2aDDd89aEbFE01d4aae4a73f31E7197152a9D99e`](https://hyperevmscan.io/address/0x2aDDd89aEbFE01d4aae4a73f31E7197152a9D99e)
- **V3QuoteVerifier** (SGX): [`0x087C0c460C083DACcA6DBaa82E8Fe0983E70C6F7`](https://hyperevmscan.io/address/0x087C0c460C083DACcA6DBaa82E8Fe0983E70C6F7)
- **PCCSRouter**: [`0xB0483A77543dF107aa6DfF1BFb6316dBE0ceFbf2`](https://hyperevmscan.io/address/0xB0483A77543dF107aa6DfF1BFb6316dBE0ceFbf2)

#### TEE Agent Registry Contracts

**Testnet:**
- **Registry**: `[To be deployed]`

**Mainnet:**
- **Registry**: `[To be deployed]`

## Network Configuration

### HyperEVM Testnet
- **RPC URL**: `https://api.hyperliquid-testnet.xyz/evm`
- **Chain ID**: `998` (estimated)
- **Explorer**: `https://testnet.purrsec.com/`
- **Native Token**: ETH

### HyperEVM Mainnet
- **RPC URL**: `https://api.hyperliquid.xyz/evm`
- **Chain ID**: `99999` (estimated)
- **Explorer**: `https://hyperevmscan.io/`
- **Native Token**: ETH

## Deployment Instructions

### Prerequisites

1. **Install Foundry**
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd workspace-1/contracts
   ```

3. **Install Dependencies**
   ```bash
   forge install
   ```

4. **Set Environment Variables**
   ```bash
   export PRIVATE_KEY="your_private_key_here"
   export ETHERSCAN_API_KEY="your_etherscan_key" # Optional for verification
   ```

### Deploy to Testnet

```bash
# Deploy Registry contract
forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_testnet

# Verify contract (optional)
forge verify-contract --rpc-url hyperliquid_testnet <CONTRACT_ADDRESS> src/Registry.sol:Registry
```

### Deploy to Mainnet

```bash
# Deploy Registry contract
forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_mainnet

# Verify contract (optional)
forge verify-contract --rpc-url hyperliquid_mainnet <CONTRACT_ADDRESS> src/Registry.sol:Registry
```

## Gas Estimates

| Operation | Estimated Gas | Notes |
|-----------|--------------|-------|
| Deploy Registry | ~2,000,000 | One-time deployment cost |
| Register Agent | ~300,000 + Automata fee | Includes attestation verification |
| Query Agent | ~30,000 | View function gas cost |

**Note**: Gas costs include calls to Automata DCAP contracts which may charge additional fees.

## Post-Deployment Verification

### 1. Contract Verification

After deployment, verify the contract is working correctly:

```bash
# Check if Registry is deployed
cast code <REGISTRY_ADDRESS> --rpc-url hyperliquid_testnet

# Verify Automata integration
cast call <REGISTRY_ADDRESS> "DCAP_VERIFIER()(address)" --rpc-url hyperliquid_testnet
```

### 2. Test Basic Functionality

```bash
# Check total records (should be 0 initially)
cast call <REGISTRY_ADDRESS> "getTotalRecords()(uint256)" --rpc-url hyperliquid_testnet

# Check attestation fee
cast call <REGISTRY_ADDRESS> "getAttestationFee()(uint256)" --rpc-url hyperliquid_testnet
```

### 3. Integration Test

For a complete integration test, you'll need:
1. A TDX-enabled environment
2. A valid TDX quote with embedded agent address
3. ETH to pay for gas and potential Automata fees

```bash
# Register an agent (requires valid TDX quote)
cast send <REGISTRY_ADDRESS> "registerAgent(bytes)" <TDX_QUOTE_HEX> \
  --private-key $PRIVATE_KEY \
  --rpc-url hyperliquid_testnet \
  --value 0.01ether
```

## Configuration Files

### foundry.toml

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.19"

[rpc_endpoints]
hyperliquid_testnet = "https://api.hyperliquid-testnet.xyz/evm"
hyperliquid_mainnet = "https://api.hyperliquid.xyz/evm"

[etherscan]
hyperliquid_testnet = { key = "${ETHERSCAN_API_KEY}", url = "https://explorer.hyperliquid-testnet.xyz" }
hyperliquid_mainnet = { key = "${ETHERSCAN_API_KEY}", url = "https://explorer.hyperliquid.xyz" }
```

### Environment Variables

Create a `.env` file in the contracts directory:

```bash
# Required for deployment
PRIVATE_KEY=your_private_key_here

# Optional for verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# RPC URLs (if different from foundry.toml)
HYPERLIQUID_TESTNET_RPC=https://api.hyperliquid-testnet.xyz/evm
HYPERLIQUID_MAINNET_RPC=https://api.hyperliquid.xyz/evm
```

## Security Considerations

### Private Key Management

⚠️ **Never commit private keys to version control**

Use one of these secure methods:

1. **Environment Variables** (recommended for development)
   ```bash
   export PRIVATE_KEY="0x..."
   ```

2. **Hardware Wallets** (recommended for mainnet)
   ```bash
   forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_mainnet --ledger
   ```

3. **Encrypted Keystore**
   ```bash
   cast wallet import deployer --interactive
   forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_mainnet --account deployer
   ```

### Contract Verification

Always verify contracts after deployment to ensure transparency:

1. **Source Code Verification**: Proves the deployed bytecode matches the source
2. **Constructor Arguments**: Verify any constructor parameters
3. **Compiler Settings**: Ensure optimization settings match

## Monitoring & Maintenance

### Event Monitoring

Monitor the Registry contract for key events:

```solidity
event AgentRegistered(
    uint256 indexed recordId,
    address indexed agentAddress,
    address indexed registeredBy,
    bytes32 mrTd,
    bytes32 mrConfigId,
    bytes32 mrOwner,
    uint8 tcbStatus
);
```

### Health Checks

Regular health checks to perform:

1. **Automata Integration**: Verify DCAP contracts are still operational
2. **Gas Prices**: Monitor network congestion and gas costs
3. **Storage Growth**: Track registry size and gas costs for queries
4. **Security Updates**: Monitor for Automata contract upgrades

### Upgrade Considerations

The Registry contract is designed to be immutable for transparency. Consider these factors:

1. **Bug Fixes**: Deploy new contract version if critical bugs are found
2. **Feature Additions**: Deploy separate contracts for new functionality
3. **Protocol Updates**: Monitor Automata for breaking changes
4. **Migration Tools**: Provide tools to verify agent records across versions

## Troubleshooting

### Common Deployment Issues

1. **Insufficient Gas**
   ```bash
   Error: Transaction failed with gas limit
   Solution: Increase gas limit or gas price
   ```

2. **Network Connectivity**
   ```bash
   Error: Failed to connect to RPC
   Solution: Check RPC URL and network status
   ```

3. **Private Key Issues**
   ```bash
   Error: Invalid private key
   Solution: Verify private key format (0x prefix)
   ```

### Runtime Issues

1. **Automata Verification Fails**
   - Check quote format and validity
   - Verify sufficient ETH for fees
   - Ensure TDX quote contains valid reportData

2. **Address Extraction Fails**
   - Verify protocol identifier in reportData
   - Check agent address is non-zero
   - Validate quote structure

3. **Gas Estimation Fails**
   - Check contract state and inputs
   - Verify sufficient balance for transaction
   - Test with smaller gas limits first

## Support

For deployment support and issues:

1. **Protocol Questions**: See [protocol.md](./protocol.md)
2. **Contract Issues**: Check contract source and tests
3. **Network Issues**: Consult HyperEVM documentation
4. **Automata Issues**: Refer to [Automata DCAP documentation](https://github.com/automata-network/automata-dcap-attestation)