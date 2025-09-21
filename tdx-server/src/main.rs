use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::Value;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{info, warn, error};

mod auth;
mod config;
mod proxy;

use config::Config;
use proxy::HyperliquidProxy;

#[derive(Clone)]
pub struct AppState {
    proxy: Arc<HyperliquidProxy>,
    config: Arc<Config>,
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
    
    // Initialize Hyperliquid proxy
    let proxy = Arc::new(HyperliquidProxy::new(&config.hyperliquid_url));

    let state = AppState {
        proxy,
        config,
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
    State(_state): State<AppState>,
    Json(_payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    warn!("Exchange endpoint not yet implemented");
    
    // For now, just return an error
    Err(StatusCode::NOT_IMPLEMENTED)
}