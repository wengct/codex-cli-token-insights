# 🚀 Codex CLI Token Insights Dashboard 實作計畫

本專案旨在將原有的 Copilot CLI Dashboard 移植至 Codex CLI 版本，核心邏輯改為完全解析 `~/.codex/sessions/**/*.jsonl`，移除 statusline 與 hooks。

## 🎯 驗收標準
- [x] 能自動遞迴掃描並增量同步 `~/.codex/sessions/**/*.jsonl` 下的會話檔案進 SQLite 資料庫。
- [x] Token 計算公式符合規格，正確扣除快取輸入，不重複加推理 Token，每回合能正確計算增量。
- [x] 支援與原版前端同等之 API： `/api/dates`, `/api/usage/:date`, `/api/session/:session_id`, `/api/months`, `/api/monthly/:year_month`, `/api/pricing`, `/api/sync`。
- [x] 還原對話時間軸抽屜，能還原 UserPrompt、AssistantReply（附帶模型名與 token 數）、ToolStep（包括參數與回傳內容）、SystemStatus。
- [x] 介面所有 Copilot 標記更換為 Codex，並調整前置設定教學為 Codex 無痛零設定監控說明。

## 🗂️ 任務清單

### 1. 專案初始化
- [x] 建立 `Cargo.toml` 配置 Rust 專案依賴
- [x] 複製 `pricing.csv` 與 frontend static 檔案

### 2. 資料庫與同步引擎 (`src/db.rs`)
- [x] 初始化 SQLite schema 建立 `usage_entries` 及 `sync_state`
- [x] 實作遞迴尋找 `rollout-*.jsonl` 檔案
- [x] 實作單一 jsonl 檔案完整解析邏輯，歸納 turns 與累積/增量 token 數
- [x] 實作 `sync_usage_logs`，當檔案 size 有變更時進行 DELETE-INSERT 覆寫更新

### 3. API 服務實作 (`src/main.rs`)
- [x] 實作 `get_codex_dir` 讀取 `CODEX_DIR` 或 `~/.codex`
- [x] 實作 `calculate_cost`（依據 uncached_input 算費用）
- [x] 實作 `/api/dates`、`/api/setup-info` 介面
- [x] 實作 `/api/usage/:date`、`/api/session/:session_id` 時間軸重建
- [x] 實作 `/api/months`、`/api/monthly/:year_month` 月度報表
- [x] 實作 `/api/sync` 與 `/api/pricing`

### 4. 前端修正
- [x] 修正 `static/index.html` 將 Copilot 改為 Codex，更新 Setup Modal 說明
- [x] 修正 `static/app.js` i18n 文字與 `loadSetupInfo`

### 5. 驗證與測試
- [/] 編譯專案並啟動服務 (Release 版本編譯中)
- [x] 驗證同步及資料庫寫入 (已通過 curl API 驗證)
- [x] 測試 API 接口是否回傳正確格式 (已確認 JSON 格式正確)
- [ ] 網頁操作驗證 (Daily Dashboard, Session Details Drawer, Monthly Breakdown)
