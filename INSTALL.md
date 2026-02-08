# 安装指南

## 快速开始

### 1. 生成图标文件

插件需要图标文件才能正常安装。您有两种方式生成图标：

#### 方式一：使用Python脚本（推荐）

```bash
# 安装依赖
pip install Pillow

# 生成图标
cd assets/icons
python generate-icons.py
```

#### 方式二：使用网页工具

1. 在浏览器中打开 `assets/icons/create-icons.html`
2. 点击"生成图标"按钮
3. 图标会自动下载到您的下载文件夹
4. 将下载的图标文件移动到 `assets/icons/` 目录

#### 方式三：使用在线工具

如果您没有Python环境，可以使用在线图标生成工具：
- 访问 https://www.favicon-generator.org/
- 上传一个简单的AI相关图标
- 下载16x16, 48x48, 128x128尺寸的图标
- 重命名为 `icon16.png`, `icon48.png`, `icon128.png`
- 放入 `assets/icons/` 目录

### 2. 加载插件到浏览器

#### Chrome / Edge (Chromium)

1. 打开浏览器，访问扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

2. 开启"开发者模式"（右上角开关）

3. 点击"加载已解压的扩展程序"

4. 选择项目根目录（`ai_dialogue` 文件夹）

5. 插件安装完成！

#### Firefox

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`

2. 点击"临时载入附加组件"

3. 选择项目中的 `manifest.json` 文件

4. 插件安装完成！

**注意**：Firefox可能需要修改 `manifest.json` 中的 `service_worker` 为 `scripts`（Firefox使用background scripts而非service worker）

## 使用说明

### 首次使用

1. 安装插件后，点击浏览器工具栏中的插件图标

2. 插件会自动开始监控支持的AI平台：
   - ChatGPT (chat.openai.com)
   - Claude (claude.ai)
   - Copilot (copilot.microsoft.com)
   - Gemini (gemini.google.com)

3. 在AI平台上正常对话，插件会在后台自动记录

### 查看数据

- **Popup界面**：点击插件图标查看今日统计
- **设置页面**：右键点击插件图标 → 选项，查看完整数据和设置

### 功能说明

- ✅ **自动监控**：打开AI平台页面时自动开始监控
- ✅ **实时记录**：对话消息实时保存到本地
- ✅ **数据统计**：查看消息数量、字数统计等
- ✅ **每日总结**：生成当天的学习收获总结
- ✅ **数据导出**：导出为JSON格式备份
- ✅ **隐私保护**：所有数据完全存储在本地

## 故障排除

### 插件无法加载

- 确保所有文件都在正确的位置
- 检查 `manifest.json` 格式是否正确
- 查看浏览器控制台的错误信息

### 无法监控消息

- 确认当前页面是支持的AI平台
- 检查插件设置中是否启用了对应平台
- 刷新页面后重试
- 查看浏览器控制台是否有错误信息

### 图标显示异常

- 确保 `assets/icons/` 目录下有所有三个图标文件
- 图标文件必须是PNG格式
- 检查文件大小是否合理（不应该为0字节）

## 开发模式

如果您想修改代码：

1. 修改代码后，在扩展管理页面点击"重新加载"按钮
2. 刷新AI平台页面使更改生效
3. 查看控制台输出调试信息

## 注意事项

- 插件只在支持的AI平台页面上工作
- 数据存储在浏览器本地，清除浏览器数据会丢失记录
- 建议定期导出数据备份
- 插件不会上传任何数据到服务器

## 支持

如有问题或建议，请查看项目文档或提交Issue。


