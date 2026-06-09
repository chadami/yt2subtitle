# YouTube AI Subtitle Prototype

这个原型脚本用于验证核心能力：给一个 YouTube 链接，先检测是否有可用字幕轨道；如果有，就下载原始字幕，用 AI 重新断句、翻译并校准时间轴，最后输出 `.vtt` 或 `.srt` 字幕文件。

脚本会同时抓取视频标题、频道和描述，并把这些信息作为翻译上下文传给 AI，用于识别主题、人物、术语和缩写；这些上下文不会被输出到字幕里。

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
  --model deepseek-v4-pro \
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
- `DEEPSEEK_MODEL`：可选，默认 `deepseek-v4-pro`。
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
