// 内容脚本主文件
(function() {
  'use strict';

  console.log('AI对话监控助手 - Content Script 已加载');

  // 检测当前平台
  const platform = detectPlatform();
  if (!platform) {
    console.log('当前页面不是支持的AI平台');
    return;
  }

  console.log('检测到平台:', platform);

  // 初始化平台适配器
  const adapter = getPlatformAdapter(platform);
  if (!adapter) {
    console.error('未找到平台适配器:', platform);
    return;
  }

  // 检查是否启用
  chrome.storage.local.get(['enabled'], (result) => {
    if (result.enabled !== false) {
      startMonitoring(adapter, platform);
    }
  });

  // 监听启用状态变化
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      if (changes.enabled.newValue) {
        startMonitoring(adapter, platform);
      } else {
        stopMonitoring();
      }
    }
  });

  let observer = null;
  const processedMessages = new Set(); // 用于去重

  function startMonitoring(adapter, platform) {
    if (observer) {
      return; // 已经在监控
    }

    console.log('开始监控平台:', platform);

    // 处理已存在的消息
    setTimeout(() => {
      const existingMessages = adapter.getMessages();
      existingMessages.forEach(msg => processMessage(msg, adapter, platform));
    }, 2000);

    // 监听DOM变化
    observer = new MutationObserver((mutations) => {
      const newMessages = adapter.getNewMessages(mutations);
      newMessages.forEach(msg => processMessage(msg, adapter, platform));
    });

    // 开始观察
    const targetNode = adapter.getContainer();
    if (targetNode) {
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  function stopMonitoring() {
    if (observer) {
      observer.disconnect();
      observer = null;
      console.log('停止监控');
    }
  }

  function processMessage(messageElement, adapter, platform) {
    if (!messageElement) {
      console.log('[监控] processMessage: messageElement为空');
      return;
    }

    const messageId = adapter.getMessageId(messageElement);
    if (!messageId) {
      console.log('[监控] processMessage: 无法获取messageId');
      return;
    }
    
    if (processedMessages.has(messageId)) {
      console.log('[监控] processMessage: 消息已处理过，跳过:', messageId);
      return; // 已处理过
    }

    processedMessages.add(messageId);
    console.log('[监控] 开始处理新消息，ID:', messageId);

    // 提取消息数据
    const messageData = adapter.extractMessage(messageElement);
    if (!messageData) {
      console.log('[监控] processMessage: 无法提取消息数据');
      return;
    }
    
    if (!messageData.content || messageData.content.length < 10) {
      console.log('[监控] processMessage: 消息内容太短或为空');
      return;
    }

    // 添加元数据
    messageData.id = messageId;
    messageData.platform = platform;
    messageData.timestamp = new Date().toISOString();
    messageData.url = window.location.href;
    messageData.wordCount = messageData.content.split(/\s+/).length;

    console.log('[监控] 准备保存消息:', {
      role: messageData.role,
      platform: messageData.platform,
      contentLength: messageData.content.length,
      preview: messageData.content.substring(0, 50)
    });

    // 发送到background保存
    chrome.runtime.sendMessage({
      type: 'SAVE_MESSAGE',
      data: messageData
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[监控] 发送消息失败:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        console.log('✅ [监控] 消息已保存:', messageData.role, messageData.content.substring(0, 50));
      } else {
        console.error('[监控] 保存消息失败:', response);
      }
    });
  }

  // 检测平台
  function detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
      return 'chatgpt';
    } else if (hostname.includes('claude.ai') || hostname.includes('console.anthropic.com')) {
      return 'claude';
    } else if (hostname.includes('copilot.microsoft.com')) {
      return 'copilot';
    } else if (hostname.includes('gemini.google.com')) {
      return 'gemini';
    }
    
    return null;
  }

  // 获取平台适配器
  function getPlatformAdapter(platform) {
    switch (platform) {
      case 'chatgpt':
        return new ChatGPTAdapter();
      case 'claude':
        return new ClaudeAdapter();
      case 'copilot':
        return new CopilotAdapter();
      case 'gemini':
        return new GeminiAdapter();
      default:
        return null;
    }
  }
})();

