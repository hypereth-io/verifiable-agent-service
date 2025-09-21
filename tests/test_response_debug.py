"""
Test to examine actual exchange response data and verify order operations.
"""

import pytest
import time
import json


class TestExchangeResponseData:
    """Test exchange response data to verify order operations."""
    
    @pytest.mark.integration
    def test_exchange_response_content(self, tdx_server_client):
        """Examine actual exchange response data."""
        # Create order request
        order_request = {
            "action": {
                "type": "order",
                "orders": [{
                    "a": 0,  # BTC
                    "b": True,  # Buy
                    "p": "200000.0",  # Very high price (unmatchable)
                    "s": "0.001",  # Small size
                    "r": False,  # Not reduce-only
                    "t": {"limit": {"tif": "Gtc"}}  # Good till cancel
                }]
            },
            "nonce": int(time.time() * 1000)
        }
        
        print(f"Testing order request: {json.dumps(order_request, indent=2)}")
        
        # Send request to TDX server
        response = tdx_server_client.post("/exchange", order_request)
        
        print(f"Response Status: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Examine response data
        try:
            response_data = response.json()
            print(f"Response Data: {json.dumps(response_data, indent=2)}")
            
            # Look for indicators of successful order placement
            success_indicators = []
            
            if "status" in response_data:
                status = response_data["status"]
                print(f"✅ Status field: {status}")
                success_indicators.append(f"status={status}")
            
            if "response" in response_data:
                response_field = response_data["response"]
                print(f"✅ Response field: {response_field}")
                success_indicators.append(f"response={response_field}")
                
            # Check for order ID or order-related data
            order_data = self._find_order_data(response_data)
            if order_data:
                print(f"✅ Order data found: {order_data}")
                success_indicators.extend(order_data)
            
            # Check for error indicators
            error_indicators = self._find_error_data(response_data)
            if error_indicators:
                print(f"⚠️ Error indicators: {error_indicators}")
            
            print(f"\n📊 Summary:")
            print(f"Success indicators: {success_indicators}")
            print(f"Error indicators: {error_indicators}")
            
            return response_data
            
        except json.JSONDecodeError:
            print(f"Response is not JSON: {response.text}")
            pytest.fail("Expected JSON response")
    
    def _find_order_data(self, data):
        """Find order-related data in response."""
        order_indicators = []
        
        if isinstance(data, dict):
            for key, value in data.items():
                key_lower = str(key).lower()
                if any(term in key_lower for term in ["oid", "order", "id"]):
                    order_indicators.append(f"{key}={value}")
                    
                # Recursively check nested objects
                if isinstance(value, (dict, list)):
                    nested = self._find_order_data(value)
                    order_indicators.extend(nested)
                    
        elif isinstance(data, list):
            for item in data:
                nested = self._find_order_data(item)
                order_indicators.extend(nested)
        
        return order_indicators
    
    def _find_error_data(self, data):
        """Find error-related data in response."""
        error_indicators = []
        
        if isinstance(data, dict):
            for key, value in data.items():
                key_lower = str(key).lower()
                value_str = str(value).lower()
                
                if any(term in key_lower for term in ["error", "fail", "reject"]):
                    error_indicators.append(f"{key}={value}")
                elif any(term in value_str for term in ["error", "fail", "reject", "insufficient"]):
                    error_indicators.append(f"{key}={value}")
                    
                # Recursively check nested objects
                if isinstance(value, (dict, list)):
                    nested = self._find_error_data(value)
                    error_indicators.extend(nested)
                    
        elif isinstance(data, list):
            for item in data:
                nested = self._find_error_data(item)
                error_indicators.extend(nested)
        
        return error_indicators
    
    @pytest.mark.integration
    def test_order_cancellation_response(self, tdx_server_client):
        """Test order cancellation response data."""
        # Try to cancel a non-existent order (safe operation)
        cancel_request = {
            "action": {
                "type": "cancel",
                "cancels": [{
                    "a": 0,  # BTC asset
                    "o": 999999999999  # Non-existent order ID
                }]
            },
            "nonce": int(time.time() * 1000)
        }
        
        print(f"Testing cancel request: {json.dumps(cancel_request, indent=2)}")
        
        response = tdx_server_client.post("/exchange", cancel_request)
        
        print(f"Cancel Response Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                response_data = response.json()
                print(f"Cancel Response Data: {json.dumps(response_data, indent=2)}")
                
                # Analyze cancellation response
                if "status" in response_data:
                    print(f"✅ Cancel status: {response_data['status']}")
                
                return response_data
                
            except json.JSONDecodeError:
                print(f"Cancel response is not JSON: {response.text}")
        else:
            print(f"Cancel failed: {response.text}")
    
    @pytest.mark.integration
    def test_invalid_order_response(self, tdx_server_client):
        """Test response to invalid order to understand error format."""
        # Send clearly invalid order
        invalid_request = {
            "action": {
                "type": "order",
                "orders": [{
                    "a": 0,
                    "b": True,
                    "p": "-1000.0",  # Negative price (invalid)
                    "s": "0.001",
                    "r": False,
                    "t": {"limit": {"tif": "Gtc"}}
                }]
            },
            "nonce": int(time.time() * 1000)
        }
        
        print(f"Testing invalid order: {json.dumps(invalid_request, indent=2)}")
        
        response = tdx_server_client.post("/exchange", invalid_request)
        
        print(f"Invalid Order Response Status: {response.status_code}")
        
        try:
            response_data = response.json()
            print(f"Invalid Order Response: {json.dumps(response_data, indent=2)}")
            
            # This helps us understand Hyperliquid's error response format
            error_info = self._find_error_data(response_data)
            if error_info:
                print(f"⚠️ Error details: {error_info}")
            
        except json.JSONDecodeError:
            print(f"Invalid order response (non-JSON): {response.text}")
        
        # Invalid orders should either be rejected (400) or processed with error message (200)
        assert response.status_code in [200, 400], f"Unexpected status for invalid order: {response.status_code}"