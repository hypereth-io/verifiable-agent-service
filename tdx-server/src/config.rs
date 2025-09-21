use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub hyperliquid_url: String,
    pub log_level: String,
    pub mock_api_key: String,
}

impl Config {
    pub fn from_env() -> Self {
        // Load from environment or use defaults
        let hyperliquid_url = env::var("HYPERLIQUID_API_URL")
            .unwrap_or_else(|_| "https://api.hyperliquid.xyz".to_string());
            
        let log_level = env::var("LOG_LEVEL")
            .unwrap_or_else(|_| "info".to_string());
            
        let mock_api_key = env::var("MOCK_API_KEY")
            .unwrap_or_else(|_| "test-api-key-12345".to_string());

        Self {
            hyperliquid_url,
            log_level,
            mock_api_key,
        }
    }
}