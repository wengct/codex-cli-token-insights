use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::time::SystemTime;
use rusqlite::{params, Connection};
use crate::get_codex_dir;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct TokenCountUsage {
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    total_tokens: u64,
}

struct ParsedTurnData {
    turn_no: u32,
    timestamp: String,
    model: Option<String>,
    cwd: Option<String>,
    duration_ms: Option<u64>,
    total_token_usage: Option<TokenCountUsage>,
}

/// 取得 SQLite 資料庫連接，資料庫存放於 ~/.codex/codex_cli_token_insights.db
pub fn get_db_conn() -> Result<Connection, String> {
    let codex_dir = get_codex_dir()?;
    let db_path = codex_dir.join("codex_cli_token_insights.db");
    Connection::open(&db_path).map_err(|e| format!("無法開啟資料庫: {}", e))
}

/// 初始化資料庫，建立資料表與必要的索引
pub fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS usage_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            date TEXT NOT NULL,
            session_id TEXT NOT NULL,
            session_name TEXT,
            transcript_path TEXT,
            cwd TEXT,
            version TEXT,
            turn_no INTEGER NOT NULL,
            model TEXT,
            model_id TEXT,
            
            -- Token 統計 (排除快取的累計)
            tokens_input INTEGER,
            tokens_output INTEGER,
            tokens_cache_read INTEGER,
            tokens_reasoning INTEGER,
            tokens_total INTEGER,
            
            -- Delta Token 統計 (本次請求增量)
            delta_input INTEGER,
            delta_output INTEGER,
            delta_cache_read INTEGER,
            delta_reasoning INTEGER,
            delta_total INTEGER,
            
            -- 成本與時間
            duration_ms INTEGER,
            premium_requests INTEGER,
            parent_session_id TEXT,
            agent_nickname TEXT,
            agent_role TEXT
        )",
        [],
    ).map_err(|e| format!("建立 usage_entries 表失敗: {}", e))?;

    // Attempt to add parent_session_id column if database already exists
    let _ = conn.execute("ALTER TABLE usage_entries ADD COLUMN parent_session_id TEXT", []);
    if conn.execute("ALTER TABLE usage_entries ADD COLUMN agent_nickname TEXT", []).is_ok() {
        // If we successfully added the column, clear sync_state to force a full re-sync
        let _ = conn.execute("DELETE FROM sync_state", []);
    }
    let _ = conn.execute("ALTER TABLE usage_entries ADD COLUMN agent_role TEXT", []);

    // 建立唯一聯合約束，防止重複寫入
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uidx_session_turn ON usage_entries(session_id, turn_no)",
        [],
    ).map_err(|e| format!("建立唯一索引 uidx_session_turn 失敗: {}", e))?;

    // 建立日期索引以加速日明細與月報查詢
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_entries(date)",
        [],
    ).map_err(|e| format!("建立日期索引 idx_usage_date 失敗: {}", e))?;

    // 建立同步狀態記錄表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_state (
            filename TEXT PRIMARY KEY,
            last_synced_size INTEGER NOT NULL,
            last_synced_time INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("建立 sync_state 表失敗: {}", e))?;

    Ok(())
}

/// 解析 rollout 檔名獲取 session_id、開始日期與預設會話名稱
fn parse_filename(filename: &str) -> Option<(String, String, String)> {
    if !filename.starts_with("rollout-") || !filename.ends_with(".jsonl") {
        return None;
    }
    let core = filename.strip_prefix("rollout-")?.strip_suffix(".jsonl")?;
    if core.len() < 20 {
        return None;
    }
    let date_part = &core[0..10]; // YYYY-MM-DD
    let time_part = &core[11..19]; // HH-mm-ss
    let uuid_part = &core[20..]; // UUID
    
    let date = date_part.to_string();
    let time_formatted = time_part.replace('-', ":");
    let session_name = format!("Rollout {} {}", date, time_formatted);
    let session_id = uuid_part.to_string();
    
    Some((session_id, date, session_name))
}

/// 遞迴尋找 sessions 目錄下的所有 rollout-*.jsonl 檔案
fn find_session_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(find_session_files(&path));
            } else if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename.starts_with("rollout-") && filename.ends_with(".jsonl") {
                        files.push(path);
                    }
                }
            }
        }
    }
    files
}

/// 解析一個會話 JSONL 檔案的所有事件，歸納出 turns 的 Token 累積值與增量
fn parse_session_file(
    filepath: &Path,
    session_id: &str,
    session_name: &str,
    _session_date: &str,
) -> Result<Vec<crate::UsageEntry>, String> {
    let file = File::open(filepath).map_err(|e| format!("無法開啟檔案: {}", e))?;
    let reader = BufReader::new(file);

    let mut cli_version = None;
    let mut session_meta_cwd = None;
    let mut parent_session_id = None;
    let mut agent_nickname = None;
    let mut agent_role = None;

    let mut seen_turn_ids = Vec::new();
    let mut active_turn_id: Option<String> = None;
    let mut turn_data_map: HashMap<String, ParsedTurnData> = HashMap::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => continue,
        };
        let event: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let timestamp = event.get("timestamp").and_then(|t| t.as_str()).unwrap_or("").to_string();
        let payload = event.get("payload");

        if event_type == "session_meta" {
            if let Some(p) = payload {
                if cli_version.is_none() {
                    cli_version = p.get("cli_version").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
                if session_meta_cwd.is_none() {
                    session_meta_cwd = p.get("cwd").and_then(|c| c.as_str()).map(|s| s.to_string());
                }
                let p_sid = p.get("session_id").and_then(|v| v.as_str());
                let p_id = p.get("id").and_then(|v| v.as_str());
                if let (Some(psid), Some(pid)) = (p_sid, p_id) {
                    if psid != pid {
                        parent_session_id = Some(psid.to_string());
                    }
                }
                if agent_nickname.is_none() {
                    agent_nickname = p.get("agent_nickname")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            p.get("source")
                                .and_then(|s| s.get("subagent"))
                                .and_then(|s| s.get("thread_spawn"))
                                .and_then(|t| t.get("agent_nickname"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        });
                }
                if agent_role.is_none() {
                    agent_role = p.get("agent_role")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            p.get("source")
                                .and_then(|s| s.get("subagent"))
                                .and_then(|s| s.get("thread_spawn"))
                                .and_then(|t| t.get("agent_role"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        });
                }
            }
            continue;
        }

        // 嘗試獲取 turn_id
        let mut turn_id = None;
        if event_type == "turn_context" {
            if let Some(p) = payload {
                turn_id = p.get("turn_id").and_then(|id| id.as_str()).map(|s| s.to_string());
            }
        } else if event_type == "event_msg" {
            if let Some(p) = payload {
                turn_id = p.get("turn_id").and_then(|id| id.as_str()).map(|s| s.to_string());
            }
        } else if event_type == "response_item" {
            if let Some(meta) = event.get("metadata") {
                turn_id = meta.get("turn_id").and_then(|id| id.as_str()).map(|s| s.to_string());
            }
        }

        if let Some(tid) = turn_id {
            active_turn_id = Some(tid.clone());
            if !seen_turn_ids.contains(&tid) {
                seen_turn_ids.push(tid.clone());
                let turn_no = seen_turn_ids.len() as u32;
                turn_data_map.insert(tid.clone(), ParsedTurnData {
                    turn_no,
                    timestamp: timestamp.clone(),
                    model: None,
                    cwd: None,
                    duration_ms: None,
                    total_token_usage: None,
                });
            }
        }

        // 依據事件更新 active_turn_id 的細節
        if let Some(ref active_tid) = active_turn_id {
            if let Some(td) = turn_data_map.get_mut(active_tid) {
                if event_type == "turn_context" {
                    if let Some(p) = payload {
                        if td.model.is_none() {
                            td.model = p.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());
                        }
                        if td.cwd.is_none() {
                            td.cwd = p.get("cwd").and_then(|c| c.as_str()).map(|s| s.to_string());
                        }
                    }
                } else if event_type == "response_item" {
                    if let Some(p) = payload {
                        if p.get("role").and_then(|r| r.as_str()) == Some("assistant") && td.model.is_none() {
                            td.model = p.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());
                        }
                    }
                } else if event_type == "event_msg" {
                    if let Some(p) = payload {
                        let sub_type = p.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if sub_type == "token_count" {
                            if let Some(info) = p.get("info") {
                                if let Some(usage_val) = info.get("total_token_usage") {
                                    if let Ok(usage) = serde_json::from_value::<TokenCountUsage>(usage_val.clone()) {
                                        // 只覆蓋最新的 token_count 記錄
                                        td.total_token_usage = Some(usage);
                                    }
                                }
                            }
                        } else if sub_type == "task_complete" || sub_type == "turn_aborted" {
                            if let Some(dur) = p.get("duration_ms").and_then(|d| d.as_u64()) {
                                td.duration_ms = Some(dur);
                            }
                        }
                    }
                }
            }
        }
    }

    // 處理 turns 的累計與增量計算
    let mut results = Vec::new();
    let mut cumulative_usage = TokenCountUsage {
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: 0,
    };

    let mut prev_cli_input = 0u64;
    let mut prev_cli_cached = 0u64;
    let mut prev_cli_output = 0u64;
    let mut prev_cli_reasoning = 0u64;
    let mut prev_cli_total = 0u64;

    for tid in &seen_turn_ids {
        if let Some(td) = turn_data_map.get(tid) {
            if let Some(ref usage) = td.total_token_usage {
                cumulative_usage = usage.clone();
            }

            // CLI token 計算邏輯
            let cli_input = cumulative_usage.input_tokens.saturating_sub(cumulative_usage.cached_input_tokens);
            let cli_cached = cumulative_usage.cached_input_tokens;
            let cli_output = cumulative_usage.output_tokens;
            let cli_reasoning = cumulative_usage.reasoning_output_tokens;
            let cli_total = cli_input + cli_output;

            let delta_input = cli_input.saturating_sub(prev_cli_input);
            let delta_cached = cli_cached.saturating_sub(prev_cli_cached);
            let delta_output = cli_output.saturating_sub(prev_cli_output);
            let delta_reasoning = cli_reasoning.saturating_sub(prev_cli_reasoning);
            let delta_total = cli_total.saturating_sub(prev_cli_total);

            // 更新前一回合狀態
            prev_cli_input = cli_input;
            prev_cli_cached = cli_cached;
            prev_cli_output = cli_output;
            prev_cli_reasoning = cli_reasoning;
            prev_cli_total = cli_total;

            let turn_tokens = crate::TokenStats {
                input: cli_input,
                output: cli_output,
                cache_read: Some(cli_cached),
                cache_write: None,
                reasoning: Some(cli_reasoning),
                total: cli_total,
            };

            let turn_delta = crate::TokenStats {
                input: delta_input,
                output: delta_output,
                cache_read: Some(delta_cached),
                cache_write: None,
                reasoning: Some(delta_reasoning),
                total: delta_total,
            };

            let cost = if td.duration_ms.is_some() {
                Some(crate::CostStats {
                    total_api_duration_ms: td.duration_ms.map(|d| d as f64),
                    total_duration_ms: None,
                    total_premium_requests: Some(0.0),
                })
            } else {
                None
            };

            results.push(crate::UsageEntry {
                timestamp: td.timestamp.clone(),
                session_id: session_id.to_string(),
                session_name: Some(session_name.to_string()),
                transcript_path: Some(filepath.to_string_lossy().into_owned()),
                cwd: td.cwd.clone().or_else(|| session_meta_cwd.clone()),
                version: cli_version.clone(),
                turn_no: td.turn_no,
                model: td.model.clone(),
                model_id: td.model.clone(),
                tokens: Some(turn_tokens),
                delta_tokens: Some(turn_delta),
                context: None,
                cost,
                parent_session_id: parent_session_id.clone(),
                agent_nickname: agent_nickname.clone(),
                agent_role: agent_role.clone(),
            });
        }
    }

    Ok(results)
}

/// 增量同步使用量日誌檔到 SQLite 中
pub fn sync_usage_logs(conn: &Connection) -> Result<(), String> {
    let codex_dir = get_codex_dir()?;
    let sessions_dir = codex_dir.join("sessions");
    if !sessions_dir.exists() {
        return Ok(());
    }

    let files = find_session_files(&sessions_dir);

    for filepath in files {
        let filename = match filepath.file_name().and_then(|f| f.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        let (session_id, session_date, session_name) = match parse_filename(&filename) {
            Some(res) => res,
            None => continue,
        };

        // 查詢該檔案上一次同步時的大小
        let last_synced_size: u64 = conn
            .query_row(
                "SELECT last_synced_size FROM sync_state WHERE filename = ?",
                params![filename],
                |row| row.get(0),
            )
            .unwrap_or(0u64);

        let metadata = match fs::metadata(&filepath) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let current_size = metadata.len();

        // 若檔案被截斷或重置，或大小增加，則進行同步
        if current_size != last_synced_size {
            let parsed_entries = match parse_session_file(&filepath, &session_id, &session_name, &session_date) {
                Ok(entries) => entries,
                Err(e) => {
                    eprintln!("解析會話檔案 {} 失敗: {}", filename, e);
                    continue;
                }
            };

            // 啟動交易以確保資料庫完整性
            conn.execute("BEGIN TRANSACTION", []).map_err(|e| format!("Transaction BEGIN 失敗: {}", e))?;

            // 使用 DELETE-INSERT 模式：先清空舊的 Session 回合資料，再重新寫入
            let delete_res = conn.execute(
                "DELETE FROM usage_entries WHERE session_id = ?",
                params![session_id],
            );

            if let Err(e) = delete_res {
                eprintln!("清空舊 Session 資料失敗: {}", e);
                let _ = conn.execute("ROLLBACK TRANSACTION", []);
                continue;
            }

            let mut success = true;
            for entry in &parsed_entries {
                let tokens = entry.tokens.as_ref();
                let delta = entry.delta_tokens.as_ref();
                let cost = entry.cost.as_ref();

                let insert_res = conn.execute(
                    "INSERT INTO usage_entries (
                        timestamp, date, session_id, session_name, transcript_path, cwd, version, turn_no, model, model_id,
                        tokens_input, tokens_output, tokens_cache_read, tokens_reasoning, tokens_total,
                        delta_input, delta_output, delta_cache_read, delta_reasoning, delta_total,
                        duration_ms, premium_requests, parent_session_id, agent_nickname, agent_role
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    params![
                        entry.timestamp,
                        session_date,
                        entry.session_id,
                        entry.session_name.as_deref(),
                        entry.transcript_path.as_deref(),
                        entry.cwd.as_deref(),
                        entry.version.as_deref(),
                        entry.turn_no as i64,
                        entry.model.as_deref(),
                        entry.model_id.as_deref(),
                        tokens.map(|t| t.input as i64),
                        tokens.map(|t| t.output as i64),
                        tokens.and_then(|t| t.cache_read.map(|v| v as i64)),
                        tokens.and_then(|t| t.reasoning.map(|v| v as i64)),
                        tokens.map(|t| t.total as i64),
                        delta.map(|t| t.input as i64),
                        delta.map(|t| t.output as i64),
                        delta.and_then(|t| t.cache_read.map(|v| v as i64)),
                        delta.and_then(|t| t.reasoning.map(|v| v as i64)),
                        delta.map(|t| t.total as i64),
                        cost.and_then(|c| c.total_api_duration_ms.map(|d| d as i64)),
                        cost.and_then(|c| c.total_premium_requests.map(|r| r as i64)),
                        entry.parent_session_id.as_deref(),
                        entry.agent_nickname.as_deref(),
                        entry.agent_role.as_deref()
                    ],
                );

                if let Err(e) = insert_res {
                    eprintln!("寫入資料庫失敗 (turn_no {}): {}", entry.turn_no, e);
                    success = false;
                    break;
                }
            }

            if success {
                let now = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;

                let update_state_res = conn.execute(
                    "INSERT OR REPLACE INTO sync_state (filename, last_synced_size, last_synced_time) VALUES (?, ?, ?)",
                    params![filename, current_size as i64, now],
                );

                if update_state_res.is_ok() {
                    if let Err(e) = conn.execute("COMMIT TRANSACTION", []) {
                        eprintln!("Transaction COMMIT 失敗: {}", e);
                        let _ = conn.execute("ROLLBACK TRANSACTION", []);
                    }
                } else {
                    let _ = conn.execute("ROLLBACK TRANSACTION", []);
                }
            } else {
                let _ = conn.execute("ROLLBACK TRANSACTION", []);
            }
        }
    }

    Ok(())
}
