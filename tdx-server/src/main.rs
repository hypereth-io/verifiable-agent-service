use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::{info, error};

mod agent;
mod agents;
mod auth;
mod config;
mod preset_tdx;
mod proxy;
mod siwe_auth;
mod universal_signing;

use agent::AgentManager;
use agents::AgentSessionManager;
use config::Config;
use preset_tdx::PresetTDXData;
use proxy::HyperliquidProxy;
use universal_signing::handle_with_sdk_complete;

#[derive(Clone)]
pub struct AppState {
    proxy: Arc<HyperliquidProxy>,
    config: Arc<Config>,
    agent_manager: Arc<RwLock<AgentManager>>,
    session_manager: Arc<RwLock<AgentSessionManager>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables
    dotenvy::dotenv().ok();

    // Initialize tracing with better configuration
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    println!("🚀 Starting TDX Agent Server...");
    info!("Starting TDX Agent Server");

    // Initialize preset TDX data
    PresetTDXData::initialize()?;
    info!("✅ Preset TDX data initialized");

    // Load configuration
    let config = Arc::new(Config::from_env());
    
    // Initialize components
    let proxy = Arc::new(HyperliquidProxy::new(&config.hyperliquid_url));
    let agent_manager = Arc::new(RwLock::new(AgentManager::new()));
    let session_manager = Arc::new(RwLock::new(AgentSessionManager::new()));

    let state = AppState {
        proxy,
        config,
        agent_manager,
        session_manager,
    };

    // Build router with authentication for /exchange endpoints
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/info", post(proxy_info))
        .route("/exchange", post(proxy_exchange))
        .route("/debug/agent-address", get(get_agent_address))
        // Agents API routes
        .route("/agents/login", post(agents_login))
        .route("/agents/quote", get(agents_quote))
        .route("/debug/sessions", get(debug_sessions))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            |State(state): State<AppState>, req: Request, next: Next| async move {
                // Only apply auth to /exchange endpoints
                if req.uri().path().starts_with("/exchange") {
                    auth::api_key_auth(State(state), req.headers().clone(), req, next).await
                } else {
                    Ok(next.run(req).await)
                }
            }
        ))
        .with_state(state)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    println!("🌐 TDX Agent Server running on http://0.0.0.0:8080");
    info!("TDX Agent Server running on http://0.0.0.0:8080");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> Json<Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "tdx-agent-server",
        "version": "0.1.0"
    }))
}

async fn get_agent_address(State(state): State<AppState>) -> Json<Value> {
    let agent_manager = state.agent_manager.read().await;
    
    if let Some(agent) = agent_manager.get_agent("test-key") {
        Json(serde_json::json!({
            "agent_address": agent.address,
            "api_key": "test-key",
            "note": "Master wallet must approve this agent address before trading"
        }))
    } else {
        Json(serde_json::json!({
            "error": "No agent found for test-key"
        }))
    }
}

async fn proxy_info(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    info!("Proxying info request: {:?}", payload);

    match state.proxy.proxy_info_request(&payload).await {
        Ok(response) => {
            info!("Info request successful");
            Ok(Json(response))
        }
        Err(e) => {
            error!("Info request failed: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn agents_login(
    State(session_manager): State<AppState>,
    Json(payload): Json<siwe_auth::SiweLoginRequest>,
) -> Result<Json<siwe_auth::SiweLoginResponse>, (StatusCode, Json<siwe_auth::SiweLoginError>)> {
    agents::agents_login(State(session_manager.session_manager), Json(payload)).await
}

async fn agents_quote() -> Result<Json<Value>, StatusCode> {
    agents::agents_quote().await
}

async fn debug_sessions(
    State(session_manager): State<AppState>,
) -> Json<Value> {
    agents::debug_sessions(State(session_manager.session_manager)).await
}

async fn proxy_exchange(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    info!("🔄 Processing exchange request with universal signing");
    
    // Extract API key (already validated by middleware)
    let api_key = headers
        .get("X-API-Key")
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    
    // Get agent private key - use the same preset TDX key for consistency
    let private_key = {
        let preset_data = PresetTDXData::get()
            .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
        
        if api_key == state.config.fixed_api_key {
            info!("🔑 Using preset TDX key for fixed API key (consistency)");
        } else {
            info!("🔑 Using preset TDX key for SIWE API key");
        }
        
        preset_data.agent_private_key.clone()
    };
    
    info!("🔐 Using universal signing with agent private key");
    
    // Extract action and nonce from payload
    let action = payload.get("action")
        .ok_or(StatusCode::BAD_REQUEST)?
        .clone();
    
    let nonce = payload.get("nonce")
        .and_then(|n| n.as_u64())
        .unwrap_or_else(|| {
            // Generate nonce if not provided
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64
        });
    
    // Extract vault address if present
    let vault_address = payload.get("vaultAddress")
        .and_then(|v| v.as_str());
    
    // Determine if mainnet based on config
    let is_mainnet = state.config.hyperliquid_url.contains("api.hyperliquid.xyz");
    
    info!("📋 Action: {:?}", action.get("type"));
    info!("📋 Nonce: {}", nonce);
    info!("📋 Vault: {:?}", vault_address);
    info!("📋 Mainnet: {}", is_mainnet);
    
    // Check if this is an approveAgent request (should be forwarded as pre-signed)
    let action_type = action.get("type").and_then(|t| t.as_str());
    
    if action_type == Some("approveAgent") {
        info!("🔓 ApproveAgent detected - forwarding pre-signed master wallet request");
        
        // Check if request has signature (should be pre-signed by master wallet)
        if let Some(signature_obj) = payload.get("signature") {
            info!("📝 ApproveAgent has signature - analyzing and forwarding");
            
            // Extract signature components for recovery
            if let (Some(r), Some(s), Some(v)) = (
                signature_obj.get("r").and_then(|r| r.as_str()),
                signature_obj.get("s").and_then(|s| s.as_str()),
                signature_obj.get("v").and_then(|v| v.as_u64())
            ) {
                info!("🔍 ApproveAgent signature debug:");
                info!("   r: {}", r);
                info!("   s: {}", s);
                info!("   v: {}", v);
                
                // Validate nonce consistency (security check)
                let request_nonce = payload.get("nonce").and_then(|n| n.as_u64());
                let action_nonce = action.get("nonce").and_then(|n| n.as_u64());
                
                info!("🔍 Nonce validation:");
                info!("   Request body nonce: {:?}", request_nonce);
                info!("   Action nonce: {:?}", action_nonce);
                
                if request_nonce != action_nonce {
                    error!("❌ Nonce mismatch: request={:?} vs action={:?}", request_nonce, action_nonce);
                    
                    let error_response = serde_json::json!({
                        "status": "err", 
                        "response": "Nonce mismatch between request body and action structure",
                        "details": {
                            "request_nonce": request_nonce,
                            "action_nonce": action_nonce
                        }
                    });
                    
                    return Ok(Json(error_response));
                } else {
                    info!("✅ Nonce validation passed");
                }
                
                // Try to recover the signer address
                match recover_signer_from_approve_agent(&payload, r, s, v) {
                    Ok(signer_address) => {
                        info!("🔍 Recovered signer address: {}", signer_address);
                        info!("🔍 Expected agent address: 0xe249b7295cdf2d0d60add817851efd0900531b35");
                        info!("🔍 Action details: agentAddress = {}", 
                            action.get("agentAddress").and_then(|a| a.as_str()).unwrap_or("unknown"));
                    }
                    Err(e) => {
                        info!("⚠️ Could not recover signer: {}", e);
                    }
                }
            }
            
            // Forward the pre-signed request directly via proxy
            match state.proxy.proxy_exchange_request(&payload).await {
                Ok(response) => {
                    info!("✅ ApproveAgent forwarded successfully");
                    info!("📊 Response: {:?}", response);
                    Ok(Json(response))
                }
                Err(e) => {
                    error!("❌ ApproveAgent forwarding failed: {:?}", e);
                    Err(StatusCode::BAD_REQUEST)
                }
            }
        } else {
            info!("❌ ApproveAgent missing signature");
            
            // Return helpful error for unsigned approveAgent requests
            let error_response = serde_json::json!({
                "status": "err",
                "response": "ApproveAgent requests must be signed by the master wallet before sending to TDX server",
                "note": "This action approves the TDX agent and must be signed by your master wallet, not the TDX agent itself"
            });
            
            Ok(Json(error_response))
        }
    } else {
        // Handle other actions with SDK (order, cancel, etc.)
        match handle_with_sdk_complete(&action, nonce, &private_key, vault_address, is_mainnet).await {
            Ok(response) => {
                info!("✅ SDK handled request completely");
                Ok(Json(response))
            }
            Err(e) => {
                error!("❌ SDK request handling failed: {:?}", e);
                Err(StatusCode::BAD_REQUEST)
            }
        }
    }
}

/// Recover signer address from approveAgent signature for debugging
fn recover_signer_from_approve_agent(
    payload: &Value,
    r: &str,
    s: &str,
    v: u64,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    use ethers::{
        types::{Signature, RecoveryMessage},
        utils::keccak256,
    };
    
    // Create the signature
    let signature = Signature {
        r: r.parse()?,
        s: s.parse()?,
        v,
    };
    
    // Create the message that was signed (simplified approach)
    let action = payload.get("action").ok_or("Missing action")?;
    let nonce = payload.get("nonce").and_then(|n| n.as_u64()).ok_or("Missing nonce")?;
    
    // Create a message from the action data (this is a simplified recovery)
    let message_data = format!("{}:{}", serde_json::to_string(action)?, nonce);
    let message_hash = keccak256(message_data.as_bytes());
    
    // Recover the address
    let recovery_message = RecoveryMessage::Hash(message_hash.into());
    let recovered_address = signature.recover(recovery_message)?;
    
    Ok(format!("{:?}", recovered_address))
}
