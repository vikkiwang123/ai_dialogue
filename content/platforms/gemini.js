// Google Gemini平台适配器
class GeminiAdapter {
  constructor() {
    this.messageCache = new Map();
  }

  getContainer() {
    return document.querySelector('main') || document.querySelector('[role="log"]') || document.body;
  }

  getMessages() {
    // Gemini的多种可能选择器
    const selectors = [
      '[data-message]',
      '[class*="message"]',
      '[class*="Message"]',
      '[class*="conversation-turn"]',
      '[class*="model-response"]',
      '[class*="user-message"]',
      'div[role="listitem"]',
      'article',
      '[data-testid*="message"]',
      '[data-testid*="Message"]'
    ];
    
    const foundMessages = [];
    const seen = new Set();
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = el.textContent || el.innerText || '';
        // 过滤掉太短或空的元素
        if (text.trim().length > 10 && !seen.has(el)) {
          seen.add(el);
          foundMessages.push(el);
        }
      });
    }
    
    // 如果找到消息，返回
    if (foundMessages.length > 0) {
      return foundMessages;
    }
    
    // 备用方案：查找包含对话内容的div
    const allDivs = document.querySelectorAll('div');
    const candidates = [];
    allDivs.forEach(div => {
      const text = div.textContent || '';
      // 查找包含较多文本的div（可能是消息）
      if (text.length > 50 && text.length < 10000) {
        const children = div.children.length;
        // 如果子元素不多，可能是消息容器
        if (children < 10) {
          candidates.push(div);
        }
      }
    });
    
    return candidates.slice(0, 20); // 最多返回20个候选
  }

  getNewMessages(mutations) {
    const newMessages = [];
    const selectors = [
      '[data-message]',
      '[class*="message"]',
      '[class*="Message"]',
      '[class*="conversation-turn"]',
      'div[role="listitem"]',
      'article'
    ];
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // 检查节点本身
          let messageElement = null;
          for (const selector of selectors) {
            if (node.matches && node.matches(selector)) {
              messageElement = node;
              break;
            }
            if (node.closest) {
              messageElement = node.closest(selector);
              if (messageElement) break;
            }
          }
          
          // 如果没找到，检查是否有足够的文本内容
          if (!messageElement) {
            const text = node.textContent || node.innerText || '';
            if (text.length > 50 && text.length < 10000) {
              messageElement = node;
            }
          }
          
          if (messageElement) {
            const id = this.getMessageId(messageElement);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(messageElement);
            }
          }
        }
      });
    });

    return newMessages;
  }

  getMessageId(element) {
    if (!element) return null;
    
    const id = element.getAttribute('id') ||
               element.getAttribute('data-message') ||
               (element.textContent ? this.hashCode(element.textContent.substring(0, 100)) : null);
    
    return id ? `gemini_${id}` : null;
  }

  extractMessage(element) {
    if (!element) return null;

    try {
      let role = 'assistant';
      const classAttr = element.getAttribute('class') || '';
      const dataRole = element.getAttribute('data-role');
      const ariaLabel = element.getAttribute('aria-label') || '';
      
      // 更全面的角色检测
      const roleIndicators = {
        user: ['user', 'User', 'human', 'Human', 'you', 'You', 'prompt'],
        assistant: ['assistant', 'Assistant', 'model', 'Model', 'ai', 'AI', 'gemini', 'Gemini', 'response']
      };
      
      const allText = (classAttr + ' ' + dataRole + ' ' + ariaLabel).toLowerCase();
      if (roleIndicators.user.some(indicator => allText.includes(indicator))) {
        role = 'user';
      } else if (roleIndicators.assistant.some(indicator => allText.includes(indicator))) {
        role = 'assistant';
      } else {
        // 尝试通过位置判断（用户消息通常在底部或右侧）
        const parent = element.parentElement;
        if (parent) {
          const parentClass = parent.getAttribute('class') || '';
          if (parentClass.toLowerCase().includes('user')) {
            role = 'user';
          }
        }
      }

      // 提取内容，优先使用innerText
      let content = element.innerText || element.textContent || '';
      
      // 如果内容为空，尝试查找子元素
      if (!content || content.trim().length < 10) {
        const textNodes = [];
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text.length > 0) {
            textNodes.push(text);
          }
        }
        content = textNodes.join(' ');
      }
      
      content = content.trim();
      
      // 过滤掉太短的内容
      if (!content || content.length < 10) {
        return null;
      }
      
      // 过滤掉明显不是消息的内容（如导航、按钮等）
      const skipPatterns = ['menu', 'button', 'nav', 'header', 'footer', 'sidebar'];
      const elementTag = element.tagName.toLowerCase();
      if (skipPatterns.some(pattern => classAttr.toLowerCase().includes(pattern) || 
                                      elementTag === pattern)) {
        return null;
      }

      return {
        role: role,
        content: content,
        timestamp: new Date().toISOString(),
        hasCode: content.includes('```') || element.querySelector('code, pre') !== null,
        conversationId: this.getConversationId()
      };
    } catch (error) {
      console.error('提取消息失败:', error);
      return null;
    }
  }

  getConversationId() {
    return window.location.pathname || 'unknown';
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }
}

