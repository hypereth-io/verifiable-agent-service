use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use serde_json::Value;
use tracing::{info, warn, error};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::siwe_auth::{SiweLoginRequest, SiweLoginResponse, SiweLoginError, validate_siwe_signature};
use crate::preset_tdx::{PresetTDXData, generate_api_key};

/// Agent session manager for tracking authenticated users
#[derive(Debug, Clone)]
pub struct AgentSession {
    pub user_address: String,
    pub agent_address: String,
    pub api_key: String,
    pub created_at: u64,
    pub expires_at: u64,
}

/// Agent manager for handling SIWE authentication and sessions
#[derive(Debug)]
pub struct AgentSessionManager {
    /// Map API key -> AgentSession
    sessions: HashMap<String, AgentSession>,
    /// Map user address -> API key (for duplicate login handling)
    user_to_api_key: HashMap<String, String>,
}

impl AgentSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            user_to_api_key: HashMap::new(),
        }
    }

    /// Create new session for authenticated user
    pub fn create_session(&mut self, user_address: String) -> Result<AgentSession, Box<dyn std::error::Error + Send + Sync>> {
        // Get preset TDX data
        let preset_data = PresetTDXData::get()
            .ok_or("Preset TDX data not initialized")?;

        // Generate API key for this user
        let api_key = generate_api_key(&user_address);
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        let session = AgentSession {
            user_address: user_address.clone(),
            agent_address: preset_data.agent_address.clone(),
            api_key: api_key.clone(),
            created_at: now,
            expires_at: now + (24 * 60 * 60), // 24 hours
        };

        // Store session
        self.sessions.insert(api_key.clone(), session.clone());
        self.user_to_api_key.insert(user_address, api_key);

        info!("👤 Created session for user: {}", session.user_address);
        info!("🤖 Agent address: {}", session.agent_address);
        info!("🔑 API key: {}", session.api_key);

        Ok(session)
    }

    /// Get session by API key
    pub fn get_session(&self, api_key: &str) -> Option<&AgentSession> {
        self.sessions.get(api_key)
    }

    /// Check if user already has a session
    pub fn get_user_session(&self, user_address: &str) -> Option<&AgentSession> {
        self.user_to_api_key.get(user_address)
            .and_then(|api_key| self.sessions.get(api_key))
    }

    /// Validate API key and return associated agent address
    pub fn validate_api_key(&self, api_key: &str) -> Option<String> {
        self.sessions.get(api_key)
            .map(|session| session.agent_address.clone())
    }
}

/// Agents API handlers
pub struct AgentsAPI {
    pub session_manager: Arc<RwLock<AgentSessionManager>>,
}

impl AgentsAPI {
    pub fn new() -> Self {
        Self {
            session_manager: Arc::new(RwLock::new(AgentSessionManager::new())),
        }
    }
}

/// POST /agents/login - SIWE authentication
pub async fn agents_login(
    State(session_manager): State<Arc<RwLock<AgentSessionManager>>>,
    Json(payload): Json<SiweLoginRequest>,
) -> Result<Json<SiweLoginResponse>, (StatusCode, Json<SiweLoginError>)> {
    info!("🔐 Processing SIWE login request");

    // Validate SIWE signature
    let user_address = match validate_siwe_signature(&payload.message, &payload.signature).await {
        Ok(address) => {
            info!("✅ SIWE authentication successful for: {}", address);
            address
        }
        Err(e) => {
            warn!("❌ SIWE authentication failed: {}", e);
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(SiweLoginError {
                    success: false,
                    error: format!("SIWE authentication failed: {}", e),
                    code: 401,
                })
            ));
        }
    };

    // Check if user already has a session
    let mut manager = session_manager.write().await;
    if let Some(existing_session) = manager.get_user_session(&user_address) {
        info!("👤 User already has active session, returning existing data");
        
        let preset_data = PresetTDXData::get().unwrap();
        
        return Ok(Json(SiweLoginResponse {
            success: true,
            user_address: existing_session.user_address.clone(),
            api_key: existing_session.api_key.clone(),
            agent_address: existing_session.agent_address.clone(),
            tdx_quote_hex: hex::encode(&preset_data.tdx_quote),
            message: "Existing session found. Use this TDX quote and API key.".to_string(),
            expires_at: existing_session.expires_at.to_string(),
        }));
    }

    // Create new session
    match manager.create_session(user_address) {
        Ok(session) => {
            info!("🎉 New agent session created successfully");
            
            let preset_data = PresetTDXData::get().unwrap();
            
            Ok(Json(SiweLoginResponse {
                success: true,
                user_address: session.user_address,
                api_key: session.api_key,
                agent_address: session.agent_address,
                tdx_quote_hex: hex::encode(&preset_data.tdx_quote),
                message: "Agent wallet generated. Submit tdx_quote_hex to HyperEVM registry, then approve agent with Hyperliquid.".to_string(),
                expires_at: session.expires_at.to_string(),
            }))
        }
        Err(e) => {
            error!("❌ Failed to create agent session: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SiweLoginError {
                    success: false,
                    error: format!("Failed to create agent session: {}", e),
                    code: 500,
                })
            ))
        }
    }
}

/// GET /agents/quote - Get TDX quote for verification
pub async fn agents_quote() -> Result<Json<Value>, StatusCode> {
    info!("📋 TDX quote requested");

    let preset_data = PresetTDXData::get()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = preset_data.create_quote_response();
    
    info!("📤 Returning TDX quote: {} bytes", response.quote_size);
    
    Ok(Json(serde_json::to_value(response).unwrap()))
}

/// GET /debug/sessions - Debug endpoint to view active sessions
pub async fn debug_sessions(
    State(session_manager): State<Arc<RwLock<AgentSessionManager>>>,
) -> Json<Value> {
    let manager = session_manager.read().await;
    
    let session_count = manager.sessions.len();
    let user_count = manager.user_to_api_key.len();
    
    info!("📊 Debug: {} active sessions, {} users", session_count, user_count);
    
    Json(serde_json::json!({
        "active_sessions": session_count,
        "authenticated_users": user_count,
        "note": "Session details not exposed for security"
    }))
}

// TODO: Add session cleanup for expired sessions
// TODO: Implement API key rotation
// TODO: Add rate limiting for SIWE authentication
// TODO: Add proper nonce tracking for replay protection