// ============================================
// AI对话监控助手 - 合并内容脚本
// 所有平台适配器 + 主监控逻辑 合并在一个文件中
// ============================================

(function() {
  'use strict';

  // 防止重复注入
  if (window.__AI_DIALOGUE_MONITOR_LOADED__) {
    console.log('[AI监控] 已加载，跳过重复注入');
    return;
  }
  window.__AI_DIALOGUE_MONITOR_LOADED__ = true;

  console.log('[AI监控] 内容脚本已加载');
  console.log('[AI监控] 当前URL:', window.location.href);

  // ============================================
  // ChatGPT 适配器
  // ============================================
  class ChatGPTAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] ChatGPT适配器已初始化');
    }

    getContainer() {
      return document.querySelector('main') || document.body;
    }

    getMessages() {
      const elements = document.querySelectorAll('[data-message-author-role]');
      console.log('[AI监控] ChatGPT找到', elements.length, '条消息');
      return Array.from(elements);
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          
          // 检查节点本身
          if (node.matches && node.matches('[data-message-author-role]')) {
            const id = this.getMessageId(node);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(node);
            }
          }
          
          // 检查子节点
          if (node.querySelectorAll) {
            node.querySelectorAll('[data-message-author-role]').forEach(msg => {
              const id = this.getMessageId(msg);
              if (id && !this.messageCache.has(id)) {
                this.messageCache.set(id, true);
                newMessages.push(msg);
              }
            });
          }
        });
      });
      return newMessages;
    }

    getMessageId(el) {
      if (!el) return null;
      const id = el.getAttribute('data-message-id') || el.getAttribute('id') || this.hashCode(el.textContent || '');
      return id ? 'chatgpt_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
        
        let content = '';
        const md = el.querySelector('.markdown, .prose, [class*="markdown"]');
        if (md) {
          content = md.innerText || md.textContent || '';
        }
        if (!content || content.trim().length < 2) {
          content = el.innerText || el.textContent || '';
        }
        content = content.trim();
        if (!content) return null;

        return {
          role: role,
          content: content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code'),
          conversationId: window.location.pathname.match(/\/c\/([a-f0-9-]+)/)?.[1] || document.title
        };
      } catch (e) {
        console.error('[AI监控] ChatGPT提取失败:', e);
        return null;
      }
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length && i < 200; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash).toString();
    }
  }

  // ============================================
  // Claude 适配器
  // ============================================
  class ClaudeAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] Claude适配器已初始化');
    }

    getContainer() {
      return document.querySelector('main') || document.body;
    }

    getMessages() {
      const selectors = ['[class*="Message"]', '[class*="message"]', '[data-role]'];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return Array.from(els).filter(e => (e.textContent || '').trim().length > 0);
      }
      return [];
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const msg = node.closest ? (node.closest('[class*="Message"]') || node.closest('[data-role]')) : null;
          if (msg) {
            const id = this.getMessageId(msg);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(msg);
            }
          }
        });
      });
      return newMessages;
    }

    getMessageId(el) {
      if (!el) return null;
      const id = el.getAttribute('id') || el.getAttribute('data-id') || this.hashCode(el.textContent || '');
      return id ? 'claude_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        const attr = (el.getAttribute('data-role') || el.getAttribute('class') || '').toLowerCase();
        if (attr.includes('user') || attr.includes('human')) role = 'user';

        const content = (el.innerText || el.textContent || '').trim();
        if (!content) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname.match(/\/([a-f0-9-]+)/)?.[1] || document.title
        };
      } catch (e) {
        console.error('[AI监控] Claude提取失败:', e);
        return null;
      }
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length && i < 200; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash).toString();
    }
  }

  // ============================================
  // Copilot 适配器
  // ============================================
  class CopilotAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] Copilot适配器已初始化');
    }

    getContainer() {
      return document.querySelector('main') || document.body;
    }

    getMessages() {
      const selectors = ['[class*="message"]', '[role="listitem"]'];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return Array.from(els);
      }
      return [];
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const msg = node.closest ? (node.closest('[class*="message"]') || node.closest('[role="listitem"]')) : null;
          if (msg) {
            const id = this.getMessageId(msg);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(msg);
            }
          }
        });
      });
      return newMessages;
    }

    getMessageId(el) {
      if (!el) return null;
      const id = el.getAttribute('id') || this.hashCode(el.textContent || '');
      return id ? 'copilot_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        if ((el.getAttribute('class') || '').toLowerCase().includes('user')) role = 'user';

        const content = (el.innerText || el.textContent || '').trim();
        if (!content) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname
        };
      } catch (e) { return null; }
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length && i < 200; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash).toString();
    }
  }

  // ============================================
  // Gemini 适配器
  // ============================================
  class GeminiAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] Gemini适配器已初始化');
    }

    getContainer() {
      return document.querySelector('main') || document.body;
    }

    getMessages() {
      const selectors = ['[data-message]', '[class*="message"]', '[class*="conversation-turn"]', 'article'];
      const found = [];
      const seen = new Set();
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          if (!seen.has(el) && (el.textContent || '').trim().length > 10) {
            seen.add(el);
            found.push(el);
          }
        });
      }
      return found;
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const selectors = ['[data-message]', '[class*="message"]', 'article'];
          let msg = null;
          for (const sel of selectors) {
            if (node.matches && node.matches(sel)) { msg = node; break; }
            if (node.closest) { msg = node.closest(sel); if (msg) break; }
          }
          if (msg) {
            const id = this.getMessageId(msg);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(msg);
            }
          }
        });
      });
      return newMessages;
    }

    getMessageId(el) {
      if (!el) return null;
      const id = el.getAttribute('id') || el.getAttribute('data-message') || this.hashCode(el.textContent || '');
      return id ? 'gemini_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        const attrs = ((el.getAttribute('class') || '') + ' ' + (el.getAttribute('data-role') || '')).toLowerCase();
        if (attrs.includes('user') || attrs.includes('human') || attrs.includes('prompt')) role = 'user';

        const content = (el.innerText || el.textContent || '').trim();
        if (!content || content.length < 10) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname
        };
      } catch (e) { return null; }
    }

    hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length && i < 200; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash).toString();
    }
  }

  // ============================================
  // 主监控逻辑
  // ============================================

  // 检测平台
  function detectPlatform() {
    const h = window.location.hostname;
    if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
    if (h.includes('claude.ai') || h.includes('console.anthropic.com')) return 'claude';
    if (h.includes('copilot.microsoft.com')) return 'copilot';
    if (h.includes('gemini.google.com')) return 'gemini';
    return null;
  }

  // 获取适配器
  function getAdapter(platform) {
    switch (platform) {
      case 'chatgpt': return new ChatGPTAdapter();
      case 'claude':  return new ClaudeAdapter();
      case 'copilot': return new CopilotAdapter();
      case 'gemini':  return new GeminiAdapter();
      default: return null;
    }
  }

  const platform = detectPlatform();
  if (!platform) {
    console.log('[AI监控] 当前页面不是支持的AI平台');
    return;
  }
  console.log('[AI监控] 检测到平台:', platform);

  const adapter = getAdapter(platform);
  if (!adapter) {
    console.error('[AI监控] 无法创建适配器:', platform);
    return;
  }

  let observer = null;
  const processedMessages = new Set();

  function startMonitoring() {
    if (observer) return;
    console.log('[AI监控] 开始监控...');

    // 处理已存在的消息
    setTimeout(() => {
      try {
        const existing = adapter.getMessages();
        console.log('[AI监控] 处理已存在的', existing.length, '条消息');
        existing.forEach(msg => processMessage(msg));
      } catch (e) {
        console.error('[AI监控] 处理已有消息失败:', e);
      }
    }, 3000);

    // MutationObserver
    observer = new MutationObserver(mutations => {
      try {
        const newMsgs = adapter.getNewMessages(mutations);
        if (newMsgs.length > 0) {
          console.log('[AI监控] 检测到', newMsgs.length, '条新消息');
          newMsgs.forEach(msg => processMessage(msg));
        }
      } catch (e) {
        console.error('[AI监控] 处理新消息失败:', e);
      }
    });

    const container = adapter.getContainer();
    console.log('[AI监控] 监控容器:', container ? container.tagName : 'null');
    if (container) {
      observer.observe(container, { childList: true, subtree: true, characterData: true });
      console.log('[AI监控] ✅ MutationObserver已启动');
    } else {
      console.error('[AI监控] ❌ 未找到监控容器');
    }
  }

  function processMessage(el) {
    if (!el) return;

    const id = adapter.getMessageId(el);
    if (!id || processedMessages.has(id)) return;
    processedMessages.add(id);

    const data = adapter.extractMessage(el);
    if (!data || !data.content || data.content.length < 2) return;

    data.id = id;
    data.platform = platform;
    data.timestamp = new Date().toISOString();
    data.url = window.location.href;
    data.wordCount = data.content.length; // 中文按字符数

    console.log('[AI监控] 保存消息:', data.role, data.content.substring(0, 60));

    try {
      chrome.runtime.sendMessage({
        type: 'SAVE_MESSAGE',
        data: data
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('[AI监控] 发送失败:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          console.log('[AI监控] ✅ 已保存');
        } else {
          console.error('[AI监控] ❌ 保存失败:', response);
        }
      });
    } catch (e) {
      console.error('[AI监控] 发送异常:', e);
    }
  }

  // 检查启用状态并开始监控
  try {
    chrome.storage.local.get(['enabled'], result => {
      if (chrome.runtime.lastError) {
        console.error('[AI监控] 读取设置失败:', chrome.runtime.lastError.message);
        // 即使读取失败也开始监控
        startMonitoring();
        return;
      }
      if (result.enabled !== false) {
        startMonitoring();
      } else {
        console.log('[AI监控] 监控已禁用');
      }
    });
  } catch (e) {
    console.error('[AI监控] 初始化异常，直接开始监控:', e);
    startMonitoring();
  }

  // 监听启用/禁用
  try {
    chrome.storage.onChanged.addListener(changes => {
      if (changes.enabled) {
        if (changes.enabled.newValue) {
          startMonitoring();
        } else if (observer) {
          observer.disconnect();
          observer = null;
          console.log('[AI监控] 已停止监控');
        }
      }
    });
  } catch (e) {
    // 忽略
  }

  console.log('[AI监控] ✅ 内容脚本初始化完成');

})();


