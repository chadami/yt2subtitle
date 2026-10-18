# VidLingo for macOS

把原本跑在 Docker 里的后端，做成了一个双击即可使用的原生 macOS 应用。App 内嵌 Node 运行时和本地服务，自带数据库与任务队列，不再需要 Postgres、Redis、Docker，也不需要邮箱登录。

## 它做了什么

- **原生界面（SwiftUI）**：填 API Key、看运行状态、看最近任务和日志、菜单栏常驻。
- **界面风格**：无标题栏窗口 + 左侧分组导航，白色卡片 + 发丝描边，胶囊分段控件，大号等宽数字；不使用阴影和毛玻璃，强调色只给数据（绿/紫）。
- **设置都在 App 里**：字幕语言、是否显示原文、可分页加载的完整历史记录都在 App 内；插件设置页只剩一个「连接本机应用」按钮。
- **机器翻译可选**：正常情况下仅运行 AI；AI 最终失败后，保留已完成的 AI 字幕，从失败批次接手机翻。Google Cloud Translation，或 macOS 自带翻译（需要 macOS 26 或更新版本，首次需下载语言包）。
- **内嵌服务**：App 启动时拉起一个只监听 `127.0.0.1` 的本地服务，端口默认 3000。
- **零外部依赖**：数据库用 PGlite（Postgres 编译成 WASM，跑在进程里），队列用进程内队列，数据存在 `~/Library/Application Support/VidLingo/data`。
- **本机登录**：首次启动时生成本机令牌并保存在钥匙串，插件通过专用连接请求自动领取；普通网页来源无法领取令牌，本机业务接口均校验令牌，不再走邮箱验证码。
- **密钥安全**：AI API Key 存在 macOS 钥匙串（Keychain），不写配置文件，仅在调用对应服务商接口时使用；启动后在内存中缓存，减少重复读取钥匙串。
- **断点续跑**：App 退出或崩溃时正在翻译的任务，下次启动会分批恢复全部中断任务并重新入队。

## 构建

```bash
npm run build:mac
# 产物：dist/VidLingo.app
```

首次构建会下载运行时的 npm 依赖（约 40 秒），之后会复用缓存。构建脚本会：

1. 编译后端 TypeScript；
2. 组装精简运行时（express / zod / jsonwebtoken / PGlite）；
3. 编译 SwiftUI 应用（`swift build -c release`）；
4. 生成 AppIcon 并组装 `.app`，内嵌插件目录；
5. 优先使用固定的 Apple Development 证书签名，没有证书时使用 ad-hoc 签名。

单独跑本地服务（不打包 App）：

```bash
npm run dev:local
# 或
cd backend && LOCAL_MODE=1 PORT=3000 DATA_DIR=/tmp/vidlingo node dist/start-local.js
```

## 使用

1. 打开 `dist/VidLingo.app`（建议拖进「应用程序」）。
2. 在「AI 模型」里先选模式：**预设服务商**（DeepSeek / Gemini / OpenAI / Claude / 通义千问 / 小米 MiMo，走官方地址）或 **自定义地址**（代理、自建网关、第三方兼容接口，需填 Base URL 和接口协议）。然后填 API Key 和模型名称，点「保存并应用」，服务会自动重启并加载新配置。
3. 在「Chrome 插件」页点「打开内置插件目录」，按提示在 Chrome 里加载这个目录。
4. 打开插件设置页，点一次「连接本机应用」，显示「已连接」即可，不需要登录。
5. 打开 YouTube 视频，点播放器里的 VidLingo 按钮生成字幕。

## 目录

| 路径 | 说明 |
| --- | --- |
| `macos/Sources/VidLingo` | SwiftUI 源码 |
| `macos/scripts/build-app.sh` | 打包脚本 |
| `macos/scripts/make-icon.swift` | 生成 1024pt 应用图标 |
| `backend/src/start-local.ts` | 本机模式入口（服务 + 进程内 worker） |
| `backend/src/db.ts` | Postgres / PGlite 双实现 |
| `backend/src/localQueue.ts` | 进程内任务队列 |
| `backend/src/routes/local.ts` | 本机会话与状态接口 |

## 运行时数据

| 路径 | 内容 |
| --- | --- |
| `~/Library/Application Support/VidLingo/config.json` | 端口、提供方、模型、开机启动 |
| `~/Library/Application Support/VidLingo/data/pgdata` | PGlite 数据库 |
| `~/Library/Application Support/VidLingo/server.log` | 服务日志（超过 4MB 自动轮转） |
| 钥匙串 `com.vidlingo.desktop` | API Key、Google Key、JWT secret、本机令牌 |

## 排错

- **插件提示 Cannot reach backend API**：确认 App 在运行、状态是「运行中」；检查插件设置里的地址和 App 端口一致。
- **服务启动失败**：看「高级 → 运行日志」。端口被占用时换成 3001，再在插件里重新点一次「使用本机应用」。
- **首次生成字幕很慢**：PGlite 初始化 + 模型首次请求需要几秒，后续会快很多。
- **想回到云端服务**：插件设置里把地址改回 `https://api.vidlingo.online` 并重新登录。

## 与云端模式的关系

保留云端服务代码、`render.yaml` 和 `railway.toml`，本地 Docker 部署配置已移除。`LOCAL_MODE=1` 时走本机分支，两种形态共用同一套翻译逻辑与数据库 schema。

本机接口会校验 Host 和浏览器来源。插件与服务需一起更新；更新后请在 Chrome 扩展管理页重新加载插件。稳定的签名证书仍是避免重构建后再次出现钥匙串授权弹窗的前提。

机翻只在 AI 最终失败后启动，正常翻译和等待期间不并行运行。播放器会显示语言包缺失等原因；保持视频页面打开时，每 30 秒自动重试可恢复的机翻兜底错误，并复用已完成批次。更新或重启应用后，AI 任务也会保留已保存的翻译批次。
