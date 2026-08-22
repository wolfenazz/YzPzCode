//! SQLite explorer backend (read-only stub): list tables and run bounded
//! queries so the panel never has to shell out.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;

const MAX_RESULT_ROWS: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
}

fn open_readonly(db_path: &str) -> Result<Connection, String> {
    if !Path::new(db_path).exists() {
        return Err(format!("Database does not exist: {db_path}"));
    }
    Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("Cannot open database: {e}"))
}

#[tauri::command]
pub fn sqlite_list_tables(db_path: String) -> Result<Vec<String>, String> {
    let conn = open_readonly(&db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| format!("Query failed: {e}"))?;

    let tables = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Query failed: {e}"))?;

    Ok(tables)
}

/// Run a read-only query. Statement that could mutate (INSERT/UPDATE/DELETE/
/// DROP/ALTER/ATTACH/etc.) is rejected up front.
#[tauri::command]
pub fn sqlite_query(db_path: String, sql: String) -> Result<SqlQueryResult, String> {
    if sql.len() > 10_000 {
        return Err("Query is too long".to_string());
    }
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err("Query is empty".to_string());
    }
    let upper = trimmed.to_uppercase();
    for forbidden in [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "ATTACH", "DETACH", "VACUUM",
        "REINDEX", "REPLACE", "PRAGMA",
    ] {
        if upper.starts_with(forbidden) {
            return Err("Read-only mode — only SELECT queries are allowed".to_string());
        }
    }

    let conn = open_readonly(&db_path)?;
    let mut stmt = conn
        .prepare(trimmed)
        .map_err(|e| format!("Query failed: {e}"))?;

    let column_count = stmt.column_count();
    let columns = stmt
        .column_names()
        .iter()
        .map(|c| c.to_string())
        .collect::<Vec<_>>();

    let mut rows: Vec<Vec<Value>> = Vec::new();
    {
        let mut query = stmt.query([]).map_err(|e| format!("Query failed: {e}"))?;
        while let Ok(Some(row)) = query.next() {
            if rows.len() >= MAX_RESULT_ROWS {
                break;
            }
            let mut values = Vec::with_capacity(column_count);
            for index in 0..column_count {
                let value = match row.get_ref(index) {
                    Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                    Ok(rusqlite::types::ValueRef::Integer(i)) => Value::from(i),
                    Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::Number::from_f64(f)
                        .map(Value::Number)
                        .unwrap_or(Value::Null),
                    Ok(rusqlite::types::ValueRef::Text(t)) => {
                        Value::String(String::from_utf8_lossy(t).to_string())
                    }
                    Ok(rusqlite::types::ValueRef::Blob(_)) => Value::String("<blob>".to_string()),
                    Err(_) => Value::Null,
                };
                values.push(value);
            }
            rows.push(values);
        }
    }

    let row_count = rows.len();
    Ok(SqlQueryResult {
        columns,
        rows,
        row_count,
    })
}
