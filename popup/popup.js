// Popup脚本
let mermaidReady = false;

function initMarkdownRenderer() {
  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    renderer.code = function ({ text, lang }) {
      const code = text || '';
      const language = (lang || '').toLowerCase().trim();
      if (language === 'mermaid') {
        return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(code)}</pre></div>`;
      }
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
      const escapedForAttr = code.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      return `<div class="code-block" data-code="${escapedForAttr}">${langLabel}<button class="code-copy-btn" title="复制代码">📋</button><pre><code class="hljs">${highlighted}</code></pre></div>`;
    };
    renderer.codespan = function ({ text }) {
      return `<code class="inline-code">${text}</code>`;
    };
    marked.setOptions({ renderer, gfm: true, breaks: true });
  }
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
    mermaidReady = true;
  }
}

async function renderMermaidBlocks(container) {
  if (!mermaidReady) return;
  const blocks = container.querySelectorAll('pre.mermaid');
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const code = block.textContent;
    const id = 'mermaid-pop-' + Date.now() + '-' + i;
    try {
      const { svg } = await mermaid.render(id, code);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-rendered';
      wrapper.innerHTML = svg;
      block.parentElement.replaceChild(wrapper, block);
    } catch (err) {
      const fallback = document.createElement('div');
      fallback.className = 'code-block mermaid-fallback';
      fallback.dataset.code = code;
      fallback.innerHTML = `<span class="code-lang">mermaid ⚠️</span><button class="code-copy-btn" title="复制代码">📋</button><pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
      block.parentElement.replaceChild(fallback, block);
      const errDiv = document.getElementById('d' + id);
      if (errDiv) errDiv.remove();
    }
  }
  document.querySelectorAll('[id^="dmermaid-"]').forEach(el => el.remove());
}

document.addEventListener('DOMContentLoaded', () => {
  initMarkdownRenderer();
  loadStats();
  setupEventListeners();
  checkStatus();

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
});

// 加载统计数据
function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (response && response.success) {
      displayStats(response.stats);
    } else {
      console.error('获取统计失败:', response?.error);
      displayEmptyState();
    }
  });
}

// 显示统计数据
function displayStats(stats) {
  document.getElementById('totalMessages').textContent = stats.totalMessages || 0;
  document.getElementById('aiMessages').textContent = stats.aiMessages || 0;
  document.getElementById('userMessages').textContent = stats.userMessages || 0;
  document.getElementById('totalWords').textContent = formatNumber(stats.totalWords || 0);

  const platformsList = document.getElementById('platformsList');
  if (Object.keys(stats.platforms || {}).length === 0) {
    platformsList.innerHTML = '<div class="empty-state">暂无数据</div>';
  } else {
    platformsList.innerHTML = Object.entries(stats.platforms)
      .map(([platform, count]) => `
        <div class="platform-item">
          <span class="platform-name">${getPlatformName(platform)}</span>
          <span class="platform-count">${count}</span>
        </div>
      `).join('');
  }
}

// 显示空状态
function displayEmptyState() {
  document.getElementById('totalMessages').textContent = '0';
  document.getElementById('aiMessages').textContent = '0';
  document.getElementById('userMessages').textContent = '0';
  document.getElementById('totalWords').textContent = '0';
  document.getElementById('platformsList').innerHTML = '<div class="empty-state">暂无数据</div>';
}

// 获取平台中文名称
function getPlatformName(platform) {
  const names = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    copilot: 'Copilot',
    gemini: 'Gemini'
  };
  return names[platform] || platform;
}

// 格式化数字
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

// 设置事件监听
function setupEventListeners() {
  document.getElementById('generateSummary').addEventListener('click', () => generateAISummary(false));
  document.getElementById('regenerateSummary').addEventListener('click', () => generateAISummary(true));
  document.getElementById('viewAll').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// 生成AI总结（force=true 强制重新生成，忽略缓存）- 流式输出
function generateAISummary(force = false) {
  const btn = document.getElementById('generateSummary');
  const regenBtn = document.getElementById('regenerateSummary');
  const section = document.getElementById('summarySection');
  const content = document.getElementById('summaryContent');

  btn.disabled = true;
  regenBtn.disabled = true;
  btn.textContent = force ? '🔄 重新生成中...' : '🤖 AI正在分析...';
  regenBtn.style.display = 'none';
  section.style.display = 'block';

  // 初始连接状态
  content.innerHTML = `
    <div class="ai-summary">
      <div class="ai-badge">🤖 AI 生成</div>
      <div class="ai-content md-body streaming-content" id="popupStreamContent">
        <div class="streaming-placeholder">
          <div class="loading-spinner"></div>
          <p>${force ? '正在重新生成总结...' : '正在连接大模型...'}</p>
        </div>
      </div>
    </div>
  `;

  if (typeof LLMStream !== 'undefined') {
    LLMStream.streamSummary({
      date: null, // 默认今天
      force: !!force,

      onChunk(fullText, delta) {
        const container = document.getElementById('popupStreamContent');
        if (!container) return;
        container.classList.add('streaming-active');
        container.innerHTML = renderMarkdown(fullText) + '<span class="streaming-cursor"></span>';
      },

      onDone(fullText, fromCache) {
        btn.disabled = false;
        regenBtn.disabled = false;
        btn.textContent = '🤖 AI智能总结';
        content.dataset.rawText = fullText;
        finalizePopupSummary(fullText, fromCache);
      },

      onError(error) {
        btn.disabled = false;
        regenBtn.disabled = false;
        btn.textContent = '🤖 AI智能总结';
        const errMsg = error.message || '未知错误';
        content.innerHTML = `<div class="error-state">
          <p>❌ ${escapeHtml(errMsg)}</p>
          ${errMsg.includes('API Key') ? '<p class="error-hint">请在设置页面配置正确的API Key</p>' : ''}
          ${errMsg.includes('没有对话记录') ? '<p class="error-hint">请先在AI平台进行一些对话</p>' : ''}
        </div>`;
      }
    });
  } else {
    // 回退到非流式
    fallbackPopupSummary(force);
  }
}

async function finalizePopupSummary(summary, fromCache) {
  const section = document.getElementById('summarySection');
  const content = document.getElementById('summaryContent');
  const regenBtn = document.getElementById('regenerateSummary');

  const html = renderMarkdown(summary);
  content.innerHTML = `
    <div class="ai-summary">
      <div class="ai-badge">🤖 AI 生成${fromCache ? ' (缓存)' : ''}</div>
      <div class="ai-content md-body">${html}</div>
      <div class="ai-footer">
        <span class="ai-time">生成时间: ${new Date().toLocaleString('zh-CN')}</span>
      </div>
    </div>
  `;

  section.style.display = 'block';
  regenBtn.style.display = 'inline-block';
  section.scrollIntoView({ behavior: 'smooth' });
  await renderMermaidBlocks(content);
}

function fallbackPopupSummary(force) {
  const btn = document.getElementById('generateSummary');
  const regenBtn = document.getElementById('regenerateSummary');
  const content = document.getElementById('summaryContent');

  content.innerHTML = `<div class="loading-ai"><div class="loading-spinner"></div><p>${force ? '正在重新生成总结...' : '正在调用大模型生成智能总结...'}</p></div>`;

  chrome.runtime.sendMessage({ type: 'AI_SUMMARY', force: !!force }, (response) => {
    btn.disabled = false;
    regenBtn.disabled = false;
    btn.textContent = '🤖 AI智能总结';

    if (chrome.runtime.lastError) {
      content.innerHTML = `<div class="error-state">
        <p>❌ 通信错误: ${chrome.runtime.lastError.message}</p>
        <p class="error-hint">请检查插件是否正常运行</p>
      </div>`;
      return;
    }

    if (response && response.success) {
      content.dataset.rawText = response.summary;
      finalizePopupSummary(response.summary, false);
    } else {
      const errMsg = response?.error || '未知错误';
      content.innerHTML = `<div class="error-state">
        <p>❌ ${escapeHtml(errMsg)}</p>
        ${errMsg.includes('API Key') ? '<p class="error-hint">请在设置页面配置正确的API Key</p>' : ''}
        ${errMsg.includes('没有对话记录') ? '<p class="error-hint">请先在AI平台进行一些对话</p>' : ''}
      </div>`;
    }
  });
}

// Markdown 渲染
function renderMarkdown(text) {
  if (!text) return '';
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text); } catch (e) { /* fallback */ }
  }
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

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 检查状态
function checkStatus() {
  // 检查LLM配置状态
  chrome.runtime.sendMessage({ type: 'GET_LLM_CONFIG' }, (response) => {
    const apiStatus = document.getElementById('apiStatus');
    if (!apiStatus) return;
    
    if (response && response.success && response.config.apiKey) {
      const providerName = response.config.providers?.[response.config.provider]?.name || response.config.provider;
      apiStatus.textContent = `✅ ${providerName}`;
      apiStatus.className = 'api-status configured';
    } else {
      apiStatus.textContent = '⚠️ 未配置API';
      apiStatus.className = 'api-status not-configured';
    }
  });

  chrome.storage.local.get(['enabled'], (result) => {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (result.enabled === false) {
      indicator.classList.add('inactive');
      statusText.textContent = '已暂停';
    } else {
      indicator.classList.remove('inactive');
      statusText.textContent = '监控中';
    }
  });
}
