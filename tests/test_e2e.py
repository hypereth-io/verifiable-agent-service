"""
End-to-end test workflows for TDX Agent Wallet.

This module tests complete user workflows without relying on agent management APIs
that aren't yet implemented.
"""

import pytest
import time
from hyperliquid.utils import sign_l1_action


class TestBasicProxyWorkflow:
    """Test basic proxy functionality end-to-end."""
    
    @pytest.mark.integration
    @pytest.mark.slow
    def test_info_request_workflow(self, tdx_server_client, hyperliquid_client, sample_info_requests):
        """Test complete info request workflow."""
        # Test multiple info requests in sequence
        info_types = ["all_mids", "l2_book_btc"]
        
        for info_type in info_types:
            if info_type not in sample_info_requests:
                continue
                
            # Make request through TDX proxy
            response = tdx_server_client.post("/info", sample_info_requests[info_type])
            
            assert response.status_code == 200, f"Failed to get {info_type}"
            
            data = response.json()
            assert data is not None, f"No data returned for {info_type}"
            
            # Verify response time is reasonable (< 5 seconds)
            assert response.elapsed.total_seconds() < 5, f"Response time too slow for {info_type}"
    
    @pytest.mark.integration
    def test_health_to_info_workflow(self, tdx_server_client):
        """Test workflow from health check to actual API usage."""
        # 1. Check server health
        health_response = tdx_server_client.get("/health")
        assert health_response.status_code == 200
        
        health_data = health_response.json()
        assert health_data["status"] == "healthy"
        
        # 2. Make info request
        info_response = tdx_server_client.post("/info", {"type": "allMids"})
        assert info_response.status_code == 200
        
        # 3. Verify data consistency
        info_data = info_response.json()
        assert isinstance(info_data, dict)
        assert len(info_data) > 0


class TestSignedRequestWorkflow:
    """Test workflows involving signed requests."""
    
    @pytest.mark.integration
    def test_valid_signature_workflow(self, tdx_server_client, test_account):
        """Test workflow with properly signed request."""
        # 1. Create a valid order action
        action = {
            "type": "order",
            "orders": [{
                "a": 0,  # BTC
                "b": True,  # Buy
                "p": "100000.0",  # High price to avoid accidental execution
                "s": "0.001",  # Small size
                "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        # 2. Sign the action
        nonce = int(time.time() * 1000)
        signature = sign_l1_action(
            action,
            nonce,
            test_account["private_key"],
            chain_id=42161  # Arbitrum
        )
        
        # 3. Create full request
        request = {
            "action": action,
            "nonce": nonce,
            "signature": signature
        }
        
        # 4. Send to TDX server
        response = tdx_server_client.post("/exchange", request)
        
        # 5. Verify response (should not fail due to signature issues)
        assert response.status_code != 401, "Valid signature should not cause auth failure"
        assert response.status_code != 400 or "signature" not in response.text.lower(), \
            "Valid signature should not cause signature error"
        
        # Note: May still fail due to insufficient funds, market conditions, etc.
        # But signature should be accepted
    
    @pytest.mark.integration
    def test_signature_error_workflow(self, tdx_server_client):
        """Test workflow with invalid signature."""
        # 1. Create action
        action = {
            "type": "order",
            "orders": [{
                "a": 0, "b": True, "p": "45000.0", "s": "0.01", "r": False,
                "t": {"limit": {"tif": "Gtc"}}
            }]
        }
        
        # 2. Create invalid signature
        invalid_signature = {
            "r": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "s": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
            "v": 27
        }
        
        # 3. Create request
        request = {
            "action": action,
            "nonce": int(time.time() * 1000),
            "signature": invalid_signature
        }
        
        # 4. Send request
        response = tdx_server_client.post("/exchange", request)
        
        # 5. Should be rejected
        assert response.status_code >= 400, "Invalid signature should be rejected"


class TestErrorRecoveryWorkflows:
    """Test error handling and recovery workflows."""
    
    @pytest.mark.integration
    def test_network_error_recovery(self, tdx_server_client):
        """Test behavior when upstream API is unreachable."""
        # This test verifies graceful handling when Hyperliquid API is down
        # We can't easily simulate this, so we test with various request types
        
        requests_to_test = [
            {"type": "allMids"},
            {"type": "l2Book", "coin": "BTC"},
        ]
        
        for request in requests_to_test:
            response = tdx_server_client.post("/info", request)
            
            # Should either succeed or fail gracefully
            if response.status_code != 200:
                # If it fails, should be a proper HTTP error, not a crash
                assert 400 <= response.status_code < 600, "Should be proper HTTP error"
                
                # Response should still be valid JSON if possible
                try:
                    error_data = response.json()
                    assert "error" in error_data or "message" in error_data
                except:
                    # Plain text error is also acceptable
                    assert len(response.text) > 0, "Error response should not be empty"
    
    @pytest.mark.integration
    def test_malformed_request_recovery(self, tdx_server_client):
        """Test recovery from malformed requests."""
        malformed_requests = [
            {},  # Empty
            {"invalid": "field"},  # Wrong fields
            {"type": ""},  # Empty type
            {"type": "invalidType"},  # Invalid type
        ]
        
        for malformed in malformed_requests:
            response = tdx_server_client.post("/info", malformed)
            
            # Should handle gracefully
            assert 400 <= response.status_code < 500, "Malformed request should return 4xx"
            
            # Server should still be responsive after error
            health_response = tdx_server_client.get("/health")
            assert health_response.status_code == 200, "Server should remain healthy after error"
    
    @pytest.mark.integration
    def test_timeout_handling(self, tdx_server_client):
        """Test timeout handling for slow requests."""
        # Test with a request that might be slow
        response = tdx_server_client.post("/info", {"type": "allMids"})
        
        # Should complete within reasonable time (handled by conftest timeout)
        assert response.status_code in [200, 500, 502, 503, 504], \
            "Should complete or timeout gracefully"


class TestConcurrentRequestWorkflows:
    """Test concurrent request handling."""
    
    @pytest.mark.integration
    @pytest.mark.slow
    def test_concurrent_info_requests(self, tdx_server_client):
        """Test handling of concurrent info requests."""
        import threading
        import queue
        
        results = queue.Queue()
        
        def make_request():
            try:
                response = tdx_server_client.post("/info", {"type": "allMids"})
                results.put(("success", response.status_code))
            except Exception as e:
                results.put(("error", str(e)))
        
        # Start multiple concurrent requests
        threads = []
        for _ in range(3):  # Conservative number for testing
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()
        
        # Wait for all to complete
        for thread in threads:
            thread.join(timeout=10)  # 10 second timeout per thread
        
        # Check results
        success_count = 0
        while not results.empty():
            result_type, result_value = results.get()
            if result_type == "success" and result_value == 200:
                success_count += 1
        
        # At least some should succeed
        assert success_count > 0, "At least some concurrent requests should succeed"
    
    @pytest.mark.integration
    def test_mixed_request_types(self, tdx_server_client):
        """Test mixing different types of requests."""
        # 1. Health check
        health_response = tdx_server_client.get("/health")
        assert health_response.status_code == 200
        
        # 2. Info request
        info_response = tdx_server_client.post("/info", {"type": "allMids"})
        assert info_response.status_code == 200
        
        # 3. Another health check
        health_response2 = tdx_server_client.get("/health")
        assert health_response2.status_code == 200
        
        # 4. Different info request
        book_response = tdx_server_client.post("/info", {"type": "l2Book", "coin": "BTC"})
        assert book_response.status_code == 200
        
        # All should work without interfering with each other


class TestDataConsistencyWorkflows:
    """Test data consistency across requests."""
    
    @pytest.mark.integration
    def test_repeated_request_consistency(self, tdx_server_client):
        """Test that repeated requests return consistent data."""
        request = {"type": "allMids"}
        
        # Make same request multiple times
        responses = []
        for _ in range(3):
            response = tdx_server_client.post("/info", request)
            if response.status_code == 200:
                responses.append(response.json())
            time.sleep(0.1)  # Small delay between requests
        
        if len(responses) < 2:
            pytest.skip("Need at least 2 successful responses for consistency test")
        
        # Data structure should be consistent
        first_response = responses[0]
        for response in responses[1:]:
            # Should have same keys (though values may differ slightly due to market movement)
            assert set(first_response.keys()) == set(response.keys()), \
                "Response structure should be consistent"
            
            # Common coins should exist in all responses
            common_coins = ["BTC", "ETH"]
            for coin in common_coins:
                if coin in first_response:
                    assert coin in response, f"Coin {coin} should be in all responses"
    
    @pytest.mark.integration
    def test_request_response_correlation(self, tdx_server_client):
        """Test that responses correspond to requests."""
        test_cases = [
            ({"type": "allMids"}, "should return price dictionary"),
            ({"type": "l2Book", "coin": "BTC"}, "should return order book"),
        ]
        
        for request, expected in test_cases:
            response = tdx_server_client.post("/info", request)
            
            if response.status_code != 200:
                continue
                
            data = response.json()
            
            if request["type"] == "allMids":
                assert isinstance(data, dict), "allMids should return dictionary"
                assert len(data) > 0, "allMids should contain price data"
                
            elif request["type"] == "l2Book":
                assert isinstance(data, dict), "l2Book should return dictionary"
                assert "levels" in data, "l2Book should contain levels"
                assert "time" in data, "l2Book should contain timestamp"


class TestPerformanceWorkflows:
    """Test performance-related workflows."""
    
    @pytest.mark.integration
    @pytest.mark.slow
    def test_response_time_consistency(self, tdx_server_client):
        """Test that response times are reasonably consistent."""
        request = {"type": "allMids"}
        response_times = []
        
        # Make multiple requests and measure response time
        for _ in range(5):
            start_time = time.time()
            response = tdx_server_client.post("/info", request)
            end_time = time.time()
            
            if response.status_code == 200:
                response_times.append(end_time - start_time)
            
            time.sleep(0.1)  # Small delay between requests
        
        if len(response_times) < 3:
            pytest.skip("Need at least 3 successful responses for timing test")
        
        # Calculate statistics
        avg_time = sum(response_times) / len(response_times)
        max_time = max(response_times)
        min_time = min(response_times)
        
        # Response times should be reasonable
        assert avg_time < 2.0, f"Average response time {avg_time:.2f}s too slow"
        assert max_time < 5.0, f"Max response time {max_time:.2f}s too slow"
        
        # Shouldn't vary too wildly (unless there are network issues)
        if len(response_times) >= 3:
            time_variance = max_time - min_time
            assert time_variance < 3.0, f"Response time variance {time_variance:.2f}s too high"