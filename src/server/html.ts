export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ingest - Git Activity & Report Explorer</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>">
  <style>
    :root {
      --bg-canvas: #0d1117;
      --bg-sidebar: #161b22;
      --bg-card: #21262d;
      --bg-hover: #30363d;
      --border-color: #30363d;
      --border-subtle: #21262d;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-purple: #bc8cff;
      --accent-red: #f85149;
      --accent-yellow: #d29922;
      --code-bg: #161b22;
      --diff-add-bg: rgba(46, 160, 67, 0.15);
      --diff-add-text: #3fb950;
      --diff-del-bg: rgba(248, 81, 73, 0.15);
      --diff-del-text: #f85149;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-canvas);
      color: var(--text-primary);
      font-family: var(--font-sans);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      background-color: var(--bg-sidebar);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--text-primary);
    }

    .brand-icon {
      background: linear-gradient(135deg, #1f6feb, #238636);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 12px rgba(88, 166, 255, 0.3);
    }

    .brand-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .brand-badge {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--bg-hover);
      color: var(--accent-blue);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .reports-dir-badge {
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      background: var(--bg-canvas);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .app-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Sidebar - Repos */
    .sidebar {
      width: 280px;
      background-color: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .search-input {
      width: 100%;
      background: var(--bg-canvas);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: var(--accent-blue);
    }

    .repo-list {
      list-style: none;
      overflow-y: auto;
      flex: 1;
      padding: 8px;
    }

    .repo-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: background 0.15s;
    }

    .repo-item:hover {
      background-color: var(--bg-hover);
    }

    .repo-item.active {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
    }

    .repo-item-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .repo-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .active-tag {
      font-size: 9px;
      padding: 1px 5px;
      background: rgba(63, 185, 80, 0.2);
      color: var(--accent-green);
      border: 1px solid rgba(63, 185, 80, 0.4);
      border-radius: 4px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .repo-date {
      font-size: 11px;
      color: var(--text-muted);
    }

    .repo-count-badge {
      font-size: 11px;
      padding: 2px 7px;
      background: var(--bg-canvas);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      color: var(--text-secondary);
      font-weight: 600;
    }

    /* Timeline / Reports List column */
    .timeline-panel {
      width: 300px;
      background-color: var(--bg-canvas);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .timeline-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .timeline-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .report-list {
      list-style: none;
      overflow-y: auto;
      flex: 1;
      padding: 8px;
    }

    .report-item {
      padding: 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 6px;
      border: 1px solid transparent;
      transition: all 0.15s;
    }

    .report-item:hover {
      background-color: var(--bg-sidebar);
      border-color: var(--border-subtle);
    }

    .report-item.active {
      background-color: var(--bg-sidebar);
      border-color: var(--accent-blue);
    }

    .report-date-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .report-date {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-family: var(--font-mono);
    }

    .style-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .style-badge.system-centric {
      background: rgba(88, 166, 255, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(88, 166, 255, 0.3);
    }

    .style-badge.default {
      background: rgba(110, 118, 129, 0.12);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
    }

    .token-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 600;
      background: rgba(188, 140, 255, 0.15);
      color: var(--accent-purple);
      border: 1px solid rgba(188, 140, 255, 0.3);
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .token-badge-header {
      font-size: 12px;
      padding: 3px 8px;
      background: rgba(188, 140, 255, 0.15);
      color: var(--accent-purple);
      border: 1px solid rgba(188, 140, 255, 0.3);
      border-radius: 6px;
      font-family: var(--font-mono);
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .btn-fix-magic {
      background: rgba(188, 140, 255, 0.12);
      border-color: rgba(188, 140, 255, 0.35);
      color: var(--accent-purple);
    }

    .btn-fix-magic:hover {
      background: rgba(188, 140, 255, 0.25);
      border-color: var(--accent-purple);
      color: #fff;
    }

    .report-meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Main Viewer Panel */
    .viewer-panel {
      flex: 1;
      background-color: var(--bg-canvas);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .viewer-header {
      padding: 14px 24px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background-color: var(--bg-sidebar);
    }

    .viewer-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .viewer-doc-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .viewer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      background-color: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }

    .btn:hover {
      background-color: var(--bg-hover);
      border-color: var(--text-muted);
    }

    .btn-primary {
      background-color: #238636;
      border-color: rgba(240, 246, 252, 0.1);
      color: #fff;
    }

    .btn-primary:hover {
      background-color: #2ea043;
    }

    .viewer-content-container {
      flex: 1;
      overflow-y: auto;
      padding: 32px 40px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      text-align: center;
      gap: 12px;
    }

    .empty-state-icon {
      font-size: 48px;
      opacity: 0.6;
    }

    /* Markdown Document Styling */
    .markdown-body {
      max-width: 900px;
      margin: 0 auto;
      line-height: 1.65;
      font-size: 15px;
      color: var(--text-primary);
    }

    .markdown-body h1 {
      font-size: 26px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 10px;
      margin-bottom: 20px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .markdown-body h2 {
      font-size: 20px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 8px;
      margin-top: 28px;
      margin-bottom: 16px;
      font-weight: 600;
      color: var(--accent-blue);
    }

    .markdown-body h3 {
      font-size: 16px;
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
      color: #e6edf3;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .markdown-body p {
      margin-bottom: 14px;
      color: #c9d1d9;
    }

    .markdown-body ul, .markdown-body ol {
      margin-bottom: 18px;
      padding-left: 20px;
    }

    .markdown-body li {
      margin-bottom: 8px;
      color: #c9d1d9;
    }

    .markdown-body blockquote {
      border-left: 4px solid var(--accent-blue);
      padding: 8px 16px;
      margin: 16px 0;
      background: var(--bg-card);
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);
    }

    .markdown-body code {
      font-family: var(--font-mono);
      font-size: 13px;
      background-color: rgba(110, 118, 129, 0.2);
      padding: 2px 6px;
      border-radius: 4px;
      color: #ff7b72;
    }

    .markdown-body pre {
      background-color: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      margin: 16px 0;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.5;
    }

    .markdown-body pre code {
      background-color: transparent;
      padding: 0;
      color: var(--text-primary);
    }

    /* Diff code line highlights */
    .diff-line-add {
      background-color: var(--diff-add-bg);
      color: var(--diff-add-text);
      display: block;
      padding: 0 4px;
      margin: 0 -4px;
    }

    .diff-line-del {
      background-color: var(--diff-del-bg);
      color: var(--diff-del-text);
      display: block;
      padding: 0 4px;
      margin: 0 -4px;
    }

    .diff-line-chunk {
      color: var(--accent-purple);
      font-weight: 600;
      display: block;
    }

    .commit-hash {
      font-family: var(--font-mono);
      color: var(--accent-yellow);
      background: rgba(210, 153, 34, 0.15);
      border: 1px solid rgba(210, 153, 34, 0.3);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 12px;
      text-decoration: none;
    }

    .markdown-body hr {
      border: 0;
      height: 1px;
      background: var(--border-color);
      margin: 28px 0;
    }

    /* Markdown Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
      margin: 20px 0;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-sidebar);
    }

    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      text-align: left;
    }

    .markdown-body th {
      background-color: var(--bg-card);
      color: var(--text-primary);
      font-weight: 600;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      border-right: 1px solid var(--border-subtle);
    }

    .markdown-body th:last-child {
      border-right: none;
    }

    .markdown-body td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-subtle);
      border-right: 1px solid var(--border-subtle);
      color: var(--text-primary);
      vertical-align: top;
      line-height: 1.5;
    }

    .markdown-body td:last-child {
      border-right: none;
    }

    .markdown-body tr:last-child td {
      border-bottom: none;
    }

    .markdown-body tr:hover td {
      background-color: rgba(110, 118, 129, 0.08);
    }

    /* Mermaid Architecture & Flow Diagrams */
    .mermaid-card {
      margin: 24px 0;
      background: var(--bg-sidebar);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .mermaid-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      user-select: none;
    }

    .mermaid-title {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-primary);
    }

    .mermaid-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .diagram-btn {
      background: var(--bg-hover);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.15s;
      user-select: none;
    }

    .diagram-btn:hover {
      background: var(--border-color);
      color: #fff;
    }

    .diagram-zoom-level {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      min-width: 44px;
      text-align: center;
      user-select: none;
    }

    .mermaid-viewport {
      position: relative;
      width: 100%;
      height: 420px;
      overflow: hidden;
      cursor: grab;
      user-select: none;
      background: #0d1117;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mermaid-viewport.dragging {
      cursor: grabbing;
    }

    .mermaid-content {
      position: absolute;
      transform-origin: center center;
      transition: transform 0.05s ease-out;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mermaid-content pre.mermaid {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
      color: var(--accent-blue);
      font-family: var(--font-mono);
      font-size: 13px;
      text-align: center;
    }

    .mermaid-content svg {
      max-width: none !important;
      height: auto;
      display: block;
    }

    .mermaid-hint {
      position: absolute;
      bottom: 8px;
      right: 12px;
      font-size: 11px;
      color: var(--text-muted);
      background: rgba(13, 17, 23, 0.85);
      border: 1px solid var(--border-subtle);
      padding: 3px 8px;
      border-radius: 4px;
      pointer-events: none;
      opacity: 0.85;
      user-select: none;
    }

    /* Fullscreen Modal */
    .mermaid-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(13, 17, 23, 0.96);
      backdrop-filter: blur(8px);
      z-index: 2000;
      flex-direction: column;
    }

    .mermaid-modal.active {
      display: flex;
    }

    .mermaid-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: var(--bg-sidebar);
      border-bottom: 1px solid var(--border-color);
    }

    .mermaid-modal-body {
      flex: 1;
      position: relative;
      overflow: hidden;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-canvas);
    }

    .mermaid-modal-body.dragging {
      cursor: grabbing;
    }

    .raw-viewer {
      font-family: var(--font-mono);
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--code-bg);
      padding: 24px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      line-height: 1.6;
    }

    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #238636;
      color: #fff;
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.25s ease;
      pointer-events: none;
      z-index: 1000;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div class="brand-title">Ingest</div>
      <div class="brand-badge">Report Explorer</div>
    </div>
    <div class="header-actions">
      <div class="reports-dir-badge" id="reports-dir-label">
        <span>📁 Store:</span>
        <span id="output-root-display">~/reports</span>
      </div>
      <button class="btn" id="refresh-btn" title="Refresh reports list">🔄 Refresh</button>
    </div>
  </header>

  <div class="app-container">
    <!-- Sidebar: Repositories -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <input type="text" class="search-input" id="repo-search" placeholder="🔍 Search repositories... ( / )">
      </div>
      <ul class="repo-list" id="repo-list">
        <!-- Dynamic repo items -->
      </ul>
    </aside>

    <!-- Timeline: Reports for selected repo -->
    <section class="timeline-panel">
      <div class="timeline-header">
        <div class="timeline-title" id="timeline-repo-title">Reports</div>
        <span class="repo-count-badge" id="reports-total-count">0</span>
      </div>
      <ul class="report-list" id="report-list">
        <!-- Dynamic report dates -->
      </ul>
    </section>

    <!-- Viewer: Report display -->
    <main class="viewer-panel">
      <div class="viewer-header" id="viewer-header" style="display: none;">
        <div class="viewer-title-group">
          <div class="viewer-doc-title" id="viewer-doc-title">Report Title</div>
          <span class="token-badge-header" id="viewer-token-badge" style="display: none;">⚡ 0 tokens</span>
        </div>
        <div class="viewer-actions">
          <button class="btn btn-fix-magic" id="fix-diagram-btn" title="Inspect report and repair Mermaid diagram syntax with AI ( f )">✨ Fix Diagrams</button>
          <button class="btn" id="toggle-raw-btn">📝 View Raw</button>
          <button class="btn" id="copy-md-btn">📋 Copy Markdown</button>
          <button class="btn" id="download-btn">💾 Download</button>
        </div>
      </div>
      <div class="viewer-content-container" id="viewer-container">
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <h3>Select a report from the list to view activity</h3>
          <p>Reports are loaded from your centralized Ingest report store.</p>
        </div>
      </div>
    </main>
  </div>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <!-- Mermaid Fullscreen Interactive Modal -->
  <div class="mermaid-modal" id="mermaid-modal">
    <div class="mermaid-modal-header">
      <div class="brand-title" id="modal-diagram-title">📊 Architecture & Flow Diagram (Interactive Fullscreen)</div>
      <div class="mermaid-toolbar">
        <button class="diagram-btn" id="modal-zoom-out" title="Zoom Out (–)">➖</button>
        <span class="diagram-zoom-level" id="modal-zoom-level">100%</span>
        <button class="diagram-btn" id="modal-zoom-in" title="Zoom In (+)">➕</button>
        <button class="diagram-btn" id="modal-zoom-reset" title="Reset Zoom">↺ Reset</button>
        <button class="diagram-btn" id="modal-close" title="Close Fullscreen (Esc)">✕ Close</button>
      </div>
    </div>
    <div class="mermaid-modal-body" id="mermaid-modal-body">
      <div class="mermaid-content" id="mermaid-modal-content"></div>
      <div class="mermaid-hint">🖱️ Drag to Pan • Scroll to Zoom • Esc to Close</div>
    </div>
  </div>

  <script>
    let state = {
      activeRepo: null,
      selectedRepo: null,
      selectedReport: null,
      repos: [],
      reports: [],
      rawMarkdown: '',
      showRaw: false,
      outputRoot: ''
    };

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function isTableDelimiter(line) {
      if (!line || !line.includes('-')) return false;
      const parts = line.trim().split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return false;
      return parts.every(p => /^:?-+:?$/.test(p));
    }

    function parseTableRow(line) {
      let s = line.trim();
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|')) s = s.slice(0, -1);
      return s.split('|').map(c => c.trim());
    }

    function renderMermaidCard(rawCode) {
      return '<div class="mermaid-card">' +
        '<div class="mermaid-header">' +
          '<div class="mermaid-title">📊 Architecture & Flow Diagram</div>' +
          '<div class="mermaid-toolbar">' +
            '<button class="diagram-btn btn-fix-mermaid btn-fix-magic" title="Repair syntax with AI">✨ Fix</button>' +
            '<button class="diagram-btn btn-zoom-out" title="Zoom Out (–)">➖</button>' +
            '<span class="diagram-zoom-level">100%</span>' +
            '<button class="diagram-btn btn-zoom-in" title="Zoom In (+)">➕</button>' +
            '<button class="diagram-btn btn-zoom-reset" title="Reset Zoom">↺</button>' +
            '<button class="diagram-btn btn-fullscreen" title="Fullscreen View">⛶ Expand</button>' +
          '</div>' +
        '</div>' +
        '<div class="mermaid-viewport">' +
          '<div class="mermaid-content">' +
            '<pre class="mermaid">' + escapeHtml(rawCode) + '</pre>' +
          '</div>' +
          '<div class="mermaid-hint">🖱️ Drag to Pan • Scroll to Zoom</div>' +
        '</div>' +
      '</div>';
    }

    // Zero-dependency Client-side Markdown Renderer
    function renderMarkdown(md) {
      if (!md) return '';
      const lines = md.split('\\n');
      let html = '';
      let inCodeBlock = false;
      let codeLang = '';
      let codeBuffer = [];
      let inList = false;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Code block toggle
        if (line.startsWith('\`\`\`')) {
          if (inCodeBlock) {
            const rawCode = codeBuffer.join('\\n');
            const trimmedCode = rawCode.trim();
            const isMermaid =
              codeLang.toLowerCase() === 'mermaid' ||
              (!codeLang && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\\b/i.test(trimmedCode)) ||
              (codeLang.toLowerCase() === 'text' && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\\b/i.test(trimmedCode));

            if (isMermaid) {
              html += renderMermaidCard(rawCode);
            } else {
              html += '<pre><code>' + formatCodeBlock(rawCode, codeLang) + '</code></pre>';
            }
            codeBuffer = [];
            inCodeBlock = false;
            codeLang = '';
          } else {
            if (inList) { html += '</ul>'; inList = false; }
            inCodeBlock = true;
            codeLang = line.slice(3).trim();
          }
          continue;
        }

        if (inCodeBlock) {
          codeBuffer.push(line);
          continue;
        }

        // Markdown Table detection (header + delimiter)
        if (line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
          if (inList) { html += '</ul>'; inList = false; }
          const headerCells = parseTableRow(line);
          const delimiterCells = parseTableRow(lines[i + 1]);
          const alignments = delimiterCells.map(d => {
            const left = d.startsWith(':');
            const right = d.endsWith(':');
            if (left && right) return 'center';
            if (right) return 'right';
            return 'left';
          });

          i++; // Advance past delimiter

          let theadHtml = '<thead><tr>';
          for (let c = 0; c < headerCells.length; c++) {
            const align = alignments[c] || 'left';
            theadHtml += '<th style="text-align: ' + align + '">' + formatInline(headerCells[c] || '') + '</th>';
          }
          theadHtml += '</tr></thead>';

          let tbodyHtml = '<tbody>';
          while (i + 1 < lines.length) {
            const nextRowLine = lines[i + 1];
            if (!nextRowLine || nextRowLine.trim() === '' || (!nextRowLine.includes('|') && !nextRowLine.trim().startsWith('|'))) {
              break;
            }
            if (/^[-*_]{3,}\\s*$/.test(nextRowLine.trim())) break;
            i++;
            const cells = parseTableRow(lines[i]);
            tbodyHtml += '<tr>';
            for (let c = 0; c < headerCells.length; c++) {
              const align = alignments[c] || 'left';
              const cellVal = cells[c] !== undefined ? formatInline(cells[c]) : '';
              tbodyHtml += '<td style="text-align: ' + align + '">' + cellVal + '</td>';
            }
            tbodyHtml += '</tr>';
          }
          tbodyHtml += '</tbody>';

          html += '<div class="table-container"><table>' + theadHtml + tbodyHtml + '</table></div>';
          continue;
        }

        // Headers
        if (line.startsWith('# ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h1>' + formatInline(line.slice(2)) + '</h1>';
          continue;
        }
        if (line.startsWith('## ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h2>' + formatInline(line.slice(3)) + '</h2>';
          continue;
        }
        if (line.startsWith('### ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h3>' + formatInline(line.slice(4)) + '</h3>';
          continue;
        }
        if (line.startsWith('#### ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h4>' + formatInline(line.slice(5)) + '</h4>';
          continue;
        }

        // Horizontal Rule
        if (/^[-*_]{3,}\\s*$/.test(line)) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<hr>';
          continue;
        }

        // Blockquotes
        if (line.startsWith('> ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<blockquote>' + formatInline(line.slice(2)) + '</blockquote>';
          continue;
        }

        // Bullet lists
        if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
          if (!inList) { html += '<ul>'; inList = true; }
          const itemText = line.replace(/^[-*•]\\s+/, '');
          html += '<li>' + formatInline(itemText) + '</li>';
          continue;
        }

        // Empty line
        if (line.trim() === '') {
          if (inList) { html += '</ul>'; inList = false; }
          continue;
        }

        // Normal paragraph
        if (inList) { html += '</ul>'; inList = false; }
        html += '<p>' + formatInline(line) + '</p>';
      }

      if (inCodeBlock) {
        const rawCode = codeBuffer.join('\\n');
        const trimmedCode = rawCode.trim();
        const isMermaid =
          codeLang.toLowerCase() === 'mermaid' ||
          (!codeLang && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\\b/i.test(trimmedCode)) ||
          (codeLang.toLowerCase() === 'text' && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\\b/i.test(trimmedCode));

        if (isMermaid) {
          html += renderMermaidCard(rawCode);
        } else {
          html += '<pre><code>' + formatCodeBlock(rawCode, codeLang) + '</code></pre>';
        }
      }
      if (inList) {
        html += '</ul>';
      }

      return html;
    }

    function formatCodeBlock(code, lang) {
      const escaped = escapeHtml(code);
      const isDiff =
        (lang && lang.toLowerCase() === 'diff') ||
        ((!lang || lang.toLowerCase() === 'text') && /^(diff --git|@@)/m.test(code));

      if (!isDiff) {
        return escaped;
      }

      const lines = escaped.split('\\n');
      return lines.map(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return '<span class="diff-line-add">' + line + '</span>';
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return '<span class="diff-line-del">' + line + '</span>';
        }
        if (line.startsWith('@@')) {
          return '<span class="diff-line-chunk">' + line + '</span>';
        }
        if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
          return '<span style="color: var(--accent-yellow); font-weight: 600;">' + line + '</span>';
        }
        return line;
      }).join('\\n');
    }

    function formatInline(text) {
      let t = escapeHtml(text);
      // Inline code
      t = t.replace(/\`([^\`]+)\`/g, (match, p1) => {
        // Detect commit hash
        if (/^[0-9a-f]{7,40}$/i.test(p1.trim())) {
          return '<span class="commit-hash">\`' + p1 + '\`</span>';
        }
        return '<code>' + p1 + '</code>';
      });
      // Bold
      t = t.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>');
      t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      // Italic
      t = t.replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>');
      // Links
      t = t.replace(/\\[([^\\]]+)\\]\\(([^\\)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener" style="color: var(--accent-blue); text-decoration: none;">$1</a>');
      return t;
    }

    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        state.activeRepo = data.activeRepo;
        state.outputRoot = data.outputRoot;
        document.getElementById('output-root-display').textContent = data.outputRoot || '~/reports';
      } catch (err) {
        console.error('Failed to load status', err);
      }
    }

    async function loadRepos() {
      try {
        const res = await fetch('/api/repos');
        state.repos = await res.json();
        renderRepoList();

        // Auto select active repo or first repo
        if (!state.selectedRepo && state.repos.length > 0) {
          const matchActive = state.activeRepo ? state.repos.find(r => r.repoName === state.activeRepo) : null;
          selectRepo(matchActive ? matchActive.repoName : state.repos[0].repoName);
        }
      } catch (err) {
        console.error('Failed to load repos', err);
      }
    }

    function renderRepoList() {
      const listEl = document.getElementById('repo-list');
      const filter = document.getElementById('repo-search').value.toLowerCase();
      const filtered = state.repos.filter(r => r.repoName.toLowerCase().includes(filter));

      listEl.innerHTML = '';
      if (filtered.length === 0) {
        listEl.innerHTML = '<li style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">No repositories found</li>';
        return;
      }

      filtered.forEach(r => {
        const li = document.createElement('li');
        li.className = 'repo-item' + (state.selectedRepo === r.repoName ? ' active' : '');
        const isActiveRepo = state.activeRepo === r.repoName;
        
        li.innerHTML = \`
          <div class="repo-item-main">
            <div class="repo-name">
              <span>\${escapeHtml(r.repoName)}</span>
              \${isActiveRepo ? '<span class="active-tag">Active</span>' : ''}
            </div>
            <div class="repo-date">Latest: \${r.latestDate || 'N/A'}</div>
          </div>
          <div class="repo-count-badge">\${r.reportCount}</div>
        \`;
        li.onclick = () => selectRepo(r.repoName);
        listEl.appendChild(li);
      });
    }

    async function selectRepo(repoName) {
      state.selectedRepo = repoName;
      renderRepoList();
      document.getElementById('timeline-repo-title').textContent = repoName;

      try {
        const res = await fetch('/api/reports?repo=' + encodeURIComponent(repoName));
        state.reports = await res.json();
        document.getElementById('reports-total-count').textContent = state.reports.length;
        renderReportList();

        if (state.reports.length > 0) {
          selectReport(state.reports[0]);
        } else {
          showEmptyViewer('No reports found for ' + repoName);
        }
      } catch (err) {
        console.error('Failed to load reports for repo', err);
      }
    }

    function formatTokens(tokenUsage) {
      if (!tokenUsage || typeof tokenUsage.totalTokens !== 'number' || tokenUsage.totalTokens <= 0) {
        return '⚡ Tokens: N/A';
      }
      const count = tokenUsage.totalTokens >= 1000000
        ? (tokenUsage.totalTokens / 1000000).toFixed(1) + 'M'
        : (tokenUsage.totalTokens >= 1000 ? (tokenUsage.totalTokens / 1000).toFixed(1) + 'k' : tokenUsage.totalTokens.toLocaleString());
      return '⚡ ' + count + ' tokens';
    }

    function renderReportList() {
      const listEl = document.getElementById('report-list');
      listEl.innerHTML = '';

      if (state.reports.length === 0) {
        listEl.innerHTML = '<li style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">No reports</li>';
        return;
      }

      state.reports.forEach(rep => {
        const li = document.createElement('li');
        const isSelected = state.selectedReport && state.selectedReport.fileName === rep.fileName;
        li.className = 'report-item' + (isSelected ? ' active' : '');
        
        const styleName = rep.reportStyle || 'default';
        const badgeClass = rep.reportStyle === 'system-centric' ? 'style-badge system-centric' : 'style-badge default';
        const tokenBadgeHtml = rep.tokenUsage && typeof rep.tokenUsage.totalTokens === 'number' && rep.tokenUsage.totalTokens > 0
          ? '<span class="token-badge">⚡ ' + (rep.tokenUsage.totalTokens >= 1000 ? (rep.tokenUsage.totalTokens / 1000).toFixed(1) + 'k' : rep.tokenUsage.totalTokens) + '</span>'
          : '<span class="token-badge" style="opacity: 0.6;">⚡ N/A</span>';
        
        li.innerHTML = \`
          <div class="report-date-row">
            <span class="report-date">📅 \${escapeHtml(rep.dateStr)}</span>
            <span class="\${badgeClass}">\${escapeHtml(styleName)}</span>
          </div>
          <div class="report-meta-row">
            <span>\${formatBytes(rep.sizeBytes)}</span>
            <span>•</span>
            \${tokenBadgeHtml}
            <span>•</span>
            <span>\${new Date(rep.modifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        \`;
        li.onclick = () => selectReport(rep);
        listEl.appendChild(li);
      });
    }

    async function selectReport(report) {
      state.selectedReport = report;
      renderReportList();

      try {
        const res = await fetch('/api/report?repo=' + encodeURIComponent(report.repoName) + '&file=' + encodeURIComponent(report.fileName));
        const data = await res.json();
        state.rawMarkdown = data.content || '';
        if (data.tokenUsage) {
          state.selectedReport.tokenUsage = data.tokenUsage;
        }
        renderReportView();
      } catch (err) {
        console.error('Failed to fetch report content', err);
      }
    }

    function initMermaid() {
      if (window.mermaid) {
        try {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
              darkMode: true,
              background: '#161b22',
              primaryColor: '#1f6feb',
              primaryTextColor: '#f0f6fc',
              primaryBorderColor: '#30363d',
              lineColor: '#58a6ff',
              secondaryColor: '#238636',
              tertiaryColor: '#21262d',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
            },
            securityLevel: 'loose'
          });
        } catch (e) {
          console.warn('Mermaid initialization warning:', e);
        }
      }
    }

    function openMermaidModal(svgHtml) {
      const modal = document.getElementById('mermaid-modal');
      const body = document.getElementById('mermaid-modal-body');
      const modalContent = document.getElementById('mermaid-modal-content');
      const zoomLevelEl = document.getElementById('modal-zoom-level');
      const btnIn = document.getElementById('modal-zoom-in');
      const btnOut = document.getElementById('modal-zoom-out');
      const btnReset = document.getElementById('modal-zoom-reset');
      const btnClose = document.getElementById('modal-close');

      modalContent.innerHTML = svgHtml;
      const svg = modalContent.querySelector('svg');
      if (svg) {
        svg.style.maxWidth = 'none';
      }

      modal.classList.add('active');

      let scale = 1.25;
      let translateX = 0;
      let translateY = 0;
      let isDragging = false;
      let startX = 0;
      let startY = 0;

      function update() {
        scale = Math.max(0.1, Math.min(scale, 8.0));
        modalContent.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
        if (zoomLevelEl) zoomLevelEl.textContent = Math.round(scale * 100) + '%';
      }
      update();

      body.onmousedown = (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        body.classList.add('dragging');
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        update();
      };

      const onMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          body.classList.remove('dragging');
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      body.onwheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        scale *= factor;
        update();
      };

      btnIn.onclick = () => { scale *= 1.25; update(); };
      btnOut.onclick = () => { scale *= 0.8; update(); };
      btnReset.onclick = () => { scale = 1.25; translateX = 0; translateY = 0; update(); };

      function closeModal() {
        modal.classList.remove('active');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('keydown', onKey);
      }

      btnClose.onclick = closeModal;

      modal.onclick = (e) => {
        if (e.target === modal) closeModal();
      };

      const onKey = (e) => {
        if (e.key === 'Escape') closeModal();
      };
      window.addEventListener('keydown', onKey);
    }

    function attachMermaidPanZoom() {
      const cards = document.querySelectorAll('.mermaid-card');
      cards.forEach((card) => {
        const viewport = card.querySelector('.mermaid-viewport');
        const content = card.querySelector('.mermaid-content');
        const zoomLevelEl = card.querySelector('.diagram-zoom-level');
        const btnIn = card.querySelector('.btn-zoom-in');
        const btnOut = card.querySelector('.btn-zoom-out');
        const btnReset = card.querySelector('.btn-zoom-reset');
        const btnFullscreen = card.querySelector('.btn-fullscreen');

        if (!viewport || !content) return;

        let scale = 1.0;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        function update() {
          scale = Math.max(0.15, Math.min(scale, 6.0));
          content.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
          if (zoomLevelEl) zoomLevelEl.textContent = Math.round(scale * 100) + '%';
        }

        // Auto-scale on render to ensure high legibility
        setTimeout(() => {
          const svg = content.querySelector('svg');
          if (svg) {
            svg.style.maxWidth = 'none';
            const vRect = viewport.getBoundingClientRect();
            const sRect = svg.getBoundingClientRect();
            if (sRect.width > 0 && sRect.height > 0) {
              const fitX = (vRect.width - 40) / sRect.width;
              const fitY = (vRect.height - 40) / sRect.height;
              scale = Math.min(1.3, Math.max(0.85, Math.min(fitX, fitY)));
              update();
            }
          }
        }, 60);

        viewport.onmousedown = (e) => {
          if (e.button !== 0) return;
          isDragging = true;
          startX = e.clientX - translateX;
          startY = e.clientY - translateY;
          viewport.classList.add('dragging');
        };

        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          translateX = e.clientX - startX;
          translateY = e.clientY - startY;
          update();
        });

        window.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            viewport.classList.remove('dragging');
          }
        });

        viewport.onwheel = (e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.15 : 0.85;
          scale *= factor;
          update();
        };

        const btnFix = card.querySelector('.btn-fix-mermaid');
        if (btnFix) {
          btnFix.onclick = () => {
            const raw = card.querySelector('.mermaid')?.textContent || '';
            fixMermaidDiagram(raw);
          };
        }

        if (btnIn) btnIn.onclick = () => { scale *= 1.25; update(); };
        if (btnOut) btnOut.onclick = () => { scale *= 0.8; update(); };
        if (btnReset) btnReset.onclick = () => { scale = 1.0; translateX = 0; translateY = 0; update(); };
        if (btnFullscreen) {
          btnFullscreen.onclick = () => {
            openMermaidModal(content.innerHTML);
          };
        }
      });
    }

    function renderReportView() {
      const header = document.getElementById('viewer-header');
      const container = document.getElementById('viewer-container');
      const titleEl = document.getElementById('viewer-doc-title');
      const tokenBadge = document.getElementById('viewer-token-badge');

      if (!state.selectedReport) {
        showEmptyViewer();
        return;
      }

      header.style.display = 'flex';
      const styleSuffix = state.selectedReport.reportStyle ? ' (' + state.selectedReport.reportStyle + ')' : '';
      titleEl.textContent = state.selectedRepo + ' / ' + state.selectedReport.dateStr + styleSuffix;

      tokenBadge.style.display = 'inline-flex';
      tokenBadge.textContent = formatTokens(state.selectedReport.tokenUsage);

      if (state.showRaw) {
        container.innerHTML = '<div class="raw-viewer">' + escapeHtml(state.rawMarkdown) + '</div>';
      } else {
        container.innerHTML = '<div class="markdown-body">' + renderMarkdown(state.rawMarkdown) + '</div>';
        if (window.mermaid) {
          setTimeout(() => {
            try {
              const nodes = container.querySelectorAll('.mermaid');
              if (nodes.length > 0) {
                mermaid.run({ nodes: nodes });
                setTimeout(attachMermaidPanZoom, 50);
              }
            } catch (err) {
              console.warn('Mermaid render error:', err);
            }
          }, 20);
        }
      }
    }

    async function fixMermaidDiagram(codeSnippet) {
      if (!state.selectedReport) return;
      const fixBtn = document.getElementById('fix-diagram-btn');
      if (fixBtn) {
        fixBtn.disabled = true;
        fixBtn.textContent = '⏳ Fixing...';
      }
      showToast('🤖 AI is inspecting and repairing Mermaid diagram...');

      try {
        const res = await fetch('/api/fix-mermaid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repo: state.selectedReport.repoName,
            file: state.selectedReport.fileName,
            mermaidCode: typeof codeSnippet === 'string' && codeSnippet.trim().length > 0 ? codeSnippet : undefined
          })
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to repair diagram');
        }

        state.rawMarkdown = data.content;
        if (data.tokenUsage) {
          state.selectedReport.tokenUsage = data.tokenUsage;
        }
        renderReportView();
        showToast('✨ Mermaid diagram repaired and saved!');
      } catch (err) {
        console.error('Failed to repair diagram', err);
        showToast('❌ Repair failed: ' + err.message);
      } finally {
        if (fixBtn) {
          fixBtn.disabled = false;
          fixBtn.textContent = '✨ Fix Diagrams';
        }
      }
    }

    function showEmptyViewer(msg) {
      document.getElementById('viewer-header').style.display = 'none';
      document.getElementById('viewer-container').innerHTML = \`
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <h3>\${msg || 'Select a report to view activity'}</h3>
        </div>
      \`;
    }

    // Event handlers
    document.getElementById('repo-search').addEventListener('input', renderRepoList);
    document.getElementById('refresh-btn').addEventListener('click', () => {
      loadRepos();
      if (state.selectedRepo) selectRepo(state.selectedRepo);
      showToast('Refreshed reports');
    });

    document.getElementById('fix-diagram-btn').addEventListener('click', () => fixMermaidDiagram());

    document.getElementById('toggle-raw-btn').addEventListener('click', () => {
      state.showRaw = !state.showRaw;
      document.getElementById('toggle-raw-btn').textContent = state.showRaw ? '👁️ Rendered' : '📝 View Raw';
      renderReportView();
    });

    document.getElementById('copy-md-btn').addEventListener('click', () => {
      if (!state.rawMarkdown) return;
      navigator.clipboard.writeText(state.rawMarkdown).then(() => {
        showToast('Markdown copied to clipboard!');
      });
    });

    document.getElementById('download-btn').addEventListener('click', () => {
      if (!state.rawMarkdown || !state.selectedReport) return;
      const blob = new Blob([state.rawMarkdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.selectedReport.fileName;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('repo-search').focus();
      } else if (e.key === 'c') {
        document.getElementById('copy-md-btn').click();
      } else if (e.key === 'f') {
        document.getElementById('fix-diagram-btn').click();
      }
    });

    // Initialize
    (async function init() {
      initMermaid();
      await loadStatus();
      await loadRepos();
    })();
  </script>
</body>
</html>
`;
}
