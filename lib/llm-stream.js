// ============================================
// LLM Streaming API 工具
// 供 UI 页面（sidepanel / options / popup）直接调用
// 通过 SSE (Server-Sent Events) 实现流式输出
// ============================================

const LLMStream = {

  /**
   * 从 background 获取完整 LLM 配置
   */
  async getConfig() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_LLM_CONFIG' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          resolve(response.config);
        } else {
          reject(new Error(response?.error || '获取配置失败'));
        }
      });
    });
  },

  /**
   * 从 background 获取指定日期的消息
   */
  async getMessages(date) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_MESSAGES', date }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          resolve(response.messages || []);
        } else {
          reject(new Error(response?.error || '获取消息失败'));
        }
      });
    });
  },

  /**
   * 检查总结缓存
   */
  async checkCache(date, messageCount) {
    const summaryKey = `summary_${date}`;
    return new Promise(resolve => {
      chrome.storage.local.get([summaryKey], result => {
        const cached = result[summaryKey];
        if (cached && cached.messageCount === messageCount) {
          resolve(cached.content);
        } else {
          resolve(null);
        }
      });
    });
  },

  /**
   * 保存总结到缓存
   */
  async saveCache(date, content, messageCount) {
    const summaryKey = `summary_${date}`;
    return new Promise(resolve => {
      chrome.storage.local.set({
        [summaryKey]: {
          content,
          messageCount,
          generatedAt: new Date().toISOString()
        }
      }, resolve);
    });
  },

  /**
   * 构建对话文本用于提示词
   */
  buildPromptText(messages, maxChars) {
    const text = messages.map(msg => {
      const role = msg.role === 'user' ? '用户' : 'AI';
      const platform = msg.platform || '未知平台';
      const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN');
      return `[${time} - ${platform}] ${role}: ${msg.content.substring(0, 500)}`;
    }).join('\n\n');

    return text.length > maxChars
      ? text.substring(0, maxChars) + '\n\n...(内容已截断)'
      : text;
  },

  /**
   * 流式生成 AI 总结
   *
   * @param {Object}   opts
   * @param {string}   opts.date     - 目标日期 (YYYY-MM-DD)
   * @param {boolean}  opts.force    - 是否强制重新生成（忽略缓存）
   * @param {Function} opts.onChunk  - 每收到一段文本时回调 (fullText, delta)
   * @param {Function} opts.onDone   - 完成时回调 (fullText, fromCache)
   * @param {Function} opts.onError  - 出错时回调 (error)
   */
  async streamSummary({ date, force = false, onChunk, onDone, onError }) {
    try {
      // 1. 获取配置
      const config = await this.getConfig();

      if (!config.apiKey) {
        throw new Error('未设置API Key，请在设置页面配置');
      }

      // 2. 获取消息
      const targetDate = date || new Date().toISOString().split('T')[0];
      const messages = await this.getMessages(targetDate);

      if (!messages || messages.length === 0) {
        throw new Error('该日期没有对话记录');
      }

      // 3. 检查缓存
      if (!force) {
        const cached = await this.checkCache(targetDate, messages.length);
        if (cached) {
          if (onDone) onDone(cached, true);
          return;
        }
      }

      // 4. 计算最大输入字符数
      const provider = config.providers?.[config.provider];
      const modelInfo = provider?.models?.find(m => m.id === config.model);
      const contextLen = modelInfo?.contextLength || 8000;
      const maxChars = Math.floor(contextLen * 1.5 * 0.7);

      // 5. 构建请求
      const promptText = this.buildPromptText(messages, maxChars);

      const requestBody = {
        model: config.model,
        messages: [
          { role: 'system', content: config.systemPrompt },
          {
            role: 'user',
            content: `以下是我今天与AI的对话记录，请帮我生成学习总结：\n\n${promptText}`
          }
        ],
        temperature: config.generation?.temperature || 0.7,
        max_tokens: config.generation?.maxTokens || 2000,
        stream: true
      };

      // 6. 发起流式请求
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errBody = await response.text();
        if (response.status === 401) throw new Error('API Key无效，请检查设置');
        if (response.status === 429) throw new Error('API调用频率过高，请稍后再试');
        throw new Error(`API调用失败 (${response.status}): ${errBody}`);
      }

      // 7. 逐块读取流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按行切分，处理完整行
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 不完整的行保留在 buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(fullText, delta);
            }
          } catch (e) {
            // 跳过不完整的 JSON
          }
        }
      }

      // 处理 buffer 中剩余内容
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:') && !trimmed.includes('[DONE]')) {
          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(fullText, delta);
            }
          } catch (e) {}
        }
      }

      // 8. 保存到缓存
      if (fullText) {
        await this.saveCache(targetDate, fullText, messages.length);
      }

      // 9. 完成回调
      if (onDone) onDone(fullText, false);

    } catch (error) {
      console.error('[AI监控] 流式生成失败:', error);
      if (onError) onError(error);
    }
  }
};


