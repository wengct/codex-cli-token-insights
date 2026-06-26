// Globals
let tokenChartInstance = null;
let monthlyChartInstance = null;
let activeTab = 'daily'; // 'daily' or 'monthly'
let currentChartSessions = [];
let currentMonthlyBreakdown = [];
let currentSessionTotalTokens = 0;
let currentSessionCacheTokens = 0;
let currentSessionInputTokens = 0;
let currentSessionOutputTokens = 0;
let currentSessionReasoningTokens = 0;
let currentSessionCwd = '';
let currentSessionModel = '';
let availableDates = [];
let pricingRules = [];

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Session table sorting state
let currentSessions = [];
let currentSortColumn = 'timestamp'; // Default sorted by starting time
let currentSortDirection = 'desc';  // Default chronological order

// Monthly daily summary sorting state
let monthlyDailySortColumn = 'date';
let monthlyDailySortDirection = 'desc';

// Live Auto-Refresh State
let liveRefreshTimer = null;
let liveProgressTimer = null;
let secondsRemaining = 10;
let refreshInterval = 10000; // default 10s

// Language / Internationalization (i18n) State
let currentLang = localStorage.getItem('lang') || 'zh-TW';
let currentUsageData = null;
let currentMonthlyData = null;

const i18n = {
  'zh-TW': {
    title: 'Codex CLI Token Insights Dashboard',
    tab_daily: '📊 每日即時',
    tab_monthly: '📅 月度彙整',
    select_date: '選擇日期',
    today_btn: '今日',
    detected_new_day: '已跨日，自動切換至新的一天：',
    select_month: '選擇月份',
    loading: '載入中...',
    no_logs: '無使用日誌記錄',
    no_month_logs: '無月份日誌記錄',
    reload_data: '重新載入數據',
    live_refresh: '即時自動刷新',
    refresh_interval: '刷新頻率:',
    seconds: '秒',
    status_preparing: '準備中...',
    status_monitoring: '監控中 (將於 {sec}s 後刷新)',
    status_failed: '更新失敗，等待下一次嘗試...',
    quick_stats_title: '當日彙整指標',
    stat_total_sessions: '總 Session 數',
    stat_total_tokens: '總 Token 消耗',
    stat_cache_read: '快取讀取: {val}',
    stat_api_duration: '累積 API 耗時',
    stat_total_requests: '總請求次數',
    select_date_prompt: '請選擇日期以載入數據',
    header_description: '監控您本地每天使用 Codex CLI 的 Token 與會話詳細數據',
    setup_guide: '使用指南',
    setup_guide_title: '前置說明與使用指南',
    theme_toggle_title_dark: '切換至淺色主題',
    theme_toggle_title_light: '切換至深色主題',
    total_tokens_label: '總消耗 Token',
    input_tokens_label: '輸入 Token',
    output_tokens_label: '輸出 Token',
    reasoning_tokens_label: '推理 Token',
    cache_read_label: '快取讀取',
    ratio_label: '佔比',
    total_label: '總計',
    chart_daily_title: 'Token 消耗趨勢與快取狀況',
    chart_token_label: 'Session 總 Token',
    chart_cache_label: '快取讀取 Token',
    chart_turn_label: '對話 Turn 數',
    chart_monthly_title: '單月每日 Token 消耗與會話數趨勢',
    chart_monthly_token_label: '月總 Token 消耗',
    chart_monthly_session_label: '每日會話數',
    sessions_table_title: '今日會話列表 (Sessions)',
    col_session: '會話',
    col_model: 'Model',
    col_turns: 'Turn 數',
    col_input: '輸入',
    col_output: '輸出',
    col_reasoning: '推理',
    col_cache: '快取',
    col_total: '總計',
    col_cost: '估算費用',
    col_duration: '耗時',
    col_time: '時間',
    estimated_cost_label: '估算費用',
    stat_cost_desc: '基於 pricing.csv 的估計金額',
    btn_pricing_sheet: '費用標準',
    pricing_sheet_title: '💰 Codex 費用標準表',
    pricing_intro: '此費用為本地估算，單價依據 <code>pricing.csv</code> 載入。單位為 1M Tokens (每百萬個 Token) 的美金價格：',
    placeholder_select_date: '請先在左側選擇一個日期',
    placeholder_no_sessions: '今日無任何會話記錄',
    monthly_tokens_label: '月總消耗 Token',
    monthly_input_label: '月輸入 Token',
    monthly_output_label: '月輸出 Token',
    monthly_sessions_label: '月總會話數',
    monthly_requests_count: '總請求: {count} 次',
    monthly_projects_title: '🏢 最常活動的專案目錄',
    monthly_models_title: '🤖 使用的模型佔比',
    col_rank: '排名',
    col_project_cwd: '工作路徑 (CWD)',
    col_sessions_count: '會話數',
    placeholder_no_projects: '本月無任何專案記錄',
    placeholder_no_models: '本月無模型數據',
    drawer_category: '會話對話重建',
    drawer_cwd: '工作路徑',
    drawer_repo: '專案庫',
    drawer_branch: 'Git 分支',
    drawer_model: 'Model',
    drawer_input: '輸入',
    drawer_output: '輸出',
    drawer_reasoning: '推理',
    drawer_cache: '快取',
    drawer_compaction: '壓縮次數',
    drawer_total: '總計',
    drawer_loading: '對話時間軸還原中...',
    drawer_load_failed_cleaned: '無法載入此 Session 事件，可能對應的 events.jsonl 檔案已被系統清理。',
    drawer_load_failed: '載入時間軸失敗。',
    drawer_no_events: '此會話無任何事件記錄',
    sender_user: '👤 USER',
    sender_agent: '🤖 CODEX AGENT',
    thinking_tools: '思考中：調用工具指令...',
    copy_markdown: '複製 Markdown',
    copy_markdown_title: '複製 LLM 回答的原始 Markdown 內容',
    expand_reply: '展開回覆',
    collapse_reply: '收起回覆',
    no_returned_data: '無回傳資料',
    data_truncated: '... [資料過長，已被 Dashboard 截斷] ...',
    tool_arguments: '參數 (Arguments)',
    tool_result: '結果 (Result)',
    session_started: '會話開始',
    session_ended: '會話結束',
    session_compaction: '會話狀態壓縮完成',
    reload_success: '數據已成功重新整理',
    reload_failed: '重新整理失敗',
    monthly_reload_success: '月度數據已成功重新整理',
    live_refresh_enabled: '即時自動重新整理已開啟',
    live_refresh_disabled: '即時自動重新整理已關閉',
    live_refresh_failed: '即時刷新失敗:',
    date_not_found: '找不到該日期的數據',
    load_failed: '讀取數據失敗',
    server_conn_failed: '無法連接到伺服器 API',
    month_not_found: '找不到該月份的數據',
    monthly_load_failed: '載入月份彙整數據失敗',
    copy_success: '✅ 已複製！',
    copy_failed: '複製失敗，請手動選取複製',
    setup_modal_title: '⚙️ Codex CLI 前置說明與使用指南',
    setup_modal_intro: '本 Dashboard 主要是解析並呈現 Codex CLI 的本地會話事件與 Token 數據。因為 Codex CLI 會自動將會話記錄在 <code>~/.codex/sessions</code> 目錄下，您不需要進行任何腳本設定或狀態列修改，本 Dashboard 就會自動讀取並進行即時同步！',
    setup_step_1: '<span>1️⃣</span> 1. 確認 Codex CLI 已在使用',
    setup_step_1_desc: '只要您在終端機中執行過 Codex CLI 進行過對話，會話檔案就會自動生成在此目錄中。',
    btn_copy_cmd: '📋 複製指令',
    setup_step_2: '<span>2️⃣</span> 2. 偵測路徑狀態',
    setup_step_2_desc: '目前偵測到的 Codex 目錄為：<code id="lbl-detected-home">/home/chenting/.codex</code>。本系統會以極高效率對該目錄進行即時掃描與分析。',
    setup_step_3: '<span>3️⃣</span> 3. 費用估算邏輯',
    setup_step_3_desc: '費用會根據您的對話模型以 Token 數量為基準進行即時估算，排除快取部分後得出實際成本。',
    empty_title: '歡迎使用 Codex CLI Token Insights Dashboard',
    empty_desc: '我們偵測到您的 <code>~/.codex/sessions</code> 本地目錄中目前沒有使用數據。這是因為您尚未在終端機執行過 Codex CLI，請先開啟您的 Codex CLI 與 AI 進行對話，本 Dashboard 將會自動同步！',
    btn_empty_setup: '⚙️ 說明與使用指南',
    btn_empty_refresh: '🔄 重新整理檢查',
    usage_report: '使用量報告：',
    loading_prefix: '載入中: ',
    loading_month_prefix: '載入月份數據中: ',
    monthly_report: '月度統計報告：',
    cache_prefix: '快取: ',
    sync_db: '同步資料',
    sync_db_title: '立即同步日誌檔到 SQLite 資料庫',
    sync_db_loading: '正在同步日誌檔到資料庫...',
    sync_db_success: '資料庫同步成功！',
    sync_db_failed: '同步失敗: ',
    monthly_daily_summary_title: '📅 當月每日彙總',
    col_date: '日期',
    placeholder_no_daily_summary: '本月無每日彙總數據',
  },
  'en': {
    title: 'GitHub Copilot CLI Token Insights Dashboard',
    tab_daily: '📊 Daily Real-time',
    tab_monthly: '📅 Monthly Summary',
    select_date: 'Select Date',
    today_btn: 'Today',
    detected_new_day: 'Cross-day detected, auto switching to: ',
    select_month: 'Select Month',
    loading: 'Loading...',
    no_logs: 'No usage logs found',
    no_month_logs: 'No monthly logs found',
    reload_data: 'Reload Data',
    live_refresh: 'Live Auto-refresh',
    refresh_interval: 'Refresh Rate:',
    seconds: 's',
    status_preparing: 'Preparing...',
    status_monitoring: 'Monitoring (refresh in {sec}s)',
    status_failed: 'Update failed, waiting for next try...',
    quick_stats_title: 'Daily Summary Metrics',
    stat_total_sessions: 'Total Sessions',
    stat_total_tokens: 'Total Tokens',
    stat_cache_read: 'Cache Read: {val}',
    stat_api_duration: 'API Duration',
    stat_total_requests: 'Total Requests',
    select_date_prompt: 'Please select a date to load data',
    header_description: 'Monitor daily tokens and session details of GitHub Copilot CLI locally',
    setup_guide: 'Setup Guide',
    setup_guide_title: 'Setup Guide & Activation Tutorial',
    theme_toggle_title_dark: 'Switch to Light Theme',
    theme_toggle_title_light: 'Switch to Dark Theme',
    total_tokens_label: 'Total Tokens',
    input_tokens_label: 'Input Tokens',
    output_tokens_label: 'Output Tokens',
    reasoning_tokens_label: 'Reasoning Tokens',
    cache_read_label: 'Cache Read',
    ratio_label: 'Ratio',
    total_label: 'Total',
    chart_daily_title: 'Token Consumption Trend & Cache Status',
    chart_token_label: 'Session Total Tokens',
    chart_cache_label: 'Cache Read Tokens',
    chart_turn_label: 'Session Turns',
    chart_monthly_title: 'Daily Token & Session Trend of the Month',
    chart_monthly_token_label: 'Monthly Total Tokens',
    chart_monthly_session_label: 'Daily Sessions',
    sessions_table_title: 'Daily Session List (Sessions)',
    col_session: 'Session',
    col_model: 'Model',
    col_turns: 'Turns',
    col_input: 'Input',
    col_output: 'Output',
    col_reasoning: 'Reasoning',
    col_cache: 'Cache',
    col_total: 'Total',
    col_cost: 'Est. Cost',
    col_duration: 'Duration',
    col_time: 'Time',
    estimated_cost_label: 'Est. Cost',
    stat_cost_desc: 'Estimated based on pricing.csv',
    btn_pricing_sheet: 'Pricing Rates',
    pricing_sheet_title: '💰 GitHub Copilot Pricing Rates',
    pricing_intro: 'This cost is locally estimated based on rates loaded from <code>pricing.csv</code>. Rates are in USD per 1M Tokens (per million tokens):',
    placeholder_select_date: 'Please select a date on the left',
    placeholder_no_sessions: 'No session records found today',
    monthly_tokens_label: 'Monthly Total Tokens',
    monthly_input_label: 'Monthly Input Tokens',
    monthly_output_label: 'Monthly Output Tokens',
    monthly_sessions_label: 'Monthly Total Sessions',
    monthly_requests_count: 'Total Requests: {count}',
    monthly_projects_title: '🏢 Most Active Project Directories',
    monthly_models_title: '🤖 Model Usage Breakdown',
    col_rank: 'Rank',
    col_project_cwd: 'Working Directory (CWD)',
    col_sessions_count: 'Sessions',
    placeholder_no_projects: 'No project activity recorded this month',
    placeholder_no_models: 'No model usage data this month',
    drawer_category: 'Session Reconstruction',
    drawer_cwd: 'Working CWD',
    drawer_repo: 'Repository',
    drawer_branch: 'Git Branch',
    drawer_model: 'Model',
    drawer_input: 'Input',
    drawer_output: 'Output',
    drawer_reasoning: 'Reasoning',
    drawer_cache: 'Cache',
    drawer_compaction: 'Compactions',
    drawer_total: 'Total',
    drawer_loading: 'Reconstructing session timeline...',
    drawer_load_failed_cleaned: 'Failed to load session events. The events.jsonl file might have been cleaned up by the system.',
    drawer_load_failed: 'Failed to load timeline.',
    drawer_no_events: 'No event logs found in this session',
    sender_user: '👤 USER',
    sender_agent: '🤖 CODEX AGENT',
    thinking_tools: 'Thinking: Calling tool commands...',
    copy_markdown: 'Copy Markdown',
    copy_markdown_title: 'Copy raw Markdown response',
    expand_reply: 'Expand Reply',
    collapse_reply: 'Collapse Reply',
    no_returned_data: 'No returned data',
    data_truncated: '... [Data too long, truncated by the dashboard] ...',
    tool_arguments: 'Arguments',
    tool_result: 'Result',
    session_started: 'Session Started',
    session_ended: 'Session Ended',
    session_compaction: 'Session Compaction Completed',
    reload_success: 'Data refreshed successfully',
    reload_failed: 'Failed to refresh data',
    monthly_reload_success: 'Monthly data refreshed successfully',
    live_refresh_enabled: 'Live auto-refresh enabled',
    live_refresh_disabled: 'Live auto-refresh disabled',
    live_refresh_failed: 'Live refresh failed:',
    date_not_found: 'Data for the specified date not found',
    load_failed: 'Failed to read data',
    server_conn_failed: 'Unable to connect to server API',
    month_not_found: 'Data for the specified month not found',
    monthly_load_failed: 'Failed to load monthly aggregated data',
    copy_success: '✅ Copied!',
    copy_failed: 'Failed to copy, please select and copy manually',
    setup_modal_title: '⚙️ Codex CLI Guide & User Instructions',
    setup_modal_intro: 'This dashboard parses and visualizes Codex CLI session events and Token statistics. Since Codex CLI automatically records sessions under <code>~/.codex/sessions</code>, no statusline configuration or scripting is required. The dashboard automatically syncs data in real time!',
    setup_step_1: '<span>1️⃣</span> 1. Ensure Codex CLI has been used',
    setup_step_1_desc: 'As long as you run Codex CLI and interact with the AI in terminal, session logs will automatically generate in this folder.',
    btn_copy_cmd: '📋 Copy Command',
    setup_step_2: '<span>2️⃣</span> 2. Detected Path Status',
    setup_step_2_desc: 'The detected Codex directory path is: <code id="lbl-detected-home">/home/chenting/.codex</code>. The system will scan and sync this folder dynamically.',
    setup_step_3: '<span>3️⃣</span> 3. Cost Calculation Logic',
    setup_step_3_desc: 'The cost is calculated dynamically based on total input (excluding cached) and output tokens using rules in pricing.csv.',
    empty_title: 'Welcome to Codex CLI Token Insights Dashboard',
    empty_desc: 'We detected that there is currently no usage data in your local <code>~/.codex/sessions</code> directory. This is because you haven\'t run any Codex CLI sessions. Please start a conversation in terminal using Codex CLI, and this dashboard will automatically sync the data!',
    btn_empty_setup: '⚙️ View Setup Guide',
    btn_empty_refresh: '🔄 Reload and Check',
    usage_report: 'Usage Report: ',
    loading_prefix: 'Loading: ',
    loading_month_prefix: 'Loading Monthly Data: ',
    monthly_report: 'Monthly Report: ',
    cache_prefix: 'Cache: ',
    sync_db: 'Sync Data',
    sync_db_title: 'Sync local logs to SQLite database now',
    sync_db_loading: 'Syncing log files to database...',
    sync_db_success: 'Database synced successfully!',
    sync_db_failed: 'Sync failed: ',
    monthly_daily_summary_title: '📅 Daily Summary of the Month',
    col_date: 'Date',
    placeholder_no_daily_summary: 'No daily summary data this month',
  }
};

function t(key) {
  return i18n[currentLang][key] || i18n['zh-TW'][key] || key;
}

function updateLanguageUI() {
  document.title = t('title');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerHTML = t(key);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });

  // Specific dynamic text updates
  const langSelect = document.getElementById('lang-select');
  if (langSelect) langSelect.value = currentLang;

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.title = currentTheme === 'dark' ? t('theme_toggle_title_dark') : t('theme_toggle_title_light');
  }

  // Update dynamic placeholders/empty state if they are currently displayed
  const emptyContainer = document.getElementById('empty-state-container');
  if (emptyContainer && !emptyContainer.classList.contains('hidden')) {
    toggleEmptyState(true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// =========================================================================
// App Initialization & Event Listeners
// =========================================================================
function initApp() {
  const dateSelect = document.getElementById('date-select');
  const monthSelect = document.getElementById('month-select');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const drawerOverlay = document.getElementById('timeline-drawer');

  // Tab Buttons
  const tabBtnDaily = document.getElementById('tab-btn-daily');
  const tabBtnMonthly = document.getElementById('tab-btn-monthly');

  // Live Controls
  const liveToggle = document.getElementById('live-toggle');
  const liveInterval = document.getElementById('live-interval');

  // Language selector
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', (e) => {
      currentLang = e.target.value;
      localStorage.setItem('lang', currentLang);
      updateLanguageUI();
      
      // Re-render currently active view
      if (activeTab === 'daily' && currentUsageData) {
        renderDashboard(currentUsageData);
      } else if (activeTab === 'monthly' && currentMonthlyData) {
        renderMonthlyDashboard(currentMonthlyData);
      }
    });
  }

  // 載入日期清單
  fetchDates();
  // 載入月份清單
  fetchMonths();

  // Initialize language UI translation
  updateLanguageUI();

  // Tab切換監聽
  tabBtnDaily.addEventListener('click', () => switchTab('daily'));
  tabBtnMonthly.addEventListener('click', () => switchTab('monthly'));

  // 監聽日期切換
  dateSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      loadUsageData(e.target.value);
    }
  });

  // 點擊整個輸入框時自動打開小日曆
  dateSelect.addEventListener('click', (e) => {
    if (typeof e.target.showPicker === 'function') {
      try {
        e.target.showPicker();
      } catch (err) {
        console.warn('showPicker not supported or blocked:', err);
      }
    }
  });

  // 監聽今日按鈕
  const btnToday = document.getElementById('btn-today');
  if (btnToday) {
    btnToday.addEventListener('click', async () => {
      const todayStr = getLocalDateString();
      if (dateSelect) {
        dateSelect.value = todayStr;
      }
      await loadUsageData(todayStr);
      showNotification(`${t('today_btn') || '今日'} ${todayStr}`, 'success');
    });
  }

  // 監聽月份切換
  monthSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      loadMonthlyData(e.target.value);
    }
  });

  // 監聽重新整理按鈕
  const btnReloadDaily = document.getElementById('btn-reload-daily');
  const btnReloadMonthly = document.getElementById('btn-reload-monthly');

  if (btnReloadDaily) {
    btnReloadDaily.addEventListener('click', async () => {
      btnReloadDaily.classList.add('loading');
      try {
        await reloadDailyData();
        showNotification(t('reload_success'), 'success');
      } catch (err) {
        console.error('Reload failed:', err);
        showNotification(t('reload_failed'), 'error');
      } finally {
        btnReloadDaily.classList.remove('loading');
      }
    });
  }

  if (btnReloadMonthly) {
    btnReloadMonthly.addEventListener('click', async () => {
      btnReloadMonthly.classList.add('loading');
      try {
        await reloadMonthlyData();
        showNotification(t('monthly_reload_success'), 'success');
      } catch (err) {
        console.error('Reload failed:', err);
        showNotification(t('reload_failed'), 'error');
      } finally {
        btnReloadMonthly.classList.remove('loading');
      }
    });
  }

  // 監聽手動同步資料庫按鈕
  const btnSyncDb = document.getElementById('btn-sync-db');
  if (btnSyncDb) {
    btnSyncDb.addEventListener('click', async () => {
      btnSyncDb.classList.add('loading');
      btnSyncDb.disabled = true;
      showNotification(t('sync_db_loading'), 'info');
      try {
        const res = await fetch('/api/sync');
        if (res.ok) {
          showNotification(t('sync_db_success'), 'success');
          // 重新載入目前頁面的數據
          if (activeTab === 'daily') {
            await reloadDailyData();
          } else {
            await reloadMonthlyData();
          }
          // 同時重新整理可用的日期與月份清單
          await fetchDates();
          await fetchMonths();
        } else {
          let errMsg = res.statusText;
          try {
            const data = await res.json();
            if (data && data.error) errMsg = data.error;
          } catch (_) {}
          showNotification(t('sync_db_failed') + errMsg, 'error');
        }
      } catch (err) {
        console.error('Sync failed:', err);
        showNotification(t('sync_db_failed') + err.message, 'error');
      } finally {
        btnSyncDb.classList.remove('loading');
        btnSyncDb.disabled = false;
      }
    });
  }

  // 監聽 Live 重新整理切換
  liveToggle.addEventListener('change', (e) => {
    toggleLiveRefresh(e.target.checked);
  });

  // 監聽 Live 頻率變更
  liveInterval.addEventListener('change', (e) => {
    refreshInterval = parseInt(e.target.value, 10);
    if (liveToggle.checked) {
      // 重啟計時器
      startLiveRefresh();
    }
  });

  // 關閉抽屜彈窗
  closeDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) {
      closeDrawer();
    }
  });

  // 支援 ESC 鍵關閉抽屜
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawer();
    }
  });

  // Sidebar Toggle Button
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const appContainer = document.querySelector('.app-container');
  if (sidebarToggleBtn && appContainer) {
    sidebarToggleBtn.addEventListener('click', () => {
      appContainer.classList.toggle('sidebar-collapsed');
    });

    // Collapse by default on medium/small screens (<= 1024px)
    if (window.innerWidth <= 1024) {
      appContainer.classList.add('sidebar-collapsed');
    }
  }

  // 初始化深淺色主題切換
  initThemeToggle();

  // 初始化表格欄位排序
  initTableSorting();

  // 初始化前置設定教學 Modal 與事件
  initSetupGuide();

  // 載入費用標準規則
  fetchPricingRules();
  // 初始化費用標準 Modal 與事件
  initPricingModal();
}

// =========================================================================
// Tab 切換邏輯
// =========================================================================
function switchTab(tab) {
  if (activeTab === tab) return;
  activeTab = tab;

  const tabBtnDaily = document.getElementById('tab-btn-daily');
  const tabBtnMonthly = document.getElementById('tab-btn-monthly');
  const dailySelector = document.getElementById('daily-selector-section');
  const monthlySelector = document.getElementById('monthly-selector-section');
  const quickStats = document.getElementById('quick-stats-section');
  const dailyView = document.getElementById('daily-view-container');
  const monthlyView = document.getElementById('monthly-view-container');

  if (tab === 'daily') {
    tabBtnDaily.classList.add('active');
    tabBtnMonthly.classList.remove('active');
    dailySelector.classList.remove('hidden');
    monthlySelector.classList.add('hidden');
    quickStats.classList.remove('hidden');
    dailyView.classList.remove('hidden');
    monthlyView.classList.add('hidden');

    // 載入當前日期的數據
    const dateSelect = document.getElementById('date-select');
    if (dateSelect.value) {
      loadUsageData(dateSelect.value);
    }
  } else {
    // 關閉即時自動刷新以節省資源
    const liveToggle = document.getElementById('live-toggle');
    if (liveToggle.checked) {
      liveToggle.checked = false;
      toggleLiveRefresh(false);
    }

    tabBtnDaily.classList.remove('active');
    tabBtnMonthly.classList.add('active');
    dailySelector.classList.add('hidden');
    monthlySelector.classList.remove('hidden');
    quickStats.classList.add('hidden');
    dailyView.classList.add('hidden');
    monthlyView.classList.remove('hidden');

    // 載入當前月份的數據
    const monthSelect = document.getElementById('month-select');
    if (monthSelect.value) {
      loadMonthlyData(monthSelect.value);
    } else {
      fetchMonths();
    }
  }
}

// =========================================================================
// 即時監控自動重新整理 (Live Auto-Refresh)
// =========================================================================
function toggleLiveRefresh(enabled) {
  const panel = document.getElementById('live-settings-panel');
  const dateSelect = document.getElementById('date-select');
  const btnToday = document.getElementById('btn-today');

  if (enabled) {
    panel.style.display = 'block';
    dateSelect.disabled = true; // 鎖定日期選擇
    if (btnToday) btnToday.disabled = true; // 鎖定今日按鈕

    // 自動切換到當天的日期 (以今天日期進行即時監控)
    const todayStr = getLocalDateString();
    dateSelect.value = todayStr;
    loadUsageData(todayStr);

    startLiveRefresh();
    showNotification(t('live_refresh_enabled'), 'success');
  } else {
    panel.style.display = 'none';
    dateSelect.disabled = false;
    if (btnToday) btnToday.disabled = false;

    stopLiveRefresh();
    showNotification(t('live_refresh_disabled'), 'info');
  }
}

function startLiveRefresh() {
  stopLiveRefresh();

  const intervalInput = document.getElementById('live-interval');
  refreshInterval = parseInt(intervalInput.value, 10);

  const statusText = document.getElementById('live-status-text');
  const progressBar = document.getElementById('refresh-progress');
  
  progressBar.style.width = '0%';

  let startTime = Date.now();
  
  // 100ms 進度條更新一次以確保極度順暢
  liveProgressTimer = setInterval(() => {
    let elapsed = Date.now() - startTime;
    let percentage = Math.min((elapsed / refreshInterval) * 100, 100);
    progressBar.style.width = `${percentage}%`;

    let seconds = Math.max(Math.ceil((refreshInterval - elapsed) / 1000), 0);
    statusText.textContent = t('status_monitoring').replace('{sec}', seconds);
  }, 100);

  // 實際刷新 API 的定時器
  liveRefreshTimer = setInterval(async () => {
    // 重設進度條與時間
    startTime = Date.now();
    progressBar.style.width = '0%';

    // 重新載入最新資料
    await refreshLiveData();
  }, refreshInterval);
}

function stopLiveRefresh() {
  if (liveRefreshTimer) {
    clearInterval(liveRefreshTimer);
    liveRefreshTimer = null;
  }
  if (liveProgressTimer) {
    clearInterval(liveProgressTimer);
    liveProgressTimer = null;
  }
  const progressBar = document.getElementById('refresh-progress');
  if (progressBar) progressBar.style.width = '0%';
}

async function refreshLiveData() {
  try {
    const res = await fetch('/api/dates');
    const data = await res.json();
    availableDates = data.dates || [];
    
    const dateSelect = document.getElementById('date-select');
    const todayStr = getLocalDateString();
    
    // 更新日曆的最小與最大限制
    if (availableDates.length > 0) {
      dateSelect.min = availableDates[availableDates.length - 1];
    }
    dateSelect.max = todayStr;

    // 即時自動刷新跨日支援：若目前時間已進入新的一天且與當前選擇不同，自動切換
    if (dateSelect.value !== todayStr) {
      console.log(`即時監控跨日切換: ${dateSelect.value} -> ${todayStr}`);
      dateSelect.value = todayStr;
      showNotification(`${t('detected_new_day') || '已跨日，自動切換至新的一天：'}${todayStr}`, 'info');
    }

    // 載入所選日期 (即新的 todayStr) 數據
    await loadUsageData(dateSelect.value);
  } catch (err) {
    console.error('即時刷新失敗:', err);
    const statusText = document.getElementById('live-status-text');
    if (statusText) statusText.textContent = t('status_failed');
  }
}

// =========================================================================
// API 呼叫: 載入日期清單
// =========================================================================
async function fetchDates(selectedDate = null) {
  try {
    const res = await fetch('/api/dates');
    const data = await res.json();
    
    const dateSelect = document.getElementById('date-select');
    availableDates = data.dates || [];

    if (availableDates.length === 0) {
      toggleEmptyState(true);
      return;
    }

    toggleEmptyState(false);
    
    // 設定日曆最小與最大值
    const oldestDate = availableDates[availableDates.length - 1];
    const newestDate = availableDates[0];
    const todayStr = getLocalDateString();
    
    dateSelect.min = oldestDate;
    dateSelect.max = todayStr;

    let dateToLoad = selectedDate;
    if (!dateToLoad) {
      // 若有啟用即時刷新，預設為今日；否則預設為最新有日誌的日期
      const liveToggle = document.getElementById('live-toggle');
      if (liveToggle && liveToggle.checked) {
        dateToLoad = todayStr;
      } else {
        dateToLoad = newestDate;
      }
    }

    dateSelect.value = dateToLoad;

    // 載入所選或最新一天的數據
    await loadUsageData(dateToLoad);

  } catch (err) {
    console.error('獲取日期清單失敗:', err);
    showNotification(t('server_conn_failed'), 'error');
  }
}

async function reloadDailyData() {
  const dateSelect = document.getElementById('date-select');
  const selectedDate = dateSelect.value;
  await fetchDates(selectedDate);
}

// =========================================================================
// API 呼叫: 載入當日使用量數據
// =========================================================================
async function loadUsageData(date) {
  try {
    // 顯示加載動畫 (可在此擴展)
    document.getElementById('current-date-title').innerHTML = `<span class="title-icon">⌛</span> <span class="title-text">${t('loading_prefix')}${date}...</span>`;

    const res = await fetch(`/api/usage/${date}`);
    if (res.status === 404) {
      showNotification(t('date_not_found'), 'error');
      return;
    }
    
    const data = await res.json();
    renderDashboard(data);

  } catch (err) {
    console.error('載入使用量失敗:', err);
    showNotification(t('load_failed'), 'error');
  }
}

// =========================================================================
// 渲染主看板數據
// =========================================================================
function renderDashboard(data) {
  currentUsageData = data;
  const { date, summary, sessions } = data;

  // 1. 更新標題與版本
  document.getElementById('current-date-title').innerHTML = `<span class="title-icon">📅</span> <span class="title-text">${t('usage_report')}${date}</span>`;
  if (data.raw_entries && data.raw_entries.length > 0) {
    const firstVer = data.raw_entries[0].version;
    document.getElementById('copilot-version-badge').textContent = `CLI v${firstVer || '1.0.x'}`;
  }

  // 2. 更新側邊欄指標卡片
  document.getElementById('mini-sessions').textContent = summary.total_sessions;
  document.getElementById('mini-tokens').textContent = formatToken(summary.total_tokens);
  document.getElementById('mini-cache').textContent = `${t('cache_read_label')}: ${formatToken(summary.total_cache_read_tokens)}`;
  document.getElementById('mini-cost').textContent = formatCost(summary.total_cost_usd || 0);
  document.getElementById('mini-duration').textContent = formatDuration(summary.total_duration_ms);
  document.getElementById('mini-requests').textContent = summary.total_requests;

  // 3. 更新主看板 Metric Cards
  document.getElementById('stat-total-tokens').textContent = formatToken(summary.total_tokens);
  document.getElementById('stat-cache-read').textContent = `${t('cache_read_label')}: ${formatToken(summary.total_cache_read_tokens)} (${calculatePercentage(summary.total_cache_read_tokens, summary.total_tokens)})`;

  document.getElementById('stat-input-tokens').textContent = formatToken(summary.total_input_tokens);
  document.getElementById('stat-input-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_input_tokens, summary.total_tokens)}`;

  document.getElementById('stat-output-tokens').textContent = formatToken(summary.total_output_tokens);
  document.getElementById('stat-output-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_output_tokens, summary.total_tokens)}`;

  document.getElementById('stat-reasoning-tokens').textContent = formatToken(summary.total_reasoning_tokens);
  document.getElementById('stat-reasoning-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_reasoning_tokens, summary.total_tokens)}`;

  document.getElementById('stat-total-cost').textContent = formatCost(summary.total_cost_usd || 0);

  // 4. 繪製 Token 圖表
  renderChart(sessions);

  // 5. 渲染 Session 列表
  currentSessions = [...sessions];
  sortAndRenderSessionTable();
}

// =========================================================================
// 渲染 Chart.js Token 使用趨勢圖
// =========================================================================
function renderChart(sessions) {
  const canvas = document.getElementById('tokenChart');

  // 只取前 15 個 Session 來畫，避免過於擁擠
  const sortedSessions = [...sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const displaySessions = sortedSessions.slice(-15);

  currentChartSessions = displaySessions;

  const labels = displaySessions.map((s, idx) => {
    const timeStr = s.timestamp ? formatLocalTime(s.timestamp, false) : '';
    return `${timeStr} (${s.session_name.substring(0, 10)}...)`;
  });

  const tokenData = displaySessions.map(s => s.total_tokens);
  const cacheData = displaySessions.map(s => s.total_cache_read_tokens || 0);
  const maxTurnData = displaySessions.map(s => s.max_turn_no);

  // 若圖表已存在，則動態更新數據以達到平滑變動效果
  if (tokenChartInstance) {
    tokenChartInstance.data.labels = labels;
    tokenChartInstance.data.datasets[0].label = t('chart_token_label');
    tokenChartInstance.data.datasets[1].label = t('chart_cache_label');
    tokenChartInstance.data.datasets[2].label = t('chart_turn_label');
    tokenChartInstance.data.datasets[0].data = tokenData;
    tokenChartInstance.data.datasets[1].data = cacheData;
    tokenChartInstance.data.datasets[2].data = maxTurnData;
    if (tokenChartInstance.options.scales && tokenChartInstance.options.scales.y && tokenChartInstance.options.scales.y.title) {
      tokenChartInstance.options.scales.y.title.text = t('col_total');
    }
    if (tokenChartInstance.options.scales && tokenChartInstance.options.scales.y1 && tokenChartInstance.options.scales.y1.title) {
      tokenChartInstance.options.scales.y1.title.text = t('col_turns');
    }
    tokenChartInstance.update();
    return;
  }

  tokenChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: t('chart_token_label'),
          data: tokenData,
          backgroundColor: 'rgba(0, 242, 254, 0.22)',
          borderColor: '#00f2fe',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y',
          grouped: false,
          barPercentage: 0.8,
        },
        {
          label: t('chart_cache_label'),
          data: cacheData,
          backgroundColor: 'rgba(129, 140, 248, 0.75)',
          borderColor: '#818cf8',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y',
          grouped: false,
          barPercentage: 0.8,
        },
        {
          label: t('chart_turn_label'),
          data: maxTurnData,
          type: 'line',
          borderColor: '#9b51e0',
          backgroundColor: 'rgba(155, 81, 224, 0.2)',
          borderWidth: 2,
          pointBackgroundColor: '#9b51e0',
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const session = currentChartSessions[index];
          if (session) {
            openSessionTimeline(
              session.session_id,
              session.session_name,
              session.total_tokens,
              session.total_cache_read_tokens,
              session.total_input_tokens,
              session.total_output_tokens,
              session.total_reasoning_tokens,
              session.cwd,
              session.model,
              session.agent_nickname,
              session.agent_role
            );
          }
        }
      },
      onHover: (event, activeElements) => {
        canvas.style.cursor = activeElements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          labels: {
            color: '#f3f4f6',
            font: {
              family: 'Outfit'
            }
          }
        },
        tooltip: {
          padding: 12,
          backgroundColor: 'rgba(15, 18, 29, 0.95)',
          titleColor: '#00f2fe',
          bodyColor: '#f3f4f6',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              if (label.includes('Token')) {
                return `${label}: ${formatToken(value)} (${formatNumber(value)})`;
              }
              return `${label}: ${formatNumber(value)}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: false,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              size: 10
            }
          }
        },
        y: {
          stacked: false,
          type: 'linear',
          position: 'left',
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            callback: (value) => formatToken(value)
          },
          title: {
            display: true,
            text: t('col_total'),
            color: '#f3f4f6'
          }
        },
        y1: {
          stacked: false,
          type: 'linear',
          position: 'right',
          grid: {
            drawOnChartArea: false, // 不畫右邊 y1 的格線避免混淆
          },
          ticks: {
            color: '#9ca3af',
            stepSize: 1
          },
          title: {
            display: true,
            text: t('col_turns')
          }
        }
      }
    }
  });

  // 根據當前主題更新圖表樣式
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateChartsTheme(currentTheme);
}

// =========================================================================
// 會話列表排序邏輯與事件監聽
// =========================================================================
function initTableSorting() {
  const headers = document.querySelectorAll('.premium-table th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      const tableType = th.getAttribute('data-table');
      
      if (tableType === 'monthly') {
        // 月度每日彙總表格排序
        if (monthlyDailySortColumn === column) {
          monthlyDailySortDirection = monthlyDailySortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          monthlyDailySortColumn = column;
          monthlyDailySortDirection = 'desc'; // 預設降冪排序
        }
        sortAndRenderMonthlyDailyTable();
      } else {
        // 會話列表排序
        if (currentSortColumn === column) {
          // 切換排序方向
          currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortColumn = column;
          // 數值欄位預設由大到小排序，字串/時間欄位預設由小到大排序
          const numericColumns = [
            'max_turn_no', 
            'total_input_tokens', 
            'total_output_tokens', 
            'total_cache_read_tokens', 
            'total_tokens', 
            'duration_ms'
          ];
          currentSortDirection = numericColumns.includes(column) ? 'desc' : 'asc';
        }
        sortAndRenderSessionTable();
      }
    });
  });
}

// =========================================================================
// 樹狀化與扁平化 Session，以在排序時依然維持 Subagent 階層關係
// =========================================================================
function sortAndGetFlatSessions(sessions, sortCol, sortDir) {
  const map = {};
  sessions.forEach(s => {
    map[s.session_id] = { ...s, children: [] };
  });

  const roots = [];
  sessions.forEach(s => {
    const item = map[s.session_id];
    if (s.parent_session_id && map[s.parent_session_id]) {
      map[s.parent_session_id].children.push(item);
    } else {
      roots.push(item);
    }
  });

  const compare = (a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (valA === undefined || valA === null) valA = 0;
    if (valB === undefined || valB === null) valB = 0;

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortDir === 'asc' ? valA - valB : valB - valA;
  };

  // 排序 Root 節點
  roots.sort(compare);

  // 遞迴排序子節點
  const sortTree = (node) => {
    node.children.sort(compare);
    node.children.forEach(sortTree);
  };
  roots.forEach(sortTree);

  // 扁平化
  const flat = [];
  const traverse = (node, depth, parentName) => {
    flat.push({
      ...node,
      depth,
      isSubagent: depth > 0,
      parentName
    });
    node.children.forEach(child => traverse(child, depth + 1, node.session_name));
  };
  roots.forEach(r => traverse(r, 0, null));

  return flat;
}

function sortAndRenderSessionTable() {
  if (!currentSessions || currentSessions.length === 0) {
    renderSessionTable([]);
    return;
  }

  const flatSessions = sortAndGetFlatSessions(currentSessions, currentSortColumn, currentSortDirection);
  renderSessionTable(flatSessions);
  updateSortHeadersUI();
}

function updateSortHeadersUI() {
  const headers = document.querySelectorAll('.premium-table th.sortable:not([data-table="monthly"])');
  headers.forEach(th => {
    const column = th.getAttribute('data-sort');
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;

    th.classList.remove('sorted-asc', 'sorted-desc');
    
    if (column === currentSortColumn) {
      if (currentSortDirection === 'asc') {
        th.classList.add('sorted-asc');
        icon.innerHTML = '▴';
      } else {
        th.classList.add('sorted-desc');
        icon.innerHTML = '▾';
      }
    } else {
      icon.innerHTML = '<span class="sort-icon-placeholder">▴▾</span>';
    }
  });
}

// =========================================================================
// 渲染 Session 列表 Table
// =========================================================================
function renderSessionTable(sessions) {
  const tbody = document.getElementById('session-list-body');
  document.getElementById('session-count').textContent = `${sessions.length} Sessions`;
  tbody.innerHTML = '';

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="placeholder-text">${t('placeholder_no_sessions')}</td></tr>`;
    return;
  }

  // 建立快速查詢 Map
  const sessionsMap = {};
  sessions.forEach(s => {
    sessionsMap[s.session_id] = s;
  });

  // 尋找最終 Root 父會話 ID 的 helper
  function getRootParentId(session) {
    let curr = session;
    while (curr && curr.parent_session_id && sessionsMap[curr.parent_session_id]) {
      curr = sessionsMap[curr.parent_session_id];
    }
    return curr ? curr.session_id : session.session_id;
  }

  sessions.forEach(s => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-session-id', s.session_id);
    tr.setAttribute('data-parent-id', s.parent_session_id || '');

    if (s.isSubagent) {
      tr.classList.add('subagent-row');
    }
    
    // 格式化時間
    const timeFormatted = s.timestamp ? formatLocalTime(s.timestamp, true) : '-';

    // 依據 depth 縮排會話名稱，並呈現└─ 符號與 subagent tag
    let nameCellContent = '';
    if (s.isSubagent) {
      const paddingLeft = s.depth * 16;
      const connectorLeft = (s.depth - 1) * 16 + 4;
      const nickname = s.agent_nickname || '';
      const role = s.agent_role || '';
      nameCellContent = `
        <div class="session-name-wrapper is-subagent" style="padding-left: ${paddingLeft}px;">
          <span class="tree-connector" style="left: ${connectorLeft}px;">└─</span>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 3px;">
            <span class="badge subagent-badge" title="Subagent of: ${escapeHtml(s.parentName || '')}">Subagent</span>
            ${nickname ? `<span class="badge agent-nickname-badge" title="Agent Nickname: ${escapeHtml(nickname)}">${escapeHtml(nickname)}</span>` : ''}
            ${role ? `<span class="badge agent-role-badge" title="Agent Role: ${escapeHtml(role)}">${escapeHtml(role)}</span>` : ''}
          </div>
          <span class="session-name-text" title="${escapeHtml(s.session_name)}">${escapeHtml(s.session_name)}</span>
          <span class="session-id-sub">${s.session_id}</span>
        </div>
      `;
    } else {
      nameCellContent = `
        <div class="session-name-wrapper">
          <span class="session-name-text" title="${escapeHtml(s.session_name)}">${escapeHtml(s.session_name)}</span>
          <span class="session-id-sub">${s.session_id}</span>
        </div>
      `;
    }

    tr.innerHTML = `
      <td class="session-name-cell">
        ${nameCellContent}
      </td>
      <td><span class="badge highlight">${escapeHtml(s.model)}</span></td>
      <td><span class="badge">${s.max_turn_no}</span></td>
      <td style="color: var(--text-secondary);">${formatToken(s.total_input_tokens || 0)}</td>
      <td style="color: var(--text-secondary);">${formatToken(s.total_output_tokens || 0)}</td>
      <td style="color: #a78bfa;">${formatToken(s.total_reasoning_tokens || 0)}</td>
      <td style="color: #34d399;">${formatToken(s.total_cache_read_tokens || 0)}</td>
      <td style="font-weight: 700; color: #fbbf24;">${formatToken(s.total_tokens)}</td>
      <td style="font-weight: 700; color: var(--accent-cyan);">${formatCost(s.cost_usd || 0)}</td>
      <td>${formatDuration(s.duration_ms)}</td>
      <td style="color: var(--text-secondary);">${timeFormatted}</td>
    `;

    // 當點擊 Session 時，開啟對話詳細還原
    tr.addEventListener('click', () => {
      openSessionTimeline(
        s.session_id,
        s.session_name,
        s.total_tokens,
        s.total_cache_read_tokens,
        s.total_input_tokens,
        s.total_output_tokens,
        s.total_reasoning_tokens,
        s.cwd,
        s.model,
        s.agent_nickname,
        s.agent_role
      );
    });

    // 群組 Hover 高亮
    tr.addEventListener('mouseenter', () => {
      const rootId = getRootParentId(s);
      tbody.querySelectorAll('tr').forEach(row => {
        const sid = row.getAttribute('data-session-id');
        const pid = row.getAttribute('data-parent-id');
        const rowSession = sessionsMap[sid];
        
        if (sid === rootId || pid === rootId || (rowSession && getRootParentId(rowSession) === rootId)) {
          row.classList.add('family-highlight');
        }
      });
    });

    tr.addEventListener('mouseleave', () => {
      tbody.querySelectorAll('tr').forEach(row => {
        row.classList.remove('family-highlight');
      });
    });

    tbody.appendChild(tr);
  });
}

// =========================================================================
// API 呼叫: 載入並渲染特定 Session 對話時間軸 (Timeline)
// =========================================================================
async function openSessionTimeline(sessionId, sessionName, totalTokens, cacheReadTokens, inputTokens, outputTokens, reasoningTokens, cwd, model, agentNickname, agentRole) {
  const drawerOverlay = document.getElementById('timeline-drawer');
  const timelineContainer = document.getElementById('timeline-items');

  // 保存當前點擊之 Session 的正確統計與資訊以作為 Fallback
  currentSessionTotalTokens = totalTokens || 0;
  currentSessionCacheTokens = cacheReadTokens || 0;
  currentSessionInputTokens = inputTokens || 0;
  currentSessionOutputTokens = outputTokens || 0;
  currentSessionReasoningTokens = reasoningTokens || 0;
  currentSessionCwd = cwd || '';
  currentSessionModel = model || '';

  // 設定基礎抬頭 (截斷至 100 字元，滑鼠移過去可以看到全部)
  let displayName = sessionName || '';
  if (displayName.length > 100) {
    displayName = displayName.substring(0, 100) + '...';
  }
  const nameEl = document.getElementById('drawer-session-name');
  nameEl.textContent = displayName;
  nameEl.title = sessionName || '';
  document.getElementById('drawer-session-id').textContent = sessionId;

  // 更新會話 Token & 基礎資訊（立即呈現在畫面上）
  document.getElementById('meta-cwd').textContent = cwd || '-';
  document.getElementById('meta-cwd').title = cwd || '';
  document.getElementById('meta-model').textContent = model || '-';
  document.getElementById('meta-tokens').textContent = formatToken(totalTokens || 0);
  document.getElementById('meta-cache').textContent = formatToken(cacheReadTokens || 0);
  document.getElementById('meta-compaction').textContent = '-';
  document.getElementById('meta-input').textContent = formatToken(inputTokens || 0);
  document.getElementById('meta-output').textContent = formatToken(outputTokens || 0);
  document.getElementById('meta-reasoning').textContent = formatToken(reasoningTokens || 0);

  const nicknameContainer = document.getElementById('drawer-meta-nickname-container');
  const roleContainer = document.getElementById('drawer-meta-role-container');

  if (agentNickname) {
    document.getElementById('meta-nickname').textContent = agentNickname;
    nicknameContainer.style.display = 'flex';
  } else {
    nicknameContainer.style.display = 'none';
  }

  if (agentRole) {
    document.getElementById('meta-role').textContent = agentRole;
    roleContainer.style.display = 'flex';
  } else {
    roleContainer.style.display = 'none';
  }

  // 顯示加載動畫
  timelineContainer.innerHTML = `<div class="placeholder-text">${t('drawer_loading')}</div>`;
  
  // 顯示抽屜面板
  drawerOverlay.classList.add('active');

  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.status === 404) {
      timelineContainer.innerHTML = `<div class="placeholder-text" style="color: var(--neon-red);">${t('drawer_load_failed_cleaned')}</div>`;
      return;
    }

    const data = await res.json();
    renderTimeline(data);

  } catch (err) {
    console.error('獲取會話細節失敗:', err);
    timelineContainer.innerHTML = `<div class="placeholder-text" style="color: var(--neon-red);">${t('drawer_load_failed')}</div>`;
  }
}

// 關閉抽屜
function closeDrawer() {
  document.getElementById('timeline-drawer').classList.remove('active');
}

// =========================================================================
// 渲染 Session 詳細時間軸 (Timeline) 內容
// =========================================================================
function renderTimeline(data) {
  const { metadata, timeline } = data;
  const timelineContainer = document.getElementById('timeline-items');
  timelineContainer.innerHTML = '';

  // 取得最終使用的基礎資訊（API 回傳優先，沒有則 fallback 到列表正確欄位）
  const finalCwd = metadata.cwd || currentSessionCwd || '-';
  const finalModel = metadata.selected_model || currentSessionModel || '-';

  // 更新 Metadata 區塊
  document.getElementById('meta-cwd').textContent = finalCwd;
  document.getElementById('meta-cwd').title = finalCwd;
  document.getElementById('meta-branch').textContent = metadata.git_branch || '-';
  document.getElementById('meta-model').textContent = finalModel;
  document.getElementById('meta-repo').textContent = metadata.repository || '-';
  document.getElementById('meta-repo').title = metadata.repository || '';

  const nicknameContainer = document.getElementById('drawer-meta-nickname-container');
  const roleContainer = document.getElementById('drawer-meta-role-container');

  if (metadata.agent_nickname) {
    document.getElementById('meta-nickname').textContent = metadata.agent_nickname;
    nicknameContainer.style.display = 'flex';
  } else {
    nicknameContainer.style.display = 'none';
  }

  if (metadata.agent_role) {
    document.getElementById('meta-role').textContent = metadata.agent_role;
    roleContainer.style.display = 'flex';
  } else {
    roleContainer.style.display = 'none';
  }

  // 取得最終使用的 Token 數據（若單一 session events 日誌無 token stats，則使用列表正確累積數據）
  const finalTotal = metadata.total_tokens || currentSessionTotalTokens || 0;
  const finalCache = metadata.total_cache_read_tokens || currentSessionCacheTokens || 0;
  const finalInput = metadata.total_input_tokens || currentSessionInputTokens || 0;
  const finalOutput = metadata.total_output_tokens || currentSessionOutputTokens || 0;
  const finalReasoning = metadata.total_reasoning_tokens || currentSessionReasoningTokens || 0;

  document.getElementById('meta-tokens').textContent = formatToken(finalTotal);
  document.getElementById('meta-cache').textContent = formatToken(finalCache);
  document.getElementById('meta-compaction').textContent = metadata.compaction_count || 0;
  document.getElementById('meta-input').textContent = formatToken(finalInput);
  document.getElementById('meta-output').textContent = formatToken(finalOutput);
  document.getElementById('meta-reasoning').textContent = formatToken(finalReasoning);

  if (!timeline || timeline.length === 0) {
    timelineContainer.innerHTML = `<div class="placeholder-text">${t('drawer_no_events')}</div>`;
    return;
  }

  // 渲染時間軸物件，使用單一回合序號進行對齊
  const hasUserPrompts = timeline.some(item => item.event_type === 'UserPrompt');
  let currentTurnNo = 1;
  let isFirstPrompt = true;

  timeline.forEach(item => {
    const timeStr = item.event_data.timestamp ? formatLocalTime(item.event_data.timestamp, true) : '';
    const div = document.createElement('div');
    div.className = 'timeline-item-wrapper';

    switch (item.event_type) {
      case 'UserPrompt': {
        if (!isFirstPrompt) {
          currentTurnNo++;
        }
        isFirstPrompt = false;
        const prompt = item.event_data.prompt;
        const turnNo = item.event_data.turn_no || currentTurnNo;
        
        let attachmentsHTML = '';
        if (item.event_data.attachments && item.event_data.attachments.length > 0) {
          attachmentsHTML = `<div class="bubble-attachments">`;
          item.event_data.attachments.forEach(att => {
            const path = att.filePath || att.path || '檔名未知';
            const basename = path.split('/').pop();
            const attType = att.type || 'file';
            attachmentsHTML += `
              <div class="attachment-badge" title="${escapeHtml(path)}">
                📎 <strong>[${escapeHtml(attType)}]</strong> ${escapeHtml(basename)}
              </div>
            `;
          });
          attachmentsHTML += `</div>`;
        }

        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="user-bubble">
            <div class="bubble-header">
              <div class="header-left">
                <span class="turn-no-badge">#${turnNo}</span>
                <span class="sender">${t('sender_user')}</span>
              </div>
              <span class="time">${timeStr}</span>
            </div>
            <div class="prompt-content-wrapper">
              <div class="prompt-text collapsed">${escapeHtml(prompt)}</div>
              <button class="prompt-toggle-btn">
                <span class="btn-text">${t('expand_reply')}</span> <span class="arrow">▼</span>
              </button>
            </div>
            ${attachmentsHTML}
          </div>
        `;

        // 綁定提問摺疊按鈕事件
        const promptText = div.querySelector('.prompt-text');
        const promptToggleBtn = div.querySelector('.prompt-toggle-btn');
        if (promptText && promptToggleBtn) {
          promptToggleBtn.addEventListener('click', () => {
            const isCollapsed = promptText.classList.contains('collapsed');
            if (isCollapsed) {
              promptText.classList.remove('collapsed');
              promptText.classList.add('expanded');
              promptToggleBtn.classList.add('expanded');
              promptToggleBtn.querySelector('.btn-text').textContent = t('collapse_reply');
              promptToggleBtn.querySelector('.arrow').textContent = '▲';
            } else {
              promptText.classList.remove('expanded');
              promptText.classList.add('collapsed');
              promptToggleBtn.classList.remove('expanded');
              promptToggleBtn.querySelector('.btn-text').textContent = t('expand_reply');
              promptToggleBtn.querySelector('.arrow').textContent = '▼';
            }
          });
        }

        break;
      }

      case 'AssistantReply': {
        const replyMarkdown = item.event_data.reply;
        const model = item.event_data.model;
        const outTokens = item.event_data.output_tokens;
        const inTokens = item.event_data.input_tokens;
        const cacheReadTokens = item.event_data.cache_read_tokens;
        const cacheWriteTokens = item.event_data.cache_write_tokens;
        const reasoningTokens = item.event_data.reasoning_tokens;
        const totalTokens = item.event_data.total_tokens || ((inTokens || outTokens) ? ((inTokens || 0) + (outTokens || 0)) : null);
        const turnNo = item.event_data.turn_no || currentTurnNo;

        // 如果 content 為空但有 Tool 呼叫，代表助理正在使用工具
        let replyHtml = '';
        const toolRequests = item.event_data.tool_requests || [];
        const hasTools = toolRequests.length > 0;

        if (!replyMarkdown && hasTools) {
          replyHtml = `<span style="font-style: italic; color: var(--text-muted);">${t('thinking_tools')}</span>`;
        } else {
          replyHtml = marked.parse(replyMarkdown || '');
        }

        // 建立詳細 Token 資訊區塊 (in, out, reasoning, cache, total)
        let tokenBadge = '';
        if (totalTokens || inTokens || outTokens || cacheReadTokens || reasoningTokens) {
          tokenBadge = `
            <div class="turn-token-stats">
              ${inTokens ? `<span class="token-badge input" title="輸入 Token (Input Tokens)">In: ${formatToken(inTokens)}</span>` : ''}
              ${outTokens ? `<span class="token-badge output" title="輸出 Token (Output Tokens)">Out: ${formatToken(outTokens)}</span>` : ''}
              ${reasoningTokens ? `<span class="token-badge reasoning" title="推理 Token (Reasoning Tokens)">Reasoning: ${formatToken(reasoningTokens)}</span>` : ''}
              ${cacheReadTokens ? `<span class="token-badge cache" title="快取讀取 Token (Cache Read Tokens)">Cache: ${formatToken(cacheReadTokens)}</span>` : ''}
              ${totalTokens ? `<span class="token-badge total" title="總 Token (Total Tokens)">Total: ${formatToken(totalTokens)}</span>` : ''}
            </div>
          `;
        }

        let copyButtonHtml = '';
        if (replyMarkdown) {
          copyButtonHtml = `
            <button class="copy-markdown-btn" title="${t('copy_markdown_title')}">
              📋 <span class="btn-text">${t('copy_markdown')}</span>
            </button>
          `;
        }

        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="assistant-bubble">
            <div class="bubble-header">
              <div class="header-left">
                <span class="turn-no-badge">#${turnNo}</span>
                <span class="sender">${t('sender_agent')} (${escapeHtml(model)})</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                ${copyButtonHtml}
                <span class="time">${timeStr}</span>
              </div>
            </div>
            ${tokenBadge}
            <div class="reply-content-wrapper">
              <div class="reply-content collapsed">${replyHtml}</div>
              <button class="reply-toggle-btn">
                <span class="btn-text">${t('expand_reply')}</span> <span class="arrow">▼</span>
              </button>
            </div>
          </div>
        `;

        // 綁定摺疊按鈕事件
        const replyContent = div.querySelector('.reply-content');
        const toggleBtn = div.querySelector('.reply-toggle-btn');
        if (replyContent && toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            const isCollapsed = replyContent.classList.contains('collapsed');
            if (isCollapsed) {
              replyContent.classList.remove('collapsed');
              replyContent.classList.add('expanded');
              toggleBtn.classList.add('expanded');
              toggleBtn.querySelector('.btn-text').textContent = t('collapse_reply');
              toggleBtn.querySelector('.arrow').textContent = '▲';
            } else {
              replyContent.classList.remove('expanded');
              replyContent.classList.add('collapsed');
              toggleBtn.classList.remove('expanded');
              toggleBtn.querySelector('.btn-text').textContent = t('expand_reply');
              toggleBtn.querySelector('.arrow').textContent = '▼';
            }
          });
        }

        // 如果此助理訊息沒有調用任何 Tool，且此會話沒有使用者提問事件，則將回合序號遞增 1
        if (!hasTools && !hasUserPrompts) {
          currentTurnNo++;
        }

        // 綁定複製 Markdown 事件
        if (replyMarkdown) {
          const copyBtn = div.querySelector('.copy-markdown-btn');
          if (copyBtn) {
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(replyMarkdown).then(() => {
                const btnTextEl = copyBtn.querySelector('.btn-text');
                const originalText = btnTextEl ? btnTextEl.textContent : 'Copy Markdown';
                if (btnTextEl) btnTextEl.textContent = t('copy_success');
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                  if (btnTextEl) btnTextEl.textContent = originalText;
                  copyBtn.classList.remove('copied');
                }, 2000);
              }).catch((err) => {
                console.error('Failed to copy text: ', err);
                showNotification(t('copy_failed'), 'error');
              });
            });
          }
        }

        break;
      }

      case 'ToolStep': {
        const toolName = item.event_data.tool_name;
        const args = item.event_data.arguments;
        const result = item.event_data.result;

        const isSuccess = result !== null && result !== undefined;
        const badgeClass = isSuccess ? 'badge success' : 'badge executing';
        const badgeText = isSuccess ? 'Success' : 'Executing';

        // 格式化 Args & Result 為 Pre 區塊
        const argsStr = args ? JSON.stringify(args, null, 2) : '{}';
        
        let resultStr = t('no_returned_data');
        if (result) {
          if (result.textResultForLlm) {
            resultStr = result.textResultForLlm;
          } else if (result.content) {
            resultStr = result.content;
          } else {
            resultStr = JSON.stringify(result, null, 2);
          }
        }

        // 限制顯示長度，防止大日誌撐爆介面
        const truncatedResultStr = resultStr.length > 1500 ? resultStr.substring(0, 1500) + '\n' + t('data_truncated') : resultStr;

        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="tool-step-bubble">
            <div class="tool-header">
              <div class="tool-info">
                🔧 <span class="tool-name">${escapeHtml(toolName)}</span>
                <span class="${badgeClass}">${badgeText}</span>
              </div>
              <span class="toggle-icon">▶</span>
            </div>
            <div class="tool-details">
              <div class="detail-section">
                <span>${t('tool_arguments')}</span>
                <pre><code>${escapeHtml(argsStr)}</code></pre>
              </div>
              <div class="detail-section">
                <span>${t('tool_result')}</span>
                <pre><code>${escapeHtml(truncatedResultStr)}</code></pre>
              </div>
            </div>
          </div>
        `;

        // 綁定點擊展開事件
        const header = div.querySelector('.tool-header');
        header.addEventListener('click', () => {
          const bubble = header.closest('.tool-step-bubble');
          bubble.classList.toggle('expanded');
          const icon = header.querySelector('.toggle-icon');
          icon.textContent = bubble.classList.contains('expanded') ? '▼' : '▶';
        });

        break;
      }

      case 'SystemStatus': {
        let message = item.event_data.message;
        if (message === '會話開始 (Session Started)') {
          message = t('session_started');
        } else if (message === '會話結束 (Session Ended)') {
          message = t('session_ended');
        } else if (message === '會話狀態壓縮完成 (Session Compaction Completed)') {
          message = t('session_compaction');
        }

        let emoji = '⚙️';
        if (item.event_data.status_type === 'session_compaction') {
          emoji = '🗜️';
        }

        div.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="system-bubble">
            <div class="system-badge">
              ${emoji} ${escapeHtml(message)} <span class="time">${timeStr}</span>
            </div>
          </div>
        `;
        break;
      }
    }

    timelineContainer.appendChild(div);
  });
}

// =========================================================================
// Helpers / Utilities
// =========================================================================
function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatToken(num) {
  if (num === null || num === undefined) return '-';
  const n = Number(num);
  if (isNaN(n)) return '-';
  if (n >= 1000000) {
    const val = n / 1000000;
    return (val % 1 === 0 ? val : val.toFixed(1)) + 'm';
  }
  if (n >= 1000) {
    const val = n / 1000;
    return (val % 1 === 0 ? val : val.toFixed(1)) + 'k';
  }
  return n.toString();
}

function calculatePercentage(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  
  const totalSecs = ms / 1000;
  if (totalSecs < 60) {
    return `${totalSecs.toFixed(1)}s`;
  }
  
  const totalSecsInt = Math.floor(totalSecs);
  const hours = Math.floor(totalSecsInt / 3600);
  const minutes = Math.floor((totalSecsInt % 3600) / 60);
  const seconds = totalSecsInt % 60;
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    return `${minutes}:${pad(seconds)}`;
  }
}

function formatLocalTime(isoString, includeSeconds = true) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    if (includeSeconds) {
      const seconds = pad(date.getSeconds());
      return `${hours}:${minutes}:${seconds}`;
    }
    return `${hours}:${minutes}`;
  } catch (err) {
    return '';
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================================================================
// API 呼叫: 載入月份清單
// =========================================================================
async function fetchMonths(selectedMonth = null) {
  try {
    const res = await fetch('/api/months');
    const data = await res.json();
    
    const monthSelect = document.getElementById('month-select');
    monthSelect.innerHTML = '';

    if (!data.months || data.months.length === 0) {
      monthSelect.innerHTML = `<option value="" disabled selected>${t('no_month_logs')}</option>`;
      return;
    }

    let monthToLoad = data.months[0];
    let hasSelected = false;

    data.months.forEach((month) => {
      const opt = document.createElement('option');
      opt.value = month;
      opt.textContent = month;
      if (selectedMonth && month === selectedMonth) {
        opt.selected = true;
        monthToLoad = month;
        hasSelected = true;
      }
      monthSelect.appendChild(opt);
    });

    if (!hasSelected) {
      if (monthSelect.options.length > 0) {
        monthSelect.options[0].selected = true;
      }
    }

    if (activeTab === 'monthly') {
      await loadMonthlyData(monthToLoad);
    }

  } catch (err) {
    console.error('獲取月份清單失敗:', err);
    showNotification(t('load_failed'), 'error');
  }
}

async function reloadMonthlyData() {
  const monthSelect = document.getElementById('month-select');
  const selectedMonth = monthSelect.value;
  await fetchMonths(selectedMonth);
}

// =========================================================================
// API 呼叫: 載入單月彙整數據
// =========================================================================
async function loadMonthlyData(month) {
  try {
    document.getElementById('current-date-title').innerHTML = `<span class="title-icon">⌛</span> <span class="title-text">${t('loading_month_prefix')}${month}...</span>`;

    const res = await fetch(`/api/monthly/${month}`);
    if (res.status === 404) {
      showNotification(t('month_not_found'), 'error');
      return;
    }
    
    const data = await res.json();
    renderMonthlyDashboard(data);

  } catch (err) {
    console.error('載入月份彙整失敗:', err);
    showNotification(t('monthly_load_failed'), 'error');
  }
}

// =========================================================================
// 渲染月報看板數據
// =========================================================================
function renderMonthlyDashboard(data) {
  currentMonthlyData = data;
  const { year_month, summary, daily_breakdown, top_models, top_projects } = data;

  // 1. 更新標題與版本
  document.getElementById('current-date-title').innerHTML = `<span class="title-icon">📅</span> <span class="title-text">${t('monthly_report')}${year_month}</span>`;
  document.getElementById('copilot-version-badge').textContent = `Monthly Summary`;

  // 2. 更新指標卡片
  document.getElementById('monthly-stat-total-tokens').textContent = formatToken(summary.total_tokens);
  document.getElementById('monthly-stat-cache-read').textContent = `${t('cache_read_label')}: ${formatToken(summary.total_cache_read_tokens)} (${calculatePercentage(summary.total_cache_read_tokens, summary.total_tokens)})`;

  document.getElementById('monthly-stat-input-tokens').textContent = formatToken(summary.total_input_tokens);
  document.getElementById('monthly-stat-input-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_input_tokens, summary.total_tokens)}`;

  document.getElementById('monthly-stat-output-tokens').textContent = formatToken(summary.total_output_tokens);
  document.getElementById('monthly-stat-output-pct').textContent = `${t('ratio_label')}: ${calculatePercentage(summary.total_output_tokens, summary.total_tokens)}`;

  document.getElementById('monthly-stat-sessions').textContent = summary.total_sessions;
  document.getElementById('monthly-stat-requests').textContent = t('monthly_requests_count').replace('{count}', formatNumber(summary.total_requests));

  document.getElementById('monthly-stat-total-cost').textContent = formatCost(summary.total_cost_usd || 0);

  // 3. 繪製單月每日趨勢圖
  renderMonthlyChart(daily_breakdown);

  // 4. 渲染最常活動專案列表
  renderMonthlyProjectsTable(top_projects);

  // 5. 渲染模型佔比列表
  renderMonthlyModelsTable(top_models);

  // 6. 渲染當月每日彙總列表
  monthlyDailySortColumn = 'date';
  monthlyDailySortDirection = 'desc';
  sortAndRenderMonthlyDailyTable();
}

// =========================================================================
// 渲染單月每日 Token 與 Session 趨勢圖
// =========================================================================
function renderMonthlyChart(dailyBreakdown) {
  currentMonthlyBreakdown = dailyBreakdown;
  const canvas = document.getElementById('monthlyTokenChart');

  // 提取標籤與數據
  const labels = dailyBreakdown.map(entry => entry.date.substring(5)); // 只顯示 MM-DD
  const tokenData = dailyBreakdown.map(entry => entry.total_tokens);
  const cacheData = dailyBreakdown.map(entry => entry.total_cache_read_tokens || 0);
  const sessionData = dailyBreakdown.map(entry => entry.total_sessions);

  // 若圖表已存在，則動態更新數據以達到平滑變動效果
  if (monthlyChartInstance) {
    monthlyChartInstance.data.labels = labels;
    monthlyChartInstance.data.datasets[0].label = t('chart_monthly_token_label');
    monthlyChartInstance.data.datasets[1].label = t('chart_cache_label');
    monthlyChartInstance.data.datasets[2].label = t('chart_monthly_session_label');
    monthlyChartInstance.data.datasets[0].data = tokenData;
    monthlyChartInstance.data.datasets[1].data = cacheData;
    monthlyChartInstance.data.datasets[2].data = sessionData;
    if (monthlyChartInstance.options.scales && monthlyChartInstance.options.scales.y && monthlyChartInstance.options.scales.y.title) {
      monthlyChartInstance.options.scales.y.title.text = t('col_total');
    }
    if (monthlyChartInstance.options.scales && monthlyChartInstance.options.scales.y1 && monthlyChartInstance.options.scales.y1.title) {
      monthlyChartInstance.options.scales.y1.title.text = t('col_sessions_count');
    }
    monthlyChartInstance.update();
    return;
  }

  monthlyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: t('chart_monthly_token_label'),
          data: tokenData,
          backgroundColor: 'rgba(0, 242, 254, 0.22)',
          borderColor: '#00f2fe',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y',
          grouped: false,
          barPercentage: 0.8,
        },
        {
          label: t('chart_cache_label'),
          data: cacheData,
          backgroundColor: 'rgba(129, 140, 248, 0.75)',
          borderColor: '#818cf8',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y',
          grouped: false,
          barPercentage: 0.8,
        },
        {
          label: t('chart_monthly_session_label'),
          data: sessionData,
          type: 'line',
          borderColor: '#ff4b5c',
          backgroundColor: 'rgba(255, 75, 92, 0.2)',
          borderWidth: 2,
          pointBackgroundColor: '#ff4b5c',
          pointRadius: 4,
          tension: 0.2,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const selectedEntry = currentMonthlyBreakdown[index];
          if (selectedEntry && selectedEntry.date) {
            switchToDailyDate(selectedEntry.date);
          }
        }
      },
      onHover: (event, activeElements) => {
        canvas.style.cursor = activeElements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          labels: {
            color: '#f3f4f6',
            font: {
              family: 'Outfit'
            }
          }
        },
        tooltip: {
          padding: 12,
          backgroundColor: 'rgba(15, 18, 29, 0.95)',
          titleColor: '#00f2fe',
          bodyColor: '#f3f4f6',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              if (label.includes('Token')) {
                return `${label}: ${formatToken(value)} (${formatNumber(value)})`;
              }
              return `${label}: ${formatNumber(value)}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: false,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              size: 10
            }
          }
        },
        y: {
          stacked: false,
          type: 'linear',
          position: 'left',
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            callback: (value) => formatToken(value)
          },
          title: {
            display: true,
            text: t('col_total'),
            color: '#f3f4f6'
          }
        },
        y1: {
          stacked: false,
          type: 'linear',
          position: 'right',
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: '#9ca3af',
            stepSize: 1
          },
          title: {
            display: true,
            text: t('col_sessions_count')
          }
        }
      }
    }
  });

  // 根據當前主題更新圖表樣式
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateChartsTheme(currentTheme);
}

// =========================================================================
// 渲染最常活動專案列表 Table
// =========================================================================
function renderMonthlyProjectsTable(projects) {
  const tbody = document.getElementById('monthly-projects-body');
  tbody.innerHTML = '';

  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="placeholder-text">${t('placeholder_no_projects')}</td></tr>`;
    return;
  }

  // 僅取前 15 名
  const displayProjects = projects.slice(0, 15);

  displayProjects.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'default';

    tr.innerHTML = `
      <td style="text-align: center;"><span class="badge ${idx < 3 ? 'highlight' : ''}">${idx + 1}</span></td>
      <td class="cwd-cell" title="${escapeHtml(p.project)}" style="max-width: 250px;">${escapeHtml(p.project)}</td>
      <td><span class="badge">${p.session_count} Sessions</span></td>
      <td style="font-weight: 700; color: var(--accent-cyan);">
        ${formatToken(p.total_tokens)}
        ${p.total_cache_read_tokens ? `<div style="font-size: 0.72rem; font-weight: normal; color: #a5b4fc; margin-top: 3px;" title="${t('chart_cache_label')}">${t('cache_prefix')}${formatToken(p.total_cache_read_tokens)}</div>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================================
// 渲染模型佔比列表 Table
// =========================================================================
function renderMonthlyModelsTable(models) {
  const tbody = document.getElementById('monthly-models-body');
  tbody.innerHTML = '';

  if (models.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="placeholder-text">${t('placeholder_no_models')}</td></tr>`;
    return;
  }

  models.forEach((m, idx) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'default';

    tr.innerHTML = `
      <td style="text-align: center;"><span class="badge ${idx < 3 ? 'highlight' : ''}">${idx + 1}</span></td>
      <td><span class="badge highlight">${escapeHtml(m.model)}</span></td>
      <td><span class="badge">${m.session_count} Sessions</span></td>
      <td style="font-weight: 700; color: var(--accent-purple);">
        ${formatToken(m.total_tokens)}
        ${m.total_cache_read_tokens ? `<div style="font-size: 0.72rem; font-weight: normal; color: #a5b4fc; margin-top: 3px;" title="${t('chart_cache_label')}">${t('cache_prefix')}${formatToken(m.total_cache_read_tokens)}</div>` : ''}
      </td>
      <td style="font-weight: 700; color: var(--neon-gold);">${formatCost(m.cost_usd || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================================
// 渲染當月每日彙總 Table
// =========================================================================
function renderMonthlyDailySummaryTable(dailyBreakdown) {
  const tbody = document.getElementById('monthly-daily-summary-body');
  tbody.innerHTML = '';

  if (!dailyBreakdown || dailyBreakdown.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder-text">${t('placeholder_no_daily_summary')}</td></tr>`;
    return;
  }

  dailyBreakdown.forEach(entry => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    
    // 點選整列可跳轉並帶入該日期查詢
    tr.addEventListener('click', () => {
      switchToDailyDate(entry.date);
    });

    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--accent-cyan);">${escapeHtml(entry.date)}</td>
      <td style="color: var(--text-secondary);">${formatToken(entry.total_input_tokens || 0)}</td>
      <td style="color: var(--text-secondary);">${formatToken(entry.total_output_tokens || 0)}</td>
      <td style="color: #a78bfa;">${formatToken(entry.total_reasoning_tokens || 0)}</td>
      <td style="color: #34d399;">${formatToken(entry.total_cache_read_tokens || 0)}</td>
      <td style="font-weight: 700; color: #fbbf24;">${formatToken(entry.total_tokens)}</td>
      <td style="font-weight: 700; color: var(--neon-gold);">${formatCost(entry.cost_usd || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function sortAndRenderMonthlyDailyTable() {
  if (!currentMonthlyBreakdown || currentMonthlyBreakdown.length === 0) {
    renderMonthlyDailySummaryTable([]);
    return;
  }

  currentMonthlyBreakdown.sort((a, b) => {
    let valA, valB;
    if (monthlyDailySortColumn === 'date') {
      valA = a.date;
      valB = b.date;
    } else {
      const keyMap = {
        'input': 'total_input_tokens',
        'output': 'total_output_tokens',
        'reasoning': 'total_reasoning_tokens',
        'cache': 'total_cache_read_tokens',
        'total': 'total_tokens',
        'cost': 'cost_usd'
      };
      const field = keyMap[monthlyDailySortColumn] || monthlyDailySortColumn;
      valA = a[field];
      valB = b[field];
    }

    // 空值處理
    if (valA === undefined || valA === null) valA = 0;
    if (valB === undefined || valB === null) valB = 0;

    if (typeof valA === 'string' && typeof valB === 'string') {
      return monthlyDailySortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }

    return monthlyDailySortDirection === 'asc' ? valA - valB : valB - valA;
  });

  renderMonthlyDailySummaryTable(currentMonthlyBreakdown);
  updateMonthlySortHeadersUI();
}

function updateMonthlySortHeadersUI() {
  const headers = document.querySelectorAll('.premium-table th.sortable[data-table="monthly"]');
  headers.forEach(th => {
    const column = th.getAttribute('data-sort');
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;

    th.classList.remove('sorted-asc', 'sorted-desc');
    
    if (column === monthlyDailySortColumn) {
      if (monthlyDailySortDirection === 'asc') {
        th.classList.add('sorted-asc');
        icon.innerHTML = '▴';
      } else {
        th.classList.add('sorted-desc');
        icon.innerHTML = '▾';
      }
    } else {
      icon.innerHTML = '<span class="sort-icon-placeholder">▴▾</span>';
    }
  });
}

// =========================================================================
// 顯示精緻浮動通知 (Toast)
// =========================================================================
function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '24px';
    container.style.right = '24px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'glass-card';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '10px';
  toast.style.boxShadow = 'var(--shadow-lg)';
  toast.style.border = '1px solid var(--glass-border)';
  toast.style.animation = 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '500';

  if (!document.getElementById('toast-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-styles';
    style.innerHTML = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }

  let icon = 'ℹ️';
  let color = 'var(--accent-cyan)';
  if (type === 'success') {
    icon = '✅';
    color = 'var(--neon-green)';
  } else if (type === 'error') {
    icon = '❌';
    color = 'var(--neon-red)';
  }

  toast.innerHTML = `<span style="font-size: 16px;">${icon}</span> <span style="color: ${color}; font-family: var(--font-display);">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3000);
}

// =========================================================================
// 主題切換 (Light / Dark Theme Toggle)
// =========================================================================
function initThemeToggle() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeButton(newTheme);
      
      // 動態更新 Chart.js 顏色
      updateChartsTheme(newTheme);
    });
  }
}

function updateThemeButton(theme) {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? '🌞' : '🌙';
    themeBtn.title = theme === 'dark' ? t('theme_toggle_title_dark') : t('theme_toggle_title_light');
  }
}

function updateChartsTheme(theme) {
  const isLight = theme === 'light';
  const textColor = isLight ? '#1e293b' : '#f3f4f6';
  const mutedColor = isLight ? '#64748b' : '#9ca3af';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
  const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 18, 29, 0.95)';
  const tooltipBorder = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';

  [tokenChartInstance, monthlyChartInstance].forEach(chart => {
    if (chart) {
      // 更新標籤文字顏色
      if (chart.options.plugins.legend && chart.options.plugins.legend.labels) {
        chart.options.plugins.legend.labels.color = textColor;
      }
      // 更新 Tooltip 樣式
      if (chart.options.plugins.tooltip) {
        chart.options.plugins.tooltip.backgroundColor = tooltipBg;
        chart.options.plugins.tooltip.titleColor = isLight ? '#0284c7' : '#00f2fe';
        chart.options.plugins.tooltip.bodyColor = textColor;
        chart.options.plugins.tooltip.borderColor = tooltipBorder;
      }
      // 更新軸線刻度與網格顏色
      if (chart.options.scales) {
        Object.keys(chart.options.scales).forEach(scaleKey => {
          const scale = chart.options.scales[scaleKey];
          if (scale.grid) {
            scale.grid.color = gridColor;
          }
          if (scale.ticks) {
            scale.ticks.color = mutedColor;
          }
          if (scale.title) {
            scale.title.color = textColor;
          }
        });
      }
      chart.update();
    }
  });
}

// =========================================================================
// Setup Guide Modal & Clipboard Dynamic Logic
// =========================================================================
function initSetupGuide() {
  const setupBtn = document.getElementById('btn-setup-guide');
  const closeBtn = document.getElementById('close-setup-modal-btn');
  const modalOverlay = document.getElementById('setup-guide-modal');

  if (setupBtn && modalOverlay) {
    setupBtn.addEventListener('click', openSetupModal);
  }

  if (closeBtn && modalOverlay) {
    closeBtn.addEventListener('click', closeSetupModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeSetupModal();
      }
    });
  }

  // Bind Escape key to close setup modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSetupModal();
    }
  });

  // Load absolute script path info and build clipboard configs dynamically
  loadSetupInfo();

  // Bind clipboard copy buttons
  initClipboardButtons();
}

function openSetupModal() {
  const modal = document.getElementById('setup-guide-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeSetupModal() {
  const modal = document.getElementById('setup-guide-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function loadSetupInfo() {
  try {
    const res = await fetch('/api/setup-info');
    const data = await res.json();
    
    // Dynamic values based on home_dir
    const homeDir = data.home_dir || '/home/user';
    const targetScriptPath = `${homeDir}/.copilot/statusline-token.sh`;
    
    const settingsJson = JSON.stringify({
      "statusLine": {
        "type": "command",
        "command": targetScriptPath,
        "padding": 1
      }
    }, null, 2);

    const mergedJson = JSON.stringify({
      "footer": {
        "showDirectory": true,
        "showBranch": true
      },
      "statusLine": {
        "type": "command",
        "command": targetScriptPath,
        "padding": 1
      }
    }, null, 2);

    // Render to DOM
    const homeLabel = document.getElementById('lbl-detected-home');
    const jsonCodeEl = document.getElementById('code-setup-json');
    const mergeCodeEl = document.getElementById('code-setup-json-merge');

    const copyJsonBtn = document.getElementById('btn-copy-json');
    const copyMergeBtn = document.getElementById('btn-copy-json-merge');

    if (homeLabel) homeLabel.textContent = homeDir;
    
    if (jsonCodeEl) jsonCodeEl.textContent = settingsJson;
    if (copyJsonBtn) copyJsonBtn.setAttribute('data-clipboard-text', settingsJson);
    
    if (mergeCodeEl) mergeCodeEl.textContent = mergedJson;
    if (copyMergeBtn) copyMergeBtn.setAttribute('data-clipboard-text', mergedJson);

  } catch (err) {
    console.error('Failed to load dynamic setup paths:', err);
  }
}

function initClipboardButtons() {
  const copyButtons = document.querySelectorAll('.copy-code-btn');
  
  copyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Prioritize data-clipboard-text, fallback to next code/pre element's textContent
      let textToCopy = btn.getAttribute('data-clipboard-text');
      if (!textToCopy) {
        const codeEl = btn.nextElementSibling.querySelector('code') || btn.nextElementSibling;
        textToCopy = codeEl ? codeEl.textContent : '';
      }
      
      navigator.clipboard.writeText(textToCopy.trim()).then(() => {
        const originalText = btn.textContent;
        btn.textContent = t('copy_success');
        btn.classList.add('copied');
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 2000);
      }).catch((err) => {
        console.error('Failed to copy text: ', err);
        showNotification(t('copy_failed'), 'error');
      });
    });
  });
}

function toggleEmptyState(showEmpty) {
  const emptyContainer = document.getElementById('empty-state-container');
  const grids = document.querySelectorAll('#daily-view-container > .dashboard-grid');
  const charts = document.querySelectorAll('#daily-view-container > .charts-section');
  const sessions = document.querySelectorAll('#daily-view-container > .sessions-section');
  
  if (showEmpty) {
    if (emptyContainer) {
      emptyContainer.classList.remove('hidden');
      emptyContainer.innerHTML = `
        <div class="welcome-setup-card">
          <div class="card-icon">🤖</div>
          <h2>${t('empty_title')}</h2>
          <p>${t('empty_desc')}</p>
          <div class="action-buttons">
            <button class="primary-btn" id="btn-empty-setup-guide">${t('btn_empty_setup')}</button>
            <button class="secondary-btn" id="btn-empty-refresh">${t('btn_empty_refresh')}</button>
          </div>
        </div>
      `;
      
      const emptyGuideBtn = document.getElementById('btn-empty-setup-guide');
      if (emptyGuideBtn) {
        emptyGuideBtn.addEventListener('click', openSetupModal);
      }
      
      const emptyRefreshBtn = document.getElementById('btn-empty-refresh');
      if (emptyRefreshBtn) {
        emptyRefreshBtn.addEventListener('click', async () => {
          emptyRefreshBtn.classList.add('loading');
          await fetchDates();
          emptyRefreshBtn.classList.remove('loading');
        });
      }
    }
    
    grids.forEach(el => el.classList.add('hidden'));
    charts.forEach(el => el.classList.add('hidden'));
    sessions.forEach(el => el.classList.add('hidden'));
  } else {
    if (emptyContainer) {
      emptyContainer.classList.add('hidden');
    }
    grids.forEach(el => el.classList.remove('hidden'));
    charts.forEach(el => el.classList.remove('hidden'));
    sessions.forEach(el => el.classList.remove('hidden'));
  }
}

// 點擊月度彙整圖表跳轉到每日即時
function switchToDailyDate(date) {
  const dateSelect = document.getElementById('date-select');
  if (!dateSelect) return;

  dateSelect.value = date;

  // 切換 Tab 到 daily
  if (activeTab === 'daily') {
    loadUsageData(date);
  } else {
    // switchTab('daily') 內部會自動載入 dateSelect.value
    switchTab('daily');
  }
}

// =========================================================================
// Pricing Rules & Modal Logic
// =========================================================================
async function fetchPricingRules() {
  try {
    const res = await fetch('/api/pricing');
    if (res.ok) {
      pricingRules = await res.json();
      console.log('Loaded pricing rules:', pricingRules);
    } else {
      console.error('Failed to fetch pricing rules');
    }
  } catch (err) {
    console.error('Error fetching pricing rules:', err);
  }
}

function initPricingModal() {
  const pricingBtn = document.getElementById('btn-pricing-sheet');
  const closeBtn = document.getElementById('close-pricing-modal-btn');
  const modalOverlay = document.getElementById('pricing-modal');

  if (pricingBtn && modalOverlay) {
    pricingBtn.addEventListener('click', openPricingModal);
  }

  if (closeBtn && modalOverlay) {
    closeBtn.addEventListener('click', closePricingModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closePricingModal();
      }
    });
  }

  // Bind Escape key to close pricing modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePricingModal();
    }
  });
}

function openPricingModal() {
  const modal = document.getElementById('pricing-modal');
  if (modal) {
    modal.classList.add('active');
    renderPricingModalTable();
  }
}

function closePricingModal() {
  const modal = document.getElementById('pricing-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function renderPricingModalTable() {
  const tbody = document.getElementById('pricing-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!pricingRules || pricingRules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="placeholder-text">載入中...</td></tr>';
    return;
  }

  pricingRules.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'default';
    tr.innerHTML = `
      <td style="font-weight: 600;"><span class="badge highlight">${escapeHtml(r.model_name)}</span></td>
      <td>${escapeHtml(r.deployment_type)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td style="color: var(--accent-cyan); font-weight: 600;">$${r.input_price.toFixed(2)}</td>
      <td style="color: #34d399; font-weight: 600;">$${r.cache_input_price.toFixed(2)}</td>
      <td style="color: #a78bfa; font-weight: 600;">$${r.output_price.toFixed(2)}</td>
      <td style="color: var(--text-secondary);">${escapeHtml(r.batch_api_price)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function formatCost(cost) {
  if (cost === null || cost === undefined) return '-';
  const c = Number(cost);
  if (isNaN(c)) return '-';
  if (c === 0) return '$0.00';
  if (c < 0.001) return '$' + c.toFixed(5);
  if (c < 0.01) return '$' + c.toFixed(4);
  return '$' + c.toFixed(3);
}
