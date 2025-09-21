use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub hyperliquid_url: String,
    pub log_level: String,
    pub fixed_api_key: String,
    pub test_agent_address: String,
}

impl Config {
    pub fn from_env() -> Self {
        // Load from environment or use defaults
        let hyperliquid_url = env::var("HYPERLIQUID_API_URL")
            .unwrap_or_else(|_| "https://api.hyperliquid.xyz".to_string());
            
        let log_level = env::var("LOG_LEVEL")
            .unwrap_or_else(|_| "info".to_string());
            
        let fixed_api_key = env::var("FIXED_API_KEY")
            .unwrap_or_else(|_| "test-key".to_string());
            
        let test_agent_address = env::var("TEST_AGENT_ADDRESS")
            .unwrap_or_else(|_| "0x742d35Cc6635C0532925a3b8D23cfcdCF83C4Ba1".to_string());

        Self {
            hyperliquid_url,
            log_level,
            fixed_api_key,
            test_agent_address,
        }
    }
}