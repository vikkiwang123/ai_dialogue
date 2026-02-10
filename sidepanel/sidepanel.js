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
  loadPlatformHealth();
  loadReminderSettings();
  setupEventListeners();

  // 自动刷新：每30秒更新统计
  setInterval(loadStats, 30000);
  // 每60秒刷新平台状态
  setInterval(loadPlatformHealth, 60000);
});

// ============================================
// 标签页切换
// ============================================
function initTabs() {
  // 主 Tab 切换（3个）
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + tabId).classList.add('active');
      if (tabId === 'dialogue') loadMessages();
    });
  });

  // 洞察 二级 Tab 切换
  document.querySelectorAll('.insights-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.sub;
      document.querySelectorAll('.insights-sub-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.insights-sub').forEach(p => p.classList.remove('active'));
      document.getElementById('sub-' + sub).classList.add('active');
    });
  });
}

// ============================================
// 日期初始化
// ============================================
function initDates() {
  const today = getLocalDateStr();
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

  // 平台分布现在在健康状态里显示，不需要单独的 platformsList
}

// ============================================
// 平台健康状态
// ============================================
function loadPlatformHealth() {
  chrome.runtime.sendMessage({ type: 'GET_PLATFORM_STATUS' }, (response) => {
    if (chrome.runtime.lastError) return;
    const container = document.getElementById('platformHealth');
    if (!response || !response.success) {
      container.innerHTML = '<div class="empty-hint">无法获取状态</div>';
      return;
    }

    const status = response.status;
    const items = Object.entries(status).map(([key, info]) => {
      const statusClass = info.active ? 'active' : (info.todayMessages > 0 ? 'has-data' : 'inactive');
      const statusIcon = info.active ? '🟢' : (info.todayMessages > 0 ? '🟡' : '⚪');
      const statusText = info.active
        ? `${info.tabCount} 个标签页`
        : (info.todayMessages > 0 ? '今日有数据' : '未打开');

      return `
        <div class="health-item ${statusClass}">
          <span class="health-icon">${statusIcon}</span>
          <span class="health-name">${info.name}</span>
          <span class="health-status">${statusText}</span>
          <span class="health-count">${info.todayMessages || 0} 条</span>
        </div>
      `;
    });

    container.innerHTML = items.join('');
  });
}

// ============================================
// 最近消息（概览页）
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
// 消息列表（消息页）
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
          <span class="platform-tag">${getPlatformName(msg.platform)}${msg.source === 'manual' ? ' (手动)' : ''}</span>
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
// 全文搜索
// ============================================
let searchTimer = null;

function initSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  const searchResults = document.getElementById('searchResults');
  const messagesSection = document.getElementById('messagesSection');

  function showSearchMode(on) {
    searchResults.style.display = on ? 'block' : 'none';
    messagesSection.style.display = on ? 'none' : 'block';
  }

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    clearBtn.style.display = input.value ? 'flex' : 'none';

    if (input.value.trim().length >= 2) {
      showSearchMode(true);
      searchTimer = setTimeout(() => performSearch(), 300);
    } else if (input.value.trim().length === 0) {
      showSearchMode(false);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim().length >= 2) {
      clearTimeout(searchTimer);
      showSearchMode(true);
      performSearch();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    showSearchMode(false);
    input.focus();
  });

  document.getElementById('searchPlatform').addEventListener('change', () => {
    if (input.value.trim().length >= 2) performSearch();
  });
  document.getElementById('searchRole').addEventListener('change', () => {
    if (input.value.trim().length >= 2) performSearch();
  });
}

function performSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (query.length < 2) return;

  const platform = document.getElementById('searchPlatform').value;
  const role = document.getElementById('searchRole').value;
  const resultsContainer = document.getElementById('searchResults');

  resultsContainer.innerHTML = `
    <div class="loading-ai">
      <div class="loading-spinner"></div>
      <p>搜索中...</p>
    </div>
  `;

  chrome.runtime.sendMessage({
    type: 'SEARCH_MESSAGES',
    query,
    options: { platform, role, maxResults: 50 }
  }, (response) => {
    if (chrome.runtime.lastError) {
      resultsContainer.innerHTML = '<div class="error-state"><p>❌ 搜索失败</p></div>';
      return;
    }

    if (!response || !response.success || !response.results || response.results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-hint">
          <div class="empty-icon">😕</div>
          <p>没有找到匹配的结果</p>
          <p class="empty-sub">试试其他关键词</p>
        </div>
      `;
      return;
    }

    const results = response.results;
    const keywords = query.toLowerCase().split(/\s+/);

    // 按日期分组
    const grouped = {};
    results.forEach(r => {
      const date = r.date || '未知日期';
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(r);
    });

    let html = `<div class="search-summary">找到 ${results.length} 条结果</div>`;

    for (const [date, msgs] of Object.entries(grouped)) {
      html += `<div class="search-date-group">`;
      html += `<div class="search-date-header">📅 ${date} (${msgs.length} 条)</div>`;

      msgs.forEach(msg => {
        const highlightedExcerpt = highlightKeywords(escapeHtml(msg.excerpt || msg.content.substring(0, 200)), keywords);

        html += `
          <div class="search-result-card ${msg.role}">
            <div class="card-header">
              <span class="role-tag">${msg.role === 'user' ? '👤 我' : '🤖 AI'}</span>
              <span class="platform-tag">${getPlatformName(msg.platform)}</span>
              <span class="result-time">${formatTime(msg.timestamp)}</span>
            </div>
            <div class="card-content search-excerpt">${highlightedExcerpt}</div>
          </div>
        `;
      });

      html += `</div>`;
    }

    resultsContainer.innerHTML = html;
  });
}

function highlightKeywords(text, keywords) {
  let result = text;
  keywords.forEach(kw => {
    if (!kw) return;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, '<mark class="search-highlight">$1</mark>');
  });
  return result;
}

// ============================================
// 手动添加对话
// ============================================
function initManualAdd() {
  const modal = document.getElementById('manualModal');
  const addBtn = document.getElementById('manualAddBtn');
  const closeBtn = document.getElementById('modalClose');
  const cancelBtn = document.getElementById('modalCancel');
  const saveBtn = document.getElementById('modalSave');

  addBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });

  // 点击遮罩关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  saveBtn.addEventListener('click', saveManualMessages);
}

function saveManualMessages() {
  const platform = document.getElementById('manualPlatform').value;
  const content = document.getElementById('manualContent').value.trim();

  if (!content) {
    alert('请输入对话内容');
    return;
  }

  // 解析内容：支持 "用户: xxx" 和 "AI: xxx" 格式
  const messages = parseManualContent(content, platform);

  if (messages.length === 0) {
    alert('无法解析对话内容，请检查格式');
    return;
  }

  const saveBtn = document.getElementById('modalSave');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  chrome.runtime.sendMessage({
    type: 'SAVE_MANUAL_MESSAGES',
    messages
  }, (response) => {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 保存';

    if (response && response.success) {
      document.getElementById('manualModal').style.display = 'none';
      document.getElementById('manualContent').value = '';

      // 刷新数据
      loadStats();
      loadMessages();
      loadPlatformHealth();

      // 显示成功提示
      showToast(`✅ 已保存 ${response.count} 条消息`);
    } else {
      alert('保存失败: ' + (response?.error || '未知错误'));
    }
  });
}

function parseManualContent(content, platform) {
  const messages = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentContent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 检测角色前缀
    let newRole = null;
    let text = trimmed;

    if (/^(用户|我|user|human)\s*[:：]/i.test(trimmed)) {
      newRole = 'user';
      text = trimmed.replace(/^(用户|我|user|human)\s*[:：]\s*/i, '');
    } else if (/^(AI|助手|assistant|bot|模型)\s*[:：]/i.test(trimmed)) {
      newRole = 'assistant';
      text = trimmed.replace(/^(AI|助手|assistant|bot|模型)\s*[:：]\s*/i, '');
    }

    if (newRole) {
      // 保存上一条消息
      if (currentRole && currentContent.trim()) {
        messages.push({ role: currentRole, content: currentContent.trim(), platform });
      }
      currentRole = newRole;
      currentContent = text;
    } else if (currentRole) {
      // 续行
      currentContent += '\n' + trimmed;
    } else {
      // 没有角色标记，默认为用户消息
      messages.push({ role: 'user', content: trimmed, platform });
    }
  }

  // 保存最后一条
  if (currentRole && currentContent.trim()) {
    messages.push({ role: currentRole, content: currentContent.trim(), platform });
  }

  return messages;
}

// ============================================
// 提醒设置
// ============================================
function loadReminderSettings() {
  chrome.runtime.sendMessage({ type: 'GET_REMINDER_SETTINGS' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.success) {
      document.getElementById('reminderToggle').checked = response.settings.enabled;
      document.getElementById('reminderTime').value = response.settings.time;
    }
  });
}

function saveReminderSettings() {
  const enabled = document.getElementById('reminderToggle').checked;
  const time = document.getElementById('reminderTime').value;

  chrome.runtime.sendMessage({
    type: 'SAVE_REMINDER_SETTINGS',
    settings: { enabled, time }
  }, (response) => {
    if (response && response.success) {
      showToast(enabled ? `✅ 每日 ${time} 提醒已开启` : '🔕 每日提醒已关闭');
    }
  });
}

// ============================================
// AI总结 (流式输出)
// ============================================
let streamAbortController = null;

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
// Toast 通知
// ============================================
function showToast(message, duration = 2500) {
  // 移除已有 toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // 动画
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// 上下文导出
// ============================================
let exportData = null; // 缓存查询结果

function initExport() {
  // 设置默认日期：最近7天
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  document.getElementById('exportDateTo').value = getLocalDateStr(today);
  document.getElementById('exportDateFrom').value = getLocalDateStr(weekAgo);

  // 查询按钮
  document.getElementById('exportQueryBtn').addEventListener('click', queryExportMessages);

  // 复制 & 下载
  document.getElementById('exportCopyBtn').addEventListener('click', copyExportContent);
  document.getElementById('exportDownloadBtn').addEventListener('click', downloadExportContent);

  // 预览切换
  document.getElementById('exportPreviewToggle').addEventListener('click', toggleExportPreview);

  // 格式切换时刷新预览和统计
  document.querySelectorAll('input[name="exportFormat"]').forEach(r => {
    r.addEventListener('change', updateExportStats);
  });
  document.getElementById('exportAddGuide').addEventListener('change', updateExportStats);
}

function queryExportMessages() {
  const dateFrom = document.getElementById('exportDateFrom').value;
  const dateTo = document.getElementById('exportDateTo').value;
  const keyword = document.getElementById('exportKeyword').value;

  if (!dateFrom || !dateTo) {
    showToast('⚠️ 请选择日期范围');
    return;
  }

  // 获取选中的平台
  const platforms = [];
  document.querySelectorAll('#exportPlatforms input[type="checkbox"]:checked').forEach(cb => {
    platforms.push(cb.value);
  });

  if (platforms.length === 0) {
    showToast('⚠️ 请至少选择一个平台');
    return;
  }

  const btn = document.getElementById('exportQueryBtn');
  btn.disabled = true;
  btn.textContent = '查询中...';

  const resultsContainer = document.getElementById('exportResults');
  resultsContainer.innerHTML = '<div class="loading-ai"><div class="loading-spinner"></div><p>加载中...</p></div>';

  chrome.runtime.sendMessage({
    type: 'GET_CONTEXT_MESSAGES',
    options: { dateFrom, dateTo, platforms, keyword }
  }, (response) => {
    btn.disabled = false;
    btn.textContent = '🔍 查询';

    if (chrome.runtime.lastError || !response || !response.success) {
      resultsContainer.innerHTML = `<div class="error-state"><p>❌ 查询失败: ${response?.error || '未知错误'}</p></div>`;
      return;
    }

    exportData = response.data;
    renderExportResults(exportData);
  });
}

function renderExportResults(data) {
  const container = document.getElementById('exportResults');
  const actionsPanel = document.getElementById('exportActions');

  if (!data || data.stats.totalMessages === 0) {
    container.innerHTML = `<div class="empty-hint"><div class="empty-icon">😕</div><p>该范围内没有找到对话记录</p></div>`;
    actionsPanel.style.display = 'none';
    return;
  }

  let html = '';

  // 遍历每个平台
  for (const [platform, sessions] of Object.entries(data.platforms)) {
    const platformName = getPlatformName(platform);
    const totalMsgs = sessions.reduce((s, sess) => s + sess.messageCount, 0);

    html += `<div class="export-platform-group">`;
    html += `<div class="export-platform-header">
      <label class="platform-group-check">
        <input type="checkbox" data-platform="${platform}" class="platform-select-all" checked>
        <strong>${platformName}</strong>
      </label>
      <span class="platform-summary">${sessions.length} 个会话 · ${totalMsgs} 条</span>
    </div>`;

    // 遍历每个会话
    sessions.forEach((session, sIdx) => {
      const startTime = formatDateTime(session.startTime);
      const endTime = formatDateTime(session.endTime);
      const timeRange = startTime === endTime ? startTime : `${startTime} → ${endTime}`;

      html += `<div class="export-session">`;
      html += `<div class="session-header">
        <label class="session-check">
          <input type="checkbox" data-platform="${platform}" data-session="${sIdx}" class="session-select-all" checked>
          <span class="session-title">会话 ${session.sessionIndex}</span>
        </label>
        <span class="session-time">${timeRange}</span>
        <span class="session-count">${session.messageCount} 条 · ${formatNumber(session.wordCount)} 字</span>
      </div>`;
      html += `<div class="session-messages">`;

      session.messages.forEach((msg, mIdx) => {
        const roleIcon = msg.role === 'user' ? '👤' : '🤖';
        const roleLabel = msg.role === 'user' ? '我' : 'AI';
        const preview = (msg.content || '').substring(0, 100);
        const time = formatTime(msg.timestamp);

        html += `
          <div class="export-msg ${msg.role}">
            <label class="msg-check">
              <input type="checkbox" data-platform="${platform}" data-session="${sIdx}" data-msg="${mIdx}" class="msg-checkbox" checked>
              <span class="msg-role-icon">${roleIcon}</span>
            </label>
            <div class="msg-content-preview">
              <span class="msg-label">${roleLabel} <span class="msg-time-inline">${time}</span></span>
              <span class="msg-preview-text">${escapeHtml(preview)}${msg.content.length > 100 ? '...' : ''}</span>
            </div>
          </div>`;
      });

      html += `</div></div>`; // session-messages + export-session
    });

    html += `</div>`; // export-platform-group
  }

  container.innerHTML = html;
  actionsPanel.style.display = 'block';

  // 绑定 checkbox 联动
  bindExportCheckboxes();
  updateExportStats();
}

function bindExportCheckboxes() {
  // 平台级全选
  document.querySelectorAll('.platform-select-all').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const platform = e.target.dataset.platform;
      const checked = e.target.checked;
      document.querySelectorAll(`.session-select-all[data-platform="${platform}"]`).forEach(s => { s.checked = checked; });
      document.querySelectorAll(`.msg-checkbox[data-platform="${platform}"]`).forEach(m => { m.checked = checked; });
      updateExportStats();
    });
  });

  // 会话级全选
  document.querySelectorAll('.session-select-all').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const { platform, session } = e.target.dataset;
      const checked = e.target.checked;
      document.querySelectorAll(`.msg-checkbox[data-platform="${platform}"][data-session="${session}"]`).forEach(m => { m.checked = checked; });
      updateExportStats();
    });
  });

  // 单条消息
  document.querySelectorAll('.msg-checkbox').forEach(cb => {
    cb.addEventListener('change', updateExportStats);
  });
}

function getSelectedMessages() {
  if (!exportData) return [];
  const selected = [];

  for (const [platform, sessions] of Object.entries(exportData.platforms)) {
    sessions.forEach((session, sIdx) => {
      session.messages.forEach((msg, mIdx) => {
        const cb = document.querySelector(`.msg-checkbox[data-platform="${platform}"][data-session="${sIdx}"][data-msg="${mIdx}"]`);
        if (cb && cb.checked) {
          selected.push({ ...msg, _platform: platform, _sessionIndex: session.sessionIndex });
        }
      });
    });
  }

  return selected;
}

function updateExportStats() {
  const selected = getSelectedMessages();
  const totalChars = selected.reduce((sum, m) => sum + (m.content || '').length, 0);
  const estimatedTokens = Math.round(totalChars * 0.6); // 粗略估算

  const statsEl = document.getElementById('exportStats');
  statsEl.innerHTML = `已选 <strong>${selected.length}</strong> 条消息 · ≈<strong>${formatNumber(totalChars)}</strong> 字 · ≈<strong>${formatNumber(estimatedTokens)}</strong> tokens`;

  // 刷新预览（如果展开了）
  if (document.getElementById('exportPreview').style.display !== 'none') {
    document.getElementById('exportPreviewText').textContent = buildExportText();
  }
}

function buildExportText() {
  const selected = getSelectedMessages();
  if (selected.length === 0) return '（没有选中任何消息）';

  const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'conversation';
  const addGuide = document.getElementById('exportAddGuide').checked;

  let text = '';

  if (format === 'conversation') {
    // 对话格式：分平台 → 分会话
    if (addGuide) {
      text += '以下是我之前与AI的对话记录，请基于这些上下文继续：\n\n';
    }

    // 按平台和会话分组
    const grouped = groupSelectedByPlatformSession(selected);
    for (const [platform, sessions] of Object.entries(grouped)) {
      if (Object.keys(grouped).length > 1) {
        text += `--- ${getPlatformName(platform)} ---\n\n`;
      }
      for (const [sessionIdx, msgs] of Object.entries(sessions)) {
        if (Object.keys(sessions).length > 1) {
          const startTime = formatDateTime(msgs[0].timestamp);
          const endTime = formatDateTime(msgs[msgs.length - 1].timestamp);
          text += `[会话 ${sessionIdx} · ${startTime}${startTime !== endTime ? ' ~ ' + endTime : ''}]\n\n`;
        }
        msgs.forEach(msg => {
          const role = msg.role === 'user' ? '用户' : 'AI';
          text += `${role}: ${msg.content}\n\n`;
        });
      }
    }

    if (addGuide) {
      text += '---\n请基于以上对话继续回答我的问题。\n';
    }

  } else if (format === 'markdown') {
    // Markdown 格式
    if (addGuide) {
      text += '> 以下是我之前与AI的对话记录\n\n';
    }

    const grouped = groupSelectedByPlatformSession(selected);
    for (const [platform, sessions] of Object.entries(grouped)) {
      text += `## ${getPlatformName(platform)}\n\n`;
      for (const [sessionIdx, msgs] of Object.entries(sessions)) {
        const startTime = formatDateTime(msgs[0].timestamp);
        const endTime = formatDateTime(msgs[msgs.length - 1].timestamp);
        text += `### 会话 ${sessionIdx} (${startTime}${startTime !== endTime ? ' ~ ' + endTime : ''})\n\n`;
        msgs.forEach(msg => {
          const role = msg.role === 'user' ? '**用户**' : '**AI**';
          const time = formatTime(msg.timestamp);
          text += `${role} (${time}): ${msg.content}\n\n`;
        });
      }
    }

  } else if (format === 'compact') {
    // 精简格式
    if (addGuide) {
      text += '[对话上下文]\n\n';
    }
    selected.forEach(msg => {
      const role = msg.role === 'user' ? 'Q' : 'A';
      text += `${role}: ${msg.content}\n\n`;
    });
  }

  return text.trim();
}

function groupSelectedByPlatformSession(selected) {
  const grouped = {};
  selected.forEach(msg => {
    const p = msg._platform || msg.platform || 'unknown';
    const s = msg._sessionIndex || 1;
    if (!grouped[p]) grouped[p] = {};
    if (!grouped[p][s]) grouped[p][s] = [];
    grouped[p][s].push(msg);
  });
  return grouped;
}

function copyExportContent() {
  const text = buildExportText();
  if (!text || text === '（没有选中任何消息）') {
    showToast('⚠️ 没有选中任何消息');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('exportCopyBtn');
    btn.textContent = '✅ 已复制!';
    setTimeout(() => { btn.textContent = '📋 复制到剪贴板'; }, 2000);
    showToast(`✅ 已复制 ${getSelectedMessages().length} 条消息到剪贴板`);
  }).catch(() => {
    showToast('❌ 复制失败，请手动复制');
  });
}

function downloadExportContent() {
  const text = buildExportText();
  if (!text || text === '（没有选中任何消息）') {
    showToast('⚠️ 没有选中任何消息');
    return;
  }

  const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'conversation';
  const ext = format === 'markdown' ? 'md' : 'txt';
  const dateFrom = document.getElementById('exportDateFrom').value;
  const dateTo = document.getElementById('exportDateTo').value;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-context_${dateFrom}_${dateTo}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 文件已下载');
}

function toggleExportPreview() {
  const preview = document.getElementById('exportPreview');
  const btn = document.getElementById('exportPreviewToggle');
  if (preview.style.display === 'none') {
    preview.style.display = 'block';
    document.getElementById('exportPreviewText').textContent = buildExportText();
    btn.textContent = '🙈 收起预览';
  } else {
    preview.style.display = 'none';
    btn.textContent = '👁 预览导出内容';
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${min}`;
  } catch { return ''; }
}

// ============================================
// 知识图谱：主题 / 时间线 / 图谱
// ============================================
let graphTopicsData = null; // 缓存提取结果
let graphZoomLevel = 1;

function initGraph() {
  // 子视图切换
  document.querySelectorAll('.graph-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.graph-sub-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.graph-view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
    });
  });

  // 范围选择
  document.querySelectorAll('.scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scope = btn.dataset.scope;
      document.getElementById('graphCustomRange').style.display = scope === 'custom' ? 'flex' : 'none';
    });
  });

  // 生成按钮
  document.getElementById('graphGenerateBtn').addEventListener('click', generateGraphAnalysis);

  // 工具栏
  document.getElementById('graphCopyMermaid').addEventListener('click', copyGraphMermaid);
  document.getElementById('graphDownloadSvg').addEventListener('click', downloadGraphSvg);
  document.getElementById('graphZoomIn').addEventListener('click', () => setGraphZoom(graphZoomLevel + 0.2));
  document.getElementById('graphZoomOut').addEventListener('click', () => setGraphZoom(graphZoomLevel - 0.2));
  document.getElementById('graphZoomReset').addEventListener('click', () => setGraphZoom(1));

  // 默认日期
  const today = new Date();
  document.getElementById('graphDateTo').value = getLocalDateStr(today);
  const weekAgo2 = new Date(today);
  weekAgo2.setDate(weekAgo2.getDate() - 7);
  document.getElementById('graphDateFrom').value = getLocalDateStr(weekAgo2);
}

function getGraphDateRange() {
  const activeScope = document.querySelector('.scope-btn.active')?.dataset.scope || 'today';
  const today = new Date();
  let dateFrom, dateTo;

  if (activeScope === 'today') {
    dateFrom = dateTo = getLocalDateStr(today);
  } else if (activeScope === 'week') {
    dateTo = getLocalDateStr(today);
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    dateFrom = getLocalDateStr(d);
  } else if (activeScope === 'month') {
    dateTo = getLocalDateStr(today);
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    dateFrom = getLocalDateStr(d);
  } else {
    dateFrom = document.getElementById('graphDateFrom').value;
    dateTo = document.getElementById('graphDateTo').value;
  }

  return { dateFrom, dateTo };
}

async function generateGraphAnalysis() {
  const { dateFrom, dateTo } = getGraphDateRange();
  if (!dateFrom || !dateTo) {
    showToast('⚠️ 请选择日期范围');
    return;
  }

  const btn = document.getElementById('graphGenerateBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 分析中...';

  // 第一步：提取主题
  showGraphLoading('view-topics', '正在提取学习主题...');
  showGraphLoading('view-timeline', '等待主题提取完成...');
  showGraphLoading('view-knowledge', '等待主题提取完成...');

  try {
    const topicResp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'EXTRACT_TOPICS',
        options: { dateFrom, dateTo }
      }, resp => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!resp?.success) reject(new Error(resp?.error || '提取失败'));
        else resolve(resp.data);
      });
    });

    graphTopicsData = topicResp;
    renderTopicsView(topicResp);

    // 第二步：生成时间线
    showGraphLoading('view-timeline', '正在生成时间线...');
    try {
      const timelineResp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_TIMELINE',
          topics: topicResp
        }, resp => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!resp?.success) reject(new Error(resp?.error || '生成失败'));
          else resolve(resp.data);
        });
      });
      await renderMermaidView('view-timeline', timelineResp.mermaidCode);
    } catch (e) {
      showGraphError('view-timeline', e.message);
    }

    // 第三步：生成知识图谱
    showGraphLoading('view-knowledge', '正在生成知识图谱...');
    try {
      const direction = document.getElementById('graphDirection').value;
      const graphResp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_KNOWLEDGE_GRAPH',
          topics: topicResp,
          direction
        }, resp => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!resp?.success) reject(new Error(resp?.error || '生成失败'));
          else resolve(resp.data);
        });
      });
      await renderMermaidView('view-knowledge', graphResp.mermaidCode);
    } catch (e) {
      showGraphError('view-knowledge', e.message);
    }

    document.getElementById('graphToolbar').style.display = 'flex';

  } catch (e) {
    showGraphError('view-topics', e.message);
    showGraphError('view-timeline', e.message);
    showGraphError('view-knowledge', e.message);
  }

  btn.disabled = false;
  btn.textContent = '✨ 生成分析';
}

function renderTopicsView(allTopics) {
  const container = document.getElementById('view-topics');

  // 过滤掉没有主题的天
  const daysWithTopics = allTopics.filter(d => d.topics && d.topics.length > 0);

  if (daysWithTopics.length === 0) {
    container.innerHTML = `<div class="graph-placeholder"><div class="empty-icon">😕</div><p>该范围内没有提取到学习主题</p><p class="empty-sub">可能对话量不够或没有明确的学习内容</p></div>`;
    return;
  }

  let html = '';
  daysWithTopics.sort((a, b) => b.date.localeCompare(a.date)); // 最新在前

  daysWithTopics.forEach(day => {
    const d = new Date(day.date);
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日 (周${weekDay})`;

    html += `<div class="topic-day-card">`;
    html += `<div class="topic-day-header"><span class="topic-date">📅 ${dateLabel}</span><span class="topic-day-count">${day.messageCount || 0} 条对话</span></div>`;

    day.topics.forEach(topic => {
      const depthStars = '⭐'.repeat(Math.min(topic.depth || 1, 3));
      const platformBadges = (topic.platforms || []).map(p => `<span class="topic-platform">${getPlatformName(p)}</span>`).join('');
      const tags = (topic.tags || []).map(t => `<span class="topic-tag">#${t}</span>`).join('');

      html += `
        <div class="topic-card depth-${topic.depth || 1}">
          <div class="topic-header">
            <span class="topic-name">${escapeHtml(topic.name)}</span>
            <span class="topic-depth">${depthStars}</span>
          </div>
          <div class="topic-tags">${tags}</div>
          ${topic.summary ? `<div class="topic-summary">${escapeHtml(topic.summary)}</div>` : ''}
          <div class="topic-meta">
            ${platformBadges}
            <span class="topic-msg-count">${topic.msgCount || 0} 条</span>
          </div>
        </div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

async function renderMermaidView(viewId, mermaidCode) {
  const container = document.getElementById(viewId);
  if (!mermaidCode) {
    container.innerHTML = `<div class="graph-placeholder"><div class="empty-icon">😕</div><p>没有足够数据生成可视化</p></div>`;
    return;
  }

  // 存储 mermaid code 到 container 上
  container.dataset.mermaidCode = mermaidCode;

  const wrapperId = 'mermaid-render-' + viewId + '-' + Date.now();
  container.innerHTML = `<div class="graph-mermaid-container" id="${wrapperId}-wrap"><div class="graph-mermaid-inner" id="${wrapperId}-inner"></div></div>`;

  if (typeof mermaid !== 'undefined' && mermaidReady) {
    try {
      const { svg } = await mermaid.render(wrapperId, mermaidCode);
      document.getElementById(wrapperId + '-inner').innerHTML = svg;
    } catch (err) {
      console.warn('[AI监控] Mermaid渲染失败:', err);
      container.innerHTML = `<div class="graph-mermaid-container"><div class="mermaid-error-block"><p>⚠️ 图表渲染失败</p><pre class="mermaid-source">${escapeHtml(mermaidCode)}</pre></div></div>`;
    }
  } else {
    container.innerHTML = `<div class="graph-mermaid-container"><pre class="mermaid-source">${escapeHtml(mermaidCode)}</pre></div>`;
  }
}

function showGraphLoading(viewId, msg) {
  document.getElementById(viewId).innerHTML = `<div class="graph-loading"><div class="loading-spinner"></div><p>${msg}</p></div>`;
}

function showGraphError(viewId, msg) {
  document.getElementById(viewId).innerHTML = `<div class="graph-placeholder"><div class="empty-icon">❌</div><p>${escapeHtml(msg)}</p></div>`;
}

function setGraphZoom(level) {
  graphZoomLevel = Math.max(0.3, Math.min(3, level));
  document.querySelectorAll('.graph-mermaid-inner').forEach(el => {
    el.style.transform = `scale(${graphZoomLevel})`;
    el.style.transformOrigin = 'top center';
  });
}

function copyGraphMermaid() {
  // 找当前活跃的视图的 mermaid code
  const activeView = document.querySelector('.graph-view.active');
  const code = activeView?.dataset?.mermaidCode;
  if (!code) {
    showToast('⚠️ 当前视图没有 Mermaid 代码');
    return;
  }
  navigator.clipboard.writeText(code).then(() => {
    showToast('✅ Mermaid 代码已复制');
  }).catch(() => {
    showToast('❌ 复制失败');
  });
}

function downloadGraphSvg() {
  const activeView = document.querySelector('.graph-view.active');
  const svg = activeView?.querySelector('svg');
  if (!svg) {
    showToast('⚠️ 当前视图没有可下载的图表');
    return;
  }

  const serializer = new XMLSerializer();
  let svgStr = serializer.serializeToString(svg);
  // 添加 XML 声明和 encoding
  if (!svgStr.startsWith('<?xml')) {
    svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
  }
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knowledge-graph-${getLocalDateStr()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ SVG 已下载');
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
    loadPlatformHealth();
    if (document.getElementById('tab-dialogue').classList.contains('active')) loadMessages();
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('dateSelector').addEventListener('change', loadMessages);
  document.getElementById('roleFilter').addEventListener('change', loadMessages);

  document.getElementById('generateSummary').addEventListener('click', () => generateSummary(false));
  document.getElementById('regenerateSummary').addEventListener('click', () => generateSummary(true));

  // 提醒设置
  document.getElementById('reminderToggle').addEventListener('change', saveReminderSettings);
  document.getElementById('reminderTime').addEventListener('change', saveReminderSettings);

  // 搜索
  initSearch();

  // 手动添加
  initManualAdd();

  // 上下文导出
  initExport();

  // 知识图谱
  initGraph();

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
function getLocalDateStr(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPlatformName(platform) {
  const names = {
    chatgpt: 'ChatGPT', claude: 'Claude', copilot: 'Copilot',
    gemini: 'Gemini', deepseek: 'DeepSeek', perplexity: 'Perplexity',
    manual: '手动添加', other: '其他'
  };
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
