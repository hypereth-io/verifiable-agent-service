"""
Test TDX server agent management functionality.

This module tests agent registration, API key management, and TDX attestation endpoints.
"""

import pytest
import time
from typing import Dict, Any


class TestAgentRegistration:
    """Test agent registration functionality."""
    
    @pytest.mark.integration
    def test_register_new_agent(self, tdx_server_client, config):
        """Test registering a new agent."""
        user_id = f"test-user-{int(time.time())}"  # Unique user ID
        
        response = tdx_server_client.post("/register-agent", {"user_id": user_id})
        
        assert response.status_code == 200, f"Registration failed with status {response.status_code}"
        
        data = response.json()
        
        # Verify response structure
        assert "agent_address" in data, "Response should contain agent_address"
        assert "api_key" in data, "Response should contain api_key"
        assert "attestation_report" in data, "Response should contain attestation_report"
        
        # Verify agent address format
        agent_address = data["agent_address"]
        assert isinstance(agent_address, str), "Agent address should be string"
        assert agent_address.startswith("0x"), "Agent address should start with 0x"
        assert len(agent_address) == 42, "Agent address should be 42 characters"
        
        # Verify API key format
        api_key = data["api_key"]
        assert isinstance(api_key, str), "API key should be string"
        assert len(api_key) >= 16, "API key should be sufficiently long"
        
        # Verify attestation report structure
        attestation = data["attestation_report"]
        assert isinstance(attestation, dict), "Attestation should be object"
        assert "quote" in attestation, "Attestation should contain quote"
        assert "mrenclave" in attestation, "Attestation should contain mrenclave"
        assert "mrsigner" in attestation, "Attestation should contain mrsigner"
        assert "timestamp" in attestation, "Attestation should contain timestamp"
        
        return data  # For use in dependent tests
    
    @pytest.mark.integration
    def test_register_duplicate_user(self, tdx_server_client):
        """Test handling of duplicate user registration."""
        user_id = "duplicate-test-user"
        
        # Register first time
        response1 = tdx_server_client.post("/register-agent", {"user_id": user_id})
        
        if response1.status_code != 200:
            pytest.skip("Initial registration failed")
        
        # Try to register same user again
        response2 = tdx_server_client.post("/register-agent", {"user_id": user_id})
        
        # Should either succeed (returning existing agent) or fail with appropriate error
        assert response2.status_code in [200, 409], "Duplicate registration should be handled appropriately"
        
        if response2.status_code == 200:
            # If it succeeds, should return same agent address
            data1 = response1.json()
            data2 = response2.json()
            assert data1["agent_address"] == data2["agent_address"], "Should return same agent for same user"
    
    @pytest.mark.unit
    def test_register_invalid_user_id(self, tdx_server_client):
        """Test registration with invalid user IDs."""
        invalid_user_ids = [
            "",  # Empty string
            None,  # Null
            "a" * 1000,  # Too long
            "user with spaces",  # Spaces
            "user@with#special$chars",  # Special characters
        ]
        
        for invalid_id in invalid_user_ids:
            if invalid_id is None:
                payload = {}
            else:
                payload = {"user_id": invalid_id}
            
            response = tdx_server_client.post("/register-agent", payload)
            assert response.status_code >= 400, f"Invalid user_id '{invalid_id}' should be rejected"
    
    @pytest.mark.unit
    def test_register_missing_user_id(self, tdx_server_client):
        """Test registration without user_id field."""
        response = tdx_server_client.post("/register-agent", {})
        assert response.status_code >= 400, "Missing user_id should be rejected"


class TestAgentLookup:
    """Test agent lookup functionality."""
    
    @pytest.mark.integration
    def test_get_existing_agent(self, tdx_server_client):
        """Test retrieving an existing agent."""
        # First register an agent
        user_id = f"lookup-test-{int(time.time())}"
        reg_response = tdx_server_client.post("/register-agent", {"user_id": user_id})
        
        if reg_response.status_code != 200:
            pytest.skip("Could not register agent for lookup test")
        
        reg_data = reg_response.json()
        
        # Now look up the agent
        response = tdx_server_client.get(f"/agents/{user_id}")
        
        assert response.status_code == 200, f"Agent lookup failed with status {response.status_code}"
        
        data = response.json()
        
        # Verify response structure
        assert "address" in data, "Response should contain address"
        assert "user_id" in data, "Response should contain user_id"
        assert "created_at" in data, "Response should contain created_at"
        
        # Verify data matches registration
        assert data["address"] == reg_data["agent_address"], "Address should match registration"
        assert data["user_id"] == user_id, "User ID should match"
        assert isinstance(data["created_at"], int), "Created timestamp should be integer"
    
    @pytest.mark.unit
    def test_get_nonexistent_agent(self, tdx_server_client):
        """Test retrieving a non-existent agent."""
        nonexistent_user = "definitely-does-not-exist-12345"
        
        response = tdx_server_client.get(f"/agents/{nonexistent_user}")
        assert response.status_code == 404, "Non-existent agent should return 404"
    
    @pytest.mark.unit
    def test_get_agent_invalid_user_id(self, tdx_server_client):
        """Test agent lookup with invalid user IDs."""
        invalid_ids = ["", "a" * 1000, "user with spaces"]
        
        for invalid_id in invalid_ids:
            response = tdx_server_client.get(f"/agents/{invalid_id}")
            # Should either be 404 (not found) or 400 (bad request)
            assert response.status_code in [400, 404], f"Invalid user_id '{invalid_id}' should be rejected"


class TestAttestationEndpoint:
    """Test TDX attestation endpoint."""
    
    @pytest.mark.integration
    def test_get_attestation(self, tdx_server_client):
        """Test retrieving current TDX attestation."""
        response = tdx_server_client.get("/attestation")
        
        assert response.status_code == 200, f"Attestation request failed with status {response.status_code}"
        
        data = response.json()
        
        # Verify attestation structure
        assert isinstance(data, dict), "Attestation should be object"
        assert "quote" in data, "Attestation should contain quote"
        assert "mrenclave" in data, "Attestation should contain mrenclave"
        assert "mrsigner" in data, "Attestation should contain mrsigner"
        assert "timestamp" in data, "Attestation should contain timestamp"
        
        # Verify field types and formats
        assert isinstance(data["quote"], str), "Quote should be string"
        assert isinstance(data["mrenclave"], str), "MRENCLAVE should be string"
        assert isinstance(data["mrsigner"], str), "MRSIGNER should be string"
        assert isinstance(data["timestamp"], int), "Timestamp should be integer"
        
        # Verify timestamp is recent (within last hour)
        current_time = int(time.time())
        assert abs(current_time - data["timestamp"]) < 3600, "Timestamp should be recent"
    
    @pytest.mark.integration
    def test_attestation_consistency(self, tdx_server_client):
        """Test that attestation data is consistent across requests."""
        # Get attestation twice
        response1 = tdx_server_client.get("/attestation")
        response2 = tdx_server_client.get("/attestation")
        
        if response1.status_code != 200 or response2.status_code != 200:
            pytest.skip("Could not get attestation for consistency test")
        
        data1 = response1.json()
        data2 = response2.json()
        
        # MRENCLAVE and MRSIGNER should be consistent
        assert data1["mrenclave"] == data2["mrenclave"], "MRENCLAVE should be consistent"
        assert data1["mrsigner"] == data2["mrsigner"], "MRSIGNER should be consistent"
        
        # Timestamps should be close (within 5 seconds)
        time_diff = abs(data1["timestamp"] - data2["timestamp"])
        assert time_diff <= 5, "Timestamps should be close for rapid requests"


class TestAPIKeyValidation:
    """Test API key validation and authentication."""
    
    @pytest.mark.integration
    def test_valid_api_key_acceptance(self, tdx_server_client, config):
        """Test that valid API keys are accepted."""
        # For now, test with the configured test API key
        # This test will need to be updated when real API key validation is implemented
        
        # Try to access an endpoint that requires API key
        response = tdx_server_client.post("/exchange", {
            "action": {"type": "order", "orders": []},
            "nonce": int(time.time() * 1000)
        })
        
        # Should not fail due to API key (may fail for other reasons like missing signature)
        assert response.status_code != 401, "Valid API key should not result in 401"
        assert response.status_code != 403, "Valid API key should not result in 403"
    
    @pytest.mark.unit
    def test_missing_api_key_rejection(self, tdx_server_client):
        """Test that requests without API keys are rejected."""
        # Create client without API key
        client_no_key = tdx_server_client
        original_key = client_no_key.api_key
        client_no_key.api_key = ""
        
        try:
            response = client_no_key.post("/exchange", {
                "action": {"type": "order", "orders": []},
                "nonce": int(time.time() * 1000)
            })
            
            assert response.status_code in [401, 403], "Missing API key should be rejected"
        finally:
            # Restore original key
            client_no_key.api_key = original_key
    
    @pytest.mark.unit
    def test_invalid_api_key_rejection(self, tdx_server_client):
        """Test that invalid API keys are rejected."""
        # Create client with invalid API key
        client_invalid_key = tdx_server_client
        original_key = client_invalid_key.api_key
        client_invalid_key.api_key = "definitely-invalid-key-12345"
        
        try:
            response = client_invalid_key.post("/exchange", {
                "action": {"type": "order", "orders": []},
                "nonce": int(time.time() * 1000)
            })
            
            assert response.status_code in [401, 403], "Invalid API key should be rejected"
        finally:
            # Restore original key
            client_invalid_key.api_key = original_key


class TestAgentDataIntegrity:
    """Test data integrity and security aspects."""
    
    @pytest.mark.integration
    def test_agent_address_uniqueness(self, tdx_server_client):
        """Test that each agent gets a unique address."""
        addresses = set()
        
        # Register multiple agents
        for i in range(3):
            user_id = f"unique-test-{i}-{int(time.time())}"
            response = tdx_server_client.post("/register-agent", {"user_id": user_id})
            
            if response.status_code == 200:
                data = response.json()
                address = data["agent_address"]
                assert address not in addresses, f"Address {address} is not unique"
                addresses.add(address)
    
    @pytest.mark.integration
    def test_api_key_uniqueness(self, tdx_server_client):
        """Test that each agent gets a unique API key."""
        api_keys = set()
        
        # Register multiple agents
        for i in range(3):
            user_id = f"key-unique-test-{i}-{int(time.time())}"
            response = tdx_server_client.post("/register-agent", {"user_id": user_id})
            
            if response.status_code == 200:
                data = response.json()
                api_key = data["api_key"]
                assert api_key not in api_keys, f"API key {api_key} is not unique"
                api_keys.add(api_key)
    
    @pytest.mark.unit
    def test_no_sensitive_data_in_responses(self, tdx_server_client):
        """Test that sensitive data is not exposed in responses."""
        # Register an agent
        user_id = f"security-test-{int(time.time())}"
        response = tdx_server_client.post("/register-agent", {"user_id": user_id})
        
        if response.status_code != 200:
            pytest.skip("Could not register agent for security test")
        
        data = response.json()
        
        # Private key should never be in response
        response_str = str(data).lower()
        assert "private" not in response_str, "Private key data should not be in response"
        assert "secret" not in response_str, "Secret data should not be in response"
        assert "key" not in response_str.replace("api_key", ""), "Private key should not be exposed"