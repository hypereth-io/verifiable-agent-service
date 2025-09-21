use std::sync::OnceLock;
use secp256k1::{SecretKey, PublicKey, Secp256k1};
use hex;
use tracing::{info, error};

/// Preset TDX data for Mac development (no real TDX hardware access)
#[derive(Debug, Clone)]
pub struct PresetTDXData {
    /// Real TDX quote from merged branch
    pub tdx_quote: Vec<u8>,
    /// Agent private key that matches the quote
    pub agent_private_key: SecretKey,
    /// Agent address derived from the private key
    pub agent_address: String,
}

/// Global preset data instance
static PRESET_TDX_DATA: OnceLock<PresetTDXData> = OnceLock::new();

impl PresetTDXData {
    /// Initialize preset TDX data (called once on startup)
    pub fn initialize() -> Result<(), Box<dyn std::error::Error>> {
        // Load real TDX quote from agent_quote.bin
        let quote_path = "agent_quote.bin";
        let tdx_quote = match std::fs::read(quote_path) {
            Ok(data) => {
                info!("📁 Loaded real agent TDX quote: {} bytes", data.len());
                data
            }
            Err(e) => {
                error!("⚠️ Could not load agent_quote.bin: {}", e);
                // Try fallback path
                let fallback_path = "../agent_quote.bin";
                match std::fs::read(fallback_path) {
                    Ok(data) => {
                        info!("📁 Loaded TDX quote from fallback path: {} bytes", data.len());
                        data
                    }
                    Err(_) => {
                        error!("⚠️ Could not load TDX quote from any path");
                        return Err(format!("TDX quote file not found: {}", e).into());
                    }
                }
            }
        };

        // Load agent private key from environment
        let env_key = std::env::var("AGENT_PRIVATE_KEY")
            .map_err(|_| "AGENT_PRIVATE_KEY environment variable required")?;
        
        info!("🔑 Loading AGENT_PRIVATE_KEY from environment");
        info!("🔍 Key length: {} chars", env_key.len());
        
        // Remove 0x prefix if present
        let key_hex = env_key.strip_prefix("0x").unwrap_or(&env_key);
        info!("🔍 Processed key hex length: {} chars", key_hex.len());
        
        let private_key_bytes = hex::decode(key_hex)
            .map_err(|e| format!("Invalid AGENT_PRIVATE_KEY hex: {}", e))?;
            
        let agent_private_key = SecretKey::from_slice(&private_key_bytes)
            .map_err(|e| format!("Invalid AGENT_PRIVATE_KEY: {}", e))?;

        // Derive agent address from private key
        let secp = Secp256k1::new();
        let public_key = PublicKey::from_secret_key(&secp, &agent_private_key);
        let agent_address = Self::public_key_to_address(&public_key);

        let preset_data = PresetTDXData {
            tdx_quote,
            agent_private_key,
            agent_address: agent_address.clone(),
        };

        // Store globally
        PRESET_TDX_DATA.set(preset_data).map_err(|_| "Failed to set preset data")?;
        
        info!("🤖 Preset TDX agent: {}", agent_address);
        info!("📝 Agent ready for SIWE authentication workflow");

        Ok(())
    }

    /// Get the global preset TDX data
    pub fn get() -> Option<&'static PresetTDXData> {
        PRESET_TDX_DATA.get()
    }

    /// Convert public key to Ethereum address using proper Keccak256
    fn public_key_to_address(public_key: &PublicKey) -> String {
        use tiny_keccak::{Hasher, Keccak};
        
        // Get uncompressed public key (65 bytes: 0x04 + 32 bytes x + 32 bytes y)
        let public_key_bytes = public_key.serialize_uncompressed();
        
        // Take last 64 bytes (skip the 0x04 prefix)
        let public_key_hash = &public_key_bytes[1..];
        
        // Keccak256 hash of the public key
        let mut keccak = Keccak::v256();
        let mut hash = [0u8; 32];
        keccak.update(public_key_hash);
        keccak.finalize(&mut hash);
        
        // Take last 20 bytes as Ethereum address
        let address_bytes = &hash[12..];
        
        // Format as 0x prefixed hex string
        format!("0x{}", hex::encode(address_bytes))
    }
}

/// API response for agent login
#[derive(Debug, serde::Serialize)]
pub struct AgentLoginResponse {
    pub agent_address: String,
    pub api_key: String,
    pub tdx_quote_hex: String,
    pub message: String,
}

/// API response for TDX quote
#[derive(Debug, serde::Serialize)]
pub struct TDXQuoteResponse {
    pub tdx_quote_hex: String,
    pub agent_address: String,
    pub quote_size: usize,
    pub note: String,
}

impl PresetTDXData {
    /// Create agent login response
    pub fn create_login_response(&self, api_key: String) -> AgentLoginResponse {
        AgentLoginResponse {
            agent_address: self.agent_address.clone(),
            api_key,
            tdx_quote_hex: hex::encode(&self.tdx_quote),
            message: "Agent wallet generated. Submit tdx_quote_hex to HyperEVM registry for verification.".to_string(),
        }
    }

    /// Create TDX quote response
    pub fn create_quote_response(&self) -> TDXQuoteResponse {
        TDXQuoteResponse {
            tdx_quote_hex: hex::encode(&self.tdx_quote),
            agent_address: self.agent_address.clone(),
            quote_size: self.tdx_quote.len(),
            note: "Submit this quote to HyperEVM registry contract for verification".to_string(),
        }
    }
}

/// Generate a unique API key for a user
pub fn generate_api_key(user_address: &str) -> String {
    use sha2::{Sha256, Digest};
    
    // Create deterministic API key based on user address + timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let input = format!("{}:{}", user_address, timestamp);
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let hash = hasher.finalize();
    
    // Take first 16 bytes and format as hex
    format!("ak_{}", hex::encode(&hash[..16]))
}

// TODO: In production, replace with real TDX quote generation
// TODO: Load agent key from secure TDX environment
// TODO: Implement proper Keccak256 for address derivation
// TODO: Add quote validation and parsing