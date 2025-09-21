# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **hlh.builders hackathon submission** for a TEE-Secured Hyperliquid Agent Wallet that demonstrates remote hosting of agent wallets in Intel TDX environments with on-chain attestation verification. The project eliminates local key storage by securely managing agent keys within a Trusted Execution Environment while providing transparent API access.

## Architecture

The system consists of three main components:

1. **Smart Contract Registry** (`/contracts`): Foundry-based contracts that verify Intel TDX attestation reports and maintain an on-chain registry of verified agent wallets
2. **TDX Server** (`/tdx-server`): Pure Rust server running in Intel TDX that manages agent keys using Automata TDX SDK, generates attestations, and proxies Hyperliquid API requests with automatic signing
3. **User Interface**: API-based interaction where users authenticate with API keys instead of managing private keys directly

## Key Development Commands

### Smart Contract Development (`/contracts`)
```bash
# Build contracts
forge build

# Run tests
forge test

# Deploy to Hyperliquid testnet
forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_testnet

# Deploy to Hyperliquid mainnet  
forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_mainnet

# Format code
forge fmt

# Verify contract on-chain
forge verify-contract --rpc-url hyperliquid_testnet <CONTRACT_ADDRESS> Registry
```

### TDX Server Development (`/tdx-server`)
```bash
# Build Rust server
cargo build --release

# Run main server
cargo run --bin server

# Run attestation setup
cargo run --bin setup-attestation

# Run tests
cargo test

# Check formatting and linting
cargo fmt
cargo clippy
```

## Network Configuration

The project is configured for Hyperliquid networks:
- **Testnet**: `https://api.hyperliquid-testnet.xyz/evm`  
- **Mainnet**: `https://api.hyperliquid.xyz/evm`
- **Explorer**: Configured in `foundry.toml` for contract verification

## Critical Security Architecture

### Trust Boundaries
- **Agent private keys**: Never exist outside Intel TDX environment
- **API keys**: Separate user authentication layer, managed independently  
- **Attestation verification**: Smart contract cryptographically verifies TDX integrity
- **Request signing**: All transactions automatically signed within verified TEE

### Key Data Flows
1. **Agent Registration**: User → TDX Server → Generate keys in TEE → Create attestation → Register on-chain → Return API key
2. **Trading Requests**: User → TDX Server (API key auth) → Sign with agent key → Hyperliquid API → Response

## Implementation Status

**Phase 1 Complete**: Project structure and foundational contracts
**Phase 2 Pending**: Full TDX verification logic, agent key management implementation
**Phase 3 Pending**: Complete Hyperliquid API integration and testing

## Important Notes

- The Registry.sol contract currently contains placeholder TDX verification logic that needs actual Intel TDX attestation libraries
- The Rust server structure is established with Automata TDX SDK dependencies configured
- Foundry configuration includes gas optimization and security settings appropriate for production deployment
- Server implements pure Rust architecture for better performance and security in TEE environment

## Development Environment

For development without TDX hardware:
- Use software attestation simulation
- Mock TDX libraries for testing
- Local testing with emulated secure environment