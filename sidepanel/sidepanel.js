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
      
      // 切换到图谱视图时自动加载
      if (sub === 'graph') {
        refreshTopicsView();
      }
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
    // 搜索模式：跨日期搜索，但显示完整对话上下文
    container.innerHTML = '<div class="loading-ai"><div class="loading-spinner"></div><p>搜索中...</p></div>';
    chrome.runtime.sendMessage({
      type: 'SEARCH_MESSAGES',
      query,
      options: { platform: platformFilter, role: roleFilter, maxResults: 200 }
    }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        container.innerHTML = '<div class="empty-hint">搜索失败</div>';
        return;
      }
      const matchedResults = response.results || [];
      if (matchedResults.length === 0) {
        container.innerHTML = '<div class="empty-hint"><div class="empty-icon">😕</div><p>没有找到匹配结果</p></div>';
        return;
      }

      // 收集匹配消息的日期+平台组合
      const datePlatformSet = new Set();
      const matchedMsgIds = new Set(); // 用于标记哪些消息是匹配的
      matchedResults.forEach(msg => {
        const d = msg.date || '未知';
        const key = `${d}|${msg.platform}`;
        datePlatformSet.add(key);
        matchedMsgIds.add(msg.id || `${msg.timestamp}_${msg.role}_${msg.platform}`);
      });

      // 加载每个日期+平台组合的完整消息（不只是匹配的）
      const byDate = {};
      const loadPromises = Array.from(datePlatformSet).map(key => {
        const [date, platform] = key.split('|');
        return new Promise(resolve => {
          chrome.runtime.sendMessage({ type: 'GET_MESSAGES', date }, (resp) => {
            if (resp && resp.success && resp.messages) {
              // 过滤平台（如果指定了平台筛选）
              let msgs = resp.messages;
              if (platformFilter !== 'all') msgs = msgs.filter(m => m.platform === platform);
              if (roleFilter !== 'all') msgs = msgs.filter(m => m.role === roleFilter);
              
              // 标记匹配的消息
              msgs.forEach(msg => {
                const msgId = msg.id || `${msg.timestamp}_${msg.role}_${msg.platform}`;
                msg._isMatched = matchedMsgIds.has(msgId);
                if (msg._isMatched) {
                  // 从matchedResults中获取excerpt
                  const matched = matchedResults.find(m => {
                    const mId = m.id || `${m.timestamp}_${m.role}_${m.platform}`;
                    return mId === msgId;
                  });
                  if (matched && matched.excerpt) msg._excerpt = matched.excerpt;
                }
              });

              if (!byDate[date]) byDate[date] = [];
              byDate[date].push(...msgs);
            }
            resolve();
          });
        });
      });

      await Promise.all(loadPromises);

      // 去重（同一条消息可能出现在多个日期，但实际不会）
      Object.keys(byDate).forEach(date => {
        const seen = new Set();
        byDate[date] = byDate[date].filter(msg => {
          const id = msg.id || `${msg.timestamp}_${msg.role}_${msg.platform}`;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });

      currentMessages = Object.values(byDate).flat();
      renderGroupedConversations(byDate, container, true); // 第三个参数表示搜索模式
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
 * @param {Object} byDate - 按日期分组的消息对象
 * @param {HTMLElement} container - 容器元素
 * @param {boolean} isSearchMode - 是否为搜索模式（需要高亮匹配消息）
 */
function renderGroupedConversations(byDate, container, isSearchMode = false) {
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
      
      // 搜索模式下，如果对话包含匹配消息，自动展开
      const hasMatched = isSearchMode && conv.messages.some(m => m._isMatched);
      const toggleIcon = hasMatched ? '▼' : '▶';

      html += `<div class="conv-card ${hasMatched ? 'expanded' : ''}" data-conv-id="${convId}">`;

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
            ${hasMatched ? '<span class="match-conv-badge">🔍 包含匹配</span>' : ''}
          </div>
        </div>
        <span class="conv-toggle-icon">${toggleIcon}</span>
      </div>`;

      // 对话消息体（搜索模式下包含匹配的对话自动展开）
      html += `<div class="conv-body" id="${convId}" style="display:${hasMatched ? 'block' : 'none'};">`;
      
      conv.messages.forEach(msg => {
        renderedMessages.push(msg); // 同步渲染顺序
        const roleIcon = msg.role === 'user' ? '👤' : '🤖';
        const msgIsMatched = isSearchMode && msg._isMatched;
        
        let contentHtml;
        if (isSearchMode) {
          if (msgIsMatched) {
            // 匹配的消息：使用excerpt并高亮关键词
            const excerpt = msg._excerpt || msg.excerpt || (msg.content || '').substring(0, 200);
            contentHtml = highlightKeywords(escapeHtml(excerpt), searchKeywords);
          } else {
            // 上下文消息：显示完整内容（不截断），但不高亮
            contentHtml = renderMarkdown(msg.content || '');
          }
        } else {
          contentHtml = renderMarkdown(msg.content || '');
        }

        html += `<div class="conv-msg ${msg.role} ${msgIsMatched ? 'matched' : ''}" data-global-idx="${globalMsgIdx}">`;
        if (selectMode) {
          html += `<label class="msg-select-check" onclick="event.stopPropagation()">
            <input type="checkbox" class="msg-select-cb" data-global-idx="${globalMsgIdx}">
          </label>`;
        }
        html += `
          <div class="conv-msg-body">
            <div class="conv-msg-header">
              <span class="conv-msg-role">${roleIcon} ${msg.role === 'user' ? '我' : 'AI'}</span>
              ${msgIsMatched ? '<span class="match-badge">🔍 匹配</span>' : ''}
              <span class="conv-msg-time">${formatTime(msg.timestamp)}</span>
            </div>
            <div class="conv-msg-content ${isSearchMode && !msgIsMatched ? 'md-body' : ''}">${contentHtml}</div>
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
      // 切换范围时自动加载
      refreshTopicsView();
    });
  });

  // 自定义日期范围变化时自动加载
  document.getElementById('graphDateFrom').addEventListener('change', refreshTopicsView);
  document.getElementById('graphDateTo').addEventListener('change', refreshTopicsView);

  // 生成按钮
  document.getElementById('graphGenerateBtn').addEventListener('click', generateGraphAnalysis);

  // 工具栏
  document.getElementById('graphCopyMermaid').addEventListener('click', copyGraphMermaid);
  document.getElementById('graphDownloadSvg').addEventListener('click', downloadGraphSvg);
  document.getElementById('graphZoomIn').addEventListener('click', () => setGraphZoom(graphZoomLevel + 0.2));
  document.getElementById('graphZoomOut').addEventListener('click', () => setGraphZoom(graphZoomLevel - 0.2));
  document.getElementById('graphZoomReset').addEventListener('click', () => setGraphZoom(1));

  // 主题卡片按钮事件委托
  document.getElementById('view-topics').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const date = btn.dataset.date;

    if (action === 'generate') generateSingleDate(date);
    else if (action === 'edit') editTopics(date);
    else if (action === 'confirm') confirmTopics(date);
    else if (action === 'regenerate') regenerateTopics(date);
    else if (action === 'save-edit') saveEditedTopics(date);
    else if (action === 'cancel-edit') cancelEditTopics(date);
    else if (action === 'add-topic') addTopic(date);
    else if (action === 'remove-topic') {
      const idx = parseInt(btn.dataset.idx);
      removeTopic(date, idx);
    }
    else if (action === 'view-conversations') {
      const topicName = btn.dataset.topicName;
      viewConversationsForTopic(date, topicName);
    }
    else if (action === 'batch-generate') {
      const dates = btn.dataset.dates.split(',');
      batchGenerateTopics(dates);
    }
  });

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

// 加载日期范围内的主题数据（不生成，只加载已有）
async function loadTopicsForRange(dateFrom, dateTo) {
  const dates = [];
  let cur = new Date(dateFrom);
  const end = new Date(dateTo);
  while (cur <= end) {
    dates.push(getLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const results = [];
  for (const date of dates) {
    // 检查确认版本
    const confirmedKey = `topics_confirmed_${date}`;
    const confirmed = await new Promise(r => 
      chrome.storage.local.get([confirmedKey], res => r(res[confirmedKey]))
    );
    if (confirmed) {
      results.push({ date, ...confirmed, isConfirmed: true });
      continue;
    }

    // 检查生成版本
    const cacheKey = `topics_${date}`;
    const cached = await new Promise(r => 
      chrome.storage.local.get([cacheKey], res => r(res[cacheKey]))
    );
    if (cached) {
      results.push({ date, ...cached, isConfirmed: false });
    } else {
      // 检查是否有消息（待生成）
      const messages = await new Promise(r => {
        chrome.runtime.sendMessage({ type: 'GET_MESSAGES', date }, resp => {
          r(resp?.success ? resp.messages : []);
        });
      });
      results.push({ 
        date, 
        topics: [], 
        messageCount: messages.length,
        needsGeneration: messages.length > 0
      });
    }
  }

  return results;
}

// 批量生成选中日期（异步队列）
async function batchGenerateTopics(dates) {
  const btn = document.getElementById('graphGenerateBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = `⏳ 生成中 (0/${dates.length})...`;

  let completed = 0;
  for (const date of dates) {
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'EXTRACT_TOPICS_SINGLE',
          date,
          force: false
        }, resp => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!resp?.success) reject(new Error(resp?.error || '生成失败'));
          else resolve(resp.data);
        });
      });
      completed++;
      btn.textContent = `⏳ 生成中 (${completed}/${dates.length})...`;
      // 更新该日期的卡片
      updateTopicCard(date);
    } catch (e) {
      console.error('[图谱] 生成失败:', date, e);
      completed++;
      btn.textContent = `⏳ 生成中 (${completed}/${dates.length})...`;
    }
  }

  btn.disabled = false;
  btn.textContent = originalText;
  showToast(`✅ 已完成 ${completed}/${dates.length} 个日期的生成`);
  // 重新加载视图
  refreshTopicsView();
}

// 刷新主题视图
async function refreshTopicsView() {
  const { dateFrom, dateTo } = getGraphDateRange();
  if (!dateFrom || !dateTo) return;
  
  const data = await loadTopicsForRange(dateFrom, dateTo);
  renderTopicsView(data);
}

// 生成图谱分析（加载已有数据，不强制生成）
async function generateGraphAnalysis() {
  const { dateFrom, dateTo } = getGraphDateRange();
  if (!dateFrom || !dateTo) {
    showToast('⚠️ 请选择日期范围');
    return;
  }

  // 加载已有主题数据
  const topicData = await loadTopicsForRange(dateFrom, dateTo);
  graphTopicsData = topicData;
  renderTopicsView(topicData);

  // 生成时间线和知识图谱（基于已有数据）
  const confirmedTopics = topicData.filter(d => d.isConfirmed || (!d.needsGeneration && d.topics?.length > 0));
  if (confirmedTopics.length === 0) {
    showGraphError('view-timeline', '请先生成并确认至少一个日期的主题');
    showGraphError('view-knowledge', '请先生成并确认至少一个日期的主题');
    return;
  }

  // 生成时间线
  showGraphLoading('view-timeline', '正在生成时间线...');
  try {
    const timelineResp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'GENERATE_TIMELINE',
        topics: confirmedTopics
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

  // 生成知识图谱
  showGraphLoading('view-knowledge', '正在生成知识图谱...');
  try {
    const direction = document.getElementById('graphDirection').value;
    const graphResp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'GENERATE_KNOWLEDGE_GRAPH',
        topics: confirmedTopics,
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
}

function renderTopicsView(allTopics) {
  const container = document.getElementById('view-topics');

  // 按日期排序（最新在前）
  allTopics.sort((a, b) => b.date.localeCompare(a.date));

  // 检查是否有待生成的日期
  const needsGen = allTopics.filter(d => d.needsGeneration);
  const hasData = allTopics.filter(d => d.topics && d.topics.length > 0);

  if (allTopics.length === 0) {
    container.innerHTML = `<div class="graph-placeholder"><div class="empty-icon">😕</div><p>该范围内没有数据</p></div>`;
    return;
  }

  let html = '';

  // 批量生成按钮（如果有待生成的）
  if (needsGen.length > 0) {
    html += `<div class="batch-generate-bar">
      <span>📋 ${needsGen.length} 个日期待生成</span>
      <button class="btn btn-ai btn-sm" data-action="batch-generate" data-dates="${needsGen.map(d => d.date).join(',')}">✨ 批量生成</button>
    </div>`;
  }

  allTopics.forEach(day => {
    const d = new Date(day.date);
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日 (周${weekDay})`;
    const cardId = `topic-card-${day.date}`;

    html += `<div class="topic-day-card" id="${cardId}">`;
    html += `<div class="topic-day-header">
      <span class="topic-date">📅 ${dateLabel}</span>
      <span class="topic-day-count">${day.messageCount || 0} 条对话</span>
      ${day.isConfirmed ? '<span class="confirmed-badge">✅ 已确认</span>' : ''}
    </div>`;

    if (day.needsGeneration) {
      // 待生成状态
      html += `<div class="topic-card-placeholder">
        <p>⏳ 该日期有 ${day.messageCount} 条消息，点击生成主题</p>
        <button class="btn btn-ai btn-sm" data-action="generate" data-date="${day.date}">✨ 生成</button>
      </div>`;
    } else if (!day.topics || day.topics.length === 0) {
      // 无主题
      html += `<div class="topic-card-placeholder">
        <p>😕 该日期没有提取到学习主题</p>
        <button class="btn btn-ai btn-sm" data-action="generate" data-date="${day.date}">✨ 重新生成</button>
      </div>`;
    } else {
      // 显示主题列表
      day.topics.forEach((topic, idx) => {
        const depthStars = '⭐'.repeat(Math.min(topic.depth || 1, 3));
        const platformBadges = (topic.platforms || []).map(p => `<span class="topic-platform">${getPlatformName(p)}</span>`).join('');
        const tags = (topic.tags || []).map(t => `<span class="topic-tag">#${t}</span>`).join('');

        html += `
          <div class="topic-card depth-${topic.depth || 1}" data-action="view-conversations" data-date="${day.date}" data-topic-name="${escapeHtml(topic.name)}" style="cursor:pointer;" title="点击查看相关对话">
            <div class="topic-header">
              <span class="topic-name">${escapeHtml(topic.name)}</span>
              <span class="topic-depth">${depthStars}</span>
            </div>
            <div class="topic-tags">${tags}</div>
            ${topic.summary ? `<div class="topic-summary">${escapeHtml(topic.summary)}</div>` : ''}
            <div class="topic-meta">
              ${platformBadges}
              <span class="topic-msg-count">${topic.msgCount || 0} 条</span>
              <span class="topic-link-hint">🔗 点击查看</span>
            </div>
          </div>`;
      });

      // 操作按钮
      html += `<div class="topic-card-actions">
        <button class="btn btn-outline btn-sm" data-action="edit" data-date="${day.date}">✏️ 编辑</button>
        ${!day.isConfirmed ? `<button class="btn btn-ai btn-sm" data-action="confirm" data-date="${day.date}">✅ 确认</button>` : ''}
        <button class="btn btn-outline btn-sm" data-action="regenerate" data-date="${day.date}">🔄 重新生成</button>
      </div>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

// 生成单个日期
async function generateSingleDate(date, force = false) {
  const card = document.getElementById(`topic-card-${date}`);
  if (!card) return;

  // 显示加载状态（如果有操作按钮区域，也更新）
  const actionsDiv = card.querySelector('.topic-card-actions');
  const placeholder = card.querySelector('.topic-card-placeholder');
  
  if (actionsDiv) {
    actionsDiv.innerHTML = '<div class="loading-ai"><div class="loading-spinner"></div><p>生成中...</p></div>';
  } else if (placeholder) {
    placeholder.innerHTML = '<div class="loading-ai"><div class="loading-spinner"></div><p>生成中...</p></div>';
  }

  try {
    const resp = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'EXTRACT_TOPICS_SINGLE',
        date,
        force
      }, res => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!res?.success) reject(new Error(res?.error || '生成失败'));
        else resolve(res.data);
      });
    });

    // 更新卡片
    await updateTopicCard(date, resp);
    showToast(`✅ ${date} 主题生成完成`);
  } catch (e) {
    if (placeholder) {
      placeholder.innerHTML = `<p>❌ 生成失败: ${escapeHtml(e.message)}</p><button class="btn btn-ai btn-sm" data-action="generate" data-date="${date}">重试</button>`;
    } else if (actionsDiv) {
      actionsDiv.innerHTML = `<p style="color:#e74c3c; font-size:12px;">❌ 生成失败: ${escapeHtml(e.message)}</p>`;
    }
    showToast(`❌ 生成失败: ${e.message}`);
  }
}

// 更新单个日期卡片
async function updateTopicCard(date, data = null) {
  if (!data) {
    // 重新加载
    const resp = await new Promise(r => {
      chrome.runtime.sendMessage({ type: 'EXTRACT_TOPICS_SINGLE', date, force: false }, res => {
        r(res?.success ? res.data : null);
      });
    });
    if (!resp) return;
    data = resp;
  }

  // 重新渲染整个视图（简单方案）
  await refreshTopicsView();
}

// 编辑主题（结构化表单）
function editTopics(date) {
  const card = document.getElementById(`topic-card-${date}`);
  if (!card) return;

  chrome.storage.local.get([`topics_${date}`, `topics_confirmed_${date}`], items => {
    const data = items[`topics_confirmed_${date}`] || items[`topics_${date}`];
    if (!data || !data.topics || data.topics.length === 0) {
      showToast('⚠️ 没有可编辑的主题');
      return;
    }

    const topics = data.topics;
    const topicsContainer = card.querySelector('.topics-list') || card;
    
    // 隐藏原有主题卡片，显示编辑表单
    card.querySelectorAll('.topic-card').forEach(el => el.style.display = 'none');
    const actionsDiv = card.querySelector('.topic-card-actions');
    if (actionsDiv) actionsDiv.style.display = 'none';

    let html = '<div class="topics-edit-form">';
    topics.forEach((topic, idx) => {
      html += `
        <div class="topic-edit-item" data-topic-idx="${idx}">
          <div class="topic-edit-header">
            <span>主题 ${idx + 1}</span>
            <button class="btn-icon-sm" data-action="remove-topic" data-date="${date}" data-idx="${idx}">🗑️</button>
          </div>
          <div class="topic-edit-fields">
            <div class="edit-field">
              <label>主题名称</label>
              <input type="text" class="topic-edit-name" value="${escapeHtml(topic.name || '')}" placeholder="例如: React性能优化">
            </div>
            <div class="edit-field">
              <label>标签 (逗号分隔)</label>
              <input type="text" class="topic-edit-tags" value="${escapeHtml((topic.tags || []).join(', '))}" placeholder="例如: 前端, 性能">
            </div>
            <div class="edit-field">
              <label>深度</label>
              <select class="topic-edit-depth">
                <option value="1" ${topic.depth === 1 ? 'selected' : ''}>1 - 浅尝辄止</option>
                <option value="2" ${topic.depth === 2 ? 'selected' : ''}>2 - 有一定深度</option>
                <option value="3" ${topic.depth === 3 ? 'selected' : ''}>3 - 深入探讨</option>
              </select>
            </div>
            <div class="edit-field">
              <label>摘要</label>
              <textarea class="topic-edit-summary" rows="2" placeholder="一句话总结">${escapeHtml(topic.summary || '')}</textarea>
            </div>
          </div>
        </div>
      `;
    });
    html += `
      <button class="btn btn-outline btn-sm" data-action="add-topic" data-date="${date}" style="margin-top:8px;">➕ 添加主题</button>
      <div class="topic-edit-actions">
        <button class="btn btn-ai btn-sm" data-action="save-edit" data-date="${date}">💾 保存</button>
        <button class="btn btn-outline btn-sm" data-action="cancel-edit" data-date="${date}">取消</button>
      </div>
    </div>`;

    // 插入编辑表单
    const editDiv = document.createElement('div');
    editDiv.className = 'topics-edit-container';
    editDiv.innerHTML = html;
    card.insertBefore(editDiv, card.firstChild.nextSibling);
  });
}

// 保存编辑（从表单收集数据）
async function saveEditedTopics(date) {
  const card = document.getElementById(`topic-card-${date}`);
  if (!card) return;

  const editForm = card.querySelector('.topics-edit-form');
  if (!editForm) return;

  const topicItems = editForm.querySelectorAll('.topic-edit-item');
  const topics = [];

  topicItems.forEach(item => {
    const name = item.querySelector('.topic-edit-name')?.value?.trim();
    if (!name) return; // 跳过空主题

    const tagsStr = item.querySelector('.topic-edit-tags')?.value?.trim() || '';
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

    topics.push({
      name,
      tags,
      depth: parseInt(item.querySelector('.topic-edit-depth')?.value || '1'),
      summary: item.querySelector('.topic-edit-summary')?.value?.trim() || '',
      platforms: [], // 保留原数据
      msgCount: 0
    });
  });

  if (topics.length === 0) {
    showToast('⚠️ 至少需要一个主题');
    return;
  }

  // 保存
  chrome.storage.local.get([`topics_${date}`], items => {
    const original = items[`topics_${date}`] || {};
    const data = {
      date,
      topics,
      messageCount: original.messageCount || 0,
      generatedAt: new Date().toISOString()
    };

    chrome.storage.local.set({ [`topics_${date}`]: data }, () => {
      showToast('✅ 已保存');
      updateTopicCard(date, data);
    });
  });
}

// 取消编辑
function cancelEditTopics(date) {
  const card = document.getElementById(`topic-card-${date}`);
  if (!card) return;
  
  // 移除编辑表单
  const editContainer = card.querySelector('.topics-edit-container');
  if (editContainer) editContainer.remove();
  
  // 恢复显示
  card.querySelectorAll('.topic-card').forEach(el => el.style.display = '');
  const actionsDiv = card.querySelector('.topic-card-actions');
  if (actionsDiv) actionsDiv.style.display = 'flex';
}

// 添加主题
function addTopic(date) {
  const card = document.getElementById(`topic-card-${date}`);
  if (!card) return;
  
  const editForm = card.querySelector('.topics-edit-form');
  if (!editForm) return;
  
  const newIdx = editForm.querySelectorAll('.topic-edit-item').length;
  const newItem = document.createElement('div');
  newItem.className = 'topic-edit-item';
  newItem.dataset.topicIdx = newIdx;
  newItem.innerHTML = `
    <div class="topic-edit-header">
      <span>主题 ${newIdx + 1}</span>
      <button class="btn-icon-sm" data-action="remove-topic" data-date="${date}" data-idx="${newIdx}">🗑️</button>
    </div>
    <div class="topic-edit-fields">
      <div class="edit-field">
        <label>主题名称</label>
        <input type="text" class="topic-edit-name" placeholder="例如: React性能优化">
      </div>
      <div class="edit-field">
        <label>标签 (逗号分隔)</label>
        <input type="text" class="topic-edit-tags" placeholder="例如: 前端, 性能">
      </div>
      <div class="edit-field">
        <label>深度</label>
        <select class="topic-edit-depth">
          <option value="1">1 - 浅尝辄止</option>
          <option value="2" selected>2 - 有一定深度</option>
          <option value="3">3 - 深入探讨</option>
        </select>
      </div>
      <div class="edit-field">
        <label>摘要</label>
        <textarea class="topic-edit-summary" rows="2" placeholder="一句话总结"></textarea>
      </div>
    </div>
  `;
  
  const addBtn = editForm.querySelector('[data-action="add-topic"]');
  addBtn.parentNode.insertBefore(newItem, addBtn);
}

// 删除主题
function removeTopic(date, idx) {
  const card = document.getElementById(`topic-card-${date}`);
  if (!card) return;
  
  const editForm = card.querySelector('.topics-edit-form');
  if (!editForm) return;
  
  const item = editForm.querySelector(`[data-topic-idx="${idx}"]`);
  if (item) item.remove();
  
  // 重新编号
  editForm.querySelectorAll('.topic-edit-item').forEach((el, i) => {
    el.querySelector('.topic-edit-header span').textContent = `主题 ${i + 1}`;
    el.dataset.topicIdx = i;
    el.querySelector('[data-action="remove-topic"]').dataset.idx = i;
  });
}

// 确认主题
async function confirmTopics(date) {
  chrome.storage.local.get([`topics_${date}`], items => {
    const data = items[`topics_${date}`];
    if (!data) {
      showToast('⚠️ 请先生成主题');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'SAVE_CONFIRMED_TOPICS',
      date,
      data
    }, resp => {
      if (resp?.success) {
        showToast('✅ 已确认');
        updateTopicCard(date);
      } else {
        showToast('❌ 确认失败');
      }
    });
  });
}

// 重新生成（强制）
async function regenerateTopics(date) {
  await generateSingleDate(date, true);
}

// 查看主题相关对话
function viewConversationsForTopic(date, topicName) {
  // 切换到对话tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="dialogue"]').classList.add('active');
  document.getElementById('tab-dialogue').classList.add('active');

  // 设置日期筛选
  document.getElementById('dateSelector').value = date;

  // 设置搜索关键词（主题名称的关键词）
  const keywords = topicName.split(/[，,、\s]+/).filter(k => k.length > 1).slice(0, 2);
  if (keywords.length > 0) {
    document.getElementById('searchInput').value = keywords.join(' ');
    document.getElementById('searchClear').style.display = 'flex';
  }

  // 加载消息
  loadMessages();
  
  showToast(`📅 已跳转到 ${date} 的对话`);
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
      // 显示为代码块格式（不要红色错误）
      container.innerHTML = `
        <div class="code-block mermaid-fallback">
          <div class="code-lang">⚠️ 图表语法有误</div>
          <button class="code-copy-btn" data-code="${escapeHtml(mermaidCode).replace(/"/g, '&quot;')}">📋</button>
          <pre><code>${escapeHtml(mermaidCode)}</code></pre>
        </div>
      `;
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
