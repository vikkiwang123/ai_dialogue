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
    // 注意: Gemini 用 Angular Material，对话区在 mat-sidenav-content 内
    //   mat-sidenav   = 侧边栏本身（要排除）
    //   mat-sidenav-content = 主内容区（不能排除！）
    // 所以不能用 [class*="sidenav"]，会误杀主内容区

    const sidebar = el.closest(
      'nav, aside, [role="navigation"], [role="complementary"], ' +
      '[class*="sidebar"], [class*="side-nav"], ' +
      '[class*="history-panel"], [class*="nav-panel"], ' +
      '[class*="menu-panel"], [class*="conversation-list"], ' +
      'mat-sidenav, mat-drawer'
    );
    if (!sidebar) return false;

    // 如果匹配到的是 mat-sidenav-content（主内容区），不算侧边栏
    const tag = (sidebar.tagName || '').toLowerCase();
    if (tag === 'mat-sidenav-content') return false;

    // 如果匹配到的容器的类名包含 "content"（如 sidenav-content, drawer-content），不算侧边栏
    const cls = (sidebar.getAttribute('class') || '').toLowerCase();
    if (cls.includes('content') && (cls.includes('sidenav') || cls.includes('drawer'))) return false;

    return true;
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
  // Gemini 适配器（修复角色识别 + 侧边栏过滤）
  // ============================================
  class GeminiAdapter {
    constructor() {
      this.messageCache = new Map();
      this._strategyUsed = '';
      console.log('[AI监控] Gemini适配器已初始化');
      // 首次加载时探测 DOM 结构
      setTimeout(() => this._logDomStructure(), 2000);
    }

    /** 开发辅助：打印 Gemini 页面的 DOM 结构，帮助识别可用选择器 */
    _logDomStructure() {
      const root = document.querySelector('mat-sidenav-content') ||
                   document.querySelector('main') ||
                   document.body;
      console.log('[AI监控] Gemini DOM探测 root:', root.tagName, root.className?.toString().substring(0, 60));

      // 打印 root 内元素的标签和类名采样
      const children = Array.from(root.querySelectorAll('*')).slice(0, 80);
      const tags = new Set();
      children.forEach(el => {
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/).filter(c => c.length > 2).slice(0, 3).join('.') : '';
        tags.add(cls ? `${tag}.${cls}` : tag);
      });
      console.log('[AI监控] Gemini DOM 标签采样:', Array.from(tags).slice(0, 40).join(', '));

      // 检测页面顶层容器结构
      const topTags = Array.from(document.body.children).map(el =>
        `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''}`
      );
      console.log('[AI监控] Gemini body直接子元素:', topTags.join(', '));

      // 特别检测已知可能的选择器
      const probes = [
        'user-query', 'model-response', 'message-content',
        'mat-sidenav-content', 'mat-sidenav', 'mat-sidenav-container',
        '[class*="conversation-turn"]', '[class*="turn"]',
        '[class*="query"]', '[class*="response"]',
        '[class*="message"]', '[data-message-id]', '[data-message]',
        'article', '.chat-turn', '.prompt-container',
        'main', '[role="main"]'
      ];
      probes.forEach(sel => {
        try {
          const count = document.querySelectorAll(sel).length;
          if (count > 0) console.log(`[AI监控] Gemini 选择器 "${sel}": ${count} 个`);
        } catch(e) {}
      });
    }

    getContainer() {
      // Gemini 用 Angular Material: mat-sidenav-content 是主内容区
      // 优先定位这个容器，避免监控侧边栏
      const candidates = [
        'mat-sidenav-content',       // Angular Material 主内容区
        '[class*="main-content"]',
        'main',
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) {
          console.log('[AI监控] Gemini容器:', sel);
          return el;
        }
      }
      console.log('[AI监控] Gemini容器: document.body (fallback)');
      return document.body;
    }

    getMessages() {
      const found = [];
      const seen = new Set();
      // Gemini 可能没有 <main>，对话区在 mat-sidenav-content 内
      const contentRoot = document.querySelector('mat-sidenav-content') ||
                          document.querySelector('main') ||
                          document.body;

      // 辅助: 在指定范围内收集匹配元素
      const collect = (root, selector, minLen) => {
        if (!root) return 0;
        let count = 0;
        root.querySelectorAll(selector).forEach(el => {
          if (!seen.has(el) && !isInSidebar(el) && (el.textContent || '').trim().length >= minLen) {
            seen.add(el);
            found.push(el);
            count++;
          }
        });
        return count;
      };

      console.log('[AI监控] Gemini getMessages contentRoot:', contentRoot.tagName);

      // === 策略1: Gemini Web Components ===
      collect(document, 'user-query, model-response', 5);
      if (found.length > 0) {
        this._strategyUsed = 'WebComponent';
        console.log('[AI监控] Gemini(策略1-WebComponent)找到', found.length, '条消息');
        return found;
      }

      // === 策略2: 会话轮次 / 查询+响应容器 ===
      collect(contentRoot, '.conversation-turn, [class*="turn-content"], [class*="query-content"], [class*="response-content"], [class*="query-text"], [class*="model-response"]', 10);
      if (found.length > 0) {
        this._strategyUsed = 'TurnContainer';
        console.log('[AI监控] Gemini(策略2-TurnContainer)找到', found.length, '条消息');
        return found;
      }

      // === 策略3: message-content / data属性 ===
      collect(contentRoot, 'message-content, [class*="message-content"], [data-message-id], [data-message]', 10);
      if (found.length > 0) {
        this._strategyUsed = 'MessageContent';
        console.log('[AI监控] Gemini(策略3-MessageContent)找到', found.length, '条消息');
        return found;
      }

      // === 策略4: 宽泛回退 — [class*="message"] + article（对话容器内 + 排除侧边栏） ===
      // 这是旧版可用的选择器，加上 isInSidebar 过滤来避免侧边栏项
      collect(contentRoot, '[class*="message"], [class*="conversation-turn"], article', 20);
      if (found.length > 0) {
        this._strategyUsed = 'BroadFallback';
        console.log('[AI监控] Gemini(策略4-BroadFallback)找到', found.length, '条消息');
        return found;
      }

      // === 策略5: 最宽泛 — 对话容器内所有有实质内容的大文本块 ===
      if (contentRoot) {
        // 查找容器内文本长度 > 50 的叶节点容器
        contentRoot.querySelectorAll('div, p, section').forEach(el => {
          if (seen.has(el) || isInSidebar(el)) return;
          const text = (el.innerText || '').trim();
          // 要求足够长的文本，且不是顶层容器（避免抓整个页面）
          if (text.length > 50 && text.length < 50000 && el.children.length < 20) {
            // 检查没有被更高层的已收集元素包含
            let dominated = false;
            for (const existing of found) {
              if (existing.contains(el) || el.contains(existing)) { dominated = true; break; }
            }
            if (!dominated) {
              seen.add(el);
              found.push(el);
            }
          }
        });
      }
      this._strategyUsed = 'DeepFallback';
      console.log('[AI监控] Gemini(策略5-DeepFallback)找到', found.length, '条消息');
      return found;
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (isInSidebar(node)) return;

          let msg = null;

          // 按优先级检测
          const selectors = [
            'user-query', 'model-response',
            'message-content', '[class*="message-content"]',
            '.conversation-turn', '[class*="turn-content"]',
            '[data-message-id]', '[data-message]',
            '[class*="query-text"]', '[class*="model-response"]',
            '[class*="message"]', 'article'
          ];

          // 先检查节点自身
          for (const sel of selectors) {
            try {
              if (node.matches && node.matches(sel)) { msg = node; break; }
            } catch(e) {}
          }

          // 再检查子节点
          if (!msg && node.querySelector) {
            for (const sel of selectors) {
              try {
                const child = node.querySelector(sel);
                if (child && !isInSidebar(child)) { msg = child; break; }
              } catch(e) {}
            }
          }

          // 如果都没匹配上，但节点本身有大量文本，也当作消息
          if (!msg && !isInSidebar(node)) {
            const text = (node.innerText || '').trim();
            if (text.length > 50 && text.length < 50000 && node.children.length < 20) {
              msg = node;
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
      try {
        const userAncestor = el.closest(
          'user-query, [class*="user-query"], [class*="query-content"], ' +
          '[class*="query-text"], [class*="user-turn"], [class*="user-message"], ' +
          '[data-author-role="user"]'
        );
        if (userAncestor) return 'user';

        const modelAncestor = el.closest(
          'model-response, [class*="model-response"], [class*="response-content"], ' +
          '[class*="model-turn"], [class*="bot-message"], [data-author-role="model"]'
        );
        if (modelAncestor) return 'assistant';
      } catch(e) {}

      // --- 策略3: 元素自身及所有祖先的属性关键字 ---
      // 遍历自身和最近5层祖先
      let current = el;
      for (let depth = 0; depth < 6 && current; depth++) {
        const allAttrs = (
          (current.getAttribute && current.getAttribute('class') || '') + ' ' +
          (current.getAttribute && current.getAttribute('data-role') || '') + ' ' +
          (current.getAttribute && current.getAttribute('data-author-role') || '') + ' ' +
          (current.tagName || '')
        ).toLowerCase();

        if (allAttrs.includes('user') || allAttrs.includes('human') ||
            allAttrs.includes('query') || allAttrs.includes('prompt')) {
          return 'user';
        }
        if (allAttrs.includes('model-response') || allAttrs.includes('bot-message') ||
            allAttrs.includes('model-turn')) {
          return 'assistant';
        }
        current = current.parentElement;
      }

      // --- 策略4: 检测前一个兄弟元素 ---
      const prev = el.previousElementSibling;
      if (prev) {
        const prevClass = (prev.getAttribute('class') || '').toLowerCase();
        if (prevClass.includes('user') || prevClass.includes('query')) {
          return 'user';
        }
      }

      // --- 策略5: Gemini图标/头像检测 ---
      const hasGeminiIcon = el.querySelector(
        '[class*="gemini-icon"], [class*="model-icon"], [class*="sparkle"], ' +
        'img[src*="gemini"], img[src*="bard"]'
      );
      if (hasGeminiIcon) return 'assistant';

      // --- 策略6: 对于宽泛回退匹配的元素，用 DOM 位置推测 ---
      // Gemini 页面中对话交替排列，奇数位置可能是用户，偶数可能是AI
      // 但这不太可靠，仅作参考log
      console.log('[AI监控] Gemini角色检测: 无法确定，默认assistant。元素:', el.tagName, el.className?.toString().substring(0, 80));

      return 'assistant';
    }

    extractMessage(el) {
      if (!el) return null;
      if (isInSidebar(el)) return null;
      try {
        const role = this._detectRole(el);

        const content = (el.innerText || el.textContent || '').trim();
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
