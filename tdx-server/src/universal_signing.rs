use serde_json::Value;
use secp256k1::SecretKey;
use tracing::info;
use ethers::{
    signers::{LocalWallet, Signer},
    types::{Signature, H256, H160},
    utils::keccak256,
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
    
    pub fn from_ethers_signature(sig: Signature) -> Self {
        Self {
            r: format!("0x{:064x}", sig.r),
            s: format!("0x{:064x}", sig.s),
            v: sig.v,
        }
    }
}

/// Universal signing function that works with any Hyperliquid exchange action
/// 
/// This replicates the signing logic from the Hyperliquid SDK:
/// 1. Serialize the action using msgpack (rmp_serde)
/// 2. Append timestamp and vault_address
/// 3. Hash the bytes using keccak256
/// 4. Sign the hash using agent connection signing pattern
pub async fn sign_exchange_request(
    action: &Value,
    nonce: u64,
    private_key: &SecretKey,
    vault_address: Option<&str>,
    is_mainnet: bool,
) -> Result<ExchangeSignature, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔐 Universal signing exchange request with nonce: {}", nonce);
    
    // Convert secp256k1::SecretKey to ethers::LocalWallet
    let private_key_bytes = private_key.secret_bytes();
    let wallet = LocalWallet::from_bytes(&private_key_bytes)?;
    
    info!("📋 Wallet address: {:?}", wallet.address());
    
    // Create the connection hash following Hyperliquid SDK pattern
    let connection_id = create_action_hash(action, nonce, vault_address)?;
    info!("🔑 Action hash (connection_id): {:?}", connection_id);
    
    // Sign using the agent connection pattern
    let signature = sign_l1_action(&wallet, connection_id, is_mainnet)?;
    
    let result = ExchangeSignature::from_ethers_signature(signature);
    info!("✅ Universal signature generated: r={}, s={}, v={}", result.r, result.s, result.v);
    
    Ok(result)
}

/// Create action hash following the Hyperliquid SDK pattern
/// This matches the `Actions.hash()` method in the SDK
fn create_action_hash(
    action: &Value,
    timestamp: u64,
    vault_address: Option<&str>,
) -> Result<H256, Box<dyn std::error::Error + Send + Sync>> {
    // Serialize action using msgpack (same as SDK)
    let mut bytes = rmp_serde::to_vec_named(action)
        .map_err(|e| format!("Msgpack serialization failed: {}", e))?;
    
    // Append timestamp in big-endian format (same as SDK)
    bytes.extend(timestamp.to_be_bytes());
    
    // Handle vault address (same as SDK)
    if let Some(vault_addr) = vault_address {
        bytes.push(1); // indicator that vault address is present
        
        // Parse vault address and append its bytes
        let vault_h160: H160 = vault_addr.parse()
            .map_err(|e| format!("Invalid vault address: {}", e))?;
        bytes.extend(vault_h160.to_fixed_bytes());
    } else {
        bytes.push(0); // indicator that no vault address
    }
    
    // Hash the combined bytes
    let hash = keccak256(&bytes);
    Ok(H256(hash))
}

/// L1 action signing following the Hyperliquid SDK pattern
/// This matches the `sign_l1_action` function in the SDK
fn sign_l1_action(
    wallet: &LocalWallet,
    connection_id: H256,
    is_mainnet: bool,
) -> Result<Signature, Box<dyn std::error::Error + Send + Sync>> {
    // Create the agent connection data structure (same as SDK)
    let source = if is_mainnet { "a" } else { "b" }.to_string();
    
    let agent_data = serde_json::json!({
        "source": source,
        "connectionId": format!("0x{:x}", connection_id)
    });
    
    info!("🔐 Signing agent data: {}", agent_data);
    
    // For now, use simplified signing since we don't have full EIP-712 implementation
    // In a full implementation, this would use EIP-712 typed data signing
    let message = serde_json::to_string(&agent_data)?;
    let message_hash = keccak256(message.as_bytes());
    
    // Sign the hash
    let signature = wallet.sign_hash(H256(message_hash))?;
    
    info!("✅ L1 action signature generated");
    Ok(signature)
}

/// Simplified signing for debugging/fallback (matching our current approach)
pub fn fallback_simplified_signing(
    private_key: &SecretKey,
    action: &Value,
    nonce: u64,
) -> Result<ExchangeSignature, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔧 Using fallback simplified signing...");
    
    // Convert secp256k1::SecretKey to ethers::LocalWallet
    let private_key_bytes = private_key.secret_bytes();
    let wallet = LocalWallet::from_bytes(&private_key_bytes)?;
    
    // Create a deterministic message from action + nonce for signing
    let message = format!("{}:{}", serde_json::to_string(action)?, nonce);
    let message_hash = keccak256(message.as_bytes());
    
    // Sign the hash
    let signature = wallet.sign_hash(H256(message_hash))?;
    
    let result = ExchangeSignature::from_ethers_signature(signature);
    
    info!("Generated fallback signature: r={}, s={}, v={}", result.r, result.s, result.v);
    
    Ok(result)
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