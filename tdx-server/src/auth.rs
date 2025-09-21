use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use tracing::{info, warn};

use crate::{AppState, config::Config};

pub async fn api_key_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract API key from X-API-Key header
    let api_key = headers
        .get("X-API-Key")
        .and_then(|value| value.to_str().ok());

    match api_key {
        Some(key) => {
            if key == state.config.fixed_api_key {
                info!("Valid API key provided");
                Ok(next.run(request).await)
            } else {
                warn!("Invalid API key provided: {}", key);
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        None => {
            warn!("No API key provided in X-API-Key header");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

pub fn get_agent_address_for_api_key(api_key: &str, config: &Config) -> Option<String> {
    // For now, return a fixed test agent address for the test key
    if api_key == config.fixed_api_key {
        Some(config.test_agent_address.clone())
    } else {
        None
    }
}