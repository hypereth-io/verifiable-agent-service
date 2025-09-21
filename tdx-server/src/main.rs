use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

mod agent;
mod attestation;
mod proxy;
mod types;

use agent::AgentManager;
use attestation::TdxAttestation;
use proxy::HyperliquidProxy;
use types::*;

#[derive(Clone)]
pub struct AppState {
    agent_manager: Arc<RwLock<AgentManager>>,
    proxy: Arc<HyperliquidProxy>,
    attestation: Arc<TdxAttestation>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::init();

    info!("Starting TEE Agent Server");

    // Initialize components
    let agent_manager = Arc::new(RwLock::new(AgentManager::new()));
    let proxy = Arc::new(HyperliquidProxy::new("https://api.hyperliquid.xyz".to_string()));
    let attestation = Arc::new(TdxAttestation::new()?);

    let state = AppState {
        agent_manager,
        proxy,
        attestation,
    };

    // Build router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/register-agent", post(register_agent))
        .route("/agents/:user_id", get(get_agent))
        .route("/attestation", get(get_attestation))
        // Hyperliquid proxy routes
        .route("/info/*path", get(proxy_info))
        .route("/exchange/*path", post(proxy_exchange))
        .with_state(state)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    info!("Server running on http://0.0.0.0:8080");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "tdx-agent-server",
        "version": "0.1.0"
    }))
}

async fn register_agent(
    State(state): State<AppState>,
    Json(payload): Json<RegisterAgentRequest>,
) -> Result<Json<RegisterAgentResponse>, StatusCode> {
    info!("Registering agent for user: {}", payload.user_id);

    // Generate attestation report
    let attestation_report = match state.attestation.generate_report().await {
        Ok(report) => report,
        Err(e) => {
            warn!("Failed to generate attestation: {:?}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Create new agent
    let mut manager = state.agent_manager.write().await;
    let agent = match manager.create_agent(&payload.user_id).await {
        Ok(agent) => agent,
        Err(e) => {
            warn!("Failed to create agent: {:?}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    Ok(Json(RegisterAgentResponse {
        agent_address: agent.address,
        api_key: agent.api_key,
        attestation_report,
    }))
}

async fn get_agent(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<Json<AgentInfo>, StatusCode> {
    let manager = state.agent_manager.read().await;
    
    match manager.get_agent(&user_id) {
        Some(agent) => Ok(Json(AgentInfo {
            address: agent.address.clone(),
            user_id: agent.user_id.clone(),
            created_at: agent.created_at,
        })),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn get_attestation(
    State(state): State<AppState>,
) -> Result<Json<AttestationData>, StatusCode> {
    match state.attestation.generate_report().await {
        Ok(report) => Ok(Json(report)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn proxy_info(
    State(state): State<AppState>,
    Path(path): Path<String>,
    query: Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.proxy.proxy_info_request(&path, &query.0).await {
        Ok(response) => Ok(Json(response)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn proxy_exchange(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Extract API key from headers and validate
    // TODO: Sign request with appropriate agent key
    
    match state.proxy.proxy_exchange_request(&path, &payload).await {
        Ok(response) => Ok(Json(response)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}