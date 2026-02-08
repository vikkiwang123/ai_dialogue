// Claude平台适配器
class ClaudeAdapter {
  constructor() {
    this.messageCache = new Map();
  }

  getContainer() {
    return document.querySelector('main') || document.querySelector('[class*="chat"]') || document.body;
  }

  getMessages() {
    // Claude的消息选择器
    const selectors = [
      '[class*="Message"]',
      '[class*="message"]',
      '[data-role]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return Array.from(elements).filter(el => {
          const text = el.textContent || '';
          return text.trim().length > 0;
        });
      }
    }
    
    return [];
  }

  getNewMessages(mutations) {
    const newMessages = [];
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Claude的消息通常有特定的class
          const messageElement = node.closest ? 
            (node.closest('[class*="Message"]') || node.closest('[class*="message"]')) : null;
          
          if (messageElement) {
            const id = this.getMessageId(messageElement);
            if (id && !this.messageCache.has(id)) {
              newMessages.push(messageElement);
            }
          }
          
          // 检查子节点
          const childMessages = node.querySelectorAll ? 
            node.querySelectorAll('[class*="Message"], [class*="message"]') : [];
          childMessages.forEach(msg => {
            const id = this.getMessageId(msg);
            if (id && !this.messageCache.has(id)) {
              newMessages.push(msg);
            }
          });
        }
      });
    });

    return newMessages;
  }

  getMessageId(element) {
    if (!element) return null;
    
    const id = element.getAttribute('id') ||
               element.getAttribute('data-id') ||
               (element.textContent ? this.hashCode(element.textContent.substring(0, 100)) : null);
    
    return id ? `claude_${id}` : null;
  }

  extractMessage(element) {
    if (!element) return null;

    try {
      // 判断角色 - Claude通常通过class或data属性标识
      let role = 'assistant';
      const roleAttr = element.getAttribute('data-role') || 
                      element.getAttribute('class') || '';
      
      if (roleAttr.includes('user') || roleAttr.includes('User')) {
        role = 'user';
      } else if (roleAttr.includes('assistant') || roleAttr.includes('Assistant')) {
        role = 'assistant';
      } else {
        // 尝试通过位置判断（用户消息通常在底部）
        const parent = element.parentElement;
        if (parent && (parent.classList.contains('user') || parent.textContent.includes('You'))) {
          role = 'user';
        }
      }

      // 获取内容
      let content = element.innerText || element.textContent || '';
      content = content.trim();
      
      if (!content) return null;

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
    const urlMatch = window.location.pathname.match(/\/([a-f0-9-]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    return document.title || 'unknown';
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


