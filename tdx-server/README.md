# TDX Agent Server

TEE-secured API server running in Intel TDX environment for managing Hyperliquid agent wallets.

## Overview

This server runs inside an Intel TDX (Trusted Execution Environment) and provides:

- **Agent Key Management**: Generate and store agent keys securely within TEE
- **Attestation Generation**: Create verifiable TDX attestation reports
- **API Proxy**: Transparent proxy for Hyperliquid API with automatic signing
- **API Key Authentication**: Secure access without exposing agent private keys

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                Intel TDX Environment                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐    ┌──────────────┐              │
│  │ Rust Core   │    │ Python Proxy │              │
│  │             │    │              │              │
│  │ • TEE Keys  │◄──►│ • HL API     │              │
│  │ • Attest.   │    │ • Auto-sign  │              │
│  │ • Auth      │    │ • Validation │              │
│  └─────────────┘    └──────────────┘              │
│                                                     │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Hyperliquid API │
                  └─────────────────┘
```

## Components

### Rust Core (`src/`)
- **Agent Management**: Secure key generation and storage
- **TDX Attestation**: Generate and verify attestation reports
- **Authentication**: API key validation and management
- **HTTP Server**: Main API endpoints

### Python Proxy (`python/`)
- **API Integration**: Direct integration with Hyperliquid API
- **Request Signing**: Automatic transaction signing with agent keys
- **Validation**: Request validation and security checks

## API Endpoints

### Agent Management
- `POST /register-agent` - Register new agent with TDX attestation
- `GET /agents/{user_id}` - Get agent information
- `GET /attestation` - Get current TDX attestation report

### Hyperliquid Proxy
- `GET /info/*` - Proxy read-only info requests
- `POST /exchange/*` - Proxy exchange requests with auto-signing

## Security Model

1. **TEE Isolation**: All agent keys generated and stored only in TDX
2. **Attestation Verification**: Cryptographic proof of TEE integrity
3. **API Key Separation**: User authentication independent of agent keys
4. **Automatic Signing**: Transparent signing within verified environment

## Development Setup

### Prerequisites
- Intel TDX-enabled hardware (for production)
- Rust toolchain
- Python 3.9+

### Quick Start
```bash
# Install Rust dependencies
cargo build

# Install Python dependencies
cd python && pip install -r requirements.txt

# Run server (development mode)
cargo run --bin server
```

## TODO
- [ ] Implement actual Intel TDX attestation libraries
- [ ] Add comprehensive authentication middleware
- [ ] Implement request signing logic
- [ ] Add database persistence (optional)
- [ ] Create deployment scripts for TDX environment
- [ ] Add monitoring and logging
- [ ] Implement rate limiting and security features