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

      // PlantUML (以文本方式展示)
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
        } catch (e) { /* fallback */ }
      }
      const langLabel = language ? `<span class="code-lang">${language}</span>` : '';
      // data-code 用于复制按钮
      const escapedForAttr = code.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      return `<div class="code-block" data-code="${escapedForAttr}">
        ${langLabel}
        <button class="code-copy-btn" title="复制代码">📋</button>
        <pre><code class="hljs ${language ? 'language-' + language : ''}">${highlighted}</code></pre>
      </div>`;
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
      // 渲染失败 → 显示为普通代码块（不暴露红色错误）
      const escapedForAttr = code.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      const fallback = document.createElement('div');
      fallback.className = 'code-block mermaid-fallback';
      fallback.dataset.code = code;
      fallback.innerHTML = `
        <span class="code-lang">mermaid ⚠️</span>
        <button class="code-copy-btn" title="复制代码">📋</button>
        <pre><code class="hljs">${escapeHtml(code)}</code></pre>
      `;
      block.parentElement.replaceChild(fallback, block);
      // 清理 mermaid 产生的错误 DOM
      const errDiv = document.getElementById('d' + id);
      if (errDiv) errDiv.remove();
    }
  }
  // 清理 mermaid 留下的任何错误 tooltip/element
  document.querySelectorAll('[id^="dmermaid-"]').forEach(el => el.remove());
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

  // 代码块复制按钮（事件委托）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-copy-btn');
    if (!btn) return;
    const block = btn.closest('.code-block');
    if (!block) return;
    const code = block.dataset.code || block.querySelector('code')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    });
  });

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
// ============================================
// 对话视图：聚类 + 统一筛选 + 选取
// ============================================
let selectMode = false;
let currentMessages = [];   // 当前过滤后的所有消息（flat）
let searchKeywords = [];    // 当前搜索关键词

const CLUSTER_GAP_MS = 10 * 60 * 1000; // 10分钟间隔分割对话

/**
 * 把扁平消息列表聚类为对话（同平台 + 时间间隔 < 10min）
 */
function clusterMessages(messages) {
  if (!messages || messages.length === 0) return [];

  // 按时间排序
  const sorted = [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const conversations = [];
  let current = null;

  sorted.forEach(msg => {
    const ts = new Date(msg.timestamp).getTime();
    const sameCluster = current
      && current.platform === msg.platform
      && (ts - current.endTs) < CLUSTER_GAP_MS;

    if (sameCluster) {
      current.messages.push(msg);
      current.endTs = ts;
      current.endTime = msg.timestamp;
      current.wordCount += (msg.content || '').length;
    } else {
      // 新对话
      current = {
        platform: msg.platform,
        messages: [msg],
        startTime: msg.timestamp,
        endTime: msg.timestamp,
        startTs: ts,
        endTs: ts,
        wordCount: (msg.content || '').length,
      };
      conversations.push(current);
    }
  });

  // 生成标题：取第一条 user 消息，或第一条消息
  conversations.forEach(conv => {
    const firstUser = conv.messages.find(m => m.role === 'user');
    const titleSource = firstUser || conv.messages[0];
    const raw = (titleSource.content || '').replace(/\n/g, ' ').trim();
    conv.title = raw.length > 60 ? raw.substring(0, 60) + '...' : raw;
    conv.messageCount = conv.messages.length;
  });

  return conversations;
}

/**
 * 主加载函数：获取消息 → 过滤 → 聚类 → 渲染
 * 有搜索词时走跨日期搜索，无搜索词时走单日期
 */
function loadMessages() {
  const query = (document.getElementById('searchInput').value || '').trim();
  const platformFilter = document.getElementById('platformFilter').value;
  const roleFilter = document.getElementById('roleFilter').value;
  const date = document.getElementById('dateSelector').value;
  const container = document.getElementById('conversationsList');

  searchKeywords = query.length >= 2 ? query.toLowerCase().split(/\s+/) : [];

  if (query.length >= 2) {
    // 搜索模式：跨日期搜索
    container.innerHTML = '<div class="loading-ai"><div class="loading-spinner"></div><p>搜索中...</p></div>';
    chrome.runtime.sendMessage({
      type: 'SEARCH_MESSAGES',
      query,
      options: { platform: platformFilter, role: roleFilter, maxResults: 100 }
    }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        container.innerHTML = '<div class="empty-hint">搜索失败</div>';
        return;
      }
      const results = response.results || [];
      currentMessages = results;
      if (results.length === 0) {
        container.innerHTML = '<div class="empty-hint"><div class="empty-icon">😕</div><p>没有找到匹配结果</p></div>';
        return;
      }
      // 按日期分组 → 每组内聚类
      const byDate = {};
      results.forEach(msg => {
        const d = msg.date || '未知';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(msg);
      });
      renderGroupedConversations(byDate, container);
    });
  } else {
    // 日期模式：单日加载
    chrome.runtime.sendMessage({ type: 'GET_MESSAGES', date }, (response) => {
      if (chrome.runtime.lastError) return;
      if (!response || !response.success || !response.messages || response.messages.length === 0) {
        container.innerHTML = '<div class="empty-hint">该日期没有对话记录</div>';
        currentMessages = [];
        if (selectMode) updateSelectStats();
        return;
      }
      let messages = response.messages;
      if (platformFilter !== 'all') messages = messages.filter(m => m.platform === platformFilter);
      if (roleFilter !== 'all') messages = messages.filter(m => m.role === roleFilter);
      currentMessages = messages;

      if (messages.length === 0) {
        container.innerHTML = '<div class="empty-hint">没有符合筛选条件的消息</div>';
        return;
      }
      renderGroupedConversations({ [date]: messages }, container);
    });
  }
}

/**
 * 渲染按日期分组的聚类对话
 */
function renderGroupedConversations(byDate, container) {
  let html = '';
  let globalMsgIdx = 0;
  const renderedMessages = []; // 按渲染顺序重建消息数组

  // 按日期降序
  const sortedDates = Object.keys(byDate).sort().reverse();

  for (const date of sortedDates) {
    const dayMsgs = byDate[date];
    const conversations = clusterMessages(dayMsgs);
    const totalMsgs = dayMsgs.length;

    html += `<div class="date-group">`;
    html += `<div class="date-group-header">📅 ${date} · ${conversations.length}个对话 · ${totalMsgs}条</div>`;

    conversations.forEach((conv, cIdx) => {
      const convId = `conv-${date}-${cIdx}`;
      const platformIcon = getPlatformIcon(conv.platform);
      const timeRange = formatTime(conv.startTime) + (conv.startTime !== conv.endTime ? ' → ' + formatTime(conv.endTime) : '');

      html += `<div class="conv-card" data-conv-id="${convId}">`;

      // 对话头部（可折叠）
      html += `<div class="conv-header" data-toggle="${convId}">`;
      if (selectMode) {
        html += `<label class="conv-select-check" onclick="event.stopPropagation()">
          <input type="checkbox" class="conv-select-cb" data-conv-id="${convId}">
        </label>`;
      }
      html += `
        <span class="conv-platform-icon">${platformIcon}</span>
        <div class="conv-info">
          <div class="conv-title">${searchKeywords.length > 0 ? highlightKeywords(escapeHtml(conv.title), searchKeywords) : escapeHtml(conv.title)}</div>
          <div class="conv-meta">
            <span class="conv-platform-name">${getPlatformName(conv.platform)}</span>
            <span class="conv-time">${timeRange}</span>
            <span class="conv-count">${conv.messageCount}条 · ${formatNumber(conv.wordCount)}字</span>
          </div>
        </div>
        <span class="conv-toggle-icon">▶</span>
      </div>`;

      // 对话消息体（默认折叠）
      html += `<div class="conv-body" id="${convId}" style="display:none;">`;
      conv.messages.forEach(msg => {
        renderedMessages.push(msg); // 同步渲染顺序
        const roleIcon = msg.role === 'user' ? '👤' : '🤖';
        const isSearchMode = searchKeywords.length > 0;
        const contentHtml = isSearchMode
          ? highlightKeywords(escapeHtml(msg.excerpt || (msg.content || '').substring(0, 200)), searchKeywords)
          : renderMarkdown(msg.content || '');

        html += `<div class="conv-msg ${msg.role}" data-global-idx="${globalMsgIdx}">`;
        if (selectMode) {
          html += `<label class="msg-select-check" onclick="event.stopPropagation()">
            <input type="checkbox" class="msg-select-cb" data-global-idx="${globalMsgIdx}">
          </label>`;
        }
        html += `
          <div class="conv-msg-body">
            <div class="conv-msg-header">
              <span class="conv-msg-role">${roleIcon} ${msg.role === 'user' ? '我' : 'AI'}</span>
              <span class="conv-msg-time">${formatTime(msg.timestamp)}</span>
            </div>
            <div class="conv-msg-content ${isSearchMode ? '' : 'md-body'}">${contentHtml}</div>
          </div>
        </div>`;
        globalMsgIdx++;
      });
      html += `</div>`; // conv-body
      html += `</div>`; // conv-card
    });

    html += `</div>`; // date-group
  }

  // 搜索模式下显示总结
  if (searchKeywords.length > 0) {
    const totalResults = Object.values(byDate).reduce((s, m) => s + m.length, 0);
    html = `<div class="search-summary">找到 ${totalResults} 条结果</div>` + html;
  }

  // 同步渲染顺序到 currentMessages（选取模式依赖这个索引）
  currentMessages = renderedMessages;

  container.innerHTML = html;

  // 绑定折叠/展开
  container.querySelectorAll('.conv-header[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const id = header.dataset.toggle;
      const body = document.getElementById(id);
      const icon = header.querySelector('.conv-toggle-icon');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = '▼';
        header.closest('.conv-card').classList.add('expanded');
        // 渲染 mermaid（如果非搜索模式）
        if (searchKeywords.length === 0) renderMermaidBlocks(body);
      } else {
        body.style.display = 'none';
        icon.textContent = '▶';
        header.closest('.conv-card').classList.remove('expanded');
      }
    });
  });

  // 选取模式事件绑定
  if (selectMode) {
    // 对话级 checkbox → 联动消息级
    container.querySelectorAll('.conv-select-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const convId = cb.dataset.convId;
        const body = document.getElementById(convId);
        if (body) {
          body.querySelectorAll('.msg-select-cb').forEach(mcb => { mcb.checked = cb.checked; });
        }
        updateSelectStats();
      });
    });
    // 消息级
    container.querySelectorAll('.msg-select-cb').forEach(cb => {
      cb.addEventListener('change', updateSelectStats);
    });
    updateSelectStats();
  }
}

function getPlatformIcon(platform) {
  const icons = {
    chatgpt: '🟢', claude: '🟠', copilot: '🔵',
    gemini: '🟣', deepseek: '🔷', perplexity: '🟡'
  };
  return icons[platform] || '⚪';
}

// ============================================
// 选取模式
// ============================================
function toggleSelectMode(on) {
  selectMode = on !== undefined ? on : !selectMode;
  const bar = document.getElementById('selectBar');
  const btn = document.getElementById('selectModeBtn');
  const list = document.getElementById('conversationsList');

  if (selectMode) {
    bar.style.display = 'block';
    btn.classList.add('active');
    btn.title = '退出选取模式';
    list.classList.add('has-select-bar');
  } else {
    bar.style.display = 'none';
    btn.classList.remove('active');
    btn.title = '选取上下文';
    list.classList.remove('has-select-bar');
  }
  loadMessages();
}

function updateSelectStats() {
  const total = document.querySelectorAll('.msg-select-cb');
  const checked = document.querySelectorAll('.msg-select-cb:checked');
  const totalChars = Array.from(checked).reduce((sum, cb) => {
    const idx = parseInt(cb.dataset.globalIdx);
    return sum + (currentMessages[idx]?.content || '').length;
  }, 0);
  const tokens = Math.round(totalChars * 0.6);
  document.getElementById('selectStats').innerHTML =
    `已选 <strong>${checked.length}</strong>/${total.length} 条 · ≈${formatNumber(totalChars)}字 · ≈${formatNumber(tokens)}t`;
}

function getSelectedMsgsFromList() {
  const selected = [];
  document.querySelectorAll('.msg-select-cb:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.globalIdx);
    if (currentMessages[idx]) selected.push(currentMessages[idx]);
  });
  return selected;
}

function buildSelectExportText() {
  const selected = getSelectedMsgsFromList();
  if (selected.length === 0) return '';

  const format = document.getElementById('selectFormat').value;
  const addGuide = document.getElementById('selectAddGuide').checked;
  let text = '';

  if (format === 'conversation') {
    if (addGuide) text += '以下是我之前与AI的对话记录，请基于这些上下文继续：\n\n';
    // 按平台分组（如有多平台）
    const platforms = [...new Set(selected.map(m => m.platform))];
    if (platforms.length > 1) {
      platforms.forEach(p => {
        text += `--- ${getPlatformName(p)} ---\n\n`;
        selected.filter(m => m.platform === p).forEach(msg => {
          text += `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}\n\n`;
        });
      });
    } else {
      selected.forEach(msg => {
        text += `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}\n\n`;
      });
    }
    if (addGuide) text += '---\n请基于以上对话继续回答我的问题。\n';
  } else if (format === 'markdown') {
    if (addGuide) text += '> 以下是我之前与AI的对话记录\n\n';
    selected.forEach(msg => {
      const role = msg.role === 'user' ? '**用户**' : '**AI**';
      text += `${role} (${formatTime(msg.timestamp)}): ${msg.content}\n\n`;
    });
  } else {
    if (addGuide) text += '[对话上下文]\n\n';
    selected.forEach(msg => {
      text += `${msg.role === 'user' ? 'Q' : 'A'}: ${msg.content}\n\n`;
    });
  }
  return text.trim();
}

function copySelectedContext() {
  const text = buildSelectExportText();
  if (!text) { showToast('⚠️ 没有选中任何消息'); return; }
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('selectCopyBtn');
    btn.textContent = '✅ 已复制!';
    setTimeout(() => { btn.textContent = '📋 复制上下文'; }, 2000);
    showToast(`✅ 已复制 ${getSelectedMsgsFromList().length} 条消息`);
  });
}

function downloadSelectedContext() {
  const text = buildSelectExportText();
  if (!text) { showToast('⚠️ 没有选中任何消息'); return; }
  const ext = document.getElementById('selectFormat').value === 'markdown' ? 'md' : 'txt';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `context-export-${getLocalDateStr()}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 文件已下载');
}

function selectAllMessages(all) {
  document.querySelectorAll('.msg-select-cb').forEach(cb => { cb.checked = all; });
  // 同步对话级 checkbox
  document.querySelectorAll('.conv-select-cb').forEach(cb => { cb.checked = all; });
  updateSelectStats();
}

// ============================================
// 统一搜索（搜索作为筛选条件，不切换视图）
// ============================================
let searchTimer = null;

function initSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    clearBtn.style.display = input.value ? 'flex' : 'none';
    searchTimer = setTimeout(() => loadMessages(), 350);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      loadMessages();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    loadMessages();
    input.focus();
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

  // 如果有已确认的总结且不是强制重新生成 → 直接展示
  if (!force) {
    const confirmedKey = `summary_confirmed_${date}`;
    chrome.storage.local.get([confirmedKey], (res) => {
      if (res[confirmedKey] && res[confirmedKey].text) {
        regenBtn.style.display = 'inline-block';
        finalizeSummary(res[confirmedKey].text, date, true);
        return;
      }
      // 没有已确认的 → 正常生成
      doGenerateSummary(date, force);
    });
    return;
  }

  doGenerateSummary(date, force);
}

function doGenerateSummary(date, force) {
  const btn = document.getElementById('generateSummary');
  const regenBtn = document.getElementById('regenerateSummary');
  const result = document.getElementById('summaryResult');

  btn.disabled = true;
  regenBtn.disabled = true;
  btn.textContent = '🤖 分析中...';
  regenBtn.style.display = 'none';

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

  // 先检查该日期是否已有「已确认」的总结
  const confirmedKey = `summary_confirmed_${date}`;
  chrome.storage.local.get([confirmedKey], async (res) => {
    const confirmed = res[confirmedKey];
    if (confirmed && !fromCache) {
      // 有已确认的版本 → 显示它而非新生成的
      // 但如果是 force 重新生成的，就不用旧版
    }

    const html = renderMarkdown(summary);
    const isConfirmed = !!confirmed && fromCache;

    result.innerHTML = `
      <div class="ai-badge">
        🤖 AI 生成 · ${date}
        ${fromCache ? ' (缓存)' : ''}
        ${isConfirmed ? ' <span class="confirmed-badge">✅ 已确认</span>' : ''}
      </div>
      <div class="ai-rendered md-body" id="summaryRendered">${html}</div>
      <textarea class="summary-editor" id="summaryEditor" style="display:none;">${escapeHtml(summary)}</textarea>
      <div class="ai-footer">
        <span>生成时间: ${new Date().toLocaleString('zh-CN')}</span>
        <div class="footer-actions">
          <button class="btn-copy" id="copyBtn" title="复制">📋</button>
          <button class="btn-copy" id="editBtn" title="编辑">${isConfirmed ? '📝' : '✏️'}</button>
          ${!isConfirmed ? '<button class="btn-confirm" id="confirmBtn" title="确认总结（下次不再自动生成）">✅ 确认</button>' : ''}
        </div>
      </div>
    `;

    result.dataset.rawText = summary;
    result.dataset.date = date;

    document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
    document.getElementById('editBtn').addEventListener('click', toggleSummaryEdit);
    const confirmBtn = document.getElementById('confirmBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmSummary);

    await renderMermaidBlocks(result);
  });
}

/** 切换编辑/预览模式 */
function toggleSummaryEdit() {
  const rendered = document.getElementById('summaryRendered');
  const editor = document.getElementById('summaryEditor');
  const editBtn = document.getElementById('editBtn');

  if (editor.style.display === 'none') {
    // 进入编辑模式
    editor.value = document.getElementById('summaryResult').dataset.rawText || '';
    editor.style.display = 'block';
    rendered.style.display = 'none';
    editBtn.textContent = '👁 预览';
    editor.focus();
  } else {
    // 回到预览模式
    const newText = editor.value;
    document.getElementById('summaryResult').dataset.rawText = newText;
    rendered.innerHTML = renderMarkdown(newText);
    rendered.style.display = 'block';
    editor.style.display = 'none';
    editBtn.textContent = '✏️';
    renderMermaidBlocks(rendered);
  }
}

/** 确认总结（保存为已确认，下次不再自动生成） */
function confirmSummary() {
  const result = document.getElementById('summaryResult');
  const rawText = result.dataset.rawText || '';
  const date = result.dataset.date || document.getElementById('summaryDate').value;

  if (!rawText || !date) return;

  const key = `summary_confirmed_${date}`;
  chrome.storage.local.set({ [key]: { text: rawText, confirmedAt: new Date().toISOString() } }, () => {
    // 也更新缓存 key 以保持一致
    const cacheKey = `summary_${date}`;
    chrome.storage.local.set({ [cacheKey]: rawText });

    showToast('✅ 总结已确认，该日不会再自动重新生成');

    // 更新UI
    const badge = result.querySelector('.ai-badge');
    if (badge && !badge.querySelector('.confirmed-badge')) {
      badge.innerHTML += ' <span class="confirmed-badge">✅ 已确认</span>';
    }
    const confirmBtn = document.getElementById('confirmBtn');
    if (confirmBtn) confirmBtn.remove();
  });
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
// 选取模式事件绑定
// ============================================
function initExport() {
  document.getElementById('selectModeBtn').addEventListener('click', () => toggleSelectMode());
  document.getElementById('selectCancelBtn').addEventListener('click', () => toggleSelectMode(false));
  document.getElementById('selectCopyBtn').addEventListener('click', copySelectedContext);
  document.getElementById('selectDownloadBtn').addEventListener('click', downloadSelectedContext);
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    const all = document.querySelectorAll('.msg-select-cb');
    const checked = document.querySelectorAll('.msg-select-cb:checked');
    selectAllMessages(checked.length < all.length);
  });
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

  document.getElementById('dateSelector').addEventListener('change', () => {
    // 切换日期时清空搜索
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    loadMessages();
  });
  document.getElementById('roleFilter').addEventListener('change', loadMessages);
  document.getElementById('platformFilter').addEventListener('change', loadMessages);

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
