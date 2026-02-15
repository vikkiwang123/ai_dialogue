// ============================================
// LLM 大模型配置文件
// 所有与大模型相关的配置集中在此，不要写死在代码中
// ============================================

const LLM_CONFIG = {

  // ------------------------------------------
  // 当前使用的模型供应商（切换供应商只需改这里）
  // 可选值: 'moonshot', 'openai', 'deepseek', 'zhipu', 'minimax', 'custom'
  // ------------------------------------------
  provider: 'minimax',

  // ------------------------------------------
  // 各供应商预设配置
  // ------------------------------------------
  providers: {

    moonshot: {
      name: 'Moonshot / Kimi',
      apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
      models: [
        { id: 'kimi-k2.5',        name: 'Kimi K2.5（最便宜）',  contextLength: 128000 },
        { id: 'moonshot-v1-8k',   name: 'V1 8K',               contextLength: 8000   },
        { id: 'moonshot-v1-32k',  name: 'V1 32K',              contextLength: 32000  },
        { id: 'moonshot-v1-128k', name: 'V1 128K',             contextLength: 128000 }
      ],
      defaultModel: 'kimi-k2.5'
    },

    openai: {
      name: 'OpenAI / ChatGPT',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      models: [
        { id: 'gpt-4o-mini',  name: 'GPT-4o Mini（便宜）', contextLength: 128000 },
        { id: 'gpt-4o',       name: 'GPT-4o',             contextLength: 128000 },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo',     contextLength: 16000  }
      ],
      defaultModel: 'gpt-4o-mini'
    },

    deepseek: {
      name: 'DeepSeek',
      apiUrl: 'https://api.deepseek.com/v1/chat/completions',
      models: [
        { id: 'deepseek-chat',     name: 'DeepSeek Chat',     contextLength: 64000 },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', contextLength: 64000 }
      ],
      defaultModel: 'deepseek-chat'
    },

    zhipu: {
      name: '智谱 / GLM',
      apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      models: [
        { id: 'glm-4-flash', name: 'GLM-4 Flash（免费）', contextLength: 128000 },
        { id: 'glm-4',       name: 'GLM-4',              contextLength: 128000 }
      ],
      defaultModel: 'glm-4-flash'
    },

    minimax: {
      name: 'MiniMax',
      apiUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
      models: [
        { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5', contextLength: 100000 }
      ],
      defaultModel: 'MiniMax-M2.5'
    },

    custom: {
      name: '自定义（兼容OpenAI格式）',
      apiUrl: '',
      models: [
        { id: 'custom-model', name: '自定义模型', contextLength: 8000 }
      ],
      defaultModel: 'custom-model'
    }
  },

  // ------------------------------------------
  // 当前选择的模型ID（留空则使用供应商的defaultModel）
  // ------------------------------------------
  model: '',

  // ------------------------------------------
  // API Key（通过设置页面配置，此处不要写死）
  // ------------------------------------------
  apiKey: '',

  // ------------------------------------------
  // 生成参数
  // ------------------------------------------
  generation: {
    temperature: 1.0,       // 创造性 0-1，越高越有创意
    maxTokens: 2000,        // 最大输出token数
    maxInputChars: 6000     // 输入内容最大字符数（留余量给提示词）
  },

  // ------------------------------------------
  // 系统提示词（可自定义总结风格）
  // ------------------------------------------
  systemPrompt: `你是一个学习总结助手。用户会给你一天中与各种AI助手的对话记录。
请你分析这些对话，生成一份简洁、结构化的每日学习总结。

总结要求：
1. 🎯 今日主题：列出今天讨论的主要话题（2-5个）
2. 💡 关键收获：从对话中提炼出最重要的知识点或发现（3-8条）
3. 🔧 实践要点：总结可以立即应用的技巧或方法
4. 📊 学习概况：简要统计（对话数量、涉及平台、主要领域）
5. 🚀 明日建议：基于今天的学习，给出后续学习建议

需要：中文回答、非常简洁、格式清晰，使用emoji让总结更生动。每个部分用简洁有力的语言。`
};

// ------------------------------------------
// 辅助方法：获取当前生效的完整配置
// ------------------------------------------

/**
 * 获取当前供应商配置
 */
function getCurrentProvider() {
  return LLM_CONFIG.providers[LLM_CONFIG.provider] || LLM_CONFIG.providers.moonshot;
}

/**
 * 获取当前使用的模型ID
 */
function getCurrentModel() {
  const provider = getCurrentProvider();
  return LLM_CONFIG.model || provider.defaultModel;
}

/**
 * 获取当前模型的上下文长度
 */
function getCurrentContextLength() {
  const provider = getCurrentProvider();
  const modelId = getCurrentModel();
  const modelInfo = provider.models.find(m => m.id === modelId);
  return modelInfo ? modelInfo.contextLength : 8000;
}

/**
 * 获取API URL
 */
function getApiUrl() {
  const provider = getCurrentProvider();
  return provider.apiUrl;
}

/**
 * 获取API Key
 */
function getApiKey() {
  return LLM_CONFIG.apiKey;
}

/**
 * 根据上下文长度计算最大输入字符数
 * 预留 30% 给系统提示词 + 输出
 */
function getMaxInputChars() {
  const contextLen = getCurrentContextLength();
  // 粗略按1个token≈1.5个中文字符估算
  return Math.floor(contextLen * 1.5 * 0.7);
}

/**
 * 从storage加载用户保存的LLM配置，覆盖默认值
 */
async function loadLLMConfigFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['llmConfig'], result => {
      if (result.llmConfig) {
        const saved = result.llmConfig;
        if (saved.provider) LLM_CONFIG.provider = saved.provider;
        if (saved.model) LLM_CONFIG.model = saved.model;
        if (saved.apiKey) LLM_CONFIG.apiKey = saved.apiKey;
        if (saved.apiUrl) {
          // 自定义API URL
          const provider = getCurrentProvider();
          if (provider) provider.apiUrl = saved.apiUrl;
        }
        if (saved.systemPrompt) LLM_CONFIG.systemPrompt = saved.systemPrompt;
        if (saved.generation) {
          Object.assign(LLM_CONFIG.generation, saved.generation);
        }
      }
      resolve(LLM_CONFIG);
    });
  });
}

/**
 * 保存LLM配置到storage
 */
async function saveLLMConfigToStorage(config) {
  return new Promise(resolve => {
    chrome.storage.local.set({ llmConfig: config }, resolve);
  });
}

