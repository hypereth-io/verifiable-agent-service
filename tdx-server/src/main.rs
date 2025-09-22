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
use tracing::{info, warn, error};

mod agent;
mod agents;
mod auth;
mod config;
mod preset_tdx;
mod proxy;
mod siwe_auth;

use agent::AgentManager;
use agents::AgentSessionManager;
use config::Config;
use preset_tdx::PresetTDXData;
use proxy::HyperliquidProxy;
use hyperliquid_rust_sdk::{ExchangeClient, BaseUrl, ClientOrderRequest, ClientOrder, ClientLimit, ExchangeResponseStatus, ExchangeDataStatus, ClientCancelRequest};
use alloy::signers::local::PrivateKeySigner;

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
    Json(payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    info!("Processing exchange request: {:?}", payload);
    
    // Extract API key (already validated by middleware)
    let api_key = headers
        .get("X-API-Key")
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    
    // Get agent private key for this API key
    let private_key = if api_key == state.config.fixed_api_key {
        // Use legacy agent for fixed API key
        let agent_manager = state.agent_manager.read().await;
        let key = agent_manager.get_private_key(api_key)
            .ok_or(StatusCode::UNAUTHORIZED)?;
        key.clone()
    } else {
        // Use preset agent for SIWE API keys
        let preset_data = PresetTDXData::get()
            .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
        preset_data.agent_private_key.clone()
    };
    
    // Create SDK wallet from private key
    let private_key_hex = hex::encode(private_key.secret_bytes());
    let wallet: PrivateKeySigner = private_key_hex.parse()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    info!("🔐 Using SDK agent wallet: {:?}", wallet.address());
    
    // Create ExchangeClient with proper SDK
    let exchange_client = match ExchangeClient::new(
        None,                    // No http client override
        wallet,                 // Agent wallet
        Some(BaseUrl::Mainnet), // Mainnet
        None,                   // No vault
        None,                   // No meta override
    ).await {
        Ok(client) => client,
        Err(e) => {
            error!("Failed to create ExchangeClient: {:?}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    
    info!("📋 ExchangeClient created successfully");
    
    // Extract action and handle with SDK methods
    let action = payload.get("action").ok_or(StatusCode::BAD_REQUEST)?;
    let action_type = action.get("type").and_then(|t| t.as_str()).ok_or(StatusCode::BAD_REQUEST)?;
    
    match action_type {
        "order" => {
            // Convert to SDK order format and use SDK method
            match convert_and_place_order(&exchange_client, action).await {
                Ok(response) => {
                    info!("✅ SDK order successful");
                    Ok(Json(response))
                }
                Err(e) => {
                    error!("SDK order failed: {:?}", e);
                    Err(StatusCode::BAD_REQUEST)
                }
            }
        }
        "cancel" => {
            // Convert to SDK cancel format and use SDK method
            match convert_and_cancel_order(&exchange_client, action).await {
                Ok(response) => {
                    info!("✅ SDK cancel successful");
                    Ok(Json(response))
                }
                Err(e) => {
                    error!("SDK cancel failed: {:?}", e);
                    Err(StatusCode::BAD_REQUEST)
                }
            }
        }
        _ => {
            error!("Unsupported action type: {}", action_type);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

async fn convert_and_place_order(
    exchange_client: &ExchangeClient,
    action: &Value,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    // Extract order data
    let orders = action.get("orders").ok_or("Missing orders")?.as_array().ok_or("Orders not array")?;
    
    if orders.is_empty() {
        return Err("Empty orders array".into());
    }
    
    let order_data = &orders[0]; // Take first order for now
    
    // Extract and format price like SDK examples (clean round numbers)
    let raw_price: f64 = order_data.get("p").and_then(|p| p.as_str()).and_then(|s| s.parse().ok()).unwrap_or(50000.0);
    
    // Use clean round numbers like SDK examples (1800.0, 1795.0)
    let limit_px = if raw_price >= 100000.0 {
        // For BTC-level prices, round to nearest 5 dollars
        (raw_price / 5.0).round() * 5.0
    } else if raw_price >= 10000.0 {
        // For high prices, round to nearest dollar
        raw_price.round()
    } else if raw_price >= 1000.0 {
        // For mid prices, round to nearest 0.5
        (raw_price * 2.0).round() / 2.0
    } else {
        // For low prices, round to nearest 0.1
        (raw_price * 10.0).round() / 10.0
    };
    
    info!("💰 Price formatting: ${:.2} → ${:.1} (SDK clean format)", raw_price, limit_px);
    
    // Convert to SDK format
    let order = ClientOrderRequest {
        asset: "BTC".to_string(), // TODO: Convert asset index to symbol
        is_buy: order_data.get("b").and_then(|b| b.as_bool()).unwrap_or(true),
        reduce_only: order_data.get("r").and_then(|r| r.as_bool()).unwrap_or(false),
        limit_px,
        sz: order_data.get("s").and_then(|s| s.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.001),
        cloid: None,
        order_type: ClientOrder::Limit(ClientLimit {
            tif: "Gtc".to_string(), // TODO: Extract from order_data
        }),
    };
    
    info!("📋 Converted to SDK order: {} {} @ ${}", 
          if order.is_buy { "BUY" } else { "SELL" },
          order.sz,
          order.limit_px);
    
    // Use SDK method (handles signing internally)
    let response = exchange_client.order(order, None).await?;
    
    info!("📊 Raw SDK response: {:?}", response);
    
    // Handle SDK response format like the examples
    match response {
        ExchangeResponseStatus::Ok(exchange_response) => {
            info!("✅ Order successful: {:?}", exchange_response);
            
            // Extract order details for proper response
            if let Some(data) = exchange_response.data {
                let mut order_statuses = Vec::new();
                
                for status in data.statuses {
                    match status {
                        ExchangeDataStatus::Resting(order) => {
                            info!("📝 Order resting with ID: {}", order.oid);
                            order_statuses.push(serde_json::json!({
                                "resting": {"oid": order.oid}
                            }));
                        }
                        ExchangeDataStatus::Filled(order) => {
                            info!("✅ Order filled: {} @ ${}", order.total_sz, order.avg_px);
                            order_statuses.push(serde_json::json!({
                                "filled": {
                                    "totalSz": order.total_sz,
                                    "avgPx": order.avg_px,
                                    "oid": order.oid
                                }
                            }));
                        }
                        ExchangeDataStatus::Error(error_msg) => {
                            info!("⚠️ Order error: {}", error_msg);
                            order_statuses.push(serde_json::json!({
                                "error": error_msg
                            }));
                        }
                        _ => {
                            order_statuses.push(serde_json::json!({
                                "status": format!("{:?}", status)
                            }));
                        }
                    }
                }
                
                Ok(serde_json::json!({
                    "status": "ok",
                    "response": {
                        "type": "order",
                        "data": {
                            "statuses": order_statuses
                        }
                    }
                }))
            } else {
                Ok(serde_json::json!({
                    "status": "ok",
                    "response": {
                        "type": "order",
                        "data": {"statuses": []}
                    }
                }))
            }
        }
        ExchangeResponseStatus::Err(error_msg) => {
            info!("❌ SDK order error: {}", error_msg);
            Ok(serde_json::json!({
                "status": "err",
                "response": error_msg
            }))
        }
    }
}

async fn convert_and_cancel_order(
    exchange_client: &ExchangeClient,
    action: &Value,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    // Extract cancel data
    let cancels = action.get("cancels").ok_or("Missing cancels")?.as_array().ok_or("Cancels not array")?;
    
    if cancels.is_empty() {
        return Err("Empty cancels array".into());
    }
    
    let cancel_data = &cancels[0]; // Take first cancel for now
    
    // Extract order ID and asset
    let oid = cancel_data.get("o").and_then(|o| o.as_u64()).ok_or("Missing order ID")?;
    let asset_index = cancel_data.get("a").and_then(|a| a.as_u64()).unwrap_or(0);
    
    // Convert asset index to symbol (simplified)
    let asset = if asset_index == 0 { "BTC" } else { "ETH" };
    
    info!("🗑️ Converting to SDK cancel: {} order ID {}", asset, oid);
    
    // Create SDK cancel request
    let cancel_request = ClientCancelRequest {
        asset: asset.to_string(),
        oid,
    };
    
    // Use SDK cancel method (single request, not vector)
    let response = exchange_client.cancel(cancel_request, None).await?;
    
    info!("📊 Raw SDK cancel response: {:?}", response);
    
    // Handle SDK cancel response
    match response {
        ExchangeResponseStatus::Ok(exchange_response) => {
            info!("✅ Cancel successful: {:?}", exchange_response);
            
            Ok(serde_json::json!({
                "status": "ok", 
                "response": {
                    "type": "cancel",
                    "data": {
                        "statuses": ["success"]
                    }
                }
            }))
        }
        ExchangeResponseStatus::Err(error_msg) => {
            info!("❌ SDK cancel error: {}", error_msg);
            Ok(serde_json::json!({
                "status": "err",
                "response": error_msg
            }))
        }
    }
}