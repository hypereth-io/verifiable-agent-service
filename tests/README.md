# TDX Agent Wallet Test Suite

Comprehensive test suite for the TEE-Secured Hyperliquid Agent Wallet, using the official Hyperliquid Python SDK as ground truth for API behavior verification.

## Overview

This test suite validates the TDX server implementation by:

1. **API Proxy Testing**: Verifying that `/info` requests are properly passed through
2. **Signature Verification**: Testing that `/exchange` requests are correctly signed using Hyperliquid's signature scheme
3. **End-to-End Workflows**: Testing complete user workflows and error scenarios

## Setup

### Prerequisites

- Python 3.9+
- TDX server running on `localhost:8080` (or configured URL)
- Access to Hyperliquid testnet (for SDK comparisons)

### Installation

1. **Create virtual environment:**
   ```bash
   cd tests
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

### Environment Configuration

Key environment variables in `.env`:

```bash
# TDX Server
TDX_SERVER_URL=http://localhost:8080

# Test API Key (mock during development)
TEST_API_KEY=test-api-key-12345

# Hyperliquid Network
USE_TESTNET=true

# Test Account (DO NOT USE REAL FUNDS)
TEST_PRIVATE_KEY=0x1234... # Generate test key
```

## Test Structure

### Core Test Files

- **`conftest.py`**: Pytest configuration and shared fixtures
- **`test_proxy.py`**: API proxy functionality tests
- **`test_signing.py`**: Signature generation and verification tests  
- **`test_e2e.py`**: End-to-end workflow tests

### Test Categories

#### Unit Tests (`@pytest.mark.unit`)
- Test individual components in isolation
- No external dependencies required
- Fast execution

#### Integration Tests (`@pytest.mark.integration`)
- Test interaction with TDX server
- Require running TDX server
- Compare against Hyperliquid SDK

#### Slow Tests (`@pytest.mark.slow`)
- Performance and stress tests
- Concurrent request testing
- Extended workflows

## Running Tests

### Basic Usage

```bash
# Run all tests
pytest

# Run specific test file
pytest test_proxy.py

# Run with verbose output
pytest -v

# Run only unit tests
pytest -m unit

# Run only integration tests (requires TDX server)
pytest -m integration

# Skip slow tests
pytest -m "not slow"
```

### Advanced Options

```bash
# Run with coverage
pytest --cov=. --cov-report=html

# Run in parallel (if pytest-xdist installed)
pytest -n auto

# Stop on first failure
pytest -x

# Run specific test function
pytest test_proxy.py::TestInfoEndpointProxy::test_all_mids_passthrough
```

## Test Scenarios

### API Proxy Tests (`test_proxy.py`)

Tests that verify the TDX server correctly proxies Hyperliquid API requests:

- **Info Endpoint Passthrough**: Verify `/info` requests pass through unmodified
- **Response Format Validation**: Ensure responses match SDK format
- **Error Handling**: Test malformed requests and error conditions
- **Authentication**: Verify API key requirements for `/exchange` endpoints

### Signature Tests (`test_signing.py`)

Tests that verify cryptographic signature generation:

- **SDK Compatibility**: Compare signatures against official SDK
- **Signature Format**: Verify ECDSA signature components (r, s, v)
- **Message Serialization**: Test action serialization for signing
- **Chain ID Handling**: Test Arbitrum mainnet/testnet signatures
- **Order Types**: Test signing different order types (limit, market, etc.)

### End-to-End Tests (`test_e2e.py`)

Tests that verify complete user workflows:

- **Basic Workflows**: Health check → Info request → Signed request
- **Error Recovery**: Network errors, malformed requests, timeouts
- **Concurrent Requests**: Multiple simultaneous requests
- **Data Consistency**: Repeated requests return consistent structure
- **Performance**: Response time and consistency validation

## Key Test Fixtures

### `config`
Test configuration loaded from environment variables.

### `test_account`
Ethereum test account for signing (never use real funds).

### `hyperliquid_client`
Official Hyperliquid SDK client for baseline comparisons.

### `tdx_server_client`
HTTP client for TDX server with automatic API key handling.

### `sample_info_requests`
Pre-configured info request payloads.

### `sample_exchange_requests`
Pre-configured exchange request payloads.

## Test Data

### Sample Requests

The test suite includes realistic sample requests:

```python
# Info requests
{"type": "allMids"}
{"type": "l2Book", "coin": "BTC"}
{"type": "clearinghouseState", "user": "0x..."}

# Exchange requests (with proper signatures)
{
  "action": {
    "type": "order",
    "orders": [{
      "a": 0, "b": True, "p": "45000.0", "s": "0.01",
      "r": False, "t": {"limit": {"tif": "Gtc"}}
    }]
  },
  "nonce": 1700000000000,
  "signature": {...}
}
```

## Development Workflow

### Test-Driven Development

1. **Run existing tests** to establish baseline
2. **Identify failing tests** that represent missing functionality
3. **Implement Rust server features** to make tests pass
4. **Add new tests** for additional functionality
5. **Refactor** with confidence that tests will catch regressions

### Example Workflow

```bash
# 1. Check current status
pytest test_proxy.py -v

# 2. Run specific failing test
pytest test_proxy.py::TestInfoEndpointProxy::test_all_mids_passthrough -v

# 3. Implement feature in Rust server
# (edit tdx-server/src/proxy.rs)

# 4. Verify fix
pytest test_proxy.py::TestInfoEndpointProxy::test_all_mids_passthrough -v

# 5. Run full test suite
pytest
```

## Common Test Patterns

### Comparing with SDK

```python
# Get baseline from official SDK
sdk_response = hyperliquid_client.info.all_mids()

# Get response from TDX proxy
proxy_response = tdx_server_client.post("/info", {"type": "allMids"})

# Compare structure and content
assert proxy_response.json().keys() == sdk_response.keys()
```

### Testing Signatures

```python
# Create action and sign with SDK
action = {"type": "order", "orders": [...]}
signature = sign_l1_action(action, nonce, private_key)

# Test TDX server accepts same signature format
request = {"action": action, "nonce": nonce, "signature": signature}
response = tdx_server_client.post("/exchange", request)
assert response.status_code != 401  # Not auth failure
```

### Error Testing

```python
# Test various error conditions
error_cases = [
    {},  # Empty request
    {"type": ""},  # Empty type
    {"invalid": "field"},  # Wrong fields
]

for error_case in error_cases:
    response = tdx_server_client.post("/info", error_case)
    assert 400 <= response.status_code < 500
```

## Troubleshooting

### Common Issues

**TDX Server Not Running**
```
pytest.skip: TDX server is not running or not healthy
```
Solution: Start the TDX server with `cargo run --bin server`

**SDK Import Errors**
```
ImportError: No module named 'hyperliquid'
```
Solution: Install requirements with `pip install -r requirements.txt`

**Test Account Issues**
```
Error: Invalid private key format
```
Solution: Generate a valid test private key in `.env`

**Network Connectivity**
```
ConnectionError: Unable to connect to Hyperliquid API
```
Solution: Check internet connection and `USE_TESTNET` setting

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
pytest -v -s
```

View detailed HTTP requests:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Security Notes

⚠️ **Important Security Reminders:**

- **Never use real private keys** in test environment
- **Never commit private keys** to version control
- **Use testnet only** for development and testing
- **Generate unique test keys** for each development environment
- **Test with minimal amounts** if using real networks

## Contributing

When adding new tests:

1. **Follow naming conventions**: `test_<functionality>_<scenario>`
2. **Use appropriate markers**: `@pytest.mark.unit`, `@pytest.mark.integration`
3. **Add docstrings**: Explain what the test validates
4. **Handle edge cases**: Test both success and failure scenarios
5. **Update documentation**: Add new test patterns to this README

## Future Enhancements

- **Agent Management Tests**: Once agent APIs are implemented
- **Performance Benchmarks**: Automated performance regression detection
- **Chaos Testing**: Network failures, server restarts during requests
- **Security Testing**: Penetration testing, input validation
- **Real TDX Testing**: Tests on actual TDX hardware