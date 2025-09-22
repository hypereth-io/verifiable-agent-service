use serde_json::Value;
use secp256k1::SecretKey;
use tracing::{info, error};
use ethers::{
    signers::{LocalWallet, Signer},
    types::Signature,
};
use hyperliquid_rust_sdk::{ExchangeClient, BaseUrl};
use alloy::signers::local::PrivateKeySigner;

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

pub async fn sign_exchange_request(
    action: &Value,
    nonce: u64,
    private_key: &SecretKey,
    vault_address: Option<&str>,
) -> Result<ExchangeSignature, Box<dyn std::error::Error + Send + Sync>> {
    info!("Signing exchange request with nonce: {}", nonce);
    
    // Convert secp256k1::SecretKey to ethers::LocalWallet for fallback
    let private_key_bytes = private_key.secret_bytes();
    let wallet = LocalWallet::from_bytes(&private_key_bytes)?;
    
    info!("Wallet address: {:?}", wallet.address());
    
    // Try Hyperliquid SDK signing first
    match try_hyperliquid_sdk_signing(private_key, action, nonce, vault_address).await {
        Ok(signature) => {
            info!("✅ SDK signing successful");
            Ok(signature)
        }
        Err(e) => {
            error!("SDK signing failed: {:?}, falling back to simplified", e);
            fallback_simplified_signing(&wallet, action, nonce)
        }
    }
}

async fn try_hyperliquid_sdk_signing(
    private_key: &SecretKey,
    action: &Value,
    nonce: u64,
    vault_address: Option<&str>,
) -> Result<ExchangeSignature, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔐 Attempting Hyperliquid SDK signing...");
    
    // Convert secp256k1::SecretKey to alloy PrivateKeySigner (latest SDK supports alloy)
    let private_key_hex = hex::encode(private_key.secret_bytes());
    let wallet: PrivateKeySigner = private_key_hex.parse()?;
    
    info!("📋 Created alloy wallet for SDK: {:?}", wallet.address());
    
    // Create ExchangeClient with alloy wallet (latest SDK)
    let exchange_client = ExchangeClient::new(
        None,                    // No http client override
        wallet,                 // Our agent wallet (alloy)
        Some(BaseUrl::Mainnet), // Mainnet
        None,                   // No vault address for now
        None,                   // No meta override
    ).await?;
    
    info!("📋 ExchangeClient created successfully with latest SDK");
    
    // TODO: Extract signing logic from ExchangeClient
    // The SDK methods include full request flow, we need just the signing part
    
    Err("SDK signing extraction not yet implemented".into())
}

fn fallback_simplified_signing(
    wallet: &LocalWallet,
    action: &Value,
    nonce: u64,
) -> Result<ExchangeSignature, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔧 Using fallback simplified signing...");
    
    // Create a deterministic message from action + nonce for signing
    let message = format!("{}:{}", serde_json::to_string(action)?, nonce);
    let message_hash = ethers::utils::keccak256(message.as_bytes());
    
    // Sign the hash
    let signature = wallet.sign_hash(message_hash.into())?;
    
    let result = ExchangeSignature::from_ethers_signature(signature);
    
    info!("Generated fallback signature: r={}, s={}, v={}", result.r, result.s, result.v);
    
    Ok(result)
}

// TODO: Replace with proper Hyperliquid signing scheme
// TODO: Use correct message format and EIP-712 domain
// TODO: Handle vault_address correctly
// TODO: Implement proper Actions parsing from the SDK