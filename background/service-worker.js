// 后台服务 Worker
// 加载LLM配置文件
try {
  importScripts('llm-config.js');
  console.log('[AI监控] ✅ 配置文件加载成功');
} catch (e) {
  console.warn('[AI监控] 配置文件加载失败，使用内置默认配置:', e.message);
}

// 如果外部配置加载失败，使用内置默认配置
if (typeof LLM_CONFIG === 'undefined') {
  var LLM_CONFIG = {
    provider: 'moonshot',
    providers: {
      moonshot: {
        name: 'Moonshot / Kimi',
        apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
        models: [
          { id: 'kimi-k2.5', name: 'Kimi K2.5（最便宜）', contextLength: 128000 },
          { id: 'moonshot-v1-8k', name: 'V1 8K', contextLength: 8000 }
        ],
        defaultModel: 'kimi-k2.5'
      },
      openai: {
        name: 'OpenAI / ChatGPT',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        models: [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128000 }
        ],
        defaultModel: 'gpt-4o-mini'
      },
      deepseek: {
        name: 'DeepSeek',
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        models: [
          { id: 'deepseek-chat', name: 'DeepSeek Chat', contextLength: 64000 }
        ],
        defaultModel: 'deepseek-chat'
      },
      custom: {
        name: '自定义（兼容OpenAI格式）',
        apiUrl: '',
        models: [{ id: 'custom-model', name: '自定义模型', contextLength: 8000 }],
        defaultModel: 'custom-model'
      }
    },
    model: '',
    apiKey: '',
    generation: { temperature: 0.7, maxTokens: 2000, maxInputChars: 6000 },
    systemPrompt: '你是一个学习总结助手。请分析对话记录，生成结构化的每日学习总结，包括：今日主题、关键收获、实践要点、学习概况、明日建议。用中文回复。'
  };
}

// 如果辅助函数也未定义（外部文件加载失败时），定义它们
if (typeof getCurrentProvider === 'undefined') {
  function getCurrentProvider() {
    return LLM_CONFIG.providers[LLM_CONFIG.provider] || LLM_CONFIG.providers.moonshot;
  }
  function getCurrentModel() {
    var provider = getCurrentProvider();
    return LLM_CONFIG.model || provider.defaultModel;
  }
  function getCurrentContextLength() {
    var provider = getCurrentProvider();
    var modelId = getCurrentModel();
    var modelInfo = provider.models.find(function(m) { return m.id === modelId; });
    return modelInfo ? modelInfo.contextLength : 8000;
  }
  function getApiUrl() {
    return getCurrentProvider().apiUrl;
  }
  function getApiKey() {
    return LLM_CONFIG.apiKey;
  }
  function getMaxInputChars() {
    return Math.floor(getCurrentContextLength() * 1.5 * 0.7);
  }
  function loadLLMConfigFromStorage() {
    return new Promise(function(resolve) {
      chrome.storage.local.get(['llmConfig'], function(result) {
        if (result.llmConfig) {
          var saved = result.llmConfig;
          if (saved.provider) LLM_CONFIG.provider = saved.provider;
          if (saved.model) LLM_CONFIG.model = saved.model;
          if (saved.apiKey) LLM_CONFIG.apiKey = saved.apiKey;
          if (saved.apiUrl) {
            var provider = getCurrentProvider();
            if (provider) provider.apiUrl = saved.apiUrl;
          }
          if (saved.systemPrompt) LLM_CONFIG.systemPrompt = saved.systemPrompt;
          if (saved.generation) Object.assign(LLM_CONFIG.generation, saved.generation);
        }
        resolve(LLM_CONFIG);
      });
    });
  }
  function saveLLMConfigToStorage(config) {
    return new Promise(function(resolve) {
      chrome.storage.local.set({ llmConfig: config }, resolve);
    });
  }
}

console.log('[AI监控] Background Service Worker 已启动');

// ============================================
// 侧边栏：点击图标时打开 Side Panel
// ============================================
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('[AI监控] ✅ 侧边栏已启用（点击图标打开）');
} catch (e) {
  console.log('[AI监控] sidePanel API 不可用，将使用 popup:', e.message);
}

// ============================================
// 支持的 AI 平台列表
// ============================================
const AI_PLATFORMS = {
  chatgpt:    { name: 'ChatGPT',    domains: ['chatgpt.com', 'chat.openai.com'] },
  claude:     { name: 'Claude',     domains: ['claude.ai', 'console.anthropic.com'] },
  copilot:    { name: 'Copilot',    domains: ['copilot.microsoft.com'] },
  gemini:     { name: 'Gemini',     domains: ['gemini.google.com'] },
  deepseek:   { name: 'DeepSeek',   domains: ['chat.deepseek.com'] },
  perplexity: { name: 'Perplexity', domains: ['www.perplexity.ai'] }
};

// ============================================
// 调用大模型API生成总结（从配置文件读取所有参数）
// ============================================
async function callLLMAPI(messages) {
  await loadLLMConfigFromStorage();

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('未设置API Key，请在设置页面配置');
  }

  const apiUrl = getApiUrl();
  const model = getCurrentModel();
  const maxInputChars = getMaxInputChars();

  console.log('[AI监控] 调用LLM:', getCurrentProvider().name, '模型:', model);

  const conversationText = messages.map(msg => {
    const role = msg.role === 'user' ? '用户' : 'AI';
    const platform = msg.platform || '未知平台';
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN');
    return `[${time} - ${platform}] ${role}: ${msg.content.substring(0, 500)}`;
  }).join('\n\n');

  const truncatedText = conversationText.length > maxInputChars
    ? conversationText.substring(0, maxInputChars) + '\n\n...(内容已截断)'
    : conversationText;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: LLM_CONFIG.systemPrompt },
        { role: 'user', content: `以下是我今天与AI的对话记录，请帮我生成学习总结：\n\n${truncatedText}` }
      ],
      temperature: LLM_CONFIG.generation.temperature,
      max_tokens: LLM_CONFIG.generation.maxTokens
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[AI监控] LLM API错误:', response.status, errBody);
    if (response.status === 401) throw new Error('API Key无效，请检查设置');
    if (response.status === 429) throw new Error('API调用频率过高，请稍后再试');
    throw new Error(`API调用失败 (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 测试API连通性
async function testApiConnection(config) {
  const apiUrl = config.apiUrl || getApiUrl();
  const apiKey = config.apiKey || getApiKey();
  const model = config.model || getCurrentModel();

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
      max_tokens: 20
    })
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('API Key无效');
    const body = await response.text();
    throw new Error(`API调用失败 (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// 插件安装/更新
// ============================================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AI监控] 插件已安装/更新:', details.reason);
  
  chrome.storage.local.set({
    enabled: true,
    platforms: { chatgpt: true, claude: true, copilot: true, gemini: true, deepseek: true, perplexity: true },
    autoSummary: true,
    retentionDays: 30,
    dailyReminder: true,
    reminderTime: '20:00'
  });

  injectToAllTabs();

  // 设置每日提醒闹钟
  setupDailyReminder();
});

// ============================================
// 标签页注入
// ============================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isAIPlatform(tab.url)) {
    console.log('[AI监控] 标签页加载完成:', tab.url);
    setTimeout(() => injectToTab(tabId), 1500);
  }
});

function isAIPlatform(url) {
  try {
    const hostname = new URL(url).hostname;
    return Object.values(AI_PLATFORMS).some(p => p.domains.some(d => hostname.includes(d)));
  } catch { return false; }
}

function getPlatformFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    for (const [key, info] of Object.entries(AI_PLATFORMS)) {
      if (info.domains.some(d => hostname.includes(d))) return key;
    }
  } catch {}
  return null;
}

function injectToAllTabs() {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      if (tab.url && isAIPlatform(tab.url)) injectToTab(tab.id);
    });
  });
}

function injectToTab(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content/all-in-one.js']
  }).then(() => {
    console.log('[AI监控] ✅ 注入成功, tabId:', tabId);
  }).catch(err => {
    console.log('[AI监控] 注入结果:', err.message);
  });
}

// ============================================
// 消息处理
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[AI监控] 收到消息:', request.type);
  
  if (request.type === 'SAVE_MESSAGE') {
    saveMessage(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error('[AI监控] 保存失败:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.type === 'GET_STATS') {
    getTodayStats()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'GET_MESSAGES') {
    getMessages(request.date)
      .then(messages => sendResponse({ success: true, messages }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // AI总结（支持 force 强制重新生成）
  if (request.type === 'AI_SUMMARY') {
    handleAISummary(request.date, request.force)
      .then(summary => sendResponse({ success: true, summary }))
      .catch(err => {
        console.error('[AI监控] AI总结失败:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // 获取LLM配置
  if (request.type === 'GET_LLM_CONFIG') {
    loadLLMConfigFromStorage().then(() => {
      sendResponse({
        success: true,
        config: {
          provider: LLM_CONFIG.provider,
          model: getCurrentModel(),
          apiKey: getApiKey(),
          apiUrl: getApiUrl(),
          systemPrompt: LLM_CONFIG.systemPrompt,
          generation: LLM_CONFIG.generation,
          providers: LLM_CONFIG.providers
        }
      });
    });
    return true;
  }

  // 保存LLM配置
  if (request.type === 'SAVE_LLM_CONFIG') {
    saveLLMConfigToStorage(request.config).then(() => {
      if (request.config.provider) LLM_CONFIG.provider = request.config.provider;
      if (request.config.model) LLM_CONFIG.model = request.config.model;
      if (request.config.apiKey) LLM_CONFIG.apiKey = request.config.apiKey;
      if (request.config.systemPrompt) LLM_CONFIG.systemPrompt = request.config.systemPrompt;
      if (request.config.generation) Object.assign(LLM_CONFIG.generation, request.config.generation);
      sendResponse({ success: true });
    });
    return true;
  }

  // 测试API连接
  if (request.type === 'TEST_API') {
    testApiConnection(request.config || {})
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ============ 新增功能 ============

  // 手动保存消息（用户粘贴的对话）
  if (request.type === 'SAVE_MANUAL_MESSAGES') {
    saveManualMessages(request.messages)
      .then(count => sendResponse({ success: true, count }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 全文搜索（跨所有日期）
  if (request.type === 'SEARCH_MESSAGES') {
    searchMessages(request.query, request.options)
      .then(results => sendResponse({ success: true, results }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 上下文导出：跨日期查询+时间聚类
  if (request.type === 'GET_CONTEXT_MESSAGES') {
    getContextMessages(request.options)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 获取平台健康状态
  if (request.type === 'GET_PLATFORM_STATUS') {
    getPlatformStatus()
      .then(status => sendResponse({ success: true, status }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 获取/保存提醒设置
  if (request.type === 'GET_REMINDER_SETTINGS') {
    chrome.storage.local.get(['dailyReminder', 'reminderTime'], result => {
      sendResponse({
        success: true,
        settings: {
          enabled: result.dailyReminder !== false,
          time: result.reminderTime || '20:00'
        }
      });
    });
    return true;
  }

  if (request.type === 'SAVE_REMINDER_SETTINGS') {
    chrome.storage.local.set({
      dailyReminder: request.settings.enabled,
      reminderTime: request.settings.time
    }, () => {
      setupDailyReminder();
      sendResponse({ success: true });
    });
    return true;
  }

  // 内容脚本心跳
  if (request.type === 'CONTENT_SCRIPT_ALIVE') {
    sendResponse({ success: true });
    return true;
  }

  // 上下文导出：跨日期批量查询 + 按平台/时间聚类
  if (request.type === 'GET_CONTEXT_MESSAGES') {
    getContextMessages(request.options)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 处理AI总结（force=true 时跳过缓存，强制重新生成）
async function handleAISummary(date, force) {
  const messages = await getMessages(date);
  
  if (!messages || messages.length === 0) {
    throw new Error('该日期没有对话记录');
  }

  console.log('[AI监控] 开始AI总结，消息数:', messages.length, force ? '(强制重新生成)' : '');
  
  const summaryKey = `summary_${date || new Date().toISOString().split('T')[0]}`;

  if (!force) {
    const cached = await new Promise(resolve => {
      chrome.storage.local.get([summaryKey], result => resolve(result[summaryKey]));
    });
    if (cached && cached.messageCount === messages.length) {
      console.log('[AI监控] 使用缓存的总结');
      return cached.content;
    }
  }

  const summary = await callLLMAPI(messages);

  await new Promise(resolve => {
    chrome.storage.local.set({
      [summaryKey]: {
        content: summary,
        messageCount: messages.length,
        generatedAt: new Date().toISOString()
      }
    }, resolve);
  });

  return summary;
}

// ============================================
// 手动保存消息（用户粘贴的对话）
// ============================================
async function saveManualMessages(messages) {
  const today = new Date().toISOString().split('T')[0];
  const key = `messages_${today}`;

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], result => {
      const existing = result[key] || [];
      let addedCount = 0;

      messages.forEach(msg => {
        // 检查重复
        const duplicate = existing.some(e =>
          e.content === msg.content && e.role === msg.role
        );
        if (!duplicate) {
          existing.push({
            id: 'manual_' + Date.now() + '_' + addedCount,
            role: msg.role || 'user',
            content: msg.content,
            platform: msg.platform || 'manual',
            timestamp: new Date().toISOString(),
            url: '',
            wordCount: (msg.content || '').length,
            source: 'manual'
          });
          addedCount++;
        }
      });

      chrome.storage.local.set({ [key]: existing }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          console.log('[AI监控] ✅ 手动保存', addedCount, '条消息');
          resolve(addedCount);
        }
      });
    });
  });
}

// ============================================
// 全文搜索（跨所有日期）
// ============================================
async function searchMessages(query, options = {}) {
  if (!query || query.trim().length === 0) return [];

  const keywords = query.toLowerCase().trim().split(/\s+/);
  const maxResults = options.maxResults || 50;
  const platformFilter = options.platform || 'all';
  const roleFilter = options.role || 'all';

  return new Promise(resolve => {
    chrome.storage.local.get(null, items => {
      const results = [];

      // 收集所有 messages_ 开头的数据
      const dateKeys = Object.keys(items)
        .filter(k => k.startsWith('messages_'))
        .sort()
        .reverse(); // 最近的日期在前

      for (const key of dateKeys) {
        const date = key.replace('messages_', '');
        const messages = items[key] || [];

        for (const msg of messages) {
          if (results.length >= maxResults) break;

          // 平台过滤
          if (platformFilter !== 'all' && msg.platform !== platformFilter) continue;
          // 角色过滤
          if (roleFilter !== 'all' && msg.role !== roleFilter) continue;

          // 关键词匹配（所有关键词都需要命中）
          const content = (msg.content || '').toLowerCase();
          const allMatch = keywords.every(kw => content.includes(kw));

          if (allMatch) {
            results.push({
              ...msg,
              date,
              // 生成高亮摘录（找到第一个关键词附近的文本）
              excerpt: generateExcerpt(msg.content, keywords[0], 100)
            });
          }
        }
        if (results.length >= maxResults) break;
      }

      resolve(results);
    });
  });
}

/**
 * 生成搜索结果摘录，关键词附近 ±N 个字符
 */
function generateExcerpt(text, keyword, radius) {
  if (!text || !keyword) return (text || '').substring(0, 200);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return text.substring(0, 200);

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + keyword.length + radius);
  let excerpt = '';
  if (start > 0) excerpt += '...';
  excerpt += text.substring(start, end);
  if (end < text.length) excerpt += '...';
  return excerpt;
}

// ============================================
// 上下文导出：跨日期查询 + 按平台/时间聚类
// ============================================
async function getContextMessages(options = {}) {
  const { dateFrom, dateTo, platforms = [], keyword = '', sessionGapMinutes = 30 } = options;

  if (!dateFrom || !dateTo) throw new Error('请选择日期范围');

  return new Promise(resolve => {
    chrome.storage.local.get(null, items => {
      // 1. 收集日期范围内的所有消息
      let allMessages = [];
      const dateKeys = Object.keys(items)
        .filter(k => k.startsWith('messages_'))
        .sort();

      for (const key of dateKeys) {
        const date = key.replace('messages_', '');
        if (date < dateFrom || date > dateTo) continue;
        const messages = items[key] || [];
        messages.forEach(m => { m._date = date; });
        allMessages = allMessages.concat(messages);
      }

      // 2. 按平台过滤
      if (platforms.length > 0) {
        allMessages = allMessages.filter(m => platforms.includes(m.platform));
      }

      // 3. 按关键词过滤
      if (keyword.trim()) {
        const kws = keyword.toLowerCase().trim().split(/\s+/);
        allMessages = allMessages.filter(m => {
          const content = (m.content || '').toLowerCase();
          return kws.every(kw => content.includes(kw));
        });
      }

      // 4. 按时间排序
      allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // 5. 按平台分组，每个平台内按时间聚类（session gap）
      const gapMs = sessionGapMinutes * 60 * 1000;
      const platformGroups = {};

      allMessages.forEach(msg => {
        const p = msg.platform || 'unknown';
        if (!platformGroups[p]) platformGroups[p] = [];
        platformGroups[p].push(msg);
      });

      const result = {};
      for (const [platform, msgs] of Object.entries(platformGroups)) {
        const sessions = [];
        let currentSession = null;

        msgs.forEach(msg => {
          const ts = new Date(msg.timestamp).getTime();

          if (!currentSession) {
            // 新 session
            currentSession = {
              startTime: msg.timestamp,
              endTime: msg.timestamp,
              messages: [msg]
            };
          } else {
            const lastTs = new Date(currentSession.endTime).getTime();
            if (ts - lastTs > gapMs) {
              // 时间间隔超过阈值 → 结束当前 session，开始新的
              sessions.push(currentSession);
              currentSession = {
                startTime: msg.timestamp,
                endTime: msg.timestamp,
                messages: [msg]
              };
            } else {
              // 继续当前 session
              currentSession.endTime = msg.timestamp;
              currentSession.messages.push(msg);
            }
          }
        });

        if (currentSession) sessions.push(currentSession);

        // 添加 session 元数据
        result[platform] = sessions.map((s, idx) => ({
          sessionIndex: idx + 1,
          startTime: s.startTime,
          endTime: s.endTime,
          messageCount: s.messages.length,
          wordCount: s.messages.reduce((sum, m) => sum + (m.content || '').length, 0),
          messages: s.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            platform: m.platform,
            date: m._date
          }))
        }));
      }

      // 6. 汇总统计
      const totalMessages = allMessages.length;
      const totalWords = allMessages.reduce((sum, m) => sum + (m.content || '').length, 0);
      const totalSessions = Object.values(result).reduce((sum, sessions) => sum + sessions.length, 0);

      resolve({
        platforms: result,
        stats: { totalMessages, totalWords, totalSessions, dateFrom, dateTo }
      });
    });
  });
}

// ============================================
// 平台健康状态
// ============================================
async function getPlatformStatus() {
  const status = {};

  // 初始化所有平台状态
  for (const [key, info] of Object.entries(AI_PLATFORMS)) {
    status[key] = { name: info.name, active: false, tabCount: 0, tabIds: [] };
  }

  // 检查当前所有标签页
  return new Promise(resolve => {
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) {
        if (!tab.url) continue;
        const platform = getPlatformFromUrl(tab.url);
        if (platform && status[platform]) {
          status[platform].active = true;
          status[platform].tabCount++;
          status[platform].tabIds.push(tab.id);
        }
      }

      // 同时查看今天有没有该平台的消息
      const today = new Date().toISOString().split('T')[0];
      chrome.storage.local.get([`messages_${today}`], result => {
        const messages = result[`messages_${today}`] || [];
        for (const [key] of Object.entries(status)) {
          status[key].todayMessages = messages.filter(m => m.platform === key).length;
        }
        resolve(status);
      });
    });
  });
}

// ============================================
// 每日提醒通知
// ============================================
function setupDailyReminder() {
  chrome.storage.local.get(['dailyReminder', 'reminderTime'], result => {
    // 先清除已有的提醒闹钟
    chrome.alarms.clear('dailyReminder');

    if (result.dailyReminder === false) {
      console.log('[AI监控] 每日提醒已关闭');
      return;
    }

    const time = result.reminderTime || '20:00';
    const [hours, minutes] = time.split(':').map(Number);

    // 计算下一次提醒时间
    const now = new Date();
    const nextReminder = new Date();
    nextReminder.setHours(hours, minutes, 0, 0);

    // 如果今天的时间已过，设到明天
    if (nextReminder <= now) {
      nextReminder.setDate(nextReminder.getDate() + 1);
    }

    const delayMinutes = (nextReminder.getTime() - now.getTime()) / 60000;

    chrome.alarms.create('dailyReminder', {
      delayInMinutes: delayMinutes,
      periodInMinutes: 1440 // 每24小时
    });

    console.log('[AI监控] ✅ 每日提醒已设置:', time, '(约', Math.round(delayMinutes), '分钟后首次触发)');
  });
}

// 处理闹钟触发
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'dailyReminder') {
    await handleDailyReminder();
  }

  if (alarm.name === 'cleanupOldData') {
    cleanupOldData();
  }
});

async function handleDailyReminder() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const messages = await getMessages(today);
    const count = messages.length;

    if (count === 0) {
      // 没有消息就不发通知
      return;
    }

    const userCount = messages.filter(m => m.role === 'user').length;
    const aiCount = messages.filter(m => m.role === 'assistant').length;
    const platforms = [...new Set(messages.map(m => m.platform))];

    chrome.notifications.create('dailyReminder', {
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title: '📊 今日AI对话报告',
      message: `今天你与AI交流了 ${count} 条消息（${userCount} 条提问，${aiCount} 条回复），使用了 ${platforms.length} 个平台。点击查看详情和AI总结！`,
      priority: 1
    });

    console.log('[AI监控] ✅ 每日提醒通知已发送');
  } catch (e) {
    console.error('[AI监控] 发送提醒通知失败:', e);
  }
}

// 点击通知时打开侧边栏
chrome.notifications.onClicked.addListener(notificationId => {
  if (notificationId === 'dailyReminder') {
    // 打开侧边栏（需要先激活一个窗口）
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
      }
    });
    chrome.notifications.clear(notificationId);
  }
});

// ============================================
// 存储操作
// ============================================
async function saveMessage(data) {
  const today = new Date().toISOString().split('T')[0];
  const key = `messages_${today}`;

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], result => {
      const messages = result[key] || [];
      
      const exists = messages.some(msg =>
        msg.id === data.id ||
        (msg.content === data.content && msg.role === data.role &&
         Math.abs(new Date(msg.timestamp) - new Date(data.timestamp)) < 5000)
      );

      if (!exists) {
        messages.push(data);
        chrome.storage.local.set({ [key]: messages }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            console.log('[AI监控] ✅ 消息已保存，今日总数:', messages.length);
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

async function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const key = `messages_${today}`;

  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      const messages = result[key] || [];
      const stats = {
        totalMessages: messages.length,
        userMessages: messages.filter(m => m.role === 'user').length,
        aiMessages: messages.filter(m => m.role === 'assistant').length,
        platforms: {},
        totalWords: messages.reduce((sum, m) => sum + (m.wordCount || 0), 0)
      };
      messages.forEach(msg => {
        stats.platforms[msg.platform] = (stats.platforms[msg.platform] || 0) + 1;
      });
      resolve(stats);
    });
  });
}

async function getMessages(date) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const key = `messages_${targetDate}`;

  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      resolve(result[key] || []);
    });
  });
}

// ============================================
// 定期清理
// ============================================
try {
  chrome.alarms.create('cleanupOldData', { periodInMinutes: 1440 });
} catch (e) {
  console.log('[AI监控] alarms设置失败（非致命）:', e.message);
}

function cleanupOldData() {
  chrome.storage.local.get(null, items => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    Object.keys(items).forEach(key => {
      if (key.startsWith('messages_') || key.startsWith('summary_')) {
        const dateStr = key.replace('messages_', '').replace('summary_', '');
        const d = new Date(dateStr);
        if (d < cutoff) chrome.storage.local.remove(key);
      }
    });
  });
}

// 启动时加载配置 + 迁移旧版kimiApiKey
(async function initConfig() {
  await loadLLMConfigFromStorage();
  
  // 兼容旧版：如果有kimiApiKey但没有新版llmConfig，自动迁移
  const result = await new Promise(resolve => {
    chrome.storage.local.get(['kimiApiKey', 'llmConfig'], resolve);
  });
  
  if (result.kimiApiKey && (!result.llmConfig || !result.llmConfig.apiKey)) {
    console.log('[AI监控] 迁移旧版kimiApiKey到新配置');
    LLM_CONFIG.apiKey = result.kimiApiKey;
    LLM_CONFIG.provider = 'moonshot';
    await saveLLMConfigToStorage({
      provider: 'moonshot',
      apiKey: result.kimiApiKey,
      model: 'kimi-k2.5'
    });
  }
  
  console.log('[AI监控] LLM配置已加载:', getCurrentProvider().name, getCurrentModel());

  // 启动时设置每日提醒
  setupDailyReminder();
})();

console.log('[AI监控] Background Service Worker 初始化完成');
