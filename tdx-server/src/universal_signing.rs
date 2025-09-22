use serde_json::Value;
use secp256k1::SecretKey;
use tracing::info;
use alloy::{
    signers::{local::PrivateKeySigner, Signer},
    primitives::{Address, B256, keccak256},
};
use hyperliquid_rust_sdk::{
    ExchangeClient, BaseUrl, 
    ClientOrderRequest, ClientCancelRequest, ClientOrder, ClientLimit,
    ExchangeResponseStatus, ExchangeDataStatus,
};

#[derive(Debug)]
pub struct ExchangeSignature {
    pub r: String,
    pub s: String, 
    pub v: u64,
}

impl ExchangeSignature {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "r": self.r,
            "s": self.s,
            "v": self.v
        })
    }
    
    pub fn from_alloy_signature(sig: alloy::primitives::Signature) -> Self {
        Self {
            r: format!("0x{:064x}", sig.r()),
            s: format!("0x{:064x}", sig.s()),
            v: if sig.v() { 28 } else { 27 }, // v is just a boolean in alloy
        }
    }
}

/// Handle request completely with SDK (like TypeScript @nktkas/hyperliquid)
/// 
/// This approach:
/// 1. Creates ExchangeClient with correct alloy wallet  
/// 2. Uses SDK methods to handle request completely
/// 3. Returns proper SDK response (no API forwarding needed)
pub async fn handle_with_sdk_complete(
    action: &Value,
    nonce: u64,
    private_key: &SecretKey,
    vault_address: Option<&str>,
    is_mainnet: bool,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔐 Using alloy-compatible SDK signing");
    
    // Convert secp256k1::SecretKey to alloy::PrivateKeySigner
    let private_key_hex = hex::encode(private_key.secret_bytes());
    let wallet: PrivateKeySigner = private_key_hex.parse()
        .map_err(|e| format!("Failed to create alloy wallet: {:?}", e))?;
    
    info!("📋 Alloy wallet address: {:?}", wallet.address());
    
    // Parse vault address if provided (using alloy Address)
    let vault_address_alloy = if let Some(vault_str) = vault_address {
        Some(vault_str.parse::<Address>()?)
    } else {
        None
    };
    
    // Create ExchangeClient with alloy wallet (this should work now)
    let base_url = if is_mainnet { BaseUrl::Mainnet } else { BaseUrl::Testnet };
    let exchange_client = ExchangeClient::new(
        None,                    // No http client override
        wallet,                 // Alloy wallet 
        Some(base_url),         // Network
        None,                   // No meta override
        vault_address_alloy,    // Vault address (alloy)
    ).await?;
    
    info!("📋 ExchangeClient created with alloy wallet");
    
    // Let the SDK handle the action completely by using its methods
    let action_type = action.get("type")
        .and_then(|t| t.as_str())
        .ok_or("Missing action type")?;
    
    info!("🔄 Action type: {}, using SDK methods directly", action_type);
    
    // Use SDK methods directly to get proper signed responses
    let response = match action_type {
        "order" => {
            // Convert to SDK client orders and use SDK method
            let client_orders = convert_json_to_client_orders(action)?;
            exchange_client.bulk_order(client_orders, None).await?
        }
        "cancel" => {
            // Convert to SDK client cancels and use SDK method  
            let client_cancels = convert_json_to_client_cancels(action)?;
            exchange_client.bulk_cancel(client_cancels, None).await?
        }
        _ => {
            return Err(format!("Unsupported action type: {}", action_type).into());
        }
    };
    
    info!("✅ SDK method completed successfully");
    
    // Convert ExchangeResponseStatus to proper JSON response
    let json_response = match response {
        ExchangeResponseStatus::Ok(exchange_response) => {
            info!("🎉 SDK request successful");
            
            // Build response matching Hyperliquid API format
            if let Some(data) = exchange_response.data {
                let mut statuses = Vec::new();
                
                for status in data.statuses {
                    match status {
                        ExchangeDataStatus::Resting(order) => {
                            statuses.push(serde_json::json!({
                                "resting": {"oid": order.oid}
                            }));
                        }
                        ExchangeDataStatus::Filled(order) => {
                            statuses.push(serde_json::json!({
                                "filled": {
                                    "totalSz": order.total_sz,
                                    "avgPx": order.avg_px, 
                                    "oid": order.oid
                                }
                            }));
                        }
                        ExchangeDataStatus::Error(error_msg) => {
                            statuses.push(serde_json::json!({
                                "error": error_msg
                            }));
                        }
                        _ => {
                            statuses.push(serde_json::json!({
                                "status": format!("{:?}", status)
                            }));
                        }
                    }
                }
                
                serde_json::json!({
                    "status": "ok",
                    "response": {
                        "type": action_type,
                        "data": {
                            "statuses": statuses
                        }
                    }
                })
            } else {
                serde_json::json!({
                    "status": "ok",
                    "response": {
                        "type": action_type,
                        "data": {"statuses": []}
                    }
                })
            }
        }
        ExchangeResponseStatus::Err(error_msg) => {
            info!("❌ SDK request error: {}", error_msg);
            serde_json::json!({
                "status": "err",
                "response": error_msg
            })
        }
    };
    
    Ok(json_response)
}

/// Convert JSON orders to SDK ClientOrderRequest
fn convert_json_to_client_orders(action: &Value) -> Result<Vec<ClientOrderRequest>, Box<dyn std::error::Error + Send + Sync>> {
    let orders = action.get("orders")
        .and_then(|o| o.as_array())
        .ok_or("Missing orders array")?;
    
    let mut client_orders = Vec::new();
    for order in orders {
        let asset_index = order.get("a")
            .and_then(|a| a.as_u64())
            .unwrap_or(0);
        
        // Convert asset index to symbol (simplified mapping)
        let asset = match asset_index {
            0 => "BTC",
            1 => "ETH", 
            _ => "BTC", // Default fallback
        }.to_string();
        
        let is_buy = order.get("b")
            .and_then(|b| b.as_bool())
            .unwrap_or(true);
            
        let limit_px: f64 = order.get("p")
            .and_then(|p| p.as_str())
            .and_then(|s| s.parse().ok())
            .unwrap_or(50000.0);
            
        let sz: f64 = order.get("s")
            .and_then(|s| s.as_str())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.001);
            
        let reduce_only = order.get("r")
            .and_then(|r| r.as_bool())
            .unwrap_or(false);
        
        let client_order = ClientOrderRequest {
            asset,
            is_buy,
            reduce_only,
            limit_px,
            sz,
            cloid: None,
            order_type: ClientOrder::Limit(ClientLimit {
                tif: "Gtc".to_string(),
            }),
        };
        
        client_orders.push(client_order);
    }
    
    Ok(client_orders)
}

/// Convert JSON cancels to SDK ClientCancelRequest  
fn convert_json_to_client_cancels(action: &Value) -> Result<Vec<ClientCancelRequest>, Box<dyn std::error::Error + Send + Sync>> {
    let cancels = action.get("cancels")
        .and_then(|c| c.as_array())
        .ok_or("Missing cancels array")?;
    
    let mut client_cancels = Vec::new();
    for cancel in cancels {
        let asset_index = cancel.get("a")
            .and_then(|a| a.as_u64())
            .unwrap_or(0);
            
        // Convert asset index to symbol (simplified mapping)
        let asset = match asset_index {
            0 => "BTC",
            1 => "ETH",
            _ => "BTC", // Default fallback  
        }.to_string();
        
        let oid = cancel.get("o")
            .and_then(|o| o.as_u64())
            .unwrap_or(0);
        
        let client_cancel = ClientCancelRequest {
            asset,
            oid,
        };
        
        client_cancels.push(client_cancel);
    }
    
    Ok(client_cancels)
}

/// Generic action hash creation (works for all action types)
/// This follows the same pattern as SDK but without action-specific conversions
fn create_generic_action_hash(
    action: &Value,
    timestamp: u64,
    vault_address: Option<&str>,
) -> Result<B256, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔄 Creating generic action hash for any action type");
    
    // Serialize action using msgpack (same as SDK)
    let mut bytes = rmp_serde::to_vec_named(action)
        .map_err(|e| format!("Msgpack serialization failed: {}", e))?;
    
    // Append timestamp in big-endian format (same as SDK)
    bytes.extend(timestamp.to_be_bytes());
    
    // Handle vault address (same as SDK)
    if let Some(vault_addr) = vault_address {
        bytes.push(1); // indicator that vault address is present
        
        // Parse vault address and append its bytes (using alloy Address)
        let vault_address: Address = vault_addr.parse()
            .map_err(|e| format!("Invalid vault address: {}", e))?;
        bytes.extend(vault_address.as_slice());
    } else {
        bytes.push(0); // indicator that no vault address
    }
    
    // Hash the combined bytes (using alloy keccak256)
    let hash = keccak256(&bytes);
    info!("🔑 Generic hash created: {:?}", hash);
    Ok(hash)
}



#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn get_test_private_key() -> SecretKey {
        let key_bytes = hex::decode("e908f86dbb4d55ac876378565aafeabc187f6690f046459397b17d9b9a19688e").unwrap();
        SecretKey::from_slice(&key_bytes).unwrap()
    }

    #[tokio::test]
    async fn test_universal_signing_order() {
        let private_key = get_test_private_key();
        
        let action = json!({
            "type": "order",
            "orders": [{
                "a": 0,
                "b": true,
                "p": "43250.0",
                "s": "0.1",
                "r": false,
                "t": {
                    "limit": {
                        "tif": "Gtc"
                    }
                }
            }],
            "grouping": "na"
        });
        
        let nonce = 1681923833000u64;
        
        let result = sign_exchange_request(&action, nonce, &private_key, None, true).await;
        assert!(result.is_ok());
        
        let signature = result.unwrap();
        assert!(signature.r.starts_with("0x"));
        assert!(signature.s.starts_with("0x"));
        assert!(signature.v == 27 || signature.v == 28);
    }

    #[tokio::test]
    async fn test_universal_signing_cancel() {
        let private_key = get_test_private_key();
        
        let action = json!({
            "type": "cancel",
            "cancels": [{
                "a": 0,
                "o": 123456789
            }]
        });
        
        let nonce = 1681923834000u64;
        
        let result = sign_exchange_request(&action, nonce, &private_key, None, true).await;
        assert!(result.is_ok());
        
        let signature = result.unwrap();
        assert!(signature.r.starts_with("0x"));
        assert!(signature.s.starts_with("0x"));
        assert!(signature.v == 27 || signature.v == 28);
    }

    #[test]
    fn test_action_hash_creation() {
        let action = json!({
            "type": "order",
            "orders": [{
                "a": 0,
                "b": true,
                "p": "43250.0",
                "s": "0.1",
                "r": false
            }]
        });
        
        let result = create_action_hash(&action, 1681923833000u64, None);
        assert!(result.is_ok());
        
        let hash = result.unwrap();
        assert_ne!(hash, H256::zero());
    }

    #[test]
    fn test_action_hash_with_vault() {
        let action = json!({
            "type": "order",
            "orders": [{"a": 0, "b": true, "p": "43250.0", "s": "0.1", "r": false}]
        });
        
        let vault_address = "0x1234567890123456789012345678901234567890";
        let result = create_action_hash(&action, 1681923833000u64, Some(vault_address));
        assert!(result.is_ok());
        
        let hash_with_vault = result.unwrap();
        
        // Hash without vault should be different
        let result_no_vault = create_action_hash(&action, 1681923833000u64, None);
        let hash_no_vault = result_no_vault.unwrap();
        
        assert_ne!(hash_with_vault, hash_no_vault);
    }
}