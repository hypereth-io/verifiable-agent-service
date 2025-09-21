# Smart Contract Registry

This directory contains the Foundry-based smart contracts for the TEE Agent Registry system.

## Overview

The smart contracts provide on-chain verification of Intel TDX attestation reports and maintain a registry of verified agent wallets.

## Contracts

### Registry.sol
Main registry contract that:
- Verifies Intel TDX attestation reports
- Registers agent wallet addresses
- Maintains mapping between users and their agents
- Provides verification functions for TEE attestation

## Development

### Prerequisites
- Foundry installed
- Access to Hyperliquid testnet/mainnet

### Setup
```bash
# Install dependencies
forge install

# Build contracts
forge build

# Run tests
forge test

# Deploy to testnet
forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_testnet
```

### Configuration
The `foundry.toml` file is configured for Hyperliquid networks with appropriate RPC endpoints and explorer URLs.

## Foundry Usage

### Build
```shell
$ forge build
```

### Test
```shell
$ forge test
```

### Format
```shell
$ forge fmt
```

### Deploy
```shell
$ forge script script/Deploy.s.sol --rpc-url hyperliquid_testnet --private-key <your_private_key>
```

## TODO
- [ ] Implement actual Intel TDX attestation verification logic
- [ ] Add comprehensive test suite
- [ ] Create deployment scripts
- [ ] Add access control mechanisms
- [ ] Implement agent lifecycle management
- [ ] Add events for better indexing
