use axum::{
    extract::{Query, State},
    http::Method,
    middleware,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use postgres_protocol::escape::{escape_identifier, escape_literal};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::Duration};
use tokio::net::TcpListener;
use tokio_postgres::NoTls;
use tower_http::trace::TraceLayer;
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, decompression::RequestDecompressionLayer,
    timeout::TimeoutLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod error;

use auth::authorize;
use error::Result;

const DEFAULT_TIMEOUT: u64 = 15000;
// pg-escape does not seem to escape multi word identifiers properly
const VALID_CONSTRAINTS: [&str; 3] = ["PRIMARY KEY", "NOT NULL", "UNIQUE"];

type ConnectionPool = Pool<PostgresConnectionManager<NoTls>>;

fn get_url() -> &'static str {
    "postgresql://postgres:KkaWbejhPSjDSeWeZIwerYZhSSrDeGIZ@tcp-proxy.railway-develop.app:24022/railway"
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| format!("{}=info", env!("CARGO_CRATE_NAME")).into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let manager = PostgresConnectionManager::new_from_stringlike(get_url(), NoTls).unwrap();
    let pool = Pool::builder()
        .max_size(5)
        .min_idle(0)
        .idle_timeout(Some(Duration::from_secs(60)))
        .build(manager)
        .await
        .unwrap();

    let timeout = std::env::var("TIMEOUT").unwrap_or_default();
    let timeout = timeout.parse::<u64>().unwrap_or(DEFAULT_TIMEOUT);
    let timeout = Duration::from_millis(timeout);

    // TODO: fix this
    let cors = CorsLayer::permissive()
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        /*
        .allow_origin([
            "http://railway-develop.app".parse().unwrap(),
            "http://railway-develop.com".parse().unwrap(),
            "http://railway-staging.app".parse().unwrap(),
            "http://railway-staging.com".parse().unwrap(),
            "http://railway.app".parse().unwrap(),
            "http://railway.com".parse().unwrap(),
        ])*/;

    // build our application with a route
    let app = Router::new()
        .route("/directories", get(directories))
        .route("/directory", post(create_directory))
        .route("/directory", delete(delete_directory))
        .route("/objects", get(objects))
        .route("/object", post(create_object))
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::new(timeout))
        .layer(cors)
        .layer(middleware::from_fn(authorize))
        .layer(RequestDecompressionLayer::new())
        .layer(CompressionLayer::new())
        .with_state(pool);

    let listener = TcpListener::bind("0.0.0.0:9009").await.unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

async fn directories(State(pool): State<ConnectionPool>) -> Result<impl IntoResponse> {
    let conn = pool.get().await?;

    let rows = conn
        .query(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'public'",
            &[],
        )
        .await?;

    let mut tables: Vec<String> = Vec::with_capacity(rows.len());
    for row in rows {
        tables.push(row.try_get(0)?);
    }
    Ok(Json(tables))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDirectoryProperty {
    name: String,
    #[serde(rename = "type")]
    ty: String,
    #[serde(default)]
    default: Option<String>,
    #[serde(default)]
    constraint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDirectoryRequest {
    directory: String,
    #[serde(default)]
    properties: Vec<CreateDirectoryProperty>,
}

async fn create_directory(
    State(pool): State<ConnectionPool>,
    Json(req): Json<CreateDirectoryRequest>,
) -> Result<impl IntoResponse> {
    let properties = req.properties.into_iter().map(|p| {
        let mut prop = format!(
            "{} {}",
            escape_identifier(&p.name),
            escape_identifier(&p.ty)
        );
        if let Some(default) = &p.default {
            prop = format!("{prop} DEFAULT {}", escape_literal(default));
        }

        if let Some(constraint) = p.constraint {
            // TODO: error here otherwise?
            if VALID_CONSTRAINTS.contains(&constraint.as_str()) {
                prop = format!("{prop} {constraint}");
            }
        }

        prop
    });

    let query = format!(
        "CREATE TABLE {} ({})",
        escape_identifier(&req.directory),
        properties.collect::<Vec<String>>().join(", ")
    );

    let conn = pool.get().await?;

    // TODO: return created table
    let _rows = conn.query(&query, &[]).await?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteDirectoryRequest {
    directory: String,
}

async fn delete_directory(
    State(pool): State<ConnectionPool>,
    Query(req): Query<DeleteDirectoryRequest>,
) -> Result<impl IntoResponse> {
    let query = format!("DROP TABLE {}", escape_identifier(&req.directory),);

    let conn = pool.get().await?;
    let _rows = conn.query(&query, &[]).await?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectsRequest {
    directory: String,
    #[serde(default)]
    cursor: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectsResponse {
    objects: Vec<Option<serde_json::Value>>,
    property_names: Vec<String>,
    primary_key: Option<String>,
    count: i64,
}

async fn objects(
    State(pool): State<ConnectionPool>,
    Query(req): Query<ObjectsRequest>,
) -> Result<Json<ObjectsResponse>> {
    let query = format!(
        "SELECT column_name, data_type FROM information_schema.columns where table_name = {}",
        escape_literal(&req.directory),
    );

    let conn = pool.get().await?;
    let rows = conn.query(&query, &[]).await?;

    let mut properties: Vec<(String, String)> = Vec::with_capacity(rows.len());
    for row in rows {
        properties.push((row.try_get(0)?, row.try_get(1)?));
    }

    let query = format!(
        "SELECT row_to_json({0}.*) FROM {0} LIMIT 10 OFFSET {1}",
        escape_identifier(&req.directory),
        req.cursor.unwrap_or(0),
    );
    let rows = conn.query(&query, &[]).await?;

    let mut objects = Vec::with_capacity(rows.len());
    let property_names = properties.iter().map(|(name, _)| name.to_owned()).collect();

    for row in rows {
        let mut json: Option<serde_json::Value> = row.try_get(0)?;
        if let Some(json) = &mut json {
            if let Some(object) = json.as_object_mut() {
                for (property, value) in object {
                    if let Some((_, ty)) = properties.iter().find(|(name, _)| name == property) {
                        if ty == "json" || ty == "jsonb" {
                            *value = serde_json::json!(serde_json::to_string(value)?);
                        }
                    }
                }
            }
        }
        objects.push(json);
    }

    let query = format!("SELECT COUNT(*) FROM {}", escape_identifier(&req.directory));
    let row = conn.query_opt(&query, &[]).await?;
    let count: i64 = row.map_or(Ok(0), |r| r.try_get(0))?;

    let query = "SELECT pg_attribute.attname
                 FROM pg_index, pg_class, pg_attribute, pg_namespace
                 WHERE indrelid = pg_class.oid AND nspname = 'public' AND pg_class.relnamespace = pg_namespace.oid AND
                   pg_attribute.attrelid = pg_class.oid AND pg_attribute.attnum = any(pg_index.indkey) AND indisprimary AND
                   relName = $1";
    let row = conn.query_opt(query, &[&req.directory]).await?;
    let primary_key: Option<String> = row.map(|r| r.try_get(0)).transpose()?;

    Ok(Json(ObjectsResponse {
        objects,
        count,
        primary_key,
        property_names,
    }))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateObjectRequest {
    properties: HashMap<String, String>,
    directory: String,
}

async fn create_object(
    State(pool): State<ConnectionPool>,
    Query(req): Query<CreateObjectRequest>,
) -> Result<()> {
    let names = req
        .properties
        .keys()
        .map(|k| escape_identifier(k))
        .collect::<Vec<String>>()
        .join(", ");
    // TODO: pass these as $n args and values as params to query
    // let values = req.properties.values().enumerate().map(|(_, index)| format!("${index}")).collect::<Vec<String>>().join(", ");
    let values = req
        .properties
        .values()
        .map(|value| escape_literal(value))
        .collect::<Vec<String>>()
        .join(", ");
    let query = dbg!(format!(
        "INSERT INTO {} ({names}) VALUES ({values})",
        escape_identifier(&req.directory)
    ));

    let conn = pool.get().await?;
    let _rows = conn.query(&query, &[]).await?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateObjectRequest {
    id: String,
    directory: String,
    properties: HashMap<String, String>;
}

async fn update_object(
    State(pool): State<ConnectionPool>,
    Query(req): Query<UpdateObjectRequest>,
) -> Result<()> {
    const query = knex(args.tableName)
      .withSchema("public")
      .where({ [args.pKey]: args.pKeyValue })
      .update(args.data)
      .toString();

    let query = "SELECT pg_attribute.attname
                 FROM pg_index, pg_class, pg_attribute, pg_namespace
                 WHERE indrelid = pg_class.oid AND nspname = 'public' AND pg_class.relnamespace = pg_namespace.oid AND
                   pg_attribute.attrelid = pg_class.oid AND pg_attribute.attnum = any(pg_index.indkey) AND indisprimary AND
                   relName = $1";
    let row = conn.query_opt(query, &[&req.directory]).await?;
    let primary_key: Option<String> = row.map(|r| r.try_get(0)).transpose()?;

    let values = req
        .properties
        .values()
        .map(|value| escape_literal(value))
        .collect::<Vec<String>>()
        .join(", ");
    let query = dbg!(format!(
        "UPDATE {} SET {} WHERE {} = $1",
        escape_identifier(&req.directory)
        values,
        escape_identifier(&primary_key)
    ));

    let conn = pool.get().await?;
    let _rows = conn.query(&query, &[req.id]).await?;

    Ok(())
}
