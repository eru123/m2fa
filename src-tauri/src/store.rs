use crate::otp::Algo;
use rusqlite::{params, Connection};

pub struct AccountRow {
    pub id: String,
    pub label: String,
    pub issuer: String,
    pub algorithm: Algo,
    pub digits: u32,
    pub period: u32,
    pub secret_enc: Vec<u8>,
    pub created_at: i64,
}

pub fn open(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("open database: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS accounts (
             id          TEXT PRIMARY KEY,
             label       TEXT NOT NULL,
             issuer      TEXT NOT NULL DEFAULT '',
             algorithm   TEXT NOT NULL DEFAULT 'SHA1',
             digits      INTEGER NOT NULL DEFAULT 6,
             period      INTEGER NOT NULL DEFAULT 30,
             secret_enc  BLOB NOT NULL,
             secret_hash TEXT NOT NULL,
             created_at  INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_accounts_secret_hash
             ON accounts(secret_hash);",
    )
    .map_err(|e| format!("init schema: {e}"))?;
    Ok(conn)
}

fn algo_from_str(s: &str) -> Algo {
    Algo::parse(s).unwrap_or(Algo::Sha1)
}

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<AccountRow> {
    let algo_str: String = row.get(3)?;
    Ok(AccountRow {
        id: row.get(0)?,
        label: row.get(1)?,
        issuer: row.get(2)?,
        algorithm: algo_from_str(&algo_str),
        digits: row.get(4)?,
        period: row.get(5)?,
        secret_enc: row.get(6)?,
        created_at: row.get(7)?,
    })
}

const COLS: &str = "id, label, issuer, algorithm, digits, period, secret_enc, created_at";

pub fn insert_account(
    conn: &Connection,
    id: &str,
    label: &str,
    issuer: &str,
    algorithm: Algo,
    digits: u32,
    period: u32,
    secret_enc: &[u8],
    secret_hash: &str,
    created_at: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO accounts (id, label, issuer, algorithm, digits, period, secret_enc, secret_hash, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, label, issuer, algorithm.as_str(), digits, period, secret_enc, secret_hash, created_at],
    )
    .map(|_| ())
    .map_err(|e| format!("insert account: {e}"))
}

pub fn account_exists(
    conn: &Connection,
    secret_hash: &str,
    label: &str,
    issuer: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM accounts WHERE secret_hash = ?1 AND label = ?2 AND issuer = ?3",
        params![secret_hash, label, issuer],
        |row| row.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .map_err(|e| format!("lookup account: {e}"))
}

pub fn list_accounts(conn: &Connection) -> Result<Vec<AccountRow>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {COLS} FROM accounts ORDER BY issuer, label, created_at"))
        .map_err(|e| format!("prepare list: {e}"))?;
    let rows = stmt
        .query_map([], row_to_account)
        .map_err(|e| format!("query accounts: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("read row: {e}"))?);
    }
    Ok(out)
}

pub fn delete_account(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
        .map(|n| n > 0)
        .map_err(|e| format!("delete account: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        open(std::path::Path::new(":memory:")).expect("mem db")
    }

    #[test]
    fn insert_list_delete_roundtrip() {
        let conn = mem_db();
        insert_account(&conn, "a1", "alice", "Example", Algo::Sha1, 6, 30, b"encblob", "hash1", 1)
            .unwrap();
        insert_account(&conn, "a2", "bob", "Acme", Algo::Sha256, 8, 60, b"encblob2", "hash2", 2)
            .unwrap();

        let all = list_accounts(&conn).unwrap();
        assert_eq!(all.len(), 2);
        // ordered by issuer: Acme before Example
        assert_eq!(all[0].label, "bob");
        assert_eq!(all[0].algorithm, Algo::Sha256);
        assert_eq!(all[0].digits, 8);
        assert_eq!(all[0].period, 60);
        assert_eq!(all[1].label, "alice");

        assert!(account_exists(&conn, "hash1", "alice", "Example").unwrap());
        assert!(!account_exists(&conn, "hash1", "alice", "Other").unwrap());

        assert!(delete_account(&conn, "a1").unwrap());
        assert!(!delete_account(&conn, "a1").unwrap());
        assert_eq!(list_accounts(&conn).unwrap().len(), 1);
    }
}
