# 🤖 Codex CLI Token Insights Dashboard

這是一個專門為 **Codex CLI** 設計的本地 Token 消耗與會話分析看板。使用高效能的 **Rust (Axum)** 作為後端，搭配 **深色毛玻璃風格 (Glassmorphism)** 前端，協助您輕鬆查看每日的 Token 快取命中率、推理 Token 消耗，並能**重建與還原每個會話 (Session) 的歷史對話時間軸**！

與 Copilot 版本不同，Codex Cli 版本**不使用任何 statusline 或 hook**，完全利用 `~/.codex/sessions` 下的 `.jsonl` 檔案來進行解析，對本地環境無任何侵入性！

---

## 🌟 功能說明 (Features)

本看板提供全方位的本地數據可視化，包含以下四大核心功能：

### 1. 📊 每日即時分析看板 (Daily Real-time Dashboard)
- **即時指標彙整**：一目了然每日的 Token 總消耗、輸入/輸出 Token 佔比、快取讀取 Token 以及推理 Token 的使用量。
- **Token 趨勢與快取圖表**：使用 Chart.js 以平滑曲線呈現每日各 Session 的 Token 消耗波動、快取命中率與對話 Turn 數對比。
- **🔴 即時自動更新機制 (Live Monitor)**：支援一鍵開啟自動刷新，可自訂 5 秒、10 秒或 30 秒的更新頻率。當您在終端機中與 Codex CLI 對話時，看板數據將會即時同步。

### 2. 📅 月度數據彙整 (Monthly Aggregation)
- **月度趨勢圖表**：折線圖展示單月內每日的 Token 總體使用情況與會話數的趨勢變化。
- **🏢 最常活動的專案目錄**：統計您在不同專案工作目錄（CWD）下的 Codex 會話次數與 Token 消耗，方便追蹤哪些專案投入了最多 AI 輔助。
- **🤖 使用的模型佔比**：清晰列出不同 LLM（如 GPT-5.4 等）在當月的會話次數與 Token 佔比。

### 3. 🔍 互動式會話歷史清單 (Interactive Session History)
- **多維度欄位**：以表格形式完整列出歷史會話。欄位包含會話名稱/ID、使用的模型、最大 Turn 數、輸入/輸出/快取 Token 以及 API 總耗時（毫秒）。
- **靈活排序**：點選任一欄位標頭即可進行即時升冪或降冪排序，幫助您快速篩選出高消耗或高頻次的會話。

### 4. ⏱️ 精準會話時間軸還原 (Session Timeline Drawer)
- **側邊滑出式抽屜**：點擊列表中的會話，右側將流暢滑出詳細的歷史對話時間軸。
- **對話內容重建**：
  - **使用者提示詞 (User Prompt)**：清晰的對話泡泡，並標示附加的 context 狀態。
  - **助理思考與回覆 (Agent Reply)**：呈現 LLM 的思維過程（Reasoning Process）與 Markdown 排版渲染的代碼高亮。
  - **工具呼叫步驟 (CLI Tool Step)**：自動展開 Codex CLI 呼叫的本地 CLI 工具名稱、入參（Arguments）、環境 context、執行狀態碼（Exit Code）以及標準輸出（Stdout）與錯誤輸出（Stderr），徹底還原 AI 在您電腦上的操作路徑。

---

## 🚀 配置與啟動指南 (Setup & Launch)

本專案完全運行於您的本地端，確保所有數據的隱私與安全性。

### 一、啟動看板服務

切換至專案根目錄，執行以下命令：

```bash
cargo run
```
> [!NOTE]
> 初次執行時，Rust 會自動下載需要的依賴庫並進行本地編譯（後續啟動僅需 1 秒且無需網路）。

當終端機顯示以下成功訊息時：
```text
🚀 Codex CLI Token Insights Dashboard is running on: http://localhost:3001
```
請在瀏覽器中打開 [**`http://localhost:3001`**](http://localhost:3001)，即可開始使用您的看板！

---

## ⚙️ Token 計算邏輯與公式

後端依據 Codex CLI 的會話 `.jsonl` 日誌的 `token_count` 事件進行解析。為符合 Codex CLI 的顯示習慣，公式轉換如下：

- **CLI input** (非快取輸入) = `input_tokens - cached_input_tokens`
- **CLI cached** (快取命中) = `cached_input_tokens`
- **CLI output** (輸出) = `output_tokens`
- **CLI reasoning** (推理) = `reasoning_output_tokens` *(已包含在 output 中，不重複加)*
- **CLI total** = `CLI input + CLI output`

此計算完全排除了快取命中的 input 額度，真實呈現您所消耗的模型調用額度與費用。
