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
mod auth;
mod config;
mod proxy;
mod signing;

use agent::AgentManager;
use config::Config;
use proxy::HyperliquidProxy;

#[derive(Clone)]
pub struct AppState {
    proxy: Arc<HyperliquidProxy>,
    config: Arc<Config>,
    agent_manager: Arc<RwLock<AgentManager>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing with better configuration
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    println!("🚀 Starting TDX Agent Server...");
    info!("Starting TDX Agent Server");

    // Load configuration
    let config = Arc::new(Config::from_env());
    
    // Initialize components
    let proxy = Arc::new(HyperliquidProxy::new(&config.hyperliquid_url));
    let agent_manager = Arc::new(RwLock::new(AgentManager::new()));

    let state = AppState {
        proxy,
        config,
        agent_manager,
    };

    // Build router with authentication for /exchange endpoints
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/info", post(proxy_info))
        .route("/exchange", post(proxy_exchange))
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

async fn proxy_exchange(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    info!("Processing exchange request: {:?}", payload);
    
    // Extract API key (already validated by middleware)
    let api_key = headers
        .get("X-API-Key")
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    
    // Get agent private key for this API key
    let agent_manager = state.agent_manager.read().await;
    let private_key = agent_manager
        .get_private_key(api_key)
        .ok_or(StatusCode::UNAUTHORIZED)?;
    
    // Extract required fields
    let action = payload
        .get("action")
        .ok_or(StatusCode::BAD_REQUEST)?;
    
    let nonce = payload
        .get("nonce")
        .and_then(|n| n.as_u64())
        .ok_or(StatusCode::BAD_REQUEST)?;
    
    // Extract optional vault address
    let vault_address = payload
        .get("vaultAddress")
        .and_then(|v| v.as_str());
    
    // Sign the request
    match signing::sign_exchange_request(action, nonce, private_key, vault_address) {
        Ok(signature) => {
            // Add signature to payload
            payload["signature"] = signature.to_json();
            info!("Request signed successfully");
            
            // Forward signed request to Hyperliquid
            match state.proxy.proxy_exchange_request(&payload).await {
                Ok(response) => {
                    info!("Exchange request successful");
                    Ok(Json(response))
                }
                Err(e) => {
                    error!("Exchange request failed: {:?}", e);
                    Err(StatusCode::BAD_GATEWAY)
                }
            }
        }
        Err(e) => {
            error!("Signing failed: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}