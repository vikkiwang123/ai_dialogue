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
  // 通用工具函数
  // ============================================

  /** 检测元素是否在侧边栏/导航区域内（排除非对话内容） */
  function isInSidebar(el) {
    return !!el.closest(
      'nav, aside, [role="navigation"], [role="complementary"], ' +
      '[class*="sidebar"], [class*="side-nav"], [class*="sidenav"], ' +
      '[class*="drawer"], [class*="history-panel"], [class*="nav-panel"], ' +
      '[class*="menu-panel"], [class*="conversation-list"], ' +
      'mat-sidenav, mat-drawer'
    );
  }

  /** 通用哈希函数 */
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length && i < 300; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }

  /** 归一化文本用于内容级去重 */
  function normalizeForDedup(text) {
    return (text || '').trim().replace(/\s+/g, ' ').substring(0, 200);
  }

  // ============================================
  // ChatGPT 适配器
  // ============================================
  class ChatGPTAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] ChatGPT适配器已初始化');
    }

    getContainer() {
      // ChatGPT: main 标签包含对话区域，sidebar 在 nav 中
      return document.querySelector('main') || document.body;
    }

    getMessages() {
      // [data-message-author-role] 是非常精确的选择器，不会匹配侧边栏
      const elements = document.querySelectorAll('[data-message-author-role]');
      const filtered = Array.from(elements).filter(el => !isInSidebar(el));
      console.log('[AI监控] ChatGPT找到', filtered.length, '条消息');
      return filtered;
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;

          // 检查节点本身
          if (node.matches && node.matches('[data-message-author-role]')) {
            if (!isInSidebar(node)) {
              const id = this.getMessageId(node);
              if (id && !this.messageCache.has(id)) {
                this.messageCache.set(id, true);
                newMessages.push(node);
              }
            }
          }

          // 检查子节点
          if (node.querySelectorAll) {
            node.querySelectorAll('[data-message-author-role]').forEach(msg => {
              if (isInSidebar(msg)) return;
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
      const id = el.getAttribute('data-message-id') || el.getAttribute('id') || hashCode(el.textContent || '');
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
      // Claude 使用 [data-is-streaming] 或 div with specific roles
      // 先尝试精确选择器
      const precise = document.querySelectorAll('[data-is-streaming], .font-claude-message, .font-user-message');
      if (precise.length > 0) {
        return Array.from(precise).filter(el => !isInSidebar(el) && (el.textContent || '').trim().length > 0);
      }

      // 回退: 查找 main 内的消息容器
      const main = document.querySelector('main');
      if (!main) return [];

      const selectors = ['[data-role]', '[class*="Message"]'];
      for (const sel of selectors) {
        const els = main.querySelectorAll(sel);
        const filtered = Array.from(els).filter(el => !isInSidebar(el) && (el.textContent || '').trim().length > 0);
        if (filtered.length > 0) return filtered;
      }
      return [];
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (isInSidebar(node)) return;

          const msg = node.closest ? (node.closest('[data-role]') || node.closest('[class*="Message"]')) : null;
          if (msg && !isInSidebar(msg)) {
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
      const id = el.getAttribute('id') || el.getAttribute('data-id') || hashCode(el.textContent || '');
      return id ? 'claude_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        const attr = (
          (el.getAttribute('data-role') || '') + ' ' +
          (el.getAttribute('class') || '')
        ).toLowerCase();
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
      // Copilot: 只监控主对话区域
      return document.querySelector('[class*="chat-container"], [class*="conversation"], main') || document.body;
    }

    getMessages() {
      // 只在 main/对话容器内查找，排除侧边栏
      const container = document.querySelector('main') || document.body;
      const selectors = ['[class*="user-message"], [class*="bot-message"]', 'cib-message-group', '[role="listitem"]'];
      for (const sel of selectors) {
        const els = container.querySelectorAll(sel);
        const filtered = Array.from(els).filter(el => !isInSidebar(el) && (el.textContent || '').trim().length > 5);
        if (filtered.length > 0) return filtered;
      }
      return [];
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (isInSidebar(node)) return;

          const msg = node.closest ? (node.closest('[class*="user-message"], [class*="bot-message"]') || node.closest('[role="listitem"]')) : null;
          if (msg && !isInSidebar(msg)) {
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
      const id = el.getAttribute('id') || hashCode(el.textContent || '');
      return id ? 'copilot_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        const cls = (el.getAttribute('class') || '').toLowerCase();
        const tag = (el.tagName || '').toLowerCase();
        if (cls.includes('user') || tag.includes('user')) role = 'user';

        const content = (el.innerText || el.textContent || '').trim();
        if (!content || content.length < 5) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname
        };
      } catch (e) { return null; }
    }
  }

  // ============================================
  // Gemini 适配器（重写 - 修复角色识别和侧边栏误录问题）
  // ============================================
  class GeminiAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] Gemini适配器已初始化');
    }

    getContainer() {
      // Gemini: 精准定位对话区域，避免监控侧边栏
      // Gemini 使用 Angular / Web Components, 对话区在 main 内
      const candidates = [
        'div[class*="conversation-container"]',
        'div[class*="chat-history"]',
        'div[class*="response-container-content"]',
        'main'
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return document.querySelector('main') || document.body;
    }

    getMessages() {
      const found = [];
      const seen = new Set();

      // === 策略1: Gemini Web Components（最精确） ===
      // Gemini 使用 <user-query> 和 <model-response> 自定义元素
      document.querySelectorAll('user-query, model-response').forEach(el => {
        if (!seen.has(el) && !isInSidebar(el) && (el.textContent || '').trim().length > 5) {
          seen.add(el);
          found.push(el);
        }
      });
      if (found.length > 0) {
        console.log('[AI监控] Gemini(策略1-WebComponent)找到', found.length, '条消息');
        return found;
      }

      // === 策略2: 会话轮次容器 ===
      document.querySelectorAll('.conversation-turn, [class*="turn-content"], [class*="query-content"], [class*="response-content"]').forEach(el => {
        if (!seen.has(el) && !isInSidebar(el) && (el.textContent || '').trim().length > 10) {
          seen.add(el);
          found.push(el);
        }
      });
      if (found.length > 0) {
        console.log('[AI监控] Gemini(策略2-TurnContainer)找到', found.length, '条消息');
        return found;
      }

      // === 策略3: 从 main 内查找 message-content ===
      const main = document.querySelector('main');
      if (main) {
        main.querySelectorAll('message-content, [class*="message-content"], [data-message-id]').forEach(el => {
          if (!seen.has(el) && !isInSidebar(el) && (el.textContent || '').trim().length > 10) {
            seen.add(el);
            found.push(el);
          }
        });
      }
      if (found.length > 0) {
        console.log('[AI监控] Gemini(策略3-MessageContent)找到', found.length, '条消息');
        return found;
      }

      // === 策略4: 最后回退 - 仅在 main 内用较宽泛选择器 ===
      if (main) {
        main.querySelectorAll('[data-message], article').forEach(el => {
          if (!seen.has(el) && !isInSidebar(el) && (el.textContent || '').trim().length > 20) {
            seen.add(el);
            found.push(el);
          }
        });
      }
      console.log('[AI监控] Gemini(策略4-Fallback)找到', found.length, '条消息');
      return found;
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (isInSidebar(node)) return;

          // 按优先级检测消息元素
          let msg = null;
          const selectorPriority = [
            'user-query', 'model-response',
            'message-content', '[class*="message-content"]',
            '.conversation-turn', '[class*="turn-content"]',
            '[data-message-id]', '[data-message]'
          ];

          for (const sel of selectorPriority) {
            if (node.matches && node.matches(sel)) { msg = node; break; }
            if (node.querySelector) {
              const child = node.querySelector(sel);
              if (child) { msg = child; break; }
            }
          }

          if (msg && !isInSidebar(msg)) {
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
      const id = el.getAttribute('data-message-id') ||
                 el.getAttribute('id') ||
                 el.getAttribute('data-message') ||
                 hashCode(el.textContent || '');
      return id ? 'gemini_' + id : null;
    }

    /** 判断消息角色 - 多策略 */
    _detectRole(el) {
      // --- 策略1: Web Component 标签名 ---
      const tagName = (el.tagName || '').toLowerCase();
      if (tagName === 'user-query') return 'user';
      if (tagName === 'model-response') return 'assistant';

      // --- 策略2: 祖先元素的标签名/类名 ---
      const userAncestor = el.closest(
        'user-query, [class*="user-query"], [class*="query-content"], ' +
        '[class*="user-turn"], [class*="user-message"], [data-author-role="user"]'
      );
      if (userAncestor) return 'user';

      const modelAncestor = el.closest(
        'model-response, [class*="model-response"], [class*="response-content"], ' +
        '[class*="model-turn"], [class*="bot-message"], [data-author-role="model"]'
      );
      if (modelAncestor) return 'assistant';

      // --- 策略3: 元素自身属性 ---
      const allAttrs = (
        (el.getAttribute('class') || '') + ' ' +
        (el.getAttribute('data-role') || '') + ' ' +
        (el.getAttribute('data-author-role') || '') + ' ' +
        (el.getAttribute('data-content-type') || '')
      ).toLowerCase();

      if (allAttrs.includes('user') || allAttrs.includes('human') ||
          allAttrs.includes('query') || allAttrs.includes('prompt')) {
        return 'user';
      }
      if (allAttrs.includes('model') || allAttrs.includes('assistant') ||
          allAttrs.includes('response') || allAttrs.includes('bot')) {
        return 'assistant';
      }

      // --- 策略4: 检测前一个兄弟元素是否有用户标识图标 ---
      const prev = el.previousElementSibling;
      if (prev) {
        const prevText = (prev.textContent || '').trim().toLowerCase();
        const prevClass = (prev.getAttribute('class') || '').toLowerCase();
        if (prevText.length < 30 && (prevClass.includes('user') || prevClass.includes('query'))) {
          return 'user';
        }
      }

      // --- 策略5: 检测是否包含 Gemini 头像/标识 ---
      // model 回复通常包含 Gemini 星号图标
      const hasGeminiIcon = el.querySelector('[class*="gemini-icon"], [class*="model-icon"], [class*="sparkle"]');
      if (hasGeminiIcon) return 'assistant';

      // 默认为 assistant（Gemini 回复通常更长）
      return 'assistant';
    }

    extractMessage(el) {
      if (!el) return null;
      if (isInSidebar(el)) return null;
      try {
        const role = this._detectRole(el);

        const content = (el.innerText || el.textContent || '').trim();
        // 过滤掉太短的内容（避免捕获按钮文字、标题等）
        if (!content || content.length < 5) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname
        };
      } catch (e) {
        console.error('[AI监控] Gemini提取失败:', e);
        return null;
      }
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
  const processedMessages = new Set();   // 元素 ID 级去重
  const contentHashes = new Set();       // 内容级去重（防止重复记录）

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

    // 跳过侧边栏元素
    if (isInSidebar(el)) return;

    const id = adapter.getMessageId(el);
    if (!id || processedMessages.has(id)) return;
    processedMessages.add(id);

    const data = adapter.extractMessage(el);
    if (!data || !data.content || data.content.length < 2) return;

    // 内容级去重：防止同一段文本被反复记录
    const contentKey = normalizeForDedup(data.content);
    if (contentHashes.has(contentKey)) {
      console.log('[AI监控] 跳过重复内容:', data.content.substring(0, 40));
      return;
    }
    contentHashes.add(contentKey);

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
