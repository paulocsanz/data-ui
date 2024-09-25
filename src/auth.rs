use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};

pub async fn authorize(request: Request, next: Next) -> Result<Response, StatusCode> {
    #[cfg(debug_assertions)]
    return Ok(next.run(request).await);

    #[cfg(not(debug_assertions))]
    let token = std::env::var("TOKEN").ok();

    #[cfg(not(debug_assertions))]
    if let Some(authorization) = request.headers().get(axum::http::header::AUTHORIZATION) {
        if authorization.to_str().ok() == token.map(|token| format!("Bearer {token}")).as_deref()
            && authorization.len() > 0
        {
            Ok(next.run(request).await)
        } else {
            Err(StatusCode::UNAUTHORIZED)
        }
    } else {
        Err(StatusCode::BAD_REQUEST)
    }
}
