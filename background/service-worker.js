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
    platforms: { chatgpt: true, claude: true, copilot: true, gemini: true },
    autoSummary: true,
    retentionDays: 30
  });

  injectToAllTabs();
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
    return ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'console.anthropic.com', 'copilot.microsoft.com', 'gemini.google.com']
      .some(d => hostname.includes(d));
  } catch { return false; }
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
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'cleanupOldData') {
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
  });
} catch (e) {
  console.log('[AI监控] alarms设置失败（非致命）:', e.message);
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
})();

console.log('[AI监控] Background Service Worker 初始化完成');
