use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use tracing::error;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Bb8Postgres(#[from] bb8::RunError<tokio_postgres::Error>),
    #[error(transparent)]
    Postgres(#[from] tokio_postgres::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("no primary key found for table")]
    NoPrimaryKey,
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        error!("Error: {self}");
        let (status, body) = match self {
            Error::NoPrimaryKey => (StatusCode::BAD_REQUEST, self.to_string()),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unexpected error".to_owned(),
            ),
        };

        // it's often easiest to implement `IntoResponse` by calling other implementations
        (status, body).into_response()
    }
}
