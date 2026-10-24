# YouTube AI Subtitle Prototype

这个原型脚本用于验证核心能力：给一个 YouTube 链接，先检测是否有可用字幕轨道；如果有，就下载原始字幕，用 AI 重新断句、翻译并校准时间轴，最后输出 `.vtt` 或 `.srt` 字幕文件。

脚本会同时抓取视频标题、频道和描述，并把这些信息作为翻译上下文传给 AI，用于识别主题、人物、术语和缩写；这些上下文不会被输出到字幕里。

## macOS 本地应用

`npm run build:mac` 生成 `dist/VidLingo.app`。应用内嵌 Node、PGlite 数据库和任务队列，不需要部署服务器、Docker、Postgres 或 Redis，也不需要邮箱登录。

在应用中配置 AI 服务商与 API Key，再使用 Chrome 插件的「连接本机应用」。详细说明见 [macos/README.md](macos/README.md)。

所有任务、历史和字幕缓存在本机。翻译内容会发送给你配置的 AI 服务商；macOS 系统翻译在本机执行：开启翻译即准备当前字幕，并跟随播放位置预翻后约 30 秒，填补等待 AI 的空白；AI 译文优先显示。

新生成的中文字幕由 AI 在翻译时同时返回语义显示片段，优先保持完整短句、修饰关系和英文名称；后端校验片段拼接与完整译文一致，再按片段文字长度预估时间。缺失或不合法的片段回退到规则拆分。20 字是参考目标，不会再次用字数规则切开合法的语义片段（单片段超过 64 个正文字符时回退）；仍会合并显示时间不足 0.65 秒的片段以避免闪屏。已有旧字幕需重新生成才能获得 AI 语义片段，单纯重新打开只会重新应用规则拆分。

规则兜底的中文字幕以每条不超过 20 个正文字符为柔性目标（标点和空格不计），完整短句分别显示。自然标点边界允许放宽到 24 字；没有合适标点时，24 字以内的短句保持完整，更长的句子才按中文词边界拆分。拆分时间按各片段文字长度在原字幕时间范围内估算，不进行音频逐词对齐。数字、英文单词和文件名保持完整；拆分会导致片段短于 0.65 秒时，允许超过长度目标，避免闪屏。中英双语中的原文也按比例预估分配，不能保证逐句语义精确对应。

这一显示规则用于 AI 成品、生成中的 AI 字幕、系统机翻预览，以及已保存中文字幕的读取；缓存仍保留源字幕索引，不因显示分段重复翻译。

连续英文名称尽量保持在同一条字幕内；英文后没有标点时，连同紧接的中文分词一起显示（如 `Teenage Engineering 办公室`）；若先接「的」等连接词，则同时保留后面的词（如 `Teenage Engineering 的办公室`）。英文后有标点则允许在那里断开。为避免把整段英语锁成一条字幕，英文组合最多保护 8 个词、64 个正文字符；名称保护可优先于 20～24 字目标。

以下 Python 原型和 `evaluation/` 是独立的开发与评估工具，不参与应用运行。

## 使用

先查看视频有哪些字幕：

```bash
python3 ai_youtube_subtitle.py 'https://www.youtube.com/watch?v=VIDEO_ID' --list
```

生成中文字幕：

先打开 [ai_youtube_subtitle.py](/Users/chadami/Documents/Youtube%20翻译字幕插件/ai_youtube_subtitle.py)，在文件顶部填写：

```python
DEEPSEEK_API_KEY_HERE = "你的 DeepSeek API Key"
```

然后运行：

```bash
python3 ai_youtube_subtitle.py 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --source-lang en \
  --target-lang zh-Hans \
  --provider deepseek \
  --format vtt \
  --output output.zh.vtt
```

脚本默认会在翻译后检查字幕长度：显示时间越短，允许的中文字数越少；太长的字幕会自动再调用一次 AI 压缩，但不改变时间点。需要对比原始翻译效果时可以关闭压缩：

```bash
python3 ai_youtube_subtitle.py 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --source-lang en \
  --target-lang zh-Hans \
  --provider deepseek \
  --no-compress \
  --output output.no-compress.zh.vtt
```

也可以显式指定 DeepSeek 模型：

```bash
python3 ai_youtube_subtitle.py 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --provider deepseek \
  --model deepseek-v4-flash \
  --source-lang en \
  --target-lang zh-Hans \
  --output output.zh.vtt
```

只下载原始字幕、不调用 AI：

```bash
python3 ai_youtube_subtitle.py 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --source-lang en \
  --raw-output raw-captions.json \
  --clean-output clean-captions.json \
  --raw-only
```

`raw-captions.json` 是 YouTube 返回的原始时间轴，可能存在重叠。`clean-captions.json` 是脚本清理后的单轨时间轴，AI 翻译会使用这份清洗结果。

如果没有手动字幕，脚本默认允许使用 YouTube 自动字幕。只想使用手动字幕时加：

```bash
python3 ai_youtube_subtitle.py 'https://www.youtube.com/watch?v=VIDEO_ID' --no-auto
```

## 环境变量

- 也可以不改脚本，继续用环境变量。
- `DEEPSEEK_API_KEY`：使用 DeepSeek 时必填。
- `DEEPSEEK_MODEL`：可选，默认 `deepseek-v4-flash`。
- `DEEPSEEK_API_BASE`：可选，默认 `https://api.deepseek.com`。
- `OPENAI_API_KEY`：使用 OpenAI 时必填。
- `OPENAI_MODEL`：可选，默认 `gpt-4.1-mini`。
- `OPENAI_API_BASE`：可选，默认 `https://api.openai.com/v1`。
- `AI_PROVIDER` / `AI_MODEL` / `AI_API_BASE`：通用覆盖项。

脚本会在检测到 `DEEPSEEK_API_KEY` 时默认使用 DeepSeek；否则默认使用 OpenAI。也可以用 `--provider openai` 或 `--provider deepseek` 显式指定。

## 当前边界

- 只处理 YouTube 已有字幕轨道，不做音频转写。
- 字幕提取依赖 YouTube 页面里的 caption track 信息；这不是官方稳定 API，后续需要做失败重试和后端兜底。
- 时间轴校准由 AI 输出后再做基础排序和去重叠修正，适合先验证翻译质量；生产版建议加入更严格的时间轴校验。
