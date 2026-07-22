# 日语字幕批量评估

该目录用于使用生产翻译链路批量翻译 YouTube 字幕，并对日语字幕执行确定性检查和 DeepSeek 语义检查。API Key 只从环境变量读取，不写入评估产物。

## 流程

1. 将每个视频的 `meta.json` 与 `transcript-raw.json` 放入一次 run 的 `source/<video-id>/`。
2. 构建后端，确保 `backend/dist` 与生产代码一致。
3. 加载 `.env.docker` 后运行翻译、初审和验证脚本。

```bash
set -a
source .env.docker
set +a

node evaluation/scripts/run-ja-pilot.mjs <source目录> <output目录>
node evaluation/scripts/evaluate-ja-semantic.mjs <output目录>
node evaluation/scripts/verify-ja-semantic.mjs <output目录>
```

默认每个视频最多评估前 900 秒，翻译块上限为 2400 字符。可通过 `EVAL_MAX_VIDEO_SECONDS` 和 `EVAL_CHUNK_CHARACTERS` 调整。脚本默认复用已完成结果；需要重新运行时添加 `--force`。

## 判断原则

- `，`、孤立标点、时间轴重叠、数字遗漏等可以做确定性门禁。
- 长度和持续时间必须与 CPS、句法边界组合判断。
- 模型评审结果是候选问题，不直接等于生产缺陷。
- YouTube 自动字幕可能把产品名识别成同音词；标题、描述和上下文术语表的优先级应高于明显的 ASR 噪声。
