// Microsoft Copilot平台适配器
class CopilotAdapter {
  constructor() {
    this.messageCache = new Map();
  }

  getContainer() {
    return document.querySelector('main') || document.querySelector('[role="log"]') || document.body;
  }

  getMessages() {
    const selectors = [
      '[class*="message"]',
      '[class*="Message"]',
      '[role="listitem"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return Array.from(elements);
      }
    }
    
    return [];
  }

  getNewMessages(mutations) {
    const newMessages = [];
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const messageElement = node.closest ? 
            (node.closest('[class*="message"]') || node.closest('[role="listitem"]')) : null;
          
          if (messageElement) {
            const id = this.getMessageId(messageElement);
            if (id && !this.messageCache.has(id)) {
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
               element.getAttribute('data-id') ||
               (element.textContent ? this.hashCode(element.textContent.substring(0, 100)) : null);
    
    return id ? `copilot_${id}` : null;
  }

  extractMessage(element) {
    if (!element) return null;

    try {
      let role = 'assistant';
      const classAttr = element.getAttribute('class') || '';
      
      if (classAttr.includes('user') || classAttr.includes('User')) {
        role = 'user';
      }

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


