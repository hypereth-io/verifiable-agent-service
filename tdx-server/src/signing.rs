use serde_json::Value;
use secp256k1::SecretKey;
use tracing::{info, error};
use ethers::{
    signers::{LocalWallet, Signer},
    types::Signature,
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

pub fn sign_exchange_request(
    action: &Value,
    nonce: u64,
    private_key: &SecretKey,
    vault_address: Option<&str>,
) -> Result<ExchangeSignature, Box<dyn std::error::Error + Send + Sync>> {
    info!("Signing exchange request with nonce: {}", nonce);
    
    // Convert secp256k1::SecretKey to ethers::LocalWallet
    let private_key_bytes = private_key.secret_bytes();
    let wallet = LocalWallet::from_bytes(&private_key_bytes)?;
    
    info!("Wallet address: {:?}", wallet.address());
    
    // For now, let's implement a simplified version using ethers directly
    // We'll create a message hash similar to how Hyperliquid does it
    
    // Create a deterministic message from action + nonce for signing
    let message = format!("{}:{}", serde_json::to_string(action)?, nonce);
    let message_hash = ethers::utils::keccak256(message.as_bytes());
    
    // Sign the hash
    let signature = wallet.sign_hash(message_hash.into())?;
    
    let result = ExchangeSignature::from_ethers_signature(signature);
    
    info!("Generated real signature: r={}, s={}, v={}", result.r, result.s, result.v);
    
    Ok(result)
}

// TODO: Replace with proper Hyperliquid signing scheme
// TODO: Use correct message format and EIP-712 domain
// TODO: Handle vault_address correctly
// TODO: Implement proper Actions parsing from the SDK