use std::collections::HashMap;
use secp256k1::{SecretKey, PublicKey, Secp256k1};
use rand;
use hex;
use tracing::info;

#[derive(Debug, Clone)]
pub struct Agent {
    pub address: String,
    pub private_key: SecretKey,
}

#[derive(Debug)]
pub struct AgentManager {
    // Map API key -> Agent
    agents: HashMap<String, Agent>,
    secp: Secp256k1<secp256k1::All>,
}

impl AgentManager {
    pub fn new() -> Self {
        let mut manager = Self {
            agents: HashMap::new(),
            secp: Secp256k1::new(),
        };
        
        // Create fixed test agent for "test-key"
        manager.create_test_agent();
        
        manager
    }

    fn create_test_agent(&mut self) {
        // Always generate a random agent keypair for TDX server
        // The master wallet (from tests) will approve this agent
        let private_key = SecretKey::new(&mut rand::thread_rng());
        
        // Derive Ethereum address from public key
        let public_key = PublicKey::from_secret_key(&self.secp, &private_key);
        let address = self.public_key_to_address(&public_key);
        
        let agent = Agent {
            address: address.clone(),
            private_key,
        };
        
        // Map "test-key" to this agent
        self.agents.insert("test-key".to_string(), agent);
        
        info!("🤖 Created random agent wallet: address = {}", address);
        info!("⚠️  Master wallet must approve this agent before trading");
        info!("📝 Use this address in your agent approval process");
    }

    pub fn get_agent(&self, api_key: &str) -> Option<&Agent> {
        self.agents.get(api_key)
    }

    pub fn get_private_key(&self, api_key: &str) -> Option<&SecretKey> {
        self.agents.get(api_key).map(|agent| &agent.private_key)
    }

    pub fn get_agent_address(&self, api_key: &str) -> Option<&String> {
        self.agents.get(api_key).map(|agent| &agent.address)
    }

    fn public_key_to_address(&self, public_key: &PublicKey) -> String {
        use sha2::{Sha256, Digest};
        
        // Get uncompressed public key (65 bytes: 0x04 + 32 bytes x + 32 bytes y)
        let public_key_bytes = public_key.serialize_uncompressed();
        
        // Take last 64 bytes (skip the 0x04 prefix)
        let public_key_hash = &public_key_bytes[1..];
        
        // Keccak256 hash of the public key
        let mut hasher = sha2::Sha256::new(); // Note: This should be Keccak256, using SHA256 for now
        hasher.update(public_key_hash);
        let hash = hasher.finalize();
        
        // Take last 20 bytes as Ethereum address
        let address_bytes = &hash[hash.len() - 20..];
        
        // Format as 0x prefixed hex string
        format!("0x{}", hex::encode(address_bytes))
    }

    // TODO: Add proper Keccak256 implementation for Ethereum address derivation
    // TODO: Add secure key generation for production
    // TODO: Add key persistence (encrypted storage)
    // TODO: Add key rotation and management
}