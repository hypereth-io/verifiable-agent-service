use siwe::{Message, VerificationOpts};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};
use chrono::{Utc, Duration};

/// SIWE login request
#[derive(Debug, Deserialize)]
pub struct SiweLoginRequest {
    pub message: String,
    pub signature: String,
}

/// SIWE login response
#[derive(Debug, Serialize)]
pub struct SiweLoginResponse {
    pub success: bool,
    pub user_address: String,
    pub api_key: String,
    pub agent_address: String,
    pub tdx_quote_hex: String,
    pub message: String,
    pub expires_at: String,
}

/// SIWE login error response
#[derive(Debug, Serialize)]
pub struct SiweLoginError {
    pub success: bool,
    pub error: String,
    pub code: u16,
}

/// Validate SIWE message and signature
pub async fn validate_siwe_signature(
    message: &str, 
    signature: &str
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    info!("🔐 Validating SIWE signature...");
    
    // Parse the SIWE message
    let siwe_message: Message = message.parse()
        .map_err(|e| format!("Invalid SIWE message format: {}", e))?;
    
    info!("📋 SIWE message parsed successfully");
    let address_hex = format!("0x{}", hex::encode(siwe_message.address));
    info!("   Address: {}", address_hex);
    info!("   Domain: {}", siwe_message.domain);
    info!("   URI: {}", siwe_message.uri);
    
    // Verify the signature
    let verification_opts = VerificationOpts {
        domain: Some(siwe_message.domain.clone()),
        nonce: Some(siwe_message.nonce.clone()),
        timestamp: None, // Use default timestamp handling
        ..Default::default()
    };
    
    // Convert signature to the format expected by SIWE
    let signature_bytes = if signature.starts_with("0x") {
        hex::decode(&signature[2..])
            .map_err(|e| format!("Invalid signature hex: {}", e))?
    } else {
        hex::decode(signature)
            .map_err(|e| format!("Invalid signature hex: {}", e))?
    };
    
    // Verify the signature (async call)
    match siwe_message.verify(&signature_bytes, &verification_opts).await {
        Ok(_) => {
            let address_hex = format!("0x{}", hex::encode(siwe_message.address));
            info!("✅ SIWE signature valid for address: {}", address_hex);
            Ok(address_hex)
        }
        Err(e) => {
            warn!("❌ SIWE signature verification failed: {}", e);
            Err(format!("SIWE verification failed: {}", e).into())
        }
    }
}

/// Generate a SIWE message for testing
pub fn generate_siwe_message(
    user_address: &str,
    domain: &str,
    uri: &str,
    nonce: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();
    let expires = now + Duration::hours(24); // 24 hour expiry
    
    let message = format!(
        "{} wants you to sign in with your Ethereum account:\n{}\n\nGenerate agent wallet for TEE-secured trading.\n\nURI: {}\nVersion: 1\nChain ID: 1\nNonce: {}\nIssued At: {}\nExpiration Time: {}",
        domain,
        user_address,
        uri,
        nonce,
        now.to_rfc3339(),
        expires.to_rfc3339()
    );
    
    Ok(message)
}

/// Generate a secure nonce for SIWE
pub fn generate_nonce() -> String {
    use rand::Rng;
    
    // Generate 16 random bytes and encode as hex
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(bytes)
}

/// Validate that a SIWE message is not expired (simplified)
pub fn is_siwe_message_valid(message: &str) -> bool {
    match message.parse::<Message>() {
        Ok(_siwe_message) => {
            // For now, just check that message parses correctly
            // TODO: Implement proper timestamp validation with SIWE TimeStamp types
            info!("📋 SIWE message validation: parsed successfully");
            true
        }
        Err(e) => {
            error!("Failed to parse SIWE message for validation: {}", e);
            false
        }
    }
}

// TODO: Add session management for API keys
// TODO: Implement proper nonce tracking for replay protection  
// TODO: Add rate limiting for SIWE authentication
// TODO: Add API key expiration and renewal