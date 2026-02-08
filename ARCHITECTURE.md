# AI对话监控浏览器插件 - 架构设计

## 项目概述
一个浏览器插件，用于自动监控和记录用户与AI的对话，并生成每日收获总结。

## 核心功能模块

### 1. 内容监控模块 (Content Monitor)
**功能**：实时监控网页上的对话内容

**实现思路**：
- 使用 `MutationObserver` 监听DOM变化，检测新消息的出现
- 识别常见AI对话平台的DOM结构（ChatGPT, Claude, Copilot, 文心一言等）
- 通过CSS选择器或文本模式匹配识别消息容器
- 区分用户消息和AI回复（通过DOM结构、class名称、角色标识等）

**技术要点**：
```javascript
// 示例：监听DOM变化
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    // 检测新增的消息节点
    mutation.addedNodes.forEach((node) => {
      if (isMessageNode(node)) {
        processMessage(node);
      }
    });
  });
});
```

### 2. AI平台识别模块 (Platform Detector)
**功能**：识别不同的AI对话平台

**支持的平台**：
- ChatGPT (chat.openai.com)
- Claude (claude.ai, console.anthropic.com)
- Microsoft Copilot (copilot.microsoft.com)
- Google Gemini (gemini.google.com)
- 文心一言、通义千问等国内平台
- 其他自定义平台（通过配置）

**实现方式**：
- 通过 `window.location.hostname` 识别当前网站
- 为每个平台定义特定的选择器和解析规则
- 可配置的平台规则系统

### 3. 消息提取模块 (Message Extractor)
**功能**：从DOM中提取结构化的消息数据

**提取的信息**：
- 消息时间戳
- 发送者（用户/AI）
- 消息内容（文本、代码块、图片等）
- 对话上下文（所属对话/会话）
- 平台标识

**数据结构**：
```javascript
{
  id: "unique-id",
  timestamp: Date,
  platform: "chatgpt",
  role: "user" | "assistant",
  content: string,
  conversationId: string,
  metadata: {
    hasCode: boolean,
    hasImage: boolean,
    wordCount: number
  }
}
```

### 4. 数据存储模块 (Storage Manager)
**功能**：存储和管理对话数据

**存储方案**：
- 使用 `chrome.storage.local` 或 `browser.storage.local` (WebExtension标准)
- 按日期组织数据
- 实现数据压缩（如果数据量大）
- 提供数据导出功能（JSON/CSV）

**数据结构**：
```javascript
{
  "2024-01-15": {
    conversations: [...],
    summary: {...},
    stats: {
      totalMessages: number,
      aiMessages: number,
      userMessages: number,
      totalWords: number
    }
  }
}
```

### 5. 收获总结模块 (Summary Generator)
**功能**：自动生成每日收获总结

**总结方式**：
- **关键词提取**：从AI回复中提取关键概念、知识点
- **主题聚类**：将相关对话归类
- **要点总结**：生成结构化总结
- **可选AI增强**：使用本地LLM或API生成更智能的总结

**总结格式**：
```javascript
{
  date: "2024-01-15",
  topics: [
    {
      title: "JavaScript异步编程",
      conversations: [...],
      keyPoints: [...],
      learnings: [...]
    }
  ],
  highlights: [...],
  statistics: {...}
}
```

### 6. 用户界面模块 (UI Components)
**功能**：提供插件界面

**界面组件**：
- **Popup界面**：点击插件图标显示的快速视图
  - 今日统计
  - 最近对话预览
  - 快速生成总结按钮
  
- **Options页面**：设置页面
  - 平台配置
  - 监控开关
  - 数据管理
  - 导出功能

- **Dashboard页面**：完整的数据视图
  - 日历视图
  - 对话历史
  - 收获总结
  - 搜索和筛选

### 7. 后台服务模块 (Background Service)
**功能**：后台运行的服务

**服务内容**：
- 定期清理旧数据（可配置保留天数）
- 数据同步（如果支持多设备）
- 定时生成总结
- 通知提醒（可选）

## 技术栈建议

### 前端
- **框架**：原生JavaScript 或 Vue/React（轻量级）
- **UI库**：Tailwind CSS 或 原生CSS
- **状态管理**：简单的状态管理或使用框架自带

### 浏览器API
- `chrome.storage` / `browser.storage` - 数据存储
- `chrome.tabs` - 标签页管理
- `chrome.runtime` - 消息传递
- `chrome.action` - 插件图标和popup
- `chrome.scripting` - 内容脚本注入

### 可选增强
- **本地LLM**：使用WebLLM等库进行本地总结生成
- **向量数据库**：使用IndexedDB存储向量，实现语义搜索
- **导出格式**：支持Markdown、PDF等格式导出

## 实现步骤建议

### Phase 1: MVP (最小可行产品)
1. ✅ 基础manifest.json配置
2. ✅ 内容脚本注入
3. ✅ 简单的消息监听（ChatGPT优先）
4. ✅ 基础数据存储
5. ✅ 简单的popup界面

### Phase 2: 核心功能
1. ✅ 多平台支持
2. ✅ 消息提取和结构化
3. ✅ 数据管理（查看、删除、导出）
4. ✅ 基础总结功能

### Phase 3: 增强功能
1. ✅ 智能总结（AI增强）
2. ✅ 高级UI（Dashboard）
3. ✅ 搜索和筛选
4. ✅ 数据可视化

### Phase 4: 优化
1. ✅ 性能优化
2. ✅ 用户体验优化
3. ✅ 错误处理和边界情况
4. ✅ 文档和帮助

## 关键技术挑战

### 1. DOM结构变化
**问题**：AI平台可能更新UI，导致选择器失效
**解决方案**：
- 使用更通用的选择器策略
- 支持用户自定义选择器
- 版本检测和适配

### 2. 性能问题
**问题**：频繁的DOM监听可能影响页面性能
**解决方案**：
- 使用防抖和节流
- 只在活跃标签页监听
- 优化选择器性能

### 3. 隐私和安全
**问题**：收集用户对话数据涉及隐私
**解决方案**：
- 所有数据本地存储
- 明确隐私政策
- 提供数据清除功能
- 可选加密存储

### 4. 跨平台兼容
**问题**：不同平台结构差异大
**解决方案**：
- 插件化的平台适配器
- 配置化的选择器规则
- 社区贡献新平台支持

## 文件结构建议

```
ai_dialogue/
├── manifest.json          # 插件配置文件
├── background/
│   └── service-worker.js  # 后台服务
├── content/
│   ├── content.js         # 内容脚本主文件
│   └── platforms/         # 各平台适配器
│       ├── chatgpt.js
│       ├── claude.js
│       └── ...
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── dashboard/
│   ├── dashboard.html
│   ├── dashboard.js
│   └── dashboard.css
├── utils/
│   ├── storage.js         # 存储工具
│   ├── message-parser.js  # 消息解析
│   └── summary.js         # 总结生成
└── assets/
    └── icons/             # 图标资源
```

## 下一步行动

1. 确定技术栈和框架选择
2. 创建基础项目结构
3. 实现第一个平台的监控（建议从ChatGPT开始）
4. 搭建基础的数据存储和UI
5. 迭代优化和扩展功能

