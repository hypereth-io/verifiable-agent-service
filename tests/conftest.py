"""
Pytest configuration and fixtures for TDX Agent Wallet tests.
"""

import os
import pytest
import requests
from dotenv import load_dotenv
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import eth_account
from eth_account.signers.local import LocalAccount
from typing import Optional, Dict, Any

# Load environment variables
load_dotenv()

class Config:
    """Test configuration class."""
    
    def __init__(self):
        self.tdx_server_url = os.getenv("TDX_SERVER_URL", "http://localhost:8080")
        self.test_api_key = os.getenv("TEST_API_KEY", "test-api-key-12345")
        self.test_private_key = os.getenv("TEST_PRIVATE_KEY")
        self.test_address = os.getenv("TEST_ADDRESS")
        self.test_user_id = os.getenv("TEST_USER_ID", "test-user-001")
        self.use_testnet = os.getenv("USE_TESTNET", "true").lower() == "true"
        self.request_timeout = int(os.getenv("REQUEST_TIMEOUT", "30"))
        self.health_check_timeout = int(os.getenv("HEALTH_CHECK_TIMEOUT", "5"))
        
        # Hyperliquid URLs
        if self.use_testnet:
            self.hyperliquid_url = os.getenv("HYPERLIQUID_TESTNET_URL", "https://api.hyperliquid-testnet.xyz")
        else:
            self.hyperliquid_url = os.getenv("HYPERLIQUID_MAINNET_URL", "https://api.hyperliquid.xyz")

@pytest.fixture(scope="session")
def config():
    """Provide test configuration."""
    return Config()

@pytest.fixture(scope="session")
def test_account(config):
    """Create a test Ethereum account."""
    if config.test_private_key:
        # Use provided test key
        account = eth_account.Account.from_key(config.test_private_key)
    else:
        # Generate a new test account
        account = eth_account.Account.create()
    
    return {
        "private_key": account.key.hex(),
        "address": account.address,
        "account": account
    }

@pytest.fixture(scope="session")
def hyperliquid_info(config):
    """Create Hyperliquid Info client for baseline comparisons."""
    base_url = None if config.use_testnet else "https://api.hyperliquid.xyz"
    return Info(base_url=base_url)

@pytest.fixture(scope="session")
def hyperliquid_exchange(config, test_account):
    """Create Hyperliquid Exchange client for signing tests."""
    base_url = None if config.use_testnet else "https://api.hyperliquid.xyz"
    account = test_account["account"]
    return Exchange(account, base_url=base_url)

@pytest.fixture
def tdx_server_client(config):
    """HTTP client for TDX server."""
    class TDXServerClient:
        def __init__(self, base_url: str, api_key: str, timeout: int):
            self.base_url = base_url.rstrip('/')
            self.api_key = api_key
            self.timeout = timeout
            self.session = requests.Session()
            
        def get(self, endpoint: str, **kwargs) -> requests.Response:
            """Make GET request to TDX server."""
            url = f"{self.base_url}{endpoint}"
            return self.session.get(url, timeout=self.timeout, **kwargs)
            
        def post(self, endpoint: str, json_data: Optional[Dict[Any, Any]] = None, 
                headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
            """Make POST request to TDX server."""
            url = f"{self.base_url}{endpoint}"
            
            # Add API key header if needed
            if headers is None:
                headers = {}
            if endpoint.startswith('/exchange') or endpoint.startswith('/agents'):
                headers['X-API-Key'] = self.api_key
                
            headers['Content-Type'] = 'application/json'
            
            return self.session.post(
                url, 
                json=json_data, 
                headers=headers, 
                timeout=self.timeout, 
                **kwargs
            )
            
        def health_check(self) -> bool:
            """Check if TDX server is healthy."""
            try:
                response = self.get("/health")
                return response.status_code == 200
            except:
                return False
    
    return TDXServerClient(
        base_url=config.tdx_server_url,
        api_key=config.test_api_key,
        timeout=config.request_timeout
    )

# @pytest.fixture(autouse=True)
# def check_tdx_server_health(tdx_server_client):
#     """Ensure TDX server is running before each test."""
#     if not tdx_server_client.health_check():
#         pytest.skip("TDX server is not running or not healthy")

@pytest.fixture
def sample_info_requests():
    """Sample info request payloads for testing."""
    return {
        "all_mids": {"type": "allMids"},
        "l2_book_btc": {"type": "l2Book", "coin": "BTC"},
        "user_state": {"type": "clearinghouseState", "user": "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"},
        "open_orders": {"type": "openOrders", "user": "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"},
        "user_fills": {"type": "userFills", "user": "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"}
    }

@pytest.fixture
def sample_exchange_requests():
    """Sample exchange request payloads for testing."""
    return {
        "place_order": {
            "action": {
                "type": "order",
                "orders": [{
                    "a": 0,  # Asset index (BTC)
                    "b": True,  # Buy order
                    "p": "45000.0",  # Price
                    "s": "0.01",  # Size
                    "r": False,  # Not reduce-only
                    "t": {"limit": {"tif": "Gtc"}}  # Good till cancel
                }]
            },
            "nonce": 1700000000000,  # Will be updated with current timestamp
        },
        "cancel_order": {
            "action": {
                "type": "cancel",
                "cancels": [{
                    "a": 0,  # Asset index
                    "o": 12345  # Order ID to cancel
                }]
            },
            "nonce": 1700000000000,  # Will be updated with current timestamp
        }
    }

@pytest.fixture
def mock_agent_data():
    """Mock agent data for testing."""
    return {
        "user_id": "test-user-001",
        "agent_address": "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1",
        "api_key": "test-api-key-12345",
        "created_at": 1700000000
    }

# Configure pytest
def pytest_configure(config):
    """Configure pytest settings."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )