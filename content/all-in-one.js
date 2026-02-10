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

  /**
   * 消息防抖：同一个 DOM 元素在流式输出期间内容不断变化，
   * 用防抖确保只在内容稳定后才发送一次。
   */
  const pendingMessages = new Map(); // elementId → { timer, el }
  const DEBOUNCE_MS = 2000; // 2秒无变化才认为输出完成

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
  // DeepSeek 适配器
  // ============================================
  class DeepSeekAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] DeepSeek适配器已初始化');
    }

    getContainer() {
      return document.querySelector('#chat-container, [class*="chat-container"], main, [class*="conversation"]') || document.body;
    }

    getMessages() {
      const selectors = [
        // DeepSeek 常见消息选择器
        '[class*="chat-message"], [class*="message-item"]',
        '[data-role], [data-message-role]',
        '.ds-chat-message, .chat-message',
        // 更宽泛的回退
        '[class*="user-message"], [class*="assistant-message"], [class*="bot-message"]',
      ];

      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        const filtered = Array.from(els).filter(el =>
          !isInSidebar(el) && (el.textContent || '').trim().length > 5
        );
        if (filtered.length > 0) {
          console.log('[AI监控] DeepSeek找到', filtered.length, '条消息 (选择器:', sel, ')');
          return filtered;
        }
      }

      // 最终回退: 查找 main 内有实质内容的 div 块
      const main = document.querySelector('main') || document.body;
      const blocks = [];
      main.querySelectorAll('div').forEach(el => {
        if (isInSidebar(el)) return;
        const text = (el.innerText || '').trim();
        if (text.length > 20 && text.length < 50000 && el.children.length < 15) {
          // 避免嵌套重复
          let dominated = false;
          for (const existing of blocks) {
            if (existing.contains(el) || el.contains(existing)) { dominated = true; break; }
          }
          if (!dominated) blocks.push(el);
        }
      });
      console.log('[AI监控] DeepSeek(回退)找到', blocks.length, '个文本块');
      return blocks;
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (isInSidebar(node)) return;

          const selectors = [
            '[class*="chat-message"]', '[class*="message-item"]',
            '[data-role]', '[data-message-role]',
            '.ds-chat-message', '.chat-message'
          ];

          let msg = null;
          for (const sel of selectors) {
            try {
              if (node.matches && node.matches(sel)) { msg = node; break; }
              if (node.querySelector) {
                const child = node.querySelector(sel);
                if (child && !isInSidebar(child)) { msg = child; break; }
              }
            } catch(e) {}
          }

          if (!msg && (node.innerText || '').trim().length > 20) msg = node;

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
      const id = el.getAttribute('data-message-id') || el.getAttribute('id') || hashCode(el.textContent || '');
      return id ? 'deepseek_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        const attrs = (
          (el.getAttribute('class') || '') + ' ' +
          (el.getAttribute('data-role') || '') + ' ' +
          (el.getAttribute('data-message-role') || '')
        ).toLowerCase();

        if (attrs.includes('user') || attrs.includes('human') || attrs.includes('query')) {
          role = 'user';
        }

        // 往上查找父级角色标记
        if (role === 'assistant') {
          let parent = el;
          for (let i = 0; i < 5 && parent; i++) {
            const pAttrs = ((parent.getAttribute('class') || '') + ' ' + (parent.getAttribute('data-role') || '')).toLowerCase();
            if (pAttrs.includes('user') || pAttrs.includes('human')) { role = 'user'; break; }
            parent = parent.parentElement;
          }
        }

        const content = (el.innerText || el.textContent || '').trim();
        if (!content || content.length < 3) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname
        };
      } catch (e) {
        console.error('[AI监控] DeepSeek提取失败:', e);
        return null;
      }
    }
  }

  // ============================================
  // Perplexity 适配器
  // ============================================
  class PerplexityAdapter {
    constructor() {
      this.messageCache = new Map();
      console.log('[AI监控] Perplexity适配器已初始化');
    }

    getContainer() {
      return document.querySelector('main, [class*="thread"], [class*="conversation"]') || document.body;
    }

    getMessages() {
      const selectors = [
        // Perplexity 已知选择器
        '[class*="prose"], [class*="answer-text"]',
        '[class*="query-text"], [class*="user-query"]',
        // 通用消息容器
        '[data-testid*="message"], [data-testid*="answer"], [data-testid*="query"]',
        '[class*="Message"], [class*="message-content"]',
      ];

      const main = document.querySelector('main') || document.body;
      for (const sel of selectors) {
        const els = main.querySelectorAll(sel);
        const filtered = Array.from(els).filter(el =>
          !isInSidebar(el) && (el.textContent || '').trim().length > 10
        );
        if (filtered.length > 0) {
          console.log('[AI监控] Perplexity找到', filtered.length, '条消息 (选择器:', sel, ')');
          return filtered;
        }
      }

      // 回退: thread 内的文本块
      const blocks = [];
      main.querySelectorAll('div, article, section').forEach(el => {
        if (isInSidebar(el)) return;
        const text = (el.innerText || '').trim();
        if (text.length > 30 && text.length < 50000 && el.children.length < 20) {
          let dominated = false;
          for (const existing of blocks) {
            if (existing.contains(el) || el.contains(existing)) { dominated = true; break; }
          }
          if (!dominated) blocks.push(el);
        }
      });
      console.log('[AI监控] Perplexity(回退)找到', blocks.length, '个文本块');
      return blocks;
    }

    getNewMessages(mutations) {
      const newMessages = [];
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (isInSidebar(node)) return;

          const selectors = [
            '[class*="prose"]', '[class*="answer-text"]',
            '[class*="query-text"]', '[class*="user-query"]',
            '[data-testid*="message"]', '[data-testid*="answer"]',
          ];

          let msg = null;
          for (const sel of selectors) {
            try {
              if (node.matches && node.matches(sel)) { msg = node; break; }
              if (node.querySelector) {
                const child = node.querySelector(sel);
                if (child && !isInSidebar(child)) { msg = child; break; }
              }
            } catch(e) {}
          }

          if (!msg && (node.innerText || '').trim().length > 30) msg = node;

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
      const id = el.getAttribute('data-testid') || el.getAttribute('id') || hashCode(el.textContent || '');
      return id ? 'perplexity_' + id : null;
    }

    extractMessage(el) {
      if (!el) return null;
      try {
        let role = 'assistant';
        const attrs = (
          (el.getAttribute('class') || '') + ' ' +
          (el.getAttribute('data-testid') || '')
        ).toLowerCase();

        // Perplexity: prose 通常是 AI 回复，query 是用户输入
        if (attrs.includes('query') || attrs.includes('user') || attrs.includes('question')) {
          role = 'user';
        }

        // 也检查父级
        if (role === 'assistant') {
          let parent = el;
          for (let i = 0; i < 5 && parent; i++) {
            const pClass = (parent.getAttribute('class') || '').toLowerCase();
            if (pClass.includes('query') || pClass.includes('user') || pClass.includes('question')) {
              role = 'user'; break;
            }
            parent = parent.parentElement;
          }
        }

        const content = (el.innerText || el.textContent || '').trim();
        if (!content || content.length < 5) return null;

        return {
          role, content,
          timestamp: new Date().toISOString(),
          hasCode: content.includes('```') || !!el.querySelector('code, pre'),
          conversationId: window.location.pathname
        };
      } catch (e) {
        console.error('[AI监控] Perplexity提取失败:', e);
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
    if (h.includes('chat.deepseek.com')) return 'deepseek';
    if (h.includes('perplexity.ai')) return 'perplexity';
    return null;
  }

  // 获取适配器
  function getAdapter(platform) {
    switch (platform) {
      case 'chatgpt':    return new ChatGPTAdapter();
      case 'claude':     return new ClaudeAdapter();
      case 'copilot':    return new CopilotAdapter();
      case 'gemini':     return new GeminiAdapter();
      case 'deepseek':   return new DeepSeekAdapter();
      case 'perplexity': return new PerplexityAdapter();
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

    // MutationObserver — 只监听结构变化（不监听characterData，改用轮询防抖）
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
      observer.observe(container, { childList: true, subtree: true });
      console.log('[AI监控] ✅ MutationObserver已启动');
    } else {
      console.error('[AI监控] ❌ 未找到监控容器');
    }

    // 定时重扫：捕获流式输出的最终状态（每5秒扫一次，防抖会合并）
    setInterval(() => {
      try {
        const allMsgs = adapter.getMessages();
        allMsgs.forEach(msg => processMessage(msg));
      } catch (e) { /* 静默 */ }
    }, 5000);
  }

  function processMessage(el) {
    if (!el) return;

    // 跳过侧边栏元素
    if (isInSidebar(el)) return;

    const id = adapter.getMessageId(el);
    if (!id) return;

    const data = adapter.extractMessage(el);
    if (!data || !data.content || data.content.length < 2) return;

    // 防抖：同一个元素的内容可能在流式输出中不断增长
    // 每次检测到变化就重置计时器，直到内容稳定2秒后才真正发送
    if (pendingMessages.has(id)) {
      clearTimeout(pendingMessages.get(id).timer);
    }

    const timer = setTimeout(() => {
      pendingMessages.delete(id);
      sendFinalMessage(el, id);
    }, DEBOUNCE_MS);

    pendingMessages.set(id, { timer, el, lastContent: data.content });
  }

  /** 防抖结束后：提取最终内容并发送 */
  function sendFinalMessage(el, id) {
    const data = adapter.extractMessage(el);
    if (!data || !data.content || data.content.length < 2) return;

    // 内容级去重 + 前缀检测
    const contentKey = normalizeForDedup(data.content);

    // 检查是否已有完全相同的内容
    if (contentHashes.has(contentKey)) {
      return;
    }

    // 检查是否已有的某条内容是当前内容的前缀（流式残留）
    // 移除旧的短版本 hash
    for (const existingKey of contentHashes) {
      if (contentKey.startsWith(existingKey) || existingKey.startsWith(contentKey)) {
        // 新内容是旧内容的超集 或 子集，去掉旧的
        contentHashes.delete(existingKey);
        break;
      }
    }
    contentHashes.add(contentKey);

    data.id = id;
    data.platform = platform;
    data.timestamp = new Date().toISOString();
    data.url = window.location.href;
    data.wordCount = data.content.length;

    console.log('[AI监控] 保存消息:', data.role, `(${data.content.length}字)`, data.content.substring(0, 60));

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
