use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterAgentRequest {
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterAgentResponse {
    pub agent_address: String,
    pub api_key: String,
    pub attestation_report: AttestationData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub address: String,
    pub user_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationData {
    pub quote: String,
    pub mrenclave: String,
    pub mrsigner: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone)]
pub struct Agent {
    pub address: String,
    pub private_key: String,
    pub api_key: String,
    pub user_id: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HyperliquidOrder {
    pub coin: String,
    pub is_buy: bool,
    pub sz: f64,
    pub limit_px: f64,
    pub order_type: Option<String>,
    pub reduce_only: Option<bool>,
}