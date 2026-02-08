# Privacy Policy - AI对话监控助手

**Last Updated: February 9, 2026**

## Overview

AI对话监控助手 (AI Dialogue Monitor) is a browser extension that helps users track and summarize their conversations with AI platforms. We are committed to protecting your privacy.

## Data Collection

### What We Collect
- **Conversation Content**: Text of your conversations with AI platforms (ChatGPT, Claude, Copilot, Gemini, DeepSeek, Perplexity) that are displayed on the web page.
- **Metadata**: Timestamps, platform names, and message roles (user/AI).

### What We Do NOT Collect
- ❌ Personal identification information (name, email, etc.)
- ❌ Browsing history outside of supported AI platforms
- ❌ Cookies or tracking data
- ❌ Analytics or telemetry data

## Data Storage

- **All data is stored locally** in your browser using Chrome's `chrome.storage.local` API.
- **No data is sent to any server** owned or operated by us.
- Data is automatically cleaned up after 30 days (configurable).
- You can manually delete all data at any time through the extension's settings page.

## Third-Party Services

### LLM API (Optional)
- When you **manually click** "Generate Summary", your conversation data is sent to a third-party LLM API (e.g., Moonshot/Kimi, OpenAI, DeepSeek) to generate a summary.
- **This only happens when you explicitly request it** — no automatic data transmission occurs.
- You provide your own API key; we do not have access to it.
- The API key is stored locally in `chrome.storage.local`.

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Store conversation data and settings locally |
| `tabs` | Detect which AI platforms are open |
| `activeTab` | Access the current tab for content injection |
| `scripting` | Inject content scripts to capture conversations |
| `alarms` | Schedule daily reminder notifications |
| `sidePanel` | Display the side panel UI |
| `notifications` | Send daily learning reminder notifications |

## Host Permissions

We request access to specific AI platform domains to inject content scripts:
- `chatgpt.com` / `chat.openai.com`
- `claude.ai` / `console.anthropic.com`
- `copilot.microsoft.com`
- `gemini.google.com`
- `chat.deepseek.com`
- `www.perplexity.ai`

And LLM API endpoints for the summary feature:
- `api.moonshot.cn`
- `api.openai.com`
- `api.deepseek.com`
- `open.bigmodel.cn`

## User Rights

You have the right to:
- **View** all stored data through the extension's UI
- **Export** your data as JSON
- **Delete** all stored data at any time
- **Disable** monitoring for specific platforms
- **Uninstall** the extension to remove all data

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Contact

For questions about this privacy policy, please open an issue on our [GitHub repository](https://github.com/vikkiwang123/ai_dialogue).

