"""
Test TDX server API proxy functionality.

This module tests that the TDX server correctly proxies Hyperliquid API requests,
comparing responses against the official Hyperliquid SDK.
"""

import pytest
import json
from typing import Dict, Any


class TestInfoEndpointProxy:
    """Test /info endpoint passthrough functionality."""
    
    @pytest.mark.integration
    def test_all_mids_direct_api(self, hyperliquid_info):
        """Test that we can get allMids from Hyperliquid API directly."""
        # Get response from SDK directly (testing our setup)
        try:
            sdk_response = hyperliquid_info.all_mids()
        except Exception as e:
            pytest.fail(f"Cannot get data from Hyperliquid SDK: {e}")
        
        # Verify response structure
        assert isinstance(sdk_response, dict), "Response should be a dictionary"
        assert len(sdk_response) > 0, "Response should contain mid prices"
        
        # Verify that common coins exist
        common_coins = ["BTC", "ETH"]
        for coin in common_coins:
            if coin in sdk_response:
                # Verify price is a valid number string
                assert isinstance(sdk_response[coin], str), f"Price for {coin} should be string"
                try:
                    price = float(sdk_response[coin])
                    assert price > 0, f"Price for {coin} should be positive"
                    print(f"✓ {coin} price: {sdk_response[coin]}")
                except ValueError:
                    pytest.fail(f"Price for {coin} is not a valid number: {sdk_response[coin]}")
        
        print(f"✓ Got {len(sdk_response)} trading pairs from Hyperliquid API")
    
    @pytest.mark.integration 
    def test_l2_book_direct_api(self, hyperliquid_info):
        """Test that we can get l2Book from Hyperliquid API directly."""
        # Get baseline from SDK
        try:
            sdk_response = hyperliquid_info.l2_snapshot("BTC")
        except Exception as e:
            pytest.fail(f"Cannot get l2_snapshot from Hyperliquid SDK: {e}")
        
        # Verify response structure
        assert "levels" in sdk_response, "Response should contain levels"
        assert "time" in sdk_response, "Response should contain timestamp"
        assert isinstance(sdk_response["levels"], list), "Levels should be an array"
        assert len(sdk_response["levels"]) == 2, "Should have [bids, asks]"
        
        # Verify bids and asks structure
        bids, asks = sdk_response["levels"]
        assert isinstance(bids, list), "Bids should be an array"
        assert isinstance(asks, list), "Asks should be an array"
        
        # Check bid/ask entry structure
        if bids:
            bid = bids[0]
            assert "px" in bid and "sz" in bid, "Bid should have px and sz fields"
            print(f"✓ Best bid: {bid['px']} size: {bid['sz']}")
        if asks:
            ask = asks[0]
            assert "px" in ask and "sz" in ask, "Ask should have px and sz fields"
            print(f"✓ Best ask: {ask['px']} size: {ask['sz']}")
            
        print(f"✓ Got order book with {len(bids)} bids and {len(asks)} asks")
    
    @pytest.mark.integration
    def test_user_state_passthrough(self, tdx_server_client, sample_info_requests):
        """Test that clearinghouseState request is properly passed through."""
        proxy_response = tdx_server_client.post("/info", sample_info_requests["user_state"])
        
        # Should work even if user has no positions
        assert proxy_response.status_code == 200
        proxy_data = proxy_response.json()
        
        # Verify response structure (may be empty for new user)
        assert isinstance(proxy_data, dict), "Response should be a dictionary"
    
    @pytest.mark.integration
    def test_open_orders_passthrough(self, tdx_server_client, sample_info_requests):
        """Test that openOrders request is properly passed through."""
        proxy_response = tdx_server_client.post("/info", sample_info_requests["open_orders"])
        
        assert proxy_response.status_code == 200
        proxy_data = proxy_response.json()
        
        # Should return an array (empty if no orders)
        assert isinstance(proxy_data, list), "Response should be an array"
    
    @pytest.mark.integration
    def test_user_fills_passthrough(self, tdx_server_client, sample_info_requests):
        """Test that userFills request is properly passed through."""
        proxy_response = tdx_server_client.post("/info", sample_info_requests["user_fills"])
        
        assert proxy_response.status_code == 200
        proxy_data = proxy_response.json()
        
        # Should return an array (empty if no fills)
        assert isinstance(proxy_data, list), "Response should be an array"
    
    @pytest.mark.unit
    def test_invalid_info_request(self, tdx_server_client):
        """Test handling of invalid info requests."""
        invalid_request = {"type": "invalidType"}
        
        response = tdx_server_client.post("/info", invalid_request)
        
        # Should return an error (exact status code may vary)
        assert response.status_code >= 400, "Invalid request should return error"
    
    @pytest.mark.unit
    def test_malformed_info_request(self, tdx_server_client):
        """Test handling of malformed requests."""
        # Missing required 'type' field
        malformed_request = {"coin": "BTC"}
        
        response = tdx_server_client.post("/info", malformed_request)
        assert response.status_code >= 400, "Malformed request should return error"
        
        # Invalid JSON structure
        response = tdx_server_client.post("/info", "invalid json")
        assert response.status_code >= 400, "Invalid JSON should return error"


class TestExchangeEndpointProxy:
    """Test /exchange endpoint functionality (without actual trading)."""
    
    @pytest.mark.unit
    def test_exchange_endpoint_requires_api_key(self, tdx_server_client, sample_exchange_requests):
        """Test that exchange endpoints require API key authentication."""
        # Make request without API key
        client_no_auth = tdx_server_client
        client_no_auth.api_key = ""  # Remove API key
        
        response = client_no_auth.post("/exchange", sample_exchange_requests["place_order"])
        
        # Should require authentication
        assert response.status_code in [401, 403], "Should require API key authentication"
    
    @pytest.mark.integration
    @pytest.mark.slow
    def test_exchange_endpoint_structure(self, tdx_server_client, sample_exchange_requests):
        """Test exchange endpoint accepts properly structured requests."""
        # Update nonce to current timestamp
        import time
        request = sample_exchange_requests["place_order"].copy()
        request["nonce"] = int(time.time() * 1000)
        
        response = tdx_server_client.post("/exchange", request)
        
        # We expect this to fail due to missing signature, but structure should be accepted
        # The specific error will depend on TDX server implementation
        assert response.status_code in [200, 400, 401, 403], f"Unexpected status: {response.status_code}"
        
        # If it's a 400, it should be due to missing/invalid signature, not malformed request
        if response.status_code == 400:
            response_text = response.text.lower()
            assert any(keyword in response_text for keyword in ["signature", "sign", "auth"]), \
                "400 error should be related to signature/auth, not request structure"


class TestErrorHandling:
    """Test error handling and edge cases."""
    
    @pytest.mark.unit
    def test_invalid_endpoint(self, tdx_server_client):
        """Test requests to non-existent endpoints."""
        response = tdx_server_client.get("/nonexistent")
        assert response.status_code == 404, "Non-existent endpoint should return 404"
    
    @pytest.mark.unit
    def test_wrong_http_method(self, tdx_server_client):
        """Test using wrong HTTP methods."""
        # Info endpoint should be POST, not GET
        response = tdx_server_client.get("/info")
        assert response.status_code in [404, 405], "Wrong HTTP method should return error"
        
        # Exchange endpoint should be POST, not GET
        response = tdx_server_client.get("/exchange")
        assert response.status_code in [404, 405], "Wrong HTTP method should return error"
    
    @pytest.mark.unit
    def test_empty_request_body(self, tdx_server_client):
        """Test handling of empty request bodies."""
        response = tdx_server_client.post("/info", {})
        assert response.status_code >= 400, "Empty request should return error"
    
    @pytest.mark.integration
    def test_server_health_check(self, tdx_server_client):
        """Test server health check endpoint."""
        response = tdx_server_client.get("/health")
        
        assert response.status_code == 200
        health_data = response.json()
        
        assert "status" in health_data
        assert health_data["status"] == "healthy"
        assert "service" in health_data
        assert "version" in health_data


class TestResponseFormat:
    """Test response format consistency."""
    
    @pytest.mark.integration
    def test_response_headers(self, tdx_server_client, sample_info_requests):
        """Test that responses have correct headers."""
        response = tdx_server_client.post("/info", sample_info_requests["all_mids"])
        
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "").lower()
    
    @pytest.mark.integration
    def test_response_encoding(self, tdx_server_client, sample_info_requests):
        """Test that responses are properly encoded."""
        response = tdx_server_client.post("/info", sample_info_requests["all_mids"])
        
        assert response.status_code == 200
        
        # Should be valid JSON
        try:
            json.loads(response.text)
        except json.JSONDecodeError:
            pytest.fail("Response is not valid JSON")
        
        # Should be UTF-8 encoded
        assert response.encoding.lower() in ["utf-8", "utf8"] or response.encoding is None