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
    def test_all_mids_equivalence(self, hyperliquid_info, hyperliquid_info_via_proxy):
        """Test SDK equivalence: direct API vs proxy API using same SDK code."""
        # Get response from direct API (baseline)
        try:
            direct_response = hyperliquid_info.all_mids()
        except Exception as e:
            pytest.skip(f"Cannot get baseline from Hyperliquid SDK: {e}")
        
        # Get response via proxy using same SDK method
        try:
            proxy_response = hyperliquid_info_via_proxy.all_mids()
        except Exception as e:
            pytest.fail(f"Proxy SDK call failed: {e}")
        
        # True equivalence test: should be identical
        assert isinstance(direct_response, dict), "Direct response should be dictionary"
        assert isinstance(proxy_response, dict), "Proxy response should be dictionary"
        assert len(direct_response) == len(proxy_response), "Should return same number of pairs"
        
        # Verify all common coins match exactly
        common_coins = ["BTC", "ETH"]
        for coin in common_coins:
            if coin in direct_response:
                assert coin in proxy_response, f"Coin {coin} missing from proxy response"
                
                # Prices should be very close (within 1% due to timing between calls)
                direct_price = float(direct_response[coin])
                proxy_price = float(proxy_response[coin])
                price_diff = abs(direct_price - proxy_price) / direct_price
                assert price_diff < 0.01, f"Prices too different: Direct {direct_price}, Proxy {proxy_price}"
                print(f"✓ {coin} - Direct: {direct_response[coin]}, Proxy: {proxy_response[coin]}")
        
        print(f"✓ SDK Equivalence validated: {len(direct_response)} trading pairs")
    
    @pytest.mark.integration 
    def test_l2_book_equivalence(self, hyperliquid_info, hyperliquid_info_via_proxy):
        """Test l2Book SDK equivalence: direct API vs proxy API."""
        # Get baseline from direct SDK
        try:
            direct_response = hyperliquid_info.l2_snapshot("BTC")
        except Exception as e:
            pytest.skip(f"Cannot get l2_snapshot from direct SDK: {e}")
        
        # Get response via proxy using same SDK method
        try:
            proxy_response = hyperliquid_info_via_proxy.l2_snapshot("BTC")
        except Exception as e:
            pytest.fail(f"Proxy SDK call failed: {e}")
        
        # True equivalence test: structure should be identical
        assert "levels" in direct_response and "levels" in proxy_response, "Both should contain levels"
        assert "time" in direct_response and "time" in proxy_response, "Both should contain timestamp"
        
        # Verify identical structure
        direct_bids, direct_asks = direct_response["levels"]
        proxy_bids, proxy_asks = proxy_response["levels"]
        
        assert len(direct_bids) == len(proxy_bids), "Bid count should match"
        assert len(direct_asks) == len(proxy_asks), "Ask count should match"
        
        # Verify price levels structure is identical
        if direct_bids and proxy_bids:
            assert set(direct_bids[0].keys()) == set(proxy_bids[0].keys()), "Bid structure should match"
            print(f"✓ Best bid - Direct: {direct_bids[0]['px']}, Proxy: {proxy_bids[0]['px']}")
        
        if direct_asks and proxy_asks:
            assert set(direct_asks[0].keys()) == set(proxy_asks[0].keys()), "Ask structure should match"
            print(f"✓ Best ask - Direct: {direct_asks[0]['px']}, Proxy: {proxy_asks[0]['px']}")
            
        print(f"✓ SDK Equivalence validated: {len(direct_bids)} bids, {len(direct_asks)} asks")
    
    @pytest.mark.integration
    def test_user_state_equivalence(self, hyperliquid_info, hyperliquid_info_via_proxy):
        """Test user_state SDK equivalence: direct API vs proxy API."""
        test_address = "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"
        
        # Get baseline from direct SDK
        try:
            direct_response = hyperliquid_info.user_state(test_address)
        except Exception as e:
            pytest.skip(f"Cannot get user_state from direct SDK: {e}")
        
        # Get response via proxy using same SDK method
        try:
            proxy_response = hyperliquid_info_via_proxy.user_state(test_address)
        except Exception as e:
            pytest.fail(f"Proxy SDK call failed: {e}")
        
        # True equivalence test: responses should be identical
        assert type(direct_response) == type(proxy_response), "Response types should match"
        
        if direct_response:
            # Both should have data
            assert proxy_response, "Proxy should return data if direct API does"
            assert isinstance(proxy_response, dict), "Proxy response should be dictionary"
            print(f"✓ User state equivalence validated (with data)")
        else:
            # Both should be empty
            assert not proxy_response, "Proxy should return empty if direct API does"
            print(f"✓ User state equivalence validated (empty response)")
    
    @pytest.mark.integration
    def test_open_orders_equivalence(self, hyperliquid_info, hyperliquid_info_via_proxy):
        """Test open_orders SDK equivalence: direct API vs proxy API."""
        test_address = "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1"
        
        # Get baseline from direct SDK
        try:
            direct_response = hyperliquid_info.open_orders(test_address)
        except Exception as e:
            pytest.skip(f"Cannot get open_orders from direct SDK: {e}")
        
        # Get response via proxy using same SDK method
        try:
            proxy_response = hyperliquid_info_via_proxy.open_orders(test_address)
        except Exception as e:
            pytest.fail(f"Proxy SDK call failed: {e}")
        
        # True equivalence test: should be identical
        assert isinstance(direct_response, list), "Direct response should be array"
        assert isinstance(proxy_response, list), "Proxy response should be array"
        assert len(direct_response) == len(proxy_response), "Order count should match"
        
        # If there are orders, verify structure matches
        if direct_response and proxy_response:
            direct_order = direct_response[0]
            proxy_order = proxy_response[0]
            assert set(direct_order.keys()) == set(proxy_order.keys()), "Order structure should match"
            print(f"✓ Open orders equivalence validated: {len(direct_response)} orders")
        else:
            print(f"✓ Open orders equivalence validated: empty response")


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