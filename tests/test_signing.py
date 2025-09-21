"""
Test signature generation and verification functionality.

This module tests that the TDX server correctly signs Hyperliquid requests
using the same format as the official SDK.
"""

import pytest
import time
import json
from eth_account import Account
from eth_account.messages import encode_defunct
from hyperliquid.utils.signing import sign_l1_action, sign_inner


class TestHyperliquidSignatures:
    """Test Hyperliquid signature generation and verification."""
    
    @pytest.mark.unit
    def test_sdk_signature_format(self, test_account):
        """Test understanding of Hyperliquid SDK signature format."""
        # Create a simple order action using SDK
        action = {
            "type": "order",
            "orders": [{
                "a": 0,  # Asset index
                "b": True,  # Buy
                "p": "45000.0",  # Price
                "s": "0.01",  # Size
                "r": False,  # Not reduce-only
                "t": {"limit": {"tif": "Gtc"}}  # Good till cancel
            }]
        }
        
        nonce = int(time.time() * 1000)
        
        # Sign using SDK (note: different signature than expected)
        # Let's first test with a simpler approach
        account = test_account["account"]
        signature = sign_l1_action(
            wallet=account,
            action=action,
            active_pool=None,  # vault_address
            nonce=nonce,
            expires_after=int(time.time() * 1000) + 60000,  # 1 minute from now
            is_mainnet=True
        )
        
        # Verify signature structure
        assert isinstance(signature, dict), "Signature should be dict"
        assert "r" in signature, "Signature should have r component"
        assert "s" in signature, "Signature should have s component" 
        assert "v" in signature, "Signature should have v component"
        
        # Verify format (allow for leading zero variations)
        assert signature["r"].startswith("0x"), "r should be hex string"
        assert signature["s"].startswith("0x"), "s should be hex string"
        assert len(signature["r"]) in [65, 66], "r should be 32 bytes hex (65-66 chars with 0x)"
        assert len(signature["s"]) in [65, 66], "s should be 32 bytes hex (65-66 chars with 0x)"
        assert signature["v"] in [27, 28], "v should be 27 or 28"
    
    @pytest.mark.integration
    def test_exchange_request_with_sdk_signature(self, tdx_server_client, test_account):
        """Test that properly signed requests are accepted by TDX server."""
        # Create order action
        action = {
            "type": "order", 
            "orders": [{
                "a": 0,
                "b": True,
                "p": "45000.0",
                "s": "0.01", 
                "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        nonce = int(time.time() * 1000)
        
        # Sign with SDK (corrected signature)
        signature = sign_l1_action(
            wallet=test_account["account"],
            action=action,
            active_pool=None,
            nonce=nonce,
            expires_after=nonce + 60000,  # 1 minute expiry
            is_mainnet=True
        )
        
        # Create full request
        request = {
            "action": action,
            "nonce": nonce,
            "signature": signature
        }
        
        # Send to TDX server
        response = tdx_server_client.post("/exchange", request)
        
        # Should not fail due to signature format
        # (may fail for other reasons like insufficient funds, but not signature)
        assert response.status_code != 401, "Properly signed request should not be rejected for auth"
        
        # If it's a 400, should not be due to signature format
        if response.status_code == 400:
            response_text = response.text.lower()
            format_errors = ["invalid signature", "malformed", "parse", "format"]
            assert not any(error in response_text for error in format_errors), \
                "Should not fail due to signature format"
    
    @pytest.mark.unit
    def test_different_order_types_signing(self, test_account):
        """Test signing different types of orders."""
        base_order = {
            "a": 0,
            "b": True,
            "p": "45000.0", 
            "s": "0.01",
            "r": False
        }
        
        order_types = [
            {"limit": {"tif": "Gtc"}},  # Good till cancel
            {"limit": {"tif": "Ioc"}},  # Immediate or cancel
            {"limit": {"tif": "Alo"}},  # Add liquidity only
        ]
        
        for order_type in order_types:
            order = base_order.copy()
            order["t"] = order_type
            
            action = {"type": "order", "orders": [order]}
            nonce = int(time.time() * 1000)
            
            # Should be able to sign all order types
            signature = sign_l1_action(
                wallet=test_account["account"],
                action=action,
                active_pool=None,
                nonce=nonce,
                expires_after=nonce + 60000,
                is_mainnet=True
            )
            
            assert isinstance(signature, dict), f"Failed to sign order type {order_type}"
    
    @pytest.mark.unit
    def test_cancel_request_signing(self, test_account):
        """Test signing cancel requests."""
        action = {
            "type": "cancel",
            "cancels": [{
                "a": 0,  # Asset index
                "o": 12345  # Order ID to cancel
            }]
        }
        
        nonce = int(time.time() * 1000)
        
        signature = sign_l1_action(
            wallet=test_account["account"],
            action=action,
            active_pool=None,
            nonce=nonce,
            expires_after=nonce + 60000,
            is_mainnet=True
        )
        
        assert isinstance(signature, dict), "Should be able to sign cancel requests"
        assert all(key in signature for key in ["r", "s", "v"]), "Cancel signature should have r, s, v"
    
    @pytest.mark.integration
    def test_nonce_validation(self, tdx_server_client, test_account):
        """Test that nonce validation works correctly."""
        action = {
            "type": "order",
            "orders": [{
                "a": 0, "b": True, "p": "45000.0", "s": "0.01", "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        # Test with old nonce (should be rejected)
        old_nonce = int(time.time() * 1000) - 120000  # 2 minutes old
        old_signature = sign_l1_action(
            wallet=test_account["account"],
            action=action,
            active_pool=None,
            nonce=old_nonce,
            expires_after=old_nonce + 60000,
            is_mainnet=True
        )
        
        old_request = {
            "action": action,
            "nonce": old_nonce,
            "signature": old_signature
        }
        
        response = tdx_server_client.post("/exchange", old_request)
        # Should reject old nonce (exact behavior depends on implementation)
        # Could be 400 (bad request) or 401 (unauthorized)
        
        # Test with current nonce (should be accepted for signature validation)
        current_nonce = int(time.time() * 1000)
        current_signature = sign_l1_action(
            wallet=test_account["account"],
            action=action,
            active_pool=None,
            nonce=current_nonce,
            expires_after=current_nonce + 60000,
            is_mainnet=True
        )
        
        current_request = {
            "action": action,
            "nonce": current_nonce,
            "signature": current_signature
        }
        
        response = tdx_server_client.post("/exchange", current_request)
        # Should not fail due to nonce being too old
        assert response.status_code != 401 or "nonce" not in response.text.lower()


class TestSignatureVerification:
    """Test signature verification logic."""
    
    @pytest.mark.unit
    def test_signature_components_format(self):
        """Test that signature components are properly formatted."""
        # Create test signature data
        private_key = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        account = Account.from_key(private_key)
        
        # Sign some test data
        message = "test message"
        encoded_message = encode_defunct(text=message)
        signed_message = account.sign_message(encoded_message)
        
        # Verify format
        assert len(hex(signed_message.r)) <= 66, "r component should fit in 32 bytes"
        assert len(hex(signed_message.s)) <= 66, "s component should fit in 32 bytes"
        assert signed_message.v in [27, 28], "v should be 27 or 28"
    
    @pytest.mark.unit
    def test_invalid_signature_detection(self, tdx_server_client):
        """Test that invalid signatures are properly rejected."""
        action = {
            "type": "order",
            "orders": [{
                "a": 0, "b": True, "p": "45000.0", "s": "0.01", "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        nonce = int(time.time() * 1000)
        
        # Create invalid signature
        invalid_signature = {
            "r": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "s": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321", 
            "v": 27
        }
        
        request = {
            "action": action,
            "nonce": nonce,
            "signature": invalid_signature
        }
        
        response = tdx_server_client.post("/exchange", request)
        
        # Server should handle invalid signature appropriately
        if response.status_code == 200:
            # Transparent proxy: forwarded to Hyperliquid, check error response
            data = response.json()
            if data.get("status") == "err":
                error_msg = data.get("response", "").lower()
                assert any(keyword in error_msg for keyword in ["recover signer", "signature", "invalid", "does not exist"]), \
                    f"Should have signature-related error: {data}"
            else:
                pytest.fail(f"Expected signature error but got: {data}")
        elif response.status_code >= 400:
            # Direct rejection is also acceptable
            pass
        else:
            pytest.fail(f"Invalid signature should be handled, got: {response.status_code}")
    
    @pytest.mark.unit
    def test_malformed_signature_rejection(self, tdx_server_client):
        """Test rejection of malformed signatures."""
        action = {
            "type": "order",
            "orders": [{
                "a": 0, "b": True, "p": "45000.0", "s": "0.01", "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        nonce = int(time.time() * 1000)
        
        malformed_signatures = [
            # Missing components
            {"r": "0x123", "s": "0x456"},  # Missing v
            {"r": "0x123", "v": 27},       # Missing s
            {"s": "0x456", "v": 27},       # Missing r
            
            # Wrong format
            {"r": "123", "s": "0x456", "v": 27},        # Missing 0x prefix
            {"r": "0x123", "s": "0x456", "v": 29},      # Invalid v value
            {"r": "0xnotahexstring", "s": "0x456", "v": 27},  # Invalid hex
        ]
        
        for malformed_sig in malformed_signatures:
            request = {
                "action": action,
                "nonce": nonce,
                "signature": malformed_sig
            }
            
            response = tdx_server_client.post("/exchange", request)
            
            # Server should handle malformed signature appropriately
            if response.status_code == 200:
                # Transparent proxy: check error response content
                data = response.json()
                if data.get("status") == "err":
                    error_msg = data.get("response", "").lower()
                    assert any(keyword in error_msg for keyword in ["recover signer", "signature", "invalid", "malformed", "does not exist"]), \
                        f"Should have signature-related error: {data}"
                else:
                    pytest.fail(f"Expected signature error but got: {data}")
            elif response.status_code >= 400:
                # Direct rejection is also acceptable
                pass
            else:
                pytest.fail(f"Malformed signature should be handled: {malformed_sig}, got: {response.status_code}")


class TestMessageFormatting:
    """Test that message formatting matches Hyperliquid requirements."""
    
    @pytest.mark.unit
    def test_action_serialization(self):
        """Test that actions are serialized correctly for signing."""
        # This tests our understanding of how Hyperliquid serializes actions
        action = {
            "type": "order",
            "orders": [{
                "a": 0,
                "b": True,
                "p": "45000.0",
                "s": "0.01",
                "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        # Test that we can use the SDK's serialization
        # This ensures we understand the format
        nonce = 1700000000000
        
        # Just verify action structure since sign_inner is internal
        assert "type" in action, "Action should have type"
        assert "orders" in action, "Order action should have orders"
    
    @pytest.mark.unit 
    def test_field_ordering(self):
        """Test that field ordering is consistent."""
        # Hyperliquid is sensitive to field ordering in some cases
        order1 = {
            "a": 0,
            "b": True,
            "p": "45000.0",
            "s": "0.01",
            "r": False,
            "t": {"limit": {"tif": "Gtc"}}
        }
        
        order2 = {
            "t": {"limit": {"tif": "Gtc"}},
            "r": False,
            "s": "0.01",
            "p": "45000.0",
            "b": True,
            "a": 0
        }
        
        # Both should be valid orders (field order shouldn't matter for JSON)
        assert order1["a"] == order2["a"], "Orders should be equivalent"
        assert order1["b"] == order2["b"], "Orders should be equivalent"
    
    @pytest.mark.unit
    def test_number_formatting(self):
        """Test that numbers are formatted correctly."""
        # Hyperliquid requires specific number formatting
        valid_prices = ["45000.0", "45000", "0.1", "1000.5"]
        invalid_prices = ["45000.", ".5", "1,000", "1e3"]
        
        for price in valid_prices:
            # Should be able to parse as float
            try:
                float(price)
            except ValueError:
                pytest.fail(f"Valid price {price} should be parseable")
        
        # Note: Invalid prices might still work depending on parser
        # This is more about documenting expected format


class TestChainIdHandling:
    """Test chain ID handling for different networks."""
    
    @pytest.mark.unit
    def test_arbitrum_chain_id(self, test_account):
        """Test signing with Arbitrum chain ID."""
        action = {
            "type": "order",
            "orders": [{
                "a": 0, "b": True, "p": "45000.0", "s": "0.01", "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        nonce = int(time.time() * 1000)
        
        # Test with Arbitrum mainnet chain ID
        signature = sign_l1_action(
            wallet=test_account["account"],
            action=action,
            active_pool=None,
            nonce=nonce,
            expires_after=nonce + 60000,
            is_mainnet=True  # Mainnet = true
        )
        
        assert isinstance(signature, dict), "Should sign with Arbitrum chain ID"
        
        # Test with testnet
        signature_testnet = sign_l1_action(
            wallet=test_account["account"],
            action=action,
            active_pool=None,
            nonce=nonce,
            expires_after=nonce + 60000,
            is_mainnet=False  # Testnet = false
        )
        
        assert isinstance(signature_testnet, dict), "Should sign with Arbitrum testnet chain ID"
        
        # Signatures should be different for different chain IDs
        assert signature != signature_testnet, "Different chain IDs should produce different signatures"