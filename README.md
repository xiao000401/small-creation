# 💡 灵感发散器

> 输入一个词，AI 帮你无限发散联想。可视化节点图谱，点击展开，灵感无边界。

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org)

🔗 **在线体验**：[https://xiao000401.github.io/small-creation](https://xiao000401.github.io/small-creation)

> ⚠️ 在线版本为 UI 演示，AI 联想功能需要 Clone 到本地运行完整服务。

## ✨ 功能

- 🤖 **AI 联想** — 输入一个词，沿工具、场景、人物、趋势等 8 个方向返回高质量联想
- 🕸️ **节点图谱** — SVG 贝塞尔曲线连线 + 毛玻璃圆形节点，自由拖拽布局
- 🔀 **无限发散** — 点击任意节点的 `+` 继续展开，灵感无限延伸
- ↩️ **撤销** — `Ctrl+Z` 回退上一步展开
- 📜 **历史记录** — localStorage 自动保存，侧边栏一键恢复
- 🌙 **暗色模式** — 一键切换，偏好持久化
- 📱 **响应式** — 移动端适配

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/xiao000401/small-creation.git
cd small-creation

# 安装依赖
npm install

# 配置 API
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 启动开发服务（前端 + 后端）
npm run dev
```

打开 `http://localhost:5173` 即可使用。

## ⚙️ API 配置

编辑 `.env` 文件：

```bash
# API 地址（兼容所有 OpenAI 格式的服务）
API_BASE_URL=https://api.deepseek.com
# API 密钥
API_KEY=sk-xxxxxxxxxxxx
# 模型名称
API_MODEL=deepseek-chat
# 后端端口
PORT=3001
```

支持的 API 服务：
| 服务 | API_BASE_URL |
|------|-------------|
| DeepSeek | `https://api.deepseek.com` |
| OpenAI | `https://api.openai.com` |
| 第三方中转站 | 各平台提供的地址 |

## 📁 项目结构

```
├── src/
│   ├── main.js        # 应用入口
│   ├── graph.js       # 节点图谱（平移缩放、拖拽、连线、撤销）
│   ├── input.js       # 输入框组件
│   ├── history.js     # 历史记录（localStorage）
│   ├── api.js         # fetch 请求封装
│   └── style.css      # 全部样式（毛玻璃 + 暗色模式）
├── server/
│   └── index.js       # Express 后端（AI API 代理）
├── .github/workflows/
│   └── deploy.yml     # GitHub Actions 自动部署
├── index.html         # HTML 入口
├── vite.config.js     # Vite 配置
└── .env               # API 配置（不提交到 Git）
```

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vite + 原生 JavaScript（零框架） |
| 样式 | 单 CSS 文件，毛玻璃设计，CSS 变量暗色模式 |
| 后端 | Express 5，代理 AI API 调用 |
| 存储 | localStorage |
| 部署 | GitHub Pages + GitHub Actions CI/CD |

## 📄 开源协议

本项目基于 [Apache License 2.0](LICENSE) 开源。
