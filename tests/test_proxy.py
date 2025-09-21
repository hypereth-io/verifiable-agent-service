"""
Test TDX server API proxy functionality.

This module tests that the TDX server correctly proxies Hyperliquid API requests,
comparing responses against the official Hyperliquid SDK.
"""

import pytest
import json


class TestInfoEndpointProxy:
    """Test /info endpoint passthrough functionality."""
    
    @pytest.mark.integration
    def test_all_mids_proxy(self, tdx_server_client, hyperliquid_info):
        """Test that allMids request works through TDX proxy."""
        # Get baseline response from SDK
        try:
            sdk_response = hyperliquid_info.all_mids()
        except Exception as e:
            pytest.skip(f"Cannot get baseline from Hyperliquid SDK: {e}")
        
        # Test proxy with same request format
        info_request = {"type": "allMids"}
        proxy_response = tdx_server_client.post("/info", info_request)
        
        # Verify proxy response
        assert proxy_response.status_code == 200, f"Expected 200, got {proxy_response.status_code}"
        proxy_data = proxy_response.json()
        
        # Compare response structure and data
        assert isinstance(proxy_data, dict), "Response should be a dictionary"
        assert len(proxy_data) > 0, "Response should contain mid prices"
        assert len(proxy_data) == len(sdk_response), "Proxy and SDK should return same number of pairs"
        
        # Verify common coins match
        common_coins = ["BTC", "ETH"]
        for coin in common_coins:
            if coin in sdk_response:
                assert coin in proxy_data, f"Coin {coin} missing from proxy response"
                assert isinstance(proxy_data[coin], str), f"Price for {coin} should be string"
                
                # Prices should be very close (within 1% due to timing)
                proxy_price = float(proxy_data[coin])
                sdk_price = float(sdk_response[coin])
                price_diff = abs(proxy_price - sdk_price) / sdk_price
                assert price_diff < 0.01, f"Prices too different: SDK {sdk_price}, Proxy {proxy_price}"
                print(f"✓ {coin} - SDK: {sdk_response[coin]}, Proxy: {proxy_data[coin]}")
        
        print(f"✓ Proxy validated: {len(proxy_data)} trading pairs")
    
    @pytest.mark.integration 
    def test_l2_book_proxy(self, tdx_server_client, hyperliquid_info):
        """Test that l2Book request works through TDX proxy."""
        # Get baseline from SDK
        try:
            sdk_response = hyperliquid_info.l2_snapshot("BTC")
        except Exception as e:
            pytest.skip(f"Cannot get l2_snapshot from Hyperliquid SDK: {e}")
        
        # Test proxy with l2Book request
        info_request = {"type": "l2Book", "coin": "BTC"}
        proxy_response = tdx_server_client.post("/info", info_request)
        
        # Verify proxy response
        assert proxy_response.status_code == 200, f"l2Book proxy failed: {proxy_response.status_code}"
        proxy_data = proxy_response.json()
        
        # Verify response structure matches SDK
        assert "levels" in proxy_data, "Response should contain levels"
        assert "time" in proxy_data, "Response should contain timestamp"
        assert isinstance(proxy_data["levels"], list), "Levels should be array"
        assert len(proxy_data["levels"]) == 2, "Should have [bids, asks]"
        
        # Verify bids and asks structure
        bids, asks = proxy_data["levels"]
        sdk_bids, sdk_asks = sdk_response["levels"]
        
        assert len(bids) == len(sdk_bids), "Bid count should match SDK"
        assert len(asks) == len(sdk_asks), "Ask count should match SDK"
        
        if bids and sdk_bids:
            assert "px" in bids[0] and "sz" in bids[0], "Bid should have px/sz fields"
            print(f"✓ Best bid - SDK: {sdk_bids[0]['px']}, Proxy: {bids[0]['px']}")
        
        if asks and sdk_asks:
            assert "px" in asks[0] and "sz" in asks[0], "Ask should have px/sz fields"
            print(f"✓ Best ask - SDK: {sdk_asks[0]['px']}, Proxy: {asks[0]['px']}")
            
        print(f"✓ Order book proxy validated: {len(bids)} bids, {len(asks)} asks")
    
    @pytest.mark.integration
    def test_user_state_proxy(self, tdx_server_client, hyperliquid_info):
        """Test clearinghouseState request through proxy."""
        # Use a test address (may return empty state)
        test_address = "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"
        
        # Get baseline from SDK
        try:
            sdk_response = hyperliquid_info.user_state(test_address)
        except Exception as e:
            pytest.skip(f"Cannot get user_state from SDK: {e}")
        
        # Test proxy
        info_request = {"type": "clearinghouseState", "user": test_address}
        proxy_response = tdx_server_client.post("/info", info_request)
        
        # Should work even for empty/non-existent user
        assert proxy_response.status_code == 200, f"User state proxy failed: {proxy_response.status_code}"
        proxy_data = proxy_response.json()
        
        # Verify response structure
        assert isinstance(proxy_data, dict), "Response should be dictionary"
        
        # If SDK returns data, proxy should too
        if sdk_response:
            assert len(proxy_data) > 0, "Proxy should return data if SDK does"
            print(f"✓ User state proxy validated")
        else:
            print(f"✓ User state proxy handles empty response correctly")
    
    @pytest.mark.integration
    def test_open_orders_proxy(self, tdx_server_client, hyperliquid_info):
        """Test openOrders request through proxy."""
        test_address = "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"
        
        # Get baseline from SDK
        try:
            sdk_response = hyperliquid_info.open_orders(test_address)
        except Exception as e:
            pytest.skip(f"Cannot get open_orders from SDK: {e}")
        
        # Test proxy
        info_request = {"type": "openOrders", "user": test_address}
        proxy_response = tdx_server_client.post("/info", info_request)
        
        assert proxy_response.status_code == 200, f"Open orders proxy failed: {proxy_response.status_code}"
        proxy_data = proxy_response.json()
        
        # Should return array (empty if no orders)
        assert isinstance(proxy_data, list), "Response should be array"
        assert len(proxy_data) == len(sdk_response), "Order count should match SDK"
        
        print(f"✓ Open orders proxy validated: {len(proxy_data)} orders")


class TestBasicErrorHandling:
    """Test essential error handling for proxy functionality."""
    
    @pytest.mark.integration
    def test_server_health_check(self, tdx_server_client):
        """Test server health check endpoint."""
        response = tdx_server_client.get("/health")
        
        assert response.status_code == 200
        health_data = response.json()
        
        assert health_data["status"] == "healthy"
        assert "service" in health_data
        assert "version" in health_data
        print("✓ Health check passed")
    
    @pytest.mark.unit
    def test_invalid_info_request(self, tdx_server_client):
        """Test handling of invalid info requests."""
        invalid_request = {"type": "invalidType"}
        response = tdx_server_client.post("/info", invalid_request)
        
        # Should return error from upstream API
        assert response.status_code >= 400, "Invalid request should return error"
    
    @pytest.mark.unit
    def test_malformed_request(self, tdx_server_client):
        """Test handling of malformed requests."""
        # Missing required 'type' field
        response = tdx_server_client.post("/info", {"coin": "BTC"})
        assert response.status_code >= 400, "Malformed request should return error"
    
    @pytest.mark.unit
    def test_invalid_endpoint(self, tdx_server_client):
        """Test requests to non-existent endpoints."""
        response = tdx_server_client.get("/nonexistent")
        assert response.status_code == 404, "Non-existent endpoint should return 404"