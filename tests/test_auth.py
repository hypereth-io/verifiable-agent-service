"""
Test API key authentication functionality.

This module tests that the TDX server correctly validates API keys
for /exchange endpoints while leaving /info endpoints unauthenticated.
"""

import pytest


class TestAPIKeyAuthentication:
    """Test API key authentication for exchange endpoints."""
    
    @pytest.mark.integration
    def test_info_endpoint_no_auth_required(self, tdx_server_client):
        """Test that /info endpoints don't require authentication."""
        # Remove API key from client
        original_key = tdx_server_client.api_key
        tdx_server_client.api_key = ""
        
        try:
            # Info request should work without API key
            response = tdx_server_client.post("/info", {"type": "allMids"})
            assert response.status_code == 200, "/info should work without API key"
            print("✓ /info endpoint works without authentication")
        finally:
            # Restore original key
            tdx_server_client.api_key = original_key
    
    @pytest.mark.integration  
    def test_exchange_requires_api_key(self, tdx_server_client):
        """Test that /exchange endpoints require API key."""
        # Remove API key from client
        original_key = tdx_server_client.api_key
        tdx_server_client.api_key = ""
        
        try:
            # Exchange request should fail without API key
            response = tdx_server_client.post("/exchange", {"test": "data"})
            assert response.status_code == 401, "/exchange should require API key"
            print("✓ /exchange endpoint requires authentication")
        finally:
            # Restore original key
            tdx_server_client.api_key = original_key
    
    @pytest.mark.integration
    def test_exchange_rejects_wrong_api_key(self, tdx_server_client):
        """Test that /exchange endpoints reject wrong API keys."""
        # Use wrong API key
        original_key = tdx_server_client.api_key
        tdx_server_client.api_key = "wrong-key"
        
        try:
            # Exchange request should fail with wrong key
            response = tdx_server_client.post("/exchange", {"test": "data"})
            assert response.status_code == 401, "/exchange should reject wrong API key"
            print("✓ /exchange endpoint rejects wrong API key")
        finally:
            # Restore original key
            tdx_server_client.api_key = original_key
    
    @pytest.mark.integration
    def test_exchange_accepts_correct_api_key(self, tdx_server_client, config):
        """Test that /exchange endpoints accept correct API key."""
        # Ensure we're using the correct test key
        tdx_server_client.api_key = config.test_api_key  # Should be "test-key"
        
        # Exchange request should not fail due to authentication
        response = tdx_server_client.post("/exchange", {"test": "data"})
        
        # Should NOT be 401 (unauthorized) - may be 501 (not implemented) or other error
        assert response.status_code != 401, "/exchange should accept correct API key"
        print(f"✓ /exchange endpoint accepts correct API key (status: {response.status_code})")
        
        # For now, we expect 501 Not Implemented since exchange logic isn't done
        if response.status_code == 501:
            print("✓ Correct: /exchange returns 501 Not Implemented (expected)")
    
    @pytest.mark.integration
    def test_health_endpoint_no_auth(self, tdx_server_client):
        """Test that /health endpoint doesn't require authentication."""
        # Remove API key
        original_key = tdx_server_client.api_key
        tdx_server_client.api_key = ""
        
        try:
            response = tdx_server_client.get("/health")
            assert response.status_code == 200, "/health should work without API key"
            
            health_data = response.json()
            assert health_data["status"] == "healthy"
            print("✓ /health endpoint works without authentication")
        finally:
            # Restore original key
            tdx_server_client.api_key = original_key


class TestAPIKeyHeader:
    """Test API key header handling."""
    
    @pytest.mark.unit
    def test_missing_header(self, tdx_server_client):
        """Test behavior when X-API-Key header is missing."""
        # Make request without any headers
        import requests
        response = requests.post("http://localhost:8080/exchange", json={"test": "data"})
        
        assert response.status_code == 401, "Missing header should return 401"
        print("✓ Missing X-API-Key header properly rejected")
    
    @pytest.mark.unit  
    def test_empty_header(self, tdx_server_client):
        """Test behavior when X-API-Key header is empty."""
        import requests
        headers = {"X-API-Key": ""}
        response = requests.post("http://localhost:8080/exchange", json={"test": "data"}, headers=headers)
        
        assert response.status_code == 401, "Empty header should return 401"
        print("✓ Empty X-API-Key header properly rejected")
    


class TestAuthenticationFlow:
    """Test complete authentication workflows."""
    
    @pytest.mark.integration
    def test_auth_required_only_for_exchange(self, tdx_server_client):
        """Test that only /exchange endpoints require authentication."""
        # Test multiple endpoints without API key
        original_key = tdx_server_client.api_key
        tdx_server_client.api_key = ""
        
        try:
            # These should work without auth
            endpoints_no_auth = [
                ("/health", "GET", None),
                ("/info", "POST", {"type": "allMids"}),
            ]
            
            for endpoint, method, payload in endpoints_no_auth:
                if method == "GET":
                    response = tdx_server_client.get(endpoint)
                else:
                    response = tdx_server_client.post(endpoint, payload)
                
                assert response.status_code == 200, f"{endpoint} should work without auth"
                print(f"✓ {endpoint} works without authentication")
            
            # This should require auth
            response = tdx_server_client.post("/exchange", {"test": "data"})
            assert response.status_code == 401, "/exchange should require auth"
            print("✓ /exchange requires authentication")
            
        finally:
            # Restore original key
            tdx_server_client.api_key = original_key
    
    @pytest.mark.integration
    def test_auth_preserves_functionality(self, tdx_server_client):
        """Test that authentication doesn't break existing functionality."""
        # Ensure we have correct API key
        assert tdx_server_client.api_key == "test-key", "Should be using test-key"
        
        # Test that /info still works with API key present
        response = tdx_server_client.post("/info", {"type": "allMids"})
        assert response.status_code == 200, "/info should work with API key present"
        
        # Test that /exchange works with correct key (should be 501, not 401)
        response = tdx_server_client.post("/exchange", {"test": "data"})
        assert response.status_code != 401, "/exchange should not be unauthorized with correct key"
        
        print("✓ Authentication doesn't interfere with existing endpoints")