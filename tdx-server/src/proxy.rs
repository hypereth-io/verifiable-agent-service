use reqwest::Client;
use serde_json::Value;
use tracing::{info, error};

#[derive(Debug)]
pub struct HyperliquidProxy {
    client: Client,
    base_url: String,
}

impl HyperliquidProxy {
    pub fn new(base_url: &str) -> Self {
        let client = Client::new();
        
        Self {
            client,
            base_url: base_url.to_string(),
        }
    }

    pub async fn proxy_info_request(&self, payload: &Value) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/info", self.base_url);
        
        info!("Making request to: {}", url);
        info!("Payload: {}", payload);

        let response = self
            .client
            .post(&url)
            .json(payload)
            .send()
            .await?;

        let status = response.status();
        info!("Response status: {}", status);

        if status.is_success() {
            let json_response: Value = response.json().await?;
            info!("Response received successfully");
            Ok(json_response)
        } else {
            let error_text = response.text().await.unwrap_or_default();
            error!("Hyperliquid API error: {} - {}", status, error_text);
            Err(format!("API error: {} - {}", status, error_text).into())
        }
    }

    pub async fn proxy_exchange_request(&self, payload: &Value) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/exchange", self.base_url);
        
        info!("🔄 Proxying signed exchange request to: {}", url);
        info!("📋 Payload keys: {:?}", payload.as_object().map(|o| o.keys().collect::<Vec<_>>()));
        
        // Verify that the payload has required fields for signed request
        if !payload.get("signature").is_some() {
            error!("❌ Exchange request missing signature - this should not happen");
            return Err("Exchange request missing signature".into());
        }
        
        if !payload.get("nonce").is_some() {
            error!("❌ Exchange request missing nonce - this should not happen");
            return Err("Exchange request missing nonce".into());
        }
        
        if !payload.get("action").is_some() {
            error!("❌ Exchange request missing action");
            return Err("Exchange request missing action".into());
        }
        
        info!("✅ Request has all required fields (action, signature, nonce)");
        
        // Forward the pre-signed request directly to Hyperliquid
        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(payload)
            .send()
            .await?;

        let status = response.status();
        info!("📡 Hyperliquid response status: {}", status);

        if status.is_success() {
            let json_response: Value = response.json().await?;
            info!("✅ Exchange request successful");
            Ok(json_response)
        } else {
            let error_text = response.text().await.unwrap_or_default();
            error!("❌ Hyperliquid exchange error: {} - {}", status, error_text);
            Err(format!("Exchange API error: {} - {}", status, error_text).into())
        }
    }
}