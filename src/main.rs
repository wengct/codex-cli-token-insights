use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader},
    path::PathBuf,
};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use rusqlite::params;

mod db;

#[tokio::main]
async fn main() {
    // 初始化 SQLite 資料庫並進行第一次增量同步
    if let Ok(conn) = db::get_db_conn() {
        if let Err(e) = db::init_db(&conn) {
            eprintln!("❌ 初始化 SQLite 資料庫失敗: {}", e);
        } else if let Err(e) = db::sync_usage_logs(&conn) {
            eprintln!("❌ 初次同步日誌檔到 SQLite 失敗: {}", e);
        } else {
            println!("✅ SQLite 資料庫已成功載入並完成增量同步！");
        }
    } else {
        eprintln!("❌ 無法連結到 SQLite 資料庫，請檢查 ~/.codex 是否存在或設定 CODEX_DIR");
    }

    // 建立 Axum 路由
    let app = Router::new()
        .route("/api/dates", get(get_available_dates))
        .route("/api/setup-info", get(get_setup_info))
        .route("/api/usage/:date", get(get_usage_details))
        .route("/api/session/:session_id", get(get_session_details))
        .route("/api/months", get(get_available_months))
        .route("/api/monthly/:year_month", get(get_monthly_details))
        .route("/api/pricing", get(get_pricing))
        .route("/api/sync", get(trigger_manual_sync))
        .nest_service("/static", ServeDir::new("static"))
        .fallback_service(ServeDir::new("static"))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    println!("🚀 Codex CLI Token Insights Dashboard is running on: http://localhost:3001");
    
    axum::serve(listener, app).await.unwrap();
}

/// 獲取 .codex 的基準路徑
fn get_codex_dir() -> Result<PathBuf, String> {
    if let Ok(val) = std::env::var("CODEX_DIR") {
        let p = PathBuf::from(val);
        if p.exists() {
            return Ok(p);
        }
    }

    if let Some(home) = dirs::home_dir() {
        let p = home.join(".codex");
        if p.exists() {
            return Ok(p);
        }
    }

    let backup = PathBuf::from("/home/chenting/.codex");
    if backup.exists() {
        return Ok(backup);
    }

    Err("無法定位 .codex 資料夾，請設定 CODEX_DIR 環境變數。".to_string())
}

#[derive(Serialize)]
struct SetupInfoResponse {
    workspace_dir: String,
    script_path: String,
    codex_dir: String,
    codex_dir_exists: bool,
    home_dir: String,
}

async fn get_setup_info() -> impl IntoResponse {
    let workspace_dir = match std::env::current_dir() {
        Ok(dir) => dir.to_string_lossy().into_owned(),
        Err(_) => "".to_string(),
    };

    let codex_dir_path = get_codex_dir();
    let (codex_dir_str, codex_dir_exists) = match &codex_dir_path {
        Ok(p) => (p.to_string_lossy().into_owned(), p.exists()),
        Err(_) => ("".to_string(), false),
    };

    let home_dir_str = dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    Json(SetupInfoResponse {
        workspace_dir,
        script_path: "".to_string(),
        codex_dir: codex_dir_str,
        codex_dir_exists,
        home_dir: home_dir_str,
    })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct TokenStats {
    input: u64,
    output: u64,
    cache_read: Option<u64>,
    cache_write: Option<u64>,
    reasoning: Option<u64>,
    total: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ContextStats {
    current_context_tokens: Option<u64>,
    displayed_context_limit: Option<u64>,
    current_context_used_percentage: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CostStats {
    total_api_duration_ms: Option<f64>,
    total_duration_ms: Option<f64>,
    total_premium_requests: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct UsageEntry {
    timestamp: String,
    session_id: String,
    session_name: Option<String>,
    transcript_path: Option<String>,
    cwd: Option<String>,
    version: Option<String>,
    turn_no: u32,
    model: Option<String>,
    model_id: Option<String>,
    tokens: Option<TokenStats>,
    delta_tokens: Option<TokenStats>,
    context: Option<ContextStats>,
    cost: Option<CostStats>,
}

#[derive(Serialize)]
struct UsageDetailsResponse {
    date: String,
    summary: DaySummary,
    sessions: Vec<SessionSummary>,
    raw_entries: Vec<UsageEntry>,
}

#[derive(Debug, Clone)]
struct PricingRule {
    model_name: String,
    input_price: f64,       // USD per 1M tokens (uncached)
    cache_input_price: f64, // USD per 1M tokens
    output_price: f64,      // USD per 1M tokens
}

#[derive(Serialize)]
struct PricingEntry {
    model_name: String,
    deployment_type: String,
    unit: String,
    input_price: f64,
    cache_input_price: f64,
    output_price: f64,
    batch_api_price: String,
}

fn load_pricing_rules() -> Vec<PricingRule> {
    let mut rules = Vec::new();
    let file_path = PathBuf::from("pricing.csv");
    if let Ok(file) = File::open(&file_path) {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        if let Some(Ok(_header)) = lines.next() {
            for line in lines.flatten() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 6 {
                    let name = parts[0].trim().to_string();
                    let input_p: f64 = parts[3].trim().parse().unwrap_or(0.0);
                    let cache_p: f64 = parts[4].trim().parse().unwrap_or(0.0);
                    let output_p: f64 = parts[5].trim().parse().unwrap_or(0.0);
                    rules.push(PricingRule {
                        model_name: name,
                        input_price: input_p,
                        cache_input_price: cache_p,
                        output_price: output_p,
                    });
                }
            }
        }
    }
    if rules.is_empty() {
        rules = vec![
            PricingRule { model_name: "GPT-5.5".to_string(), input_price: 5.0, cache_input_price: 0.50, output_price: 30.0 },
            PricingRule { model_name: "GPT-5.4 (<272k)".to_string(), input_price: 2.50, cache_input_price: 0.25, output_price: 15.0 },
            PricingRule { model_name: "GPT-5.4 (>272k)".to_string(), input_price: 5.0, cache_input_price: 0.50, output_price: 22.50 },
            PricingRule { model_name: "GPT-5.4-mini".to_string(), input_price: 0.75, cache_input_price: 0.08, output_price: 4.50 },
            PricingRule { model_name: "GPT-5.3-Codex".to_string(), input_price: 1.75, cache_input_price: 0.18, output_price: 14.0 },
        ];
    }
    rules
}

fn calculate_cost(rules: &[PricingRule], model_name: &str, uncached_input_tokens: u64, output_tokens: u64, cache_read_tokens: u64) -> f64 {
    let model = model_name.to_lowercase();
    let mut selected_rule = None;

    if model.contains("gpt-5.5") {
        selected_rule = rules.iter().find(|r| r.model_name.to_lowercase().contains("gpt-5.5"));
    } else if model.contains("gpt-5.4-mini") || model.contains("gpt-5.4 mini") {
        selected_rule = rules.iter().find(|r| r.model_name.to_lowercase().contains("gpt-5.4-mini"));
    } else if model.contains("gpt-5.4") {
        let total_input = uncached_input_tokens + cache_read_tokens;
        if total_input > 272_000 {
            selected_rule = rules.iter().find(|r| r.model_name.contains(">272k"));
        } else {
            selected_rule = rules.iter().find(|r| r.model_name.contains("<272k"));
        }
        if selected_rule.is_none() {
            selected_rule = rules.iter().find(|r| r.model_name.to_lowercase().contains("gpt-5.4"));
        }
    } else if model.contains("gpt-5.3-codex") || model.contains("gpt-5.3") {
        selected_rule = rules.iter().find(|r| r.model_name.to_lowercase().contains("gpt-5.3"));
    }

    let rule = selected_rule.unwrap_or_else(|| {
        rules.iter().find(|r| r.model_name.to_lowercase().contains("gpt-5.3"))
            .unwrap_or(&rules[rules.len() - 1])
    });

    (uncached_input_tokens as f64 * rule.input_price 
        + cache_read_tokens as f64 * rule.cache_input_price 
        + output_tokens as f64 * rule.output_price) / 1_000_000.0
}

async fn get_pricing() -> impl IntoResponse {
    let file_path = PathBuf::from("pricing.csv");
    let mut entries = Vec::new();
    if let Ok(file) = File::open(&file_path) {
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        if let Some(Ok(_header)) = lines.next() {
            for line in lines.flatten() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 7 {
                    entries.push(PricingEntry {
                        model_name: parts[0].trim().to_string(),
                        deployment_type: parts[1].trim().to_string(),
                        unit: parts[2].trim().to_string(),
                        input_price: parts[3].trim().parse().unwrap_or(0.0),
                        cache_input_price: parts[4].trim().parse().unwrap_or(0.0),
                        output_price: parts[5].trim().parse().unwrap_or(0.0),
                        batch_api_price: parts[6].trim().to_string(),
                    });
                }
            }
        }
    }
    if entries.is_empty() {
        let rules = load_pricing_rules();
        for r in rules {
            entries.push(PricingEntry {
                model_name: r.model_name.clone(),
                deployment_type: "Global".to_string(),
                unit: "1M Tokens".to_string(),
                input_price: r.input_price,
                cache_input_price: r.cache_input_price,
                output_price: r.output_price,
                batch_api_price: "N/A".to_string(),
            });
        }
    }
    Json(entries)
}

#[derive(Serialize)]
struct DateListResponse {
    dates: Vec<String>,
}

async fn get_available_dates() -> impl IntoResponse {
    let _ = tokio::task::spawn_blocking(|| {
        if let Ok(conn) = db::get_db_conn() {
            let _ = db::sync_usage_logs(&conn);
        }
    }).await;

    let res: Result<Vec<String>, String> = tokio::task::spawn_blocking(|| {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare("SELECT DISTINCT date FROM usage_entries ORDER BY date DESC")
            .map_err(|e| e.to_string())?;
        let dates_iter = stmt.query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut dates = Vec::new();
        for d in dates_iter {
            if let Ok(date) = d {
                dates.push(date);
            }
        }
        Ok(dates)
    }).await.unwrap_or_else(|_| Err("執行緒執行失敗".to_string()));

    match res {
        Ok(dates) => Json(DateListResponse { dates }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e }))).into_response(),
    }
}

#[derive(Serialize)]
struct DaySummary {
    total_sessions: usize,
    total_tokens: u64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_reasoning_tokens: u64,
    total_cache_read_tokens: u64,
    total_duration_ms: u64,
    total_requests: u64,
    total_cost_usd: f64,
}

impl Default for DaySummary {
    fn default() -> Self {
        DaySummary {
            total_sessions: 0,
            total_tokens: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_reasoning_tokens: 0,
            total_cache_read_tokens: 0,
            total_duration_ms: 0,
            total_requests: 0,
            total_cost_usd: 0.0,
        }
    }
}

#[derive(Serialize)]
struct SessionSummary {
    session_id: String,
    session_name: String,
    cwd: String,
    model: String,
    total_tokens: u64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_read_tokens: u64,
    total_reasoning_tokens: u64,
    max_turn_no: u32,
    timestamp: String,
    duration_ms: u64,
    cost_usd: f64,
}

async fn get_usage_details(Path(date): Path<String>) -> impl IntoResponse {
    let _ = tokio::task::spawn_blocking(|| {
        if let Ok(conn) = db::get_db_conn() {
            let _ = db::sync_usage_logs(&conn);
        }
    }).await;

    let date_clone = date.clone();
    let entries_res: Result<Vec<UsageEntry>, String> = tokio::task::spawn_blocking(move || {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare(
            "SELECT 
                timestamp, session_id, session_name, transcript_path, cwd, version, turn_no, model, model_id,
                tokens_input, tokens_output, tokens_cache_read, tokens_reasoning, tokens_total,
                delta_input, delta_output, delta_cache_read, delta_reasoning, delta_total,
                duration_ms, premium_requests
             FROM usage_entries WHERE date = ? ORDER BY timestamp ASC"
        ).map_err(|e| e.to_string())?;

        let entries_iter = stmt.query_map(params![date_clone], |row| {
            let tokens_input: Option<u64> = row.get::<_, Option<i64>>(9)?.map(|v| v as u64);
            let tokens_output: Option<u64> = row.get::<_, Option<i64>>(10)?.map(|v| v as u64);
            let tokens_cache_read: Option<u64> = row.get::<_, Option<i64>>(11)?.map(|v| v as u64);
            let tokens_reasoning: Option<u64> = row.get::<_, Option<i64>>(12)?.map(|v| v as u64);
            let tokens_total: Option<u64> = row.get::<_, Option<i64>>(13)?.map(|v| v as u64);

            let tokens = if let (Some(input), Some(output), Some(total)) = (tokens_input, tokens_output, tokens_total) {
                Some(TokenStats {
                    input,
                    output,
                    cache_read: tokens_cache_read,
                    cache_write: None,
                    reasoning: tokens_reasoning,
                    total,
                })
            } else {
                None
            };

            let delta_input: Option<u64> = row.get::<_, Option<i64>>(14)?.map(|v| v as u64);
            let delta_output: Option<u64> = row.get::<_, Option<i64>>(15)?.map(|v| v as u64);
            let delta_cache_read: Option<u64> = row.get::<_, Option<i64>>(16)?.map(|v| v as u64);
            let delta_reasoning: Option<u64> = row.get::<_, Option<i64>>(17)?.map(|v| v as u64);
            let delta_total: Option<u64> = row.get::<_, Option<i64>>(18)?.map(|v| v as u64);

            let delta_tokens = if let (Some(input), Some(output), Some(total)) = (delta_input, delta_output, delta_total) {
                Some(TokenStats {
                    input,
                    output,
                    cache_read: delta_cache_read,
                    cache_write: None,
                    reasoning: delta_reasoning,
                    total,
                })
            } else {
                None
            };

            let duration_ms: Option<f64> = row.get::<_, Option<i64>>(19)?.map(|v| v as f64);
            let premium_requests: Option<f64> = row.get::<_, Option<i64>>(20)?.map(|v| v as f64);

            let cost = if duration_ms.is_some() || premium_requests.is_some() {
                Some(CostStats {
                    total_api_duration_ms: duration_ms,
                    total_duration_ms: None,
                    total_premium_requests: premium_requests,
                })
            } else {
                None
            };

            Ok(UsageEntry {
                timestamp: row.get(0)?,
                session_id: row.get(1)?,
                session_name: row.get(2).ok(),
                transcript_path: row.get(3).ok(),
                cwd: row.get(4).ok(),
                version: row.get(5).ok(),
                turn_no: row.get::<_, i64>(6)? as u32,
                model: row.get(7).ok(),
                model_id: row.get(8).ok(),
                tokens,
                delta_tokens,
                context: None,
                cost,
            })
        }).map_err(|e| e.to_string())?;

        let mut entries = Vec::new();
        for entry in entries_iter {
            if let Ok(e) = entry {
                entries.push(e);
            }
        }
        Ok(entries)
    }).await.unwrap_or_else(|_| Err("執行緒執行失敗".to_string()));

    let entries = match entries_res {
        Ok(e) => e,
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": err }))).into_response(),
    };

    if entries.is_empty() {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "找不到指定日期的使用日誌。" }))).into_response();
    }

    let mut summary = DaySummary::default();
    let mut sessions_map: HashMap<String, Vec<UsageEntry>> = HashMap::new();

    for entry in &entries {
        if let Some(ref tokens) = entry.delta_tokens {
            summary.total_tokens += tokens.total;
            summary.total_input_tokens += tokens.input;
            summary.total_output_tokens += tokens.output;
            summary.total_reasoning_tokens += tokens.reasoning.unwrap_or(0);
            summary.total_cache_read_tokens += tokens.cache_read.unwrap_or(0);
        } else if let Some(ref tokens) = entry.tokens {
            if entry.turn_no == 1 {
                summary.total_tokens += tokens.total;
                summary.total_input_tokens += tokens.input;
                summary.total_output_tokens += tokens.output;
                summary.total_reasoning_tokens += tokens.reasoning.unwrap_or(0);
                summary.total_cache_read_tokens += tokens.cache_read.unwrap_or(0);
            }
        }

        let sid = entry.session_id.clone();
        sessions_map.entry(sid).or_default().push(entry.clone());
    }

    summary.total_sessions = sessions_map.len();
    let pricing_rules = load_pricing_rules();
    let mut sessions_summary = Vec::new();

    for (session_id, s_entries) in sessions_map {
        let last_entry = s_entries
            .iter()
            .max_by_key(|e| e.turn_no)
            .cloned()
            .unwrap_or_else(|| s_entries[0].clone());

        let session_tokens = s_entries
            .iter()
            .map(|e| e.delta_tokens.as_ref().map(|t| t.total).unwrap_or(0))
            .sum::<u64>();

        let session_input_tokens = s_entries
            .iter()
            .map(|e| e.delta_tokens.as_ref().map(|t| t.input).unwrap_or(0))
            .sum::<u64>();

        let session_output_tokens = s_entries
            .iter()
            .map(|e| e.delta_tokens.as_ref().map(|t| t.output).unwrap_or(0))
            .sum::<u64>();

        let session_cache_read = s_entries
            .iter()
            .map(|e| e.delta_tokens.as_ref().and_then(|t| t.cache_read).unwrap_or(0))
            .sum::<u64>();

        let session_reasoning = s_entries
            .iter()
            .map(|e| e.delta_tokens.as_ref().and_then(|t| t.reasoning).unwrap_or(0))
            .sum::<u64>();

        let session_duration = last_entry
            .cost
            .as_ref()
            .and_then(|c| c.total_api_duration_ms)
            .unwrap_or(0.0) as u64;

        let session_requests = s_entries.len() as u64;

        summary.total_duration_ms += session_duration;
        summary.total_requests += session_requests;

        let total_cache_read_tokens = if session_tokens > 0 {
            session_cache_read
        } else {
            last_entry.tokens.as_ref().and_then(|t| t.cache_read).unwrap_or(0)
        };

        let total_reasoning_tokens = if session_tokens > 0 {
            session_reasoning
        } else {
            last_entry.tokens.as_ref().and_then(|t| t.reasoning).unwrap_or(0)
        };

        let total_input_tokens = if session_tokens > 0 { session_input_tokens } else { last_entry.tokens.as_ref().map(|t| t.input).unwrap_or(0) };
        let total_output_tokens = if session_tokens > 0 { session_output_tokens } else { last_entry.tokens.as_ref().map(|t| t.output).unwrap_or(0) };

        let cost_usd = calculate_cost(
            &pricing_rules,
            &last_entry.model.clone().unwrap_or_else(|| "Unknown Model".to_string()),
            total_input_tokens,
            total_output_tokens,
            total_cache_read_tokens,
        );
        summary.total_cost_usd += cost_usd;

        sessions_summary.push(SessionSummary {
            session_id,
            session_name: last_entry.session_name.unwrap_or_else(|| "Start Coding Session".to_string()),
            cwd: last_entry.cwd.unwrap_or_default(),
            model: last_entry.model.unwrap_or_else(|| "Unknown Model".to_string()),
            total_tokens: if session_tokens > 0 { session_tokens } else { last_entry.tokens.as_ref().map(|t| t.total).unwrap_or(0) },
            total_input_tokens,
            total_output_tokens,
            total_cache_read_tokens,
            total_reasoning_tokens,
            max_turn_no: s_entries.iter().map(|e| e.turn_no).max().unwrap_or(1),
            timestamp: s_entries[0].timestamp.clone(),
            duration_ms: session_duration,
            cost_usd,
        });
    }

    sessions_summary.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Json(UsageDetailsResponse {
        date,
        summary,
        sessions: sessions_summary,
        raw_entries: entries,
    }).into_response()
}

#[derive(Serialize)]
struct SessionTimelineResponse {
    session_id: String,
    metadata: HashMap<String, serde_json::Value>,
    timeline: Vec<TimelineItem>,
}

#[derive(Serialize)]
#[serde(tag = "event_type", content = "event_data")]
enum TimelineItem {
    UserPrompt {
        timestamp: String,
        prompt: String,
        transformed_prompt: Option<String>,
        attachments: Vec<serde_json::Value>,
        turn_no: u32,
    },
    AssistantReply {
        timestamp: String,
        reply: String,
        model: String,
        output_tokens: Option<u64>,
        input_tokens: Option<u64>,
        cache_read_tokens: Option<u64>,
        cache_write_tokens: Option<u64>,
        reasoning_tokens: Option<u64>,
        total_tokens: Option<u64>,
        tool_requests: Vec<serde_json::Value>,
        turn_no: u32,
    },
    ToolStep {
        timestamp: String,
        tool_name: String,
        arguments: serde_json::Value,
        result: Option<serde_json::Value>,
        turn_no: u32,
    },
    SystemStatus {
        timestamp: String,
        status_type: String,
        message: String,
    },
}

async fn get_session_details(Path(session_id): Path<String>) -> impl IntoResponse {
    let _ = tokio::task::spawn_blocking(|| {
        if let Ok(conn) = db::get_db_conn() {
            let _ = db::sync_usage_logs(&conn);
        }
    }).await;

    // 從資料庫中查尋 rollout 檔案的絕對路徑
    let session_id_clone = session_id.clone();
    let file_info_res: Result<(String, String), String> = tokio::task::spawn_blocking(move || {
        let conn = db::get_db_conn()?;
        conn.query_row(
            "SELECT DISTINCT transcript_path, session_name FROM usage_entries WHERE session_id = ? LIMIT 1",
            params![session_id_clone],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        ).map_err(|e| e.to_string())
    }).await.unwrap_or_else(|_| Err("執行緒執行失敗".to_string()));

    let (filepath_str, session_name) = match file_info_res {
        Ok(p) => p,
        Err(_) => {
            return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": format!("找不到 Session {} 的檔案路徑。", session_id) }))).into_response();
        }
    };

    let filepath = PathBuf::from(filepath_str);
    if !filepath.exists() {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": format!("檔案不存在: {:?}", filepath) }))).into_response();
    }

    let file = match File::open(&filepath) {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("開啟檔案失敗: {}", e) }))).into_response(),
    };

    // 從資料庫加載該 Session 每回合的 Token 增量 (delta_tokens) 統計
    let session_id_clone = session_id.clone();
    let db_entries: HashMap<u32, TokenStats> = tokio::task::spawn_blocking(move || {
        let mut map = HashMap::new();
        if let Ok(conn) = db::get_db_conn() {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT turn_no, delta_input, delta_output, delta_cache_read, delta_reasoning, delta_total 
                 FROM usage_entries WHERE session_id = ? ORDER BY turn_no ASC"
            ) {
                if let Ok(mut rows) = stmt.query(params![session_id_clone]) {
                    while let Ok(Some(row)) = rows.next() {
                        if let (Ok(turn_no), Ok(delta_input), Ok(delta_output), Ok(delta_total)) = (
                            row.get::<_, i64>(0),
                            row.get::<_, Option<i64>>(1),
                            row.get::<_, Option<i64>>(2),
                            row.get::<_, Option<i64>>(5)
                        ) {
                            if let (Some(input), Some(output), Some(total)) = (delta_input, delta_output, delta_total) {
                                let cache_read = row.get::<_, Option<i64>>(3).ok().flatten().map(|v| v as u64);
                                let reasoning = row.get::<_, Option<i64>>(4).ok().flatten().map(|v| v as u64);
                                map.insert(turn_no as u32, TokenStats {
                                    input: input as u64,
                                    output: output as u64,
                                    cache_read,
                                    cache_write: None,
                                    reasoning,
                                    total: total as u64,
                                });
                            }
                        }
                    }
                }
            }
        }
        map
    }).await.unwrap_or_default();

    let reader = BufReader::new(file);
    let mut timeline = Vec::new();
    let mut metadata = HashMap::new();

    let mut total_in = 0;
    let mut total_out = 0;
    let mut total_cache = 0;
    let mut total_reasoning = 0;
    let mut total_all = 0;
    let compaction_count = 0;

    let mut tool_calls_map: HashMap<String, usize> = HashMap::new();
    let mut seen_turn_ids: Vec<String> = Vec::new();
    let mut active_turn_id: Option<String> = None;
    let mut current_model = "gpt-5.3-Codex".to_string();

    metadata.insert("selected_model".to_string(), serde_json::Value::String(current_model.clone()));
    metadata.insert("start_time".to_string(), serde_json::Value::String(session_name.clone()));

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
            }
        }

        let turn_no = active_turn_id.as_ref()
            .and_then(|tid| seen_turn_ids.iter().position(|id| id == tid))
            .map(|pos| (pos + 1) as u32)
            .unwrap_or(1);

        match event_type {
            "session_meta" => {
                if let Some(p) = payload {
                    if let Some(v) = p.get("cli_version") {
                        metadata.insert("copilot_version".to_string(), v.clone());
                    }
                    if let Some(cwd) = p.get("cwd") {
                        metadata.insert("cwd".to_string(), cwd.clone());
                    }
                    if let Some(git) = p.get("git") {
                        if let Some(branch) = git.get("branch") {
                            metadata.insert("git_branch".to_string(), branch.clone());
                        }
                        if let Some(repo) = git.get("repository_url") {
                            metadata.insert("repository".to_string(), repo.clone());
                        }
                    }
                }
                timeline.push(TimelineItem::SystemStatus {
                    timestamp,
                    status_type: "session_start".to_string(),
                    message: "會話開始 (Session Started)".to_string(),
                });
            }
            "turn_context" => {
                if let Some(p) = payload {
                    if let Some(m) = p.get("model").and_then(|v| v.as_str()) {
                        current_model = m.to_string();
                        metadata.insert("selected_model".to_string(), serde_json::Value::String(current_model.clone()));
                    }
                }
            }
            "event_msg" => {
                if let Some(p) = payload {
                    let sub_type = p.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    match sub_type {
                        "task_started" => {
                            timeline.push(TimelineItem::SystemStatus {
                                timestamp,
                                status_type: "task_started".to_string(),
                                message: "任務開始 (Task Started)".to_string(),
                            });
                        }
                        "task_complete" => {
                            timeline.push(TimelineItem::SystemStatus {
                                timestamp,
                                status_type: "task_complete".to_string(),
                                message: "任務完成 (Task Completed)".to_string(),
                            });
                        }
                        "turn_aborted" => {
                            timeline.push(TimelineItem::SystemStatus {
                                timestamp,
                                status_type: "turn_aborted".to_string(),
                                message: "會話中斷 (Turn Aborted)".to_string(),
                            });
                        }
                        "thread_rolled_back" => {
                            timeline.push(TimelineItem::SystemStatus {
                                timestamp,
                                status_type: "thread_rolled_back".to_string(),
                                message: "會話回滾 (Thread Rolled Back)".to_string(),
                            });
                        }
                        _ => {}
                    }
                }
            }
            "response_item" => {
                if let Some(p) = payload {
                    let sub_type = p.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    let role = p.get("role").and_then(|r| r.as_str()).unwrap_or("");

                    if role == "user" {
                        let mut prompt = String::new();
                        if let Some(content_arr) = p.get("content").and_then(|c| c.as_array()) {
                            for block in content_arr {
                                if block.get("type").and_then(|t| t.as_str()) == Some("input_text") {
                                    if let Some(txt) = block.get("text").and_then(|t| t.as_str()) {
                                        prompt.push_str(txt);
                                    }
                                }
                            }
                        }
                        timeline.push(TimelineItem::UserPrompt {
                            timestamp,
                            prompt,
                            transformed_prompt: None,
                            attachments: Vec::new(),
                            turn_no,
                        });
                    } else if role == "assistant" {
                        let mut reply = String::new();
                        if let Some(content_arr) = p.get("content").and_then(|c| c.as_array()) {
                            for block in content_arr {
                                if block.get("type").and_then(|t| t.as_str()) == Some("output_text") {
                                    if let Some(txt) = block.get("text").and_then(|t| t.as_str()) {
                                        reply.push_str(txt);
                                    }
                                }
                            }
                        }
                        if let Some(m) = p.get("model").and_then(|v| v.as_str()) {
                            current_model = m.to_string();
                        }

                        // 從 DB 讀取補齊
                        let mut input_tokens = None;
                        let mut output_tokens = None;
                        let mut cache_read_tokens = None;
                        let mut reasoning_tokens = None;
                        let mut total_tokens = None;

                        if let Some(db_stats) = db_entries.get(&turn_no) {
                            input_tokens = Some(db_stats.input);
                            output_tokens = Some(db_stats.output);
                            cache_read_tokens = db_stats.cache_read;
                            reasoning_tokens = db_stats.reasoning;
                            total_tokens = Some(db_stats.total);

                            total_in += db_stats.input;
                            total_out += db_stats.output;
                            total_cache += db_stats.cache_read.unwrap_or(0);
                            total_reasoning += db_stats.reasoning.unwrap_or(0);
                            total_all += db_stats.total;
                        }

                        timeline.push(TimelineItem::AssistantReply {
                            timestamp,
                            reply,
                            model: current_model.clone(),
                            output_tokens,
                            input_tokens,
                            cache_read_tokens,
                            cache_write_tokens: None,
                            reasoning_tokens,
                            total_tokens,
                            tool_requests: Vec::new(),
                            turn_no,
                        });
                    } else if sub_type == "function_call" || sub_type == "custom_tool_call" {
                        let tool_name = p.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                        let call_id = p.get("call_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        
                        let arguments = if sub_type == "function_call" {
                            if let Some(args_str) = p.get("arguments").and_then(|a| a.as_str()) {
                                serde_json::from_str(args_str).unwrap_or(serde_json::Value::String(args_str.to_string()))
                            } else {
                                serde_json::Value::Null
                            }
                        } else {
                            // custom_tool_call
                            if let Some(inp) = p.get("input") {
                                serde_json::json!({ "input": inp })
                            } else {
                                serde_json::Value::Null
                            }
                        };

                        let idx = timeline.len();
                        timeline.push(TimelineItem::ToolStep {
                            timestamp,
                            tool_name,
                            arguments,
                            result: None,
                            turn_no,
                        });

                        if !call_id.is_empty() {
                            tool_calls_map.insert(call_id, idx);
                        }
                    } else if sub_type == "function_call_output" || sub_type == "custom_tool_call_output" {
                        let call_id = p.get("call_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let output = p.get("output").and_then(|o| o.as_str()).unwrap_or("").to_string();

                        if let Some(&idx) = tool_calls_map.get(&call_id) {
                            if idx < timeline.len() {
                                if let TimelineItem::ToolStep { result: ref mut res, .. } = &mut timeline[idx] {
                                    *res = Some(serde_json::json!({ "content": output }));
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    metadata.insert("total_input_tokens".to_string(), serde_json::Value::from(total_in));
    metadata.insert("total_output_tokens".to_string(), serde_json::Value::from(total_out));
    metadata.insert("total_cache_read_tokens".to_string(), serde_json::Value::from(total_cache));
    metadata.insert("total_reasoning_tokens".to_string(), serde_json::Value::from(total_reasoning));
    metadata.insert("total_tokens".to_string(), serde_json::Value::from(total_all));
    metadata.insert("compaction_count".to_string(), serde_json::Value::from(compaction_count));

    Json(SessionTimelineResponse {
        session_id,
        metadata,
        timeline,
    }).into_response()
}

#[derive(Serialize)]
struct MonthListResponse {
    months: Vec<String>,
}

async fn get_available_months() -> impl IntoResponse {
    let _ = tokio::task::spawn_blocking(|| {
        if let Ok(conn) = db::get_db_conn() {
            let _ = db::sync_usage_logs(&conn);
        }
    }).await;

    let res: Result<Vec<String>, String> = tokio::task::spawn_blocking(|| {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare("SELECT DISTINCT substr(date, 1, 7) AS month FROM usage_entries ORDER BY month DESC")
            .map_err(|e| e.to_string())?;
        
        let months_iter = stmt.query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        
        let mut months = Vec::new();
        for m in months_iter {
            if let Ok(month) = m {
                months.push(month);
            }
        }
        Ok(months)
    }).await.unwrap_or_else(|_| Err("執行緒執行失敗".to_string()));

    match res {
        Ok(month_list) => Json(MonthListResponse { months: month_list }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e }))).into_response(),
    }
}

#[derive(Serialize)]
struct MonthlyDetailsResponse {
    year_month: String,
    summary: DaySummary,
    daily_breakdown: Vec<DailyBreakdownEntry>,
    top_models: Vec<ModelUsageSummary>,
    top_projects: Vec<ProjectUsageSummary>,
}

#[derive(Serialize, Clone)]
struct DailyBreakdownEntry {
    date: String,
    total_sessions: usize,
    total_tokens: u64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_read_tokens: u64,
    total_reasoning_tokens: u64,
    total_duration_ms: u64,
    total_requests: u64,
    cost_usd: f64,
}

#[derive(Serialize, Clone)]
struct ModelUsageSummary {
    model: String,
    session_count: usize,
    total_tokens: u64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_read_tokens: u64,
    cost_usd: f64,
}

#[derive(Serialize, Clone)]
struct ProjectUsageSummary {
    project: String,
    session_count: usize,
    total_tokens: u64,
    total_cache_read_tokens: u64,
}

async fn get_monthly_details(Path(year_month): Path<String>) -> impl IntoResponse {
    let _ = tokio::task::spawn_blocking(|| {
        if let Ok(conn) = db::get_db_conn() {
            let _ = db::sync_usage_logs(&conn);
        }
    }).await;

    let query_month = format!("{}-%", year_month);
    let entries_res: Result<Vec<UsageEntry>, String> = tokio::task::spawn_blocking(move || {
        let conn = db::get_db_conn()?;
        let mut stmt = conn.prepare(
            "SELECT 
                timestamp, session_id, session_name, transcript_path, cwd, version, turn_no, model, model_id,
                tokens_input, tokens_output, tokens_cache_read, tokens_reasoning, tokens_total,
                delta_input, delta_output, delta_cache_read, delta_reasoning, delta_total,
                duration_ms, premium_requests
             FROM usage_entries WHERE date LIKE ? ORDER BY timestamp ASC"
        ).map_err(|e| e.to_string())?;

        let entries_iter = stmt.query_map(params![query_month], |row| {
            let tokens_input: Option<u64> = row.get::<_, Option<i64>>(9)?.map(|v| v as u64);
            let tokens_output: Option<u64> = row.get::<_, Option<i64>>(10)?.map(|v| v as u64);
            let tokens_cache_read: Option<u64> = row.get::<_, Option<i64>>(11)?.map(|v| v as u64);
            let tokens_reasoning: Option<u64> = row.get::<_, Option<i64>>(12)?.map(|v| v as u64);
            let tokens_total: Option<u64> = row.get::<_, Option<i64>>(13)?.map(|v| v as u64);

            let tokens = if let (Some(input), Some(output), Some(total)) = (tokens_input, tokens_output, tokens_total) {
                Some(TokenStats {
                    input,
                    output,
                    cache_read: tokens_cache_read,
                    cache_write: None,
                    reasoning: tokens_reasoning,
                    total,
                })
            } else {
                None
            };

            let delta_input: Option<u64> = row.get::<_, Option<i64>>(14)?.map(|v| v as u64);
            let delta_output: Option<u64> = row.get::<_, Option<i64>>(15)?.map(|v| v as u64);
            let delta_cache_read: Option<u64> = row.get::<_, Option<i64>>(16)?.map(|v| v as u64);
            let delta_reasoning: Option<u64> = row.get::<_, Option<i64>>(17)?.map(|v| v as u64);
            let delta_total: Option<u64> = row.get::<_, Option<i64>>(18)?.map(|v| v as u64);

            let delta_tokens = if let (Some(input), Some(output), Some(total)) = (delta_input, delta_output, delta_total) {
                Some(TokenStats {
                    input,
                    output,
                    cache_read: delta_cache_read,
                    cache_write: None,
                    reasoning: delta_reasoning,
                    total,
                })
            } else {
                None
            };

            let duration_ms: Option<f64> = row.get::<_, Option<i64>>(19)?.map(|v| v as f64);
            let premium_requests: Option<f64> = row.get::<_, Option<i64>>(20)?.map(|v| v as f64);

            let cost = if duration_ms.is_some() || premium_requests.is_some() {
                Some(CostStats {
                    total_api_duration_ms: duration_ms,
                    total_duration_ms: None,
                    total_premium_requests: premium_requests,
                })
            } else {
                None
            };

            Ok(UsageEntry {
                timestamp: row.get(0)?,
                session_id: row.get(1)?,
                session_name: row.get(2).ok(),
                transcript_path: row.get(3).ok(),
                cwd: row.get(4).ok(),
                version: row.get(5).ok(),
                turn_no: row.get::<_, i64>(6)? as u32,
                model: row.get(7).ok(),
                model_id: row.get(8).ok(),
                tokens,
                delta_tokens,
                context: None,
                cost,
            })
        }).map_err(|e| e.to_string())?;

        let mut entries = Vec::new();
        for entry in entries_iter {
            if let Ok(e) = entry {
                entries.push(e);
            }
        }
        Ok(entries)
    }).await.unwrap_or_else(|_| Err("執行緒執行失敗".to_string()));

    let entries = match entries_res {
        Ok(e) => e,
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": err }))).into_response(),
    };

    if entries.is_empty() {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "找不到指定月份的使用日誌。" }))).into_response();
    }

    let mut monthly_summary = DaySummary::default();
    let mut daily_groups: HashMap<String, Vec<UsageEntry>> = HashMap::new();
    let mut model_sessions: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
    let mut model_tokens: HashMap<String, u64> = HashMap::new();
    let mut model_input_tokens: HashMap<String, u64> = HashMap::new();
    let mut model_output_tokens: HashMap<String, u64> = HashMap::new();
    let mut model_cache_tokens: HashMap<String, u64> = HashMap::new();
    let mut project_sessions: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
    let mut project_tokens: HashMap<String, u64> = HashMap::new();
    let mut project_cache_tokens: HashMap<String, u64> = HashMap::new();

    for entry in &entries {
        let date_str = entry.timestamp[0..10].to_string(); // YYYY-MM-DD
        daily_groups.entry(date_str).or_default().push(entry.clone());
    }

    let pricing_rules = load_pricing_rules();
    let mut daily_breakdown = Vec::new();
    let mut sorted_dates: Vec<String> = daily_groups.keys().cloned().collect();
    sorted_dates.sort();

    for date_str in sorted_dates {
        let entries_list = daily_groups.get(&date_str).unwrap();
        let mut day_sessions = std::collections::HashSet::new();
        let mut day_tokens = 0u64;
        let mut day_input = 0u64;
        let mut day_output = 0u64;
        let mut day_reasoning = 0u64;
        let mut day_cache_read = 0u64;
        let mut day_duration = 0u64;
        let mut day_requests = 0u64;

        for e in entries_list {
            let sid = e.session_id.clone();
            day_sessions.insert(sid.clone());

            let mut entry_tokens = 0;
            let mut entry_input = 0;
            let mut entry_output = 0;
            if let Some(ref tokens) = e.delta_tokens {
                entry_tokens = tokens.total;
                entry_input = tokens.input;
                entry_output = tokens.output;
                day_tokens += tokens.total;
                day_input += tokens.input;
                day_output += tokens.output;
                day_reasoning += tokens.reasoning.unwrap_or(0);
                day_cache_read += tokens.cache_read.unwrap_or(0);
            } else if let Some(ref tokens) = e.tokens {
                if e.turn_no == 1 {
                    entry_tokens = tokens.total;
                    entry_input = tokens.input;
                    entry_output = tokens.output;
                    day_tokens += tokens.total;
                    day_input += tokens.input;
                    day_output += tokens.output;
                    day_reasoning += tokens.reasoning.unwrap_or(0);
                    day_cache_read += tokens.cache_read.unwrap_or(0);
                }
            }

            let mut entry_cache = 0;
            if let Some(ref tokens) = e.delta_tokens {
                entry_cache = tokens.cache_read.unwrap_or(0);
            } else if let Some(ref tokens) = e.tokens {
                if e.turn_no == 1 {
                    entry_cache = tokens.cache_read.unwrap_or(0);
                }
            }

            let model = e.model.clone().unwrap_or_else(|| "Unknown Model".to_string());
            model_sessions.entry(model.clone()).or_default().insert(sid.clone());
            *model_tokens.entry(model.clone()).or_default() += entry_tokens;
            *model_input_tokens.entry(model.clone()).or_default() += entry_input;
            *model_output_tokens.entry(model.clone()).or_default() += entry_output;
            *model_cache_tokens.entry(model).or_default() += entry_cache;

            let cwd = e.cwd.clone().unwrap_or_else(|| "Unknown Path".to_string());
            project_sessions.entry(cwd.clone()).or_default().insert(sid.clone());
            *project_tokens.entry(cwd.clone()).or_default() += entry_tokens;
            *project_cache_tokens.entry(cwd).or_default() += entry_cache;
        }

        let mut session_last_entries: std::collections::HashMap<String, UsageEntry> = std::collections::HashMap::new();
        for e in entries_list {
            let sid = e.session_id.clone();
            let entry = session_last_entries.entry(sid).or_insert_with(|| e.clone());
            if e.turn_no > entry.turn_no {
                *entry = e.clone();
            }
        }
        for (_, last_entry) in session_last_entries {
            if let Some(ref cost) = last_entry.cost {
                day_duration += cost.total_api_duration_ms.unwrap_or(0.0) as u64;
                day_requests += cost.total_premium_requests.unwrap_or(0.0) as u64;
            }
        }

        monthly_summary.total_tokens += day_tokens;
        monthly_summary.total_input_tokens += day_input;
        monthly_summary.total_output_tokens += day_output;
        monthly_summary.total_reasoning_tokens += day_reasoning;
        monthly_summary.total_cache_read_tokens += day_cache_read;
        monthly_summary.total_duration_ms += day_duration;
        monthly_summary.total_requests += day_requests;

        let mut day_sessions_map: HashMap<String, Vec<UsageEntry>> = HashMap::new();
        for e in entries_list {
            day_sessions_map.entry(e.session_id.clone()).or_default().push(e.clone());
        }

        let mut day_cost_usd = 0.0;
        for (_session_id, s_entries) in &day_sessions_map {
            let last_entry = s_entries
                .iter()
                .max_by_key(|e| e.turn_no)
                .cloned()
                .unwrap_or_else(|| s_entries[0].clone());

            let session_tokens = s_entries
                .iter()
                .map(|e| e.delta_tokens.as_ref().map(|t| t.total).unwrap_or(0))
                .sum::<u64>();

            let session_input_tokens = s_entries
                .iter()
                .map(|e| e.delta_tokens.as_ref().map(|t| t.input).unwrap_or(0))
                .sum::<u64>();

            let session_output_tokens = s_entries
                .iter()
                .map(|e| e.delta_tokens.as_ref().map(|t| t.output).unwrap_or(0))
                .sum::<u64>();

            let session_cache_read = s_entries
                .iter()
                .map(|e| e.delta_tokens.as_ref().and_then(|t| t.cache_read).unwrap_or(0))
                .sum::<u64>();

            let total_cache_read_tokens = if session_tokens > 0 {
                session_cache_read
            } else {
                last_entry.tokens.as_ref().and_then(|t| t.cache_read).unwrap_or(0)
            };

            let total_input_tokens = if session_tokens > 0 { session_input_tokens } else { last_entry.tokens.as_ref().map(|t| t.input).unwrap_or(0) };
            let total_output_tokens = if session_tokens > 0 { session_output_tokens } else { last_entry.tokens.as_ref().map(|t| t.output).unwrap_or(0) };

            let cost = calculate_cost(
                &pricing_rules,
                &last_entry.model.clone().unwrap_or_else(|| "Unknown Model".to_string()),
                total_input_tokens,
                total_output_tokens,
                total_cache_read_tokens,
            );
            day_cost_usd += cost;
        }

        monthly_summary.total_cost_usd += day_cost_usd;

        daily_breakdown.push(DailyBreakdownEntry {
            date: date_str,
            total_sessions: day_sessions.len(),
            total_tokens: day_tokens,
            total_input_tokens: day_input,
            total_output_tokens: day_output,
            total_cache_read_tokens: day_cache_read,
            total_reasoning_tokens: day_reasoning,
            total_duration_ms: day_duration,
            total_requests: day_requests,
            cost_usd: day_cost_usd,
        });
    }

    let mut top_models = Vec::new();
    for (model, sids) in model_sessions {
        let total_tokens = model_tokens.get(&model).cloned().unwrap_or(0);
        let total_input_tokens = model_input_tokens.get(&model).cloned().unwrap_or(0);
        let total_output_tokens = model_output_tokens.get(&model).cloned().unwrap_or(0);
        let total_cache_read_tokens = model_cache_tokens.get(&model).cloned().unwrap_or(0);

        let cost_usd = calculate_cost(
            &pricing_rules,
            &model,
            total_input_tokens,
            total_output_tokens,
            total_cache_read_tokens,
        );

        top_models.push(ModelUsageSummary {
            model,
            session_count: sids.len(),
            total_tokens,
            total_input_tokens,
            total_output_tokens,
            total_cache_read_tokens,
            cost_usd,
        });
    }
    top_models.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    let mut top_projects = Vec::new();
    for (project, sids) in project_sessions {
        let total_tokens = project_tokens.get(&project).cloned().unwrap_or(0);
        let total_cache_read_tokens = project_cache_tokens.get(&project).cloned().unwrap_or(0);
        top_projects.push(ProjectUsageSummary {
            project,
            session_count: sids.len(),
            total_tokens,
            total_cache_read_tokens,
        });
    }
    top_projects.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    monthly_summary.total_sessions = entries.iter().map(|e| e.session_id.clone()).collect::<std::collections::HashSet<_>>().len();

    Json(MonthlyDetailsResponse {
        year_month,
        summary: monthly_summary,
        daily_breakdown,
        top_models,
        top_projects,
    }).into_response()
}

async fn trigger_manual_sync() -> impl IntoResponse {
    let res = tokio::task::spawn_blocking(|| {
        let conn = db::get_db_conn()?;
        db::init_db(&conn)?;
        db::sync_usage_logs(&conn)
    }).await.unwrap_or_else(|_| Err("執行緒執行失敗".to_string()));

    match res {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "status": "success", "message": "資料庫增量同步已完成！" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "status": "error", "error": e }))).into_response(),
    }
}
