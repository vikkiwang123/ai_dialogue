# Chrome Web Store 上架清单

## 上架步骤

### 1. 注册开发者账号
- 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- 需要一次性支付 $5 注册费
- 使用 Google 账号登录

### 2. 打包扩展
在扩展管理页面 (`chrome://extensions/`)：
1. 开启开发者模式
2. 点击「打包扩展程序」
3. 选择 `ai_dialogue` 文件夹
4. 生成 `.crx` 和 `.pem` 文件
5. 或者直接将项目文件夹打成 `.zip`（不包含 `.git` 等）

**打 zip 包命令**：
```bash
# 在项目父目录执行
cd D:\creations\projects
powershell Compress-Archive -Path ai_dialogue\* -DestinationPath ai_dialogue_v1.4.0.zip -Force
```

### 3. 填写商店信息

#### 扩展名称
```
AI对话监控助手 - AI Dialogue Monitor
```

#### 简短描述 (132字符内)
```
Auto-track AI conversations across ChatGPT, Claude, Gemini, DeepSeek & more. Search history, get daily AI summaries, stay organized.
```

#### 详细描述
```
🤖 AI对话监控助手 — Your AI Conversation Companion

Automatically monitor and record your conversations across 6 major AI platforms. Never lose a valuable AI interaction again.

✨ KEY FEATURES:
• 🔍 Auto-capture conversations from ChatGPT, Claude, Copilot, Gemini, DeepSeek, Perplexity
• 🔎 Full-text search across all your AI conversations with keyword highlighting
• 🧠 AI-powered daily summaries via Kimi/OpenAI/DeepSeek API (bring your own key)
• ⚡ Streaming output for real-time summary generation
• 📌 Side panel stays pinned to your browser (like Copilot)
• 📋 Manual paste fallback when auto-capture doesn't work
• 📡 Platform health dashboard showing real-time status
• 🔔 Daily learning reminders with customizable time
• 💾 100% local storage — your data never leaves your browser
• 📤 Export data as JSON for backup
• ⚙️ Fully configurable — choose your LLM provider, model, and prompts

🔒 PRIVACY FIRST:
All conversation data is stored locally in your browser. The only external API call happens when YOU click "Generate Summary" — and you use your own API key.

🎯 PERFECT FOR:
• Developers who use multiple AI tools daily
• Students learning from AI conversations
• Researchers tracking AI-assisted work
• Anyone who wants to remember what they learned from AI

📊 SUPPORTED PLATFORMS:
ChatGPT | Claude | Microsoft Copilot | Google Gemini | DeepSeek | Perplexity

🤖 SUPPORTED LLM PROVIDERS (for summaries):
Moonshot/Kimi | OpenAI | DeepSeek | Custom (any OpenAI-compatible API)
```

#### 分类
- **类别**: Productivity
- **语言**: Chinese (Simplified), English

### 4. 截图要求
需要至少 1-5 张截图：
- **尺寸**: 1280 x 800 或 640 x 400
- **建议截图**:
  1. 侧边栏概览页（显示统计和平台状态）
  2. 搜索页面（显示搜索结果和高亮）·
  3. AI 总结页面（显示流式输出效果）
  4. 消息列表页面（显示对话记录）
  5. 设置页面（显示 LLM 配置）

### 5. 图标要求
- ✅ 已有: 16x16, 48x48, 128x128 (在 assets/icons/)
- 商店需要额外的 **440x280 宣传图** (可选)

### 6. 隐私政策
- ✅ 已创建: `PRIVACY_POLICY.md`
- 上架时填入 GitHub 上的 raw 链接:
  `https://github.com/vikkiwang123/ai_dialogue/blob/main/PRIVACY_POLICY.md`

### 7. 提交审核
- 填写完所有信息后，点击「提交审核」
- 通常 1-3 个工作日内审核完成
- 审核通过后自动上架

## 注意事项
- 确保 `manifest.json` 中的权限都有合理的用途说明
- `host_permissions` 需要在隐私政策中解释
- 避免使用过于宽泛的权限
- 确保扩展图标清晰可辨

