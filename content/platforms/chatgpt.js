// ChatGPT平台适配器
class ChatGPTAdapter {
  constructor() {
    this.messageCache = new Map();
  }

  getContainer() {
    // ChatGPT的消息容器
    return document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  }

  getMessages() {
    // 获取所有已存在的消息 - 使用多种选择器
    let messageElements = document.querySelectorAll('[data-message-author-role]');
    
    // 如果没找到，尝试其他选择器
    if (messageElements.length === 0) {
      // 尝试查找包含消息的div
      const allDivs = document.querySelectorAll('div[class*="group"], div[class*="message"]');
      const candidates = [];
      allDivs.forEach(div => {
        // 检查是否有data-message-author-role属性（可能在父元素）
        const parent = div.closest('[data-message-author-role]');
        if (parent) {
          candidates.push(parent);
        }
        // 或者检查是否有明显的消息内容
        const text = div.textContent || '';
        if (text.length > 20 && text.length < 50000) {
          // 检查是否包含用户或AI的标识
          const hasRole = div.getAttribute('data-message-author-role') || 
                         div.querySelector('[data-message-author-role]');
          if (hasRole) {
            candidates.push(hasRole.closest ? hasRole.closest('[data-message-author-role]') || hasRole : hasRole);
          }
        }
      });
      messageElements = candidates.length > 0 ? candidates : messageElements;
    }
    
    console.log('[ChatGPT适配器] 找到', messageElements.length, '条消息');
    return Array.from(messageElements);
  }

  getNewMessages(mutations) {
    const newMessages = [];
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // 检查节点本身是否是消息元素
          if (node.matches && node.matches('[data-message-author-role]')) {
            const id = this.getMessageId(node);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(node);
              console.log('[ChatGPT适配器] 检测到新消息节点:', node.getAttribute('data-message-author-role'));
            }
          }
          
          // 检查最近的父元素是否是消息元素
          const messageElement = node.closest ? node.closest('[data-message-author-role]') : null;
          if (messageElement) {
            const id = this.getMessageId(messageElement);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(messageElement);
              console.log('[ChatGPT适配器] 检测到新消息（父元素）:', messageElement.getAttribute('data-message-author-role'));
            }
          }
          
          // 检查子节点中是否有新消息
          const childMessages = node.querySelectorAll ? node.querySelectorAll('[data-message-author-role]') : [];
          childMessages.forEach(msg => {
            const id = this.getMessageId(msg);
            if (id && !this.messageCache.has(id)) {
              this.messageCache.set(id, true);
              newMessages.push(msg);
              console.log('[ChatGPT适配器] 检测到新消息（子元素）:', msg.getAttribute('data-message-author-role'));
            }
          });
        }
      });
    });

    return newMessages;
  }

  getMessageId(element) {
    if (!element) return null;
    
    // 尝试多种方式获取唯一ID
    const id = element.getAttribute('data-message-id') ||
               element.getAttribute('id') ||
               element.getAttribute('data-id') ||
               (element.textContent ? this.hashCode(element.textContent) : null);
    
    return id ? `chatgpt_${id}` : null;
  }

  extractMessage(element) {
    if (!element) {
      console.log('[ChatGPT适配器] extractMessage: element为空');
      return null;
    }

    try {
      // 获取角色
      const roleAttr = element.getAttribute('data-message-author-role');
      const role = roleAttr === 'user' ? 'user' : 'assistant';
      console.log('[ChatGPT适配器] 提取消息，角色:', role);

      // 获取消息内容 - 尝试多种方法
      let content = '';
      
      // 方法1: ChatGPT的内容通常在markdown容器中
      const contentSelectors = [
        '.markdown',
        '[class*="markdown"]',
        '.prose',
        '[class*="prose"]',
        '[class*="message-content"]',
        '[class*="text-base"]'
      ];
      
      for (const selector of contentSelectors) {
        const contentElement = element.querySelector(selector);
        if (contentElement) {
          content = contentElement.innerText || contentElement.textContent || '';
          if (content.trim().length > 10) {
            console.log('[ChatGPT适配器] 使用选择器找到内容:', selector, '长度:', content.length);
            break;
          }
        }
      }
      
      // 方法2: 如果没找到，尝试查找所有文本节点
      if (!content || content.trim().length < 10) {
        const textNodes = [];
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              // 跳过script和style标签
              const parent = node.parentElement;
              if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          },
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
        console.log('[ChatGPT适配器] 使用TreeWalker找到内容，长度:', content.length);
      }
      
      // 方法3: 最后的备用方案
      if (!content || content.trim().length < 10) {
        content = element.innerText || element.textContent || '';
        console.log('[ChatGPT适配器] 使用innerText/textContent，长度:', content.length);
      }

      // 清理内容
      content = content.trim();
      
      // 移除可能的UI元素文本（如按钮文本）
      content = content.replace(/^(Regenerate|Copy|Like|Dislike|Continue|Stop generating)/gi, '').trim();
      
      if (!content || content.length < 10) {
        console.log('[ChatGPT适配器] 内容太短，跳过:', content.length);
        return null;
      }

      console.log('[ChatGPT适配器] 成功提取消息，角色:', role, '长度:', content.length, '预览:', content.substring(0, 50));

      // 获取时间戳（如果有）
      const timeElement = element.querySelector('time');
      let timestamp = new Date().toISOString();
      if (timeElement && timeElement.getAttribute('datetime')) {
        timestamp = timeElement.getAttribute('datetime');
      }

      return {
        role: role,
        content: content,
        timestamp: timestamp,
        hasCode: content.includes('```') || element.querySelector('code') !== null,
        conversationId: this.getConversationId()
      };
    } catch (error) {
      console.error('[ChatGPT适配器] 提取消息失败:', error);
      return null;
    }
  }

  getConversationId() {
    // 尝试从URL获取对话ID
    const urlMatch = window.location.pathname.match(/\/c\/([a-f0-9-]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    // 或者使用页面标题
    return document.title || 'unknown';
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
  }
}

