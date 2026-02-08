// Options页面脚本
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
      if (language === 'plantuml' || language === 'puml') {
        return `<div class="uml-block"><div class="uml-label">📐 PlantUML</div><pre class="plantuml-code"><code>${escapeHtml(code)}</code></pre></div>`;
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
      return `<div class="code-block">${langLabel}<pre><code class="hljs ${language ? 'language-' + language : ''}">${highlighted}</code></pre></div>`;
    };
    renderer.codespan = function ({ text }) {
      return `<code class="inline-code">${text}</code>`;
    };
    renderer.table = function ({ header, rows }) {
      let headerHtml = '<tr>' + header.map(h => `<th>${h.text}</th>`).join('') + '</tr>';
      let bodyHtml = rows.map(row => '<tr>' + row.map(cell => `<td>${cell.text}</td>`).join('') + '</tr>').join('');
      return `<div class="table-wrapper"><table class="md-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
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
    const id = 'mermaid-opt-' + Date.now() + '-' + i;
    try {
      const { svg } = await mermaid.render(id, code);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-rendered';
      wrapper.innerHTML = svg;
      block.parentElement.replaceChild(wrapper, block);
    } catch (err) {
      block.classList.add('mermaid-error');
      block.innerHTML = `<span class="mermaid-error-hint">⚠️ 图表语法有误</span>\n${escapeHtml(code)}`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMarkdownRenderer();
  loadLLMConfig();
  loadSettings();
  loadDataStats();
  setupEventListeners();
  loadMessagesForToday();
  initSummaryDate();
});

// ============================================
// LLM 大模型配置
// ============================================
let cachedProviders = {}; // 缓存供应商列表
let defaultSystemPrompt = ''; // 默认提示词

function loadLLMConfig() {
  chrome.runtime.sendMessage({ type: 'GET_LLM_CONFIG' }, (response) => {
    if (!response || !response.success) return;
    const config = response.config;

    cachedProviders = config.providers || {};
    defaultSystemPrompt = config.systemPrompt || '';

    // 供应商
    document.getElementById('llmProvider').value = config.provider || 'moonshot';
    updateModelSelect(config.provider, config.model);

    // API URL & Key
    document.getElementById('llmApiUrl').value = config.apiUrl || '';
    document.getElementById('llmApiKey').value = config.apiKey || '';

    // 生成参数
    const temp = (config.generation?.temperature || 0.7);
    document.getElementById('llmTemperature').value = Math.round(temp * 100);
    document.getElementById('temperatureValue').textContent = temp.toFixed(1);
    document.getElementById('llmMaxTokens').value = config.generation?.maxTokens || 2000;

    // 提示词
    document.getElementById('llmSystemPrompt').value = config.systemPrompt || '';

    // 自定义供应商时API URL可编辑
    toggleApiUrlEditable(config.provider);
  });
}

function updateModelSelect(provider, currentModel) {
  const select = document.getElementById('llmModel');
  select.innerHTML = '';

  const providerConfig = cachedProviders[provider];
  if (!providerConfig) return;

  providerConfig.models.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.id} — ${m.name} (${formatContextLength(m.contextLength)})`;
    select.appendChild(option);
  });

  if (currentModel) {
    select.value = currentModel;
  }

  // 更新API URL
  document.getElementById('llmApiUrl').value = providerConfig.apiUrl || '';
}

function formatContextLength(len) {
  if (len >= 1000) return Math.round(len / 1000) + 'K';
  return len + '';
}

function toggleApiUrlEditable(provider) {
  const input = document.getElementById('llmApiUrl');
  if (provider === 'custom') {
    input.removeAttribute('readonly');
    input.style.opacity = '1';
  } else {
    input.setAttribute('readonly', 'readonly');
    input.style.opacity = '0.7';
  }
}

function saveLLMConfig() {
  const config = {
    provider: document.getElementById('llmProvider').value,
    model: document.getElementById('llmModel').value,
    apiKey: document.getElementById('llmApiKey').value.trim(),
    apiUrl: document.getElementById('llmApiUrl').value.trim(),
    generation: {
      temperature: parseInt(document.getElementById('llmTemperature').value) / 100,
      maxTokens: parseInt(document.getElementById('llmMaxTokens').value) || 2000
    }
  };

  if (!config.apiKey) {
    showNotification('请输入API Key', 'error');
    return;
  }

  chrome.runtime.sendMessage({ type: 'SAVE_LLM_CONFIG', config }, (response) => {
    if (response && response.success) {
      showNotification('大模型配置已保存');
    } else {
      showNotification('保存失败: ' + (response?.error || ''), 'error');
    }
  });
}

function savePrompt() {
  const systemPrompt = document.getElementById('llmSystemPrompt').value.trim();
  chrome.runtime.sendMessage({
    type: 'SAVE_LLM_CONFIG',
    config: { systemPrompt }
  }, (response) => {
    if (response && response.success) {
      showNotification('提示词已保存');
    } else {
      showNotification('保存失败', 'error');
    }
  });
}

function resetPrompt() {
  document.getElementById('llmSystemPrompt').value = defaultSystemPrompt;
  showNotification('已恢复默认提示词，请点击"保存提示词"生效');
}

function testLLMApi() {
  const config = {
    apiUrl: document.getElementById('llmApiUrl').value.trim(),
    apiKey: document.getElementById('llmApiKey').value.trim(),
    model: document.getElementById('llmModel').value
  };

  if (!config.apiKey) {
    showNotification('请先输入API Key', 'error');
    return;
  }

  const resultEl = document.getElementById('apiTestResult');
  const btn = document.getElementById('testLLMApi');
  
  btn.disabled = true;
  btn.textContent = '测试中...';
  resultEl.textContent = '⏳ 正在连接...';
  resultEl.className = 'api-test-result testing';

  chrome.runtime.sendMessage({ type: 'TEST_API', config }, (response) => {
    btn.disabled = false;
    btn.textContent = '测试连接';

    if (response && response.success) {
      resultEl.textContent = '✅ 连接成功: ' + response.result;
      resultEl.className = 'api-test-result success';
    } else {
      resultEl.textContent = '❌ ' + (response?.error || '连接失败');
      resultEl.className = 'api-test-result error';
    }
  });
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('llmApiKey');
  const btn = document.getElementById('toggleApiKey');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// ============================================
// AI总结 (流式输出)
// ============================================
function initSummaryDate() {
  document.getElementById('summaryDate').value = new Date().toISOString().split('T')[0];
}

function generateAISummary(force = false) {
  const date = document.getElementById('summaryDate').value;
  if (!date) { showNotification('请选择日期', 'error'); return; }

  const btn = document.getElementById('generateAISummary');
  const regenBtn = document.getElementById('regenerateAISummary');
  const resultDiv = document.getElementById('aiSummaryResult');
  const contentDiv = document.getElementById('aiSummaryContent');

  btn.disabled = true;
  regenBtn.disabled = true;
  regenBtn.style.display = 'none';
  btn.textContent = force ? '🔄 重新生成中...' : '🤖 AI正在分析...';
  resultDiv.style.display = 'block';

  // 显示初始连接状态
  contentDiv.innerHTML = `
    <div class="ai-badge">🤖 AI 生成 | ${date}</div>
    <div class="ai-rendered md-body streaming-content" id="optStreamingContent">
      <div class="streaming-placeholder">
        <div class="loading-spinner"></div>
        <p>${force ? '正在重新生成总结...' : '正在连接大模型...'}</p>
      </div>
    </div>
  `;

  if (typeof LLMStream !== 'undefined') {
    LLMStream.streamSummary({
      date,
      force: !!force,

      onChunk(fullText, delta) {
        const container = document.getElementById('optStreamingContent');
        if (!container) return;
        container.classList.add('streaming-active');
        container.innerHTML = renderMarkdown(fullText) + '<span class="streaming-cursor"></span>';
      },

      onDone(fullText, fromCache) {
        btn.disabled = false;
        regenBtn.disabled = false;
        btn.textContent = '🤖 生成AI总结';
        contentDiv.dataset.rawText = fullText;
        regenBtn.style.display = 'inline-block';
        finalizeOptionsSummary(contentDiv, fullText, date, fromCache);
      },

      onError(error) {
        btn.disabled = false;
        regenBtn.disabled = false;
        btn.textContent = '🤖 生成AI总结';
        const err = error.message || '生成失败';
        contentDiv.innerHTML = `
          <div class="error-state">
            <p>❌ ${escapeHtml(err)}</p>
            ${err.includes('API Key') ? '<p class="error-hint">请在上方配置正确的API Key</p>' : ''}
            ${err.includes('没有对话记录') ? '<p class="error-hint">该日期没有记录的对话</p>' : ''}
          </div>
        `;
      }
    });
  } else {
    // 回退到非流式
    fallbackOptionsSummary(date, force);
  }
}

async function finalizeOptionsSummary(contentDiv, summary, date, fromCache) {
  const html = renderMarkdown(summary);
  contentDiv.innerHTML = `
    <div class="ai-badge">🤖 AI 生成 | ${date}${fromCache ? ' (缓存)' : ''}</div>
    <div class="ai-rendered md-body">${html}</div>
    <div class="ai-footer">
      <span>生成时间: ${new Date().toLocaleString('zh-CN')}</span>
      <button class="btn btn-sm btn-copy" onclick="copyToClipboard()">📋 复制</button>
    </div>
  `;
  await renderMermaidBlocks(contentDiv);
}

function fallbackOptionsSummary(date, force) {
  const btn = document.getElementById('generateAISummary');
  const regenBtn = document.getElementById('regenerateAISummary');
  const contentDiv = document.getElementById('aiSummaryContent');

  contentDiv.innerHTML = `
    <div class="loading-ai">
      <div class="loading-spinner"></div>
      <p>${force ? '正在重新生成总结...' : '正在调用大模型分析对话记录...'}</p>
      <p class="loading-hint">这可能需要几秒钟</p>
    </div>
  `;

  chrome.runtime.sendMessage({ type: 'AI_SUMMARY', date, force: !!force }, (response) => {
    btn.disabled = false;
    regenBtn.disabled = false;
    btn.textContent = '🤖 生成AI总结';

    if (response && response.success) {
      contentDiv.dataset.rawText = response.summary;
      regenBtn.style.display = 'inline-block';
      finalizeOptionsSummary(contentDiv, response.summary, date, false);
    } else {
      contentDiv.innerHTML = `
        <div class="error-state">
          <p>❌ ${escapeHtml(response?.error || '生成失败')}</p>
          ${(response?.error || '').includes('API Key') ? '<p class="error-hint">请在上方配置正确的API Key</p>' : ''}
          ${(response?.error || '').includes('没有对话记录') ? '<p class="error-hint">该日期没有记录的对话</p>' : ''}
        </div>
      `;
    }
  });
}

function copyToClipboard() {
  const contentDiv = document.getElementById('aiSummaryContent');
  const rawText = contentDiv.dataset.rawText || contentDiv.innerText;
  navigator.clipboard.writeText(rawText).then(() => {
    showNotification('已复制到剪贴板');
  }).catch(() => {
    showNotification('复制失败', 'error');
  });
}
window.copyToClipboard = copyToClipboard;

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

// ============================================
// 基本设置
// ============================================
function loadSettings() {
  chrome.storage.local.get(['enabled', 'retentionDays', 'platforms'], (result) => {
    document.getElementById('enableMonitoring').checked = result.enabled !== false;
    document.getElementById('retentionDays').value = result.retentionDays || 30;

    const platforms = result.platforms || {
      chatgpt: true, claude: true, copilot: true, gemini: true
    };
    document.getElementById('platform-chatgpt').checked = platforms.chatgpt !== false;
    document.getElementById('platform-claude').checked = platforms.claude !== false;
    document.getElementById('platform-copilot').checked = platforms.copilot !== false;
    document.getElementById('platform-gemini').checked = platforms.gemini !== false;
  });
}

function saveSettings() {
  const enabled = document.getElementById('enableMonitoring').checked;
  const retentionDays = parseInt(document.getElementById('retentionDays').value);
  const platforms = {
    chatgpt: document.getElementById('platform-chatgpt').checked,
    claude: document.getElementById('platform-claude').checked,
    copilot: document.getElementById('platform-copilot').checked,
    gemini: document.getElementById('platform-gemini').checked
  };
  chrome.storage.local.set({ enabled, retentionDays, platforms }, () => {
    showNotification('设置已保存');
  });
}

// ============================================
// 数据管理
// ============================================
function loadDataStats() {
  chrome.storage.local.get(null, (items) => {
    let totalMessages = 0;
    let totalSize = 0;
    Object.keys(items).forEach(key => {
      if (key.startsWith('messages_')) {
        const messages = items[key] || [];
        totalMessages += messages.length;
        totalSize += JSON.stringify(messages).length;
      }
    });
    document.getElementById('totalMessagesCount').textContent = totalMessages;
    document.getElementById('storageSize').textContent = formatBytes(totalSize);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================
// 事件监听
// ============================================
function setupEventListeners() {
  // LLM配置
  document.getElementById('saveLLMConfig').addEventListener('click', saveLLMConfig);
  document.getElementById('testLLMApi').addEventListener('click', testLLMApi);
  document.getElementById('toggleApiKey').addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('savePrompt').addEventListener('click', savePrompt);
  document.getElementById('resetPrompt').addEventListener('click', resetPrompt);

  // 供应商切换
  document.getElementById('llmProvider').addEventListener('change', (e) => {
    const provider = e.target.value;
    updateModelSelect(provider);
    toggleApiUrlEditable(provider);
  });

  // Temperature滑块
  document.getElementById('llmTemperature').addEventListener('input', (e) => {
    document.getElementById('temperatureValue').textContent = (parseInt(e.target.value) / 100).toFixed(1);
  });

  // AI总结
  document.getElementById('generateAISummary').addEventListener('click', () => generateAISummary(false));
  document.getElementById('regenerateAISummary').addEventListener('click', () => generateAISummary(true));

  // 基本设置
  document.getElementById('enableMonitoring').addEventListener('change', saveSettings);
  document.getElementById('retentionDays').addEventListener('change', saveSettings);
  document.getElementById('platform-chatgpt').addEventListener('change', saveSettings);
  document.getElementById('platform-claude').addEventListener('change', saveSettings);
  document.getElementById('platform-copilot').addEventListener('change', saveSettings);
  document.getElementById('platform-gemini').addEventListener('change', saveSettings);

  // 日期选择器
  document.getElementById('dateSelector').addEventListener('change', (e) => {
    loadMessagesForDate(e.target.value);
  });

  // 导出/清除
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('clearData').addEventListener('click', () => {
    if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
      clearAllData();
    }
  });
}

// ============================================
// 消息历史
// ============================================
function loadMessagesForToday() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dateSelector').value = today;
  loadMessagesForDate(today);
}

function loadMessagesForDate(date) {
  const key = `messages_${date}`;
  chrome.storage.local.get([key], (result) => {
    displayMessages(result[key] || []);
  });
}

function displayMessages(messages) {
  const list = document.getElementById('messagesList');
  if (messages.length === 0) {
    list.innerHTML = '<div class="empty-state">该日期没有记录的消息</div>';
    return;
  }
  list.innerHTML = messages.map(msg => `
    <div class="message-item ${msg.role}">
      <div class="message-header">
        <span class="message-role">${msg.role === 'user' ? '👤 我' : '🤖 AI'}</span>
        <div>
          <span class="message-platform">${msg.platform}</span>
          <span style="margin-left: 10px; color: #999;">${formatTime(msg.timestamp)}</span>
        </div>
      </div>
      <div class="message-content md-body">${renderMarkdown(msg.content || '')}</div>
    </div>
  `).join('');
  renderMermaidBlocks(list);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// 导出/清除
// ============================================
function exportData() {
  chrome.storage.local.get(null, (items) => {
    const data = {};
    Object.keys(items).forEach(key => {
      if (key.startsWith('messages_') || key.startsWith('summary_')) {
        data[key] = items[key];
      }
    });
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-dialogue-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('数据已导出');
  });
}

function clearAllData() {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(key =>
      key.startsWith('messages_') || key.startsWith('summary_')
    );
    chrome.storage.local.remove(keysToRemove, () => {
      showNotification('所有数据已清除');
      loadDataStats();
      displayMessages([]);
    });
  });
}

// ============================================
// 通知
// ============================================
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  const bgColor = type === 'error' ? '#f44336' : '#4caf50';
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    background: ${bgColor}; color: white;
    padding: 12px 24px; border-radius: 6px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000; animation: slideIn 0.3s ease;
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
`;
document.head.appendChild(style);
