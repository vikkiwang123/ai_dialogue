// ============================================
// AI对话监控助手 - 侧边栏脚本
// ============================================

// ---- Markdown & Mermaid 初始化 ----
let mermaidReady = false;

function initMarkdownRenderer() {
  // 配置 marked
  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();

    // 自定义代码块渲染：mermaid 走图表，其他走 highlight.js
    renderer.code = function ({ text, lang }) {
      const code = text || '';
      const language = (lang || '').toLowerCase().trim();

      // Mermaid 图表
      if (language === 'mermaid') {
        return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(code)}</pre></div>`;
      }

      // PlantUML (以文本方式展示，暂无在线渲染)
      if (language === 'plantuml' || language === 'puml') {
        return `<div class="uml-block"><div class="uml-label">📐 PlantUML</div><pre class="plantuml-code"><code>${escapeHtml(code)}</code></pre></div>`;
      }

      // 普通代码块 - 用 highlight.js
      let highlighted = escapeHtml(code);
      if (typeof hljs !== 'undefined') {
        try {
          if (language && hljs.getLanguage(language)) {
            highlighted = hljs.highlight(code, { language }).value;
          } else {
            highlighted = hljs.highlightAuto(code).value;
          }
        } catch (e) {
          // fallback
        }
      }
      const langLabel = language ? `<span class="code-lang">${language}</span>` : '';
      return `<div class="code-block">${langLabel}<pre><code class="hljs ${language ? 'language-' + language : ''}">${highlighted}</code></pre></div>`;
    };

    // 行内代码
    renderer.codespan = function ({ text }) {
      return `<code class="inline-code">${text}</code>`;
    };

    // 表格样式
    renderer.table = function ({ header, rows }) {
      let headerHtml = '<tr>' + header.map(h => `<th>${h.text}</th>`).join('') + '</tr>';
      let bodyHtml = rows.map(row => '<tr>' + row.map(cell => `<td>${cell.text}</td>`).join('') + '</tr>').join('');
      return `<div class="table-wrapper"><table class="md-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
    };

    marked.setOptions({
      renderer,
      gfm: true,
      breaks: true
    });

    console.log('[AI监控] ✅ Marked 初始化完成');
  }

  // 配置 mermaid
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    });
    mermaidReady = true;
    console.log('[AI监控] ✅ Mermaid 初始化完成');
  }
}

/**
 * 渲染 Markdown 文本为 HTML
 */
function renderMarkdown(text) {
  if (!text) return '';

  if (typeof marked !== 'undefined') {
    try {
      return marked.parse(text);
    } catch (e) {
      console.error('[AI监控] Markdown渲染失败，使用简易渲染:', e);
    }
  }

  // 简易 fallback
  return text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

/**
 * 在 DOM 插入 markdown 渲染内容后，触发 mermaid 渲染
 */
async function renderMermaidBlocks(container) {
  if (!mermaidReady) return;
  const blocks = container.querySelectorAll('pre.mermaid');
  if (blocks.length === 0) return;

  console.log('[AI监控] 渲染', blocks.length, '个 Mermaid 图表');

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const code = block.textContent;
    const id = 'mermaid-' + Date.now() + '-' + i;
    try {
      const { svg } = await mermaid.render(id, code);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-rendered';
      wrapper.innerHTML = svg;
      block.parentElement.replaceChild(wrapper, block);
    } catch (err) {
      console.warn('[AI监控] Mermaid 渲染失败:', err);
      block.classList.add('mermaid-error');
      block.innerHTML = `<span class="mermaid-error-hint">⚠️ 图表语法有误</span>\n${escapeHtml(code)}`;
    }
  }
}

// ============================================
// 主逻辑
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initMarkdownRenderer();
  initTabs();
  initDates();
  loadStats();
  checkStatus();
  setupEventListeners();

  // 自动刷新：每30秒更新统计
  setInterval(loadStats, 30000);
});

// ============================================
// 标签页切换
// ============================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + tabId).classList.add('active');
      if (tabId === 'messages') loadMessages();
    });
  });
}

// ============================================
// 日期初始化
// ============================================
function initDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dateSelector').value = today;
  document.getElementById('summaryDate').value = today;
}

// ============================================
// 加载统计
// ============================================
function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.success) displayStats(response.stats);
  });
  loadRecentMessages();
}

function displayStats(stats) {
  document.getElementById('totalMessages').textContent = stats.totalMessages || 0;
  document.getElementById('aiMessages').textContent = stats.aiMessages || 0;
  document.getElementById('userMessages').textContent = stats.userMessages || 0;
  document.getElementById('totalWords').textContent = formatNumber(stats.totalWords || 0);

  const list = document.getElementById('platformsList');
  const entries = Object.entries(stats.platforms || {});

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-hint">暂无数据</div>';
  } else {
    const maxCount = Math.max(...entries.map(([, c]) => c));
    list.innerHTML = entries.map(([platform, count]) => `
      <div class="platform-row">
        <span class="name">${getPlatformName(platform)}</span>
        <span class="count">${count} 条</span>
      </div>
      <div class="platform-bar">
        <div class="platform-bar-fill" style="width: ${Math.round(count / maxCount * 100)}%"></div>
      </div>
    `).join('');
  }
}

// ============================================
// 最近消息（概览页）- 也用 markdown 渲染
// ============================================
function loadRecentMessages() {
  chrome.runtime.sendMessage({ type: 'GET_MESSAGES' }, (response) => {
    if (chrome.runtime.lastError) return;
    const container = document.getElementById('recentMessages');

    if (!response || !response.success || !response.messages || response.messages.length === 0) {
      container.innerHTML = '<div class="empty-hint">今天还没有对话记录</div>';
      return;
    }

    const recent = response.messages.slice(-10).reverse();
    container.innerHTML = recent.map(msg => `
      <div class="msg-preview">
        <div class="msg-avatar ${msg.role}">${msg.role === 'user' ? '👤' : '🤖'}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-role">${msg.role === 'user' ? '我' : 'AI'} · ${getPlatformName(msg.platform)}</span>
            <span class="msg-time">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="msg-text">${escapeHtml((msg.content || '').substring(0, 120))}</div>
        </div>
      </div>
    `).join('');
  });
}

// ============================================
// 消息列表（消息页）- markdown 渲染每条消息
// ============================================
function loadMessages() {
  const date = document.getElementById('dateSelector').value;
  const roleFilter = document.getElementById('roleFilter').value;

  chrome.runtime.sendMessage({ type: 'GET_MESSAGES', date }, (response) => {
    if (chrome.runtime.lastError) return;
    const container = document.getElementById('messagesList');

    if (!response || !response.success || !response.messages || response.messages.length === 0) {
      container.innerHTML = '<div class="empty-hint">该日期没有对话记录</div>';
      return;
    }

    let messages = response.messages;
    if (roleFilter !== 'all') {
      messages = messages.filter(m => m.role === roleFilter);
    }

    if (messages.length === 0) {
      container.innerHTML = '<div class="empty-hint">没有符合条件的消息</div>';
      return;
    }

    container.innerHTML = messages.map(msg => `
      <div class="message-card ${msg.role}">
        <div class="card-header">
          <span class="role-tag">${msg.role === 'user' ? '👤 我' : '🤖 AI'}</span>
          <span class="platform-tag">${getPlatformName(msg.platform)}</span>
        </div>
        <div class="card-content md-body">${renderMarkdown(msg.content || '')}</div>
        <div class="card-footer">${formatTime(msg.timestamp)}</div>
      </div>
    `).join('');

    // 渲染消息中的 mermaid
    renderMermaidBlocks(container);
  });
}

// ============================================
// AI总结 (流式输出)
// ============================================
let streamAbortController = null; // 用于取消正在进行的流式请求

function generateSummary(force = false) {
  const date = document.getElementById('summaryDate').value;
  if (!date) return;

  const btn = document.getElementById('generateSummary');
  const regenBtn = document.getElementById('regenerateSummary');
  const result = document.getElementById('summaryResult');

  btn.disabled = true;
  regenBtn.disabled = true;
  btn.textContent = '🤖 分析中...';
  regenBtn.style.display = 'none';

  // 显示初始"连接中"状态
  result.innerHTML = `
    <div class="ai-badge">🤖 AI 生成 · ${date}</div>
    <div class="ai-rendered md-body streaming-content" id="streamingContent">
      <div class="streaming-placeholder">
        <div class="loading-spinner"></div>
        <p>${force ? '正在重新生成总结...' : '正在连接大模型...'}</p>
      </div>
    </div>
  `;

  // 使用流式 API
  if (typeof LLMStream !== 'undefined') {
    LLMStream.streamSummary({
      date,
      force: !!force,

      onChunk(fullText, delta) {
        // 每收到一段文字就渲染
        const container = document.getElementById('streamingContent');
        if (!container) return;
        container.classList.add('streaming-active');
        container.innerHTML = renderMarkdown(fullText) + '<span class="streaming-cursor"></span>';
      },

      onDone(fullText, fromCache) {
        btn.disabled = false;
        regenBtn.disabled = false;
        btn.textContent = '🤖 生成总结';
        result.dataset.rawText = fullText;
        regenBtn.style.display = 'inline-block';

        // 最终完整渲染（含 mermaid）
        finalizeSummary(fullText, date, fromCache);
      },

      onError(error) {
        btn.disabled = false;
        regenBtn.disabled = false;
        btn.textContent = '🤖 生成总结';

        const err = error.message || '生成失败';
        result.innerHTML = `<div class="error-state">
          <p>❌ ${escapeHtml(err)}</p>
          ${err.includes('API Key') ? '<p class="error-hint">请在设置页面配置API Key</p>' : ''}
          ${err.includes('没有对话记录') ? '<p class="error-hint">该日期没有记录的对话</p>' : ''}
        </div>`;
      }
    });
  } else {
    // LLMStream 未加载时回退到非流式
    fallbackNonStreaming(date, force);
  }
}

/**
 * 流式完成后的最终渲染（mermaid 等）
 */
async function finalizeSummary(summary, date, fromCache) {
  const result = document.getElementById('summaryResult');
  const html = renderMarkdown(summary);

  result.innerHTML = `
    <div class="ai-badge">🤖 AI 生成 · ${date}${fromCache ? ' (缓存)' : ''}</div>
    <div class="ai-rendered md-body">${html}</div>
    <div class="ai-footer">
      <span>生成时间: ${new Date().toLocaleString('zh-CN')}</span>
      <button class="btn-copy" id="copyBtn">📋 复制</button>
    </div>
  `;

  document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
  await renderMermaidBlocks(result);
}

/**
 * 非流式回退（LLMStream 不可用时）
 */
function fallbackNonStreaming(date, force) {
  const btn = document.getElementById('generateSummary');
  const regenBtn = document.getElementById('regenerateSummary');
  const result = document.getElementById('summaryResult');

  result.innerHTML = `
    <div class="loading-ai">
      <div class="loading-spinner"></div>
      <p>${force ? '正在重新生成总结...' : '正在调用大模型分析对话...'}</p>
      <p style="font-size:11px; color:#bbb;">这可能需要几秒钟</p>
    </div>
  `;

  chrome.runtime.sendMessage({ type: 'AI_SUMMARY', date, force: !!force }, (response) => {
    btn.disabled = false;
    regenBtn.disabled = false;
    btn.textContent = '🤖 生成总结';

    if (chrome.runtime.lastError) {
      result.innerHTML = `<div class="error-state">
        <p>❌ 通信错误: ${chrome.runtime.lastError.message}</p>
        <p class="error-hint">请检查插件是否正常运行</p>
      </div>`;
      return;
    }

    if (response && response.success) {
      result.dataset.rawText = response.summary;
      regenBtn.style.display = 'inline-block';
      finalizeSummary(response.summary, date, false);
    } else {
      const err = response?.error || '生成失败';
      result.innerHTML = `<div class="error-state">
        <p>❌ ${escapeHtml(err)}</p>
        ${err.includes('API Key') ? '<p class="error-hint">请在设置页面配置API Key</p>' : ''}
        ${err.includes('没有对话记录') ? '<p class="error-hint">该日期没有记录的对话</p>' : ''}
      </div>`;
    }
  });
}

function copyToClipboard() {
  const raw = document.getElementById('summaryResult').dataset.rawText || '';
  navigator.clipboard.writeText(raw).then(() => {
    const btn = document.getElementById('copyBtn');
    if (btn) {
      btn.textContent = '✅ 已复制';
      setTimeout(() => { btn.textContent = '📋 复制'; }, 2000);
    }
  });
}

// ============================================
// 状态检查
// ============================================
function checkStatus() {
  chrome.runtime.sendMessage({ type: 'GET_LLM_CONFIG' }, (response) => {
    const badge = document.getElementById('apiBadge');
    if (!badge) return;
    if (response && response.success && response.config.apiKey) {
      const name = response.config.providers?.[response.config.provider]?.name || response.config.provider;
      badge.textContent = '✅ ' + name;
      badge.className = 'api-badge configured';
    } else {
      badge.textContent = '⚠️ 未配置API';
      badge.className = 'api-badge not-configured';
    }
  });

  chrome.storage.local.get(['enabled'], (result) => {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (result.enabled === false) {
      dot.classList.add('inactive');
      text.textContent = '已暂停';
    } else {
      dot.classList.remove('inactive');
      text.textContent = '监控中';
    }
  });
}

// ============================================
// 事件监听
// ============================================
function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadStats();
    checkStatus();
    if (document.getElementById('tab-messages').classList.contains('active')) loadMessages();
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('dateSelector').addEventListener('change', loadMessages);
  document.getElementById('roleFilter').addEventListener('change', loadMessages);

  document.getElementById('generateSummary').addEventListener('click', () => generateSummary(false));
  document.getElementById('regenerateSummary').addEventListener('click', () => generateSummary(true));

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) checkStatus();
    for (const key of Object.keys(changes)) {
      if (key.startsWith('messages_')) { loadStats(); break; }
    }
  });
}

// ============================================
// 工具函数
// ============================================
function getPlatformName(platform) {
  const names = { chatgpt: 'ChatGPT', claude: 'Claude', copilot: 'Copilot', gemini: 'Gemini' };
  return names[platform] || platform || '未知';
}

function formatNumber(num) {
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
