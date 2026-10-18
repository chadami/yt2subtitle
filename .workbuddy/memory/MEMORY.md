# 项目长期记忆

## 架构
- 一个代码库，两种部署形态：
  1. **云端 SaaS**：`backend` + Postgres + Redis/BullMQ，Docker/Render/Railway 部署。
  2. **macOS 本机版**：`LOCAL_MODE=1`，PGlite（WASM Postgres，进程内）+ 进程内队列，SwiftUI App 内嵌 Node 运行时。
- 翻译逻辑、数据库 schema、任务处理（`backend/src/jobRunner.ts`）两边共用，本机模式不得复制一份翻译实现。

## 关键约定
- Swift 编译必须带 `--disable-sandbox`（当前环境的沙箱会导致 SwiftPM 的 sandbox-exec 失败）。
- 打包必须用稳定的 Apple Development 证书签名（`build-app.sh` 自动选），**不要用 ad-hoc**：ad-hoc 每次构建身份都变，钥匙串会反复弹密码。找不到证书才回退 ad-hoc。
- 打包脚本不要用 `rm -rf` 删除 `.app` 目录（安全策略会拦截），用移入废纸篓 + `ditto` 复制。
- 本机服务只监听 `127.0.0.1`；插件通过 `GET /api/local/session` 自动换取令牌，不暴露给用户。
- API Key 只存 macOS Keychain（service `com.vidlingo.desktop`），不写入配置文件或数据库。
- 本机端口默认 3000，用户可改；插件已放开 `http://127.0.0.1/*` 任意端口。

## 构建
- `npm run build:mac` → `dist/VidLingo.app` + `dist/VidLingo.dmg`
- `npm run dev:local` → 不带 App 直接跑本机后端

## 安装位置
- 用户机器上已把 App 安装到 `/Applications/VidLingo.app`（2026-10-18）。
- `npm run build:mac` 只更新 `dist/VidLingo.app`；要更新已安装版本需重新拷贝或重装 DMG。
- 配置与数据在 `~/Library/Application Support/VidLingo`，与 App 路径无关，换版本不会丢。
- 关闭窗口不会退出 App，菜单栏常驻；开机启动在「高级」里用 LaunchAgent 实现。
