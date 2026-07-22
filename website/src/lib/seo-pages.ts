import type { Locale } from "./i18n";

export const seoPageSlugs = [
  "youtube-subtitle-translator",
  "how-to-translate-youtube-subtitles",
  "ai-providers",
  "bring-your-own-api-key",
] as const;

export type SeoPageSlug = (typeof seoPageSlugs)[number];

type SeoSection = {
  title: string;
  paragraphs: string[];
};

type SeoFaq = {
  question: string;
  answer: string;
};

export type SeoPageCopy = {
  meta: { title: string; description: string; keywords: string[] };
  shortTitle: string;
  eyebrow: string;
  title: string;
  introduction: string;
  highlights: Array<{ title: string; description: string }>;
  sections: SeoSection[];
  faqTitle: string;
  faq: SeoFaq[];
  relatedTitle: string;
  ctaTitle: string;
  ctaDescription: string;
};

type SeoPageDefinition = {
  updatedAt: string;
  copy: Record<Locale, SeoPageCopy>;
};

export function isSeoPageSlug(value: string): value is SeoPageSlug {
  return seoPageSlugs.includes(value as SeoPageSlug);
}

export const seoPages = {
  "youtube-subtitle-translator": {
    updatedAt: "2026-07-22",
    copy: {
      en: {
        meta: {
          title: "YouTube Subtitle Translator with AI | VidLingo",
          description: "Translate YouTube subtitles with Gemini, DeepSeek, OpenAI, Claude, Qwen, or MiMo using your own API key.",
          keywords: ["YouTube subtitle translator", "AI subtitle translator", "YouTube translation Chrome extension"],
        },
        shortTitle: "AI subtitle translator",
        eyebrow: "AI subtitles for YouTube",
        title: "A YouTube subtitle translator built for watching",
        introduction: "VidLingo is a Chrome extension that translates existing YouTube captions with the AI provider you choose. It uses video context, rebuilds fragmented captions, and keeps timing readable instead of replacing words line by line.",
        highlights: [
          { title: "Context-aware", description: "Uses the video title, channel, description, and nearby dialogue to understand terms and intent." },
          { title: "Readable timing", description: "Cleans source captions first, then derives timing from the cleaned subtitle track." },
          { title: "Your AI provider", description: "Connect Gemini, DeepSeek, OpenAI, Claude, Qwen, or Xiaomi MiMo with your own API key." },
        ],
        sections: [
          { title: "Translate meaning, not isolated fragments", paragraphs: ["YouTube auto-captions often split one thought across several lines. Translating those fragments separately produces awkward wording and unstable subtitles.", "VidLingo groups related caption fragments before translation and includes useful video context in the request. This gives the selected AI model a better chance to preserve names, technical terms, tone, and the relationship between nearby sentences."] },
          { title: "Keep subtitles comfortable to read", paragraphs: ["Translation quality is only useful when viewers can follow it. VidLingo builds the final timeline from cleaned source captions rather than asking an AI model to invent timestamps.", "Completed subtitles load over the YouTube player and remain available in your subtitle history after you sign in."] },
          { title: "A transparent BYOK workflow", paragraphs: ["During the public beta, VidLingo does not include model usage. You provide an API key for a supported provider, choose a model, and the provider bills your account according to its own terms.", "Your key is encrypted when saved and is used only to call the provider and model you selected."] },
        ],
        faqTitle: "YouTube subtitle translator FAQ",
        faq: [
          { question: "Can VidLingo translate a video without captions?", answer: "Not during the current beta. The YouTube video must have an available caption track; audio transcription is not supported yet." },
          { question: "Does VidLingo replace YouTube's captions?", answer: "No. It generates a separate translated subtitle result and loads it over the player without modifying the original video." },
          { question: "Do I need to choose an AI model?", answer: "Yes. You select a supported provider and model, then use your own API key for translation." },
        ],
        relatedTitle: "Learn more about VidLingo",
        ctaTitle: "Translate your next YouTube video with better subtitles",
        ctaDescription: "Install the public beta, connect your preferred AI provider, and start from a video with captions.",
      },
      zh: {
        meta: {
          title: "YouTube AI 字幕翻译插件｜VidLingo",
          description: "使用自己的 API Key，通过 Gemini、DeepSeek、OpenAI、Claude、Qwen 或 MiMo 翻译 YouTube 字幕。",
          keywords: ["YouTube 字幕翻译", "字幕翻译插件", "AI 字幕翻译"],
        },
        shortTitle: "AI 字幕翻译插件",
        eyebrow: "为 YouTube 而做的 AI 字幕",
        title: "不只是换词的 YouTube 字幕翻译插件",
        introduction: "VidLingo 是一款 Chrome 扩展，可使用你选择的 AI 服务商翻译 YouTube 已有字幕。它会结合视频上下文、重新整理破碎字幕，并保持易读的时间轴，而不是逐行生硬替换单词。",
        highlights: [
          { title: "理解上下文", description: "结合视频标题、频道、简介和前后对话理解术语与表达意图。" },
          { title: "字幕更易读", description: "先清理原字幕，再根据清理结果生成稳定的字幕时间轴。" },
          { title: "自由选择模型", description: "使用自己的 API Key 连接 Gemini、DeepSeek、OpenAI、Claude、Qwen 或 Xiaomi MiMo。" },
        ],
        sections: [
          { title: "翻译完整意思，而不是字幕碎片", paragraphs: ["YouTube 自动字幕经常把一句话拆成多段。如果逐段直接翻译，很容易出现语序生硬、上下句脱节和术语不一致。", "VidLingo 会先整理相关字幕片段，并把必要的视频信息交给你选择的 AI 模型，帮助模型正确处理人名、专业词汇、语气和前后句关系。"] },
          { title: "让翻译结果真正适合观看", paragraphs: ["只有翻译正确还不够，字幕还需要在合适的时间出现。VidLingo 根据清理后的原字幕计算最终时间，不让 AI 模型自由编造时间戳。", "生成完成后，字幕会加载到 YouTube 播放器上；登录后也可以在字幕历史中再次使用。"] },
          { title: "透明的 BYOK 使用方式", paragraphs: ["Beta 公测期间，VidLingo 不提供内置模型额度。你需要选择支持的服务商和模型，并提供自己的 API Key，调用费用由服务商按其规则直接收取。", "API Key 保存时会被加密，并且只用于调用你选择的服务商和模型。"] },
        ],
        faqTitle: "YouTube 字幕翻译常见问题",
        faq: [
          { question: "没有字幕的 YouTube 视频可以翻译吗？", answer: "当前 Beta 版不支持。视频必须存在可用的字幕轨道，目前还不提供音频转写。" },
          { question: "VidLingo 会修改视频原字幕吗？", answer: "不会。VidLingo 会生成独立的翻译结果并加载到播放器上，不会修改原视频。" },
          { question: "必须自己选择 AI 模型吗？", answer: "是的。你需要选择支持的服务商和模型，并使用自己的 API Key 发起翻译。" },
        ],
        relatedTitle: "继续了解 VidLingo",
        ctaTitle: "用更自然的字幕看下一个 YouTube 视频",
        ctaDescription: "安装 Beta 版，连接你信任的 AI 服务商，然后打开一个已有字幕的视频。",
      },
      ja: {
        meta: {
          title: "YouTube AI字幕翻訳 Chrome拡張機能 | VidLingo",
          description: "自分のAPIキーでGemini、DeepSeek、OpenAI、Claude、Qwen、MiMoを使い、YouTube字幕を自然に翻訳します。",
          keywords: ["YouTube 字幕 翻訳", "字幕翻訳 拡張機能", "AI 字幕翻訳"],
        },
        shortTitle: "AI字幕翻訳",
        eyebrow: "YouTubeのためのAI字幕",
        title: "視聴のために作られたYouTube字幕翻訳",
        introduction: "VidLingoは、選択したAIプロバイダーで既存のYouTube字幕を翻訳するChrome拡張機能です。単語を行ごとに置き換えるのではなく、動画の文脈を使い、断片的な字幕を再構成して読みやすいタイミングを保ちます。",
        highlights: [
          { title: "文脈を理解", description: "動画タイトル、チャンネル、概要、前後の会話から用語と意図を読み取ります。" },
          { title: "読みやすいタイミング", description: "元字幕を整理してから、その結果を基準に字幕の時間を決めます。" },
          { title: "モデルを自分で選択", description: "自分のAPIキーでGemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMoを利用できます。" },
        ],
        sections: [
          { title: "断片ではなく、文全体の意味を翻訳", paragraphs: ["YouTubeの自動字幕は、一つの発言を複数行に分割することがあります。そのまま個別に翻訳すると、不自然な語順や用語のずれが生まれます。", "VidLingoは関連する字幕を先に整理し、必要な動画情報と一緒に選択したAIモデルへ送ります。人名、専門用語、話し方、前後のつながりを保ちやすくなります。"] },
          { title: "実際に読める字幕を作る", paragraphs: ["翻訳が正しくても、表示時間が不安定では視聴しにくくなります。VidLingoはAIに時間を作らせず、整理した元字幕から最終タイミングを計算します。", "完成した字幕はYouTubeプレーヤー上に表示され、ログイン後は字幕履歴にも保存されます。"] },
          { title: "透明なBYOKワークフロー", paragraphs: ["パブリックベータではモデル利用枠を提供しません。対応プロバイダーとモデルを選び、自分のAPIキーを登録します。料金はプロバイダーから直接請求されます。", "保存時にAPIキーは暗号化され、選択したプロバイダーとモデルの呼び出しにのみ使われます。"] },
        ],
        faqTitle: "YouTube字幕翻訳のよくある質問",
        faq: [
          { question: "字幕がない動画も翻訳できますか？", answer: "現在のベータではできません。利用可能なYouTube字幕トラックが必要で、音声文字起こしにはまだ対応していません。" },
          { question: "元のYouTube字幕は変更されますか？", answer: "変更されません。独立した翻訳結果を生成し、プレーヤー上に表示します。" },
          { question: "AIモデルを自分で選ぶ必要がありますか？", answer: "はい。対応プロバイダーとモデルを選び、自分のAPIキーを使用します。" },
        ],
        relatedTitle: "VidLingoについて詳しく見る",
        ctaTitle: "次のYouTube動画を、より自然な字幕で",
        ctaDescription: "ベータ版をインストールし、利用するAIプロバイダーを接続して、字幕のある動画を開いてください。",
      },
    },
  },
  "how-to-translate-youtube-subtitles": {
    updatedAt: "2026-07-22",
    copy: {
      en: {
        meta: { title: "How to Translate YouTube Subtitles with AI | VidLingo", description: "A practical three-step guide to translating existing YouTube captions with your own AI provider and API key.", keywords: ["how to translate YouTube subtitles", "translate YouTube captions", "YouTube subtitle Chrome extension"] },
        shortTitle: "How to translate subtitles",
        eyebrow: "Three-step guide",
        title: "How to translate YouTube subtitles with your own AI model",
        introduction: "VidLingo turns an existing YouTube caption track into a more natural translated track. The process is simple: connect a supported model, open a captioned video, then generate and watch.",
        highlights: [
          { title: "1. Connect", description: "Sign in, select an AI provider and model, then save your API key." },
          { title: "2. Open", description: "Open a YouTube video that has an available caption track." },
          { title: "3. Generate", description: "Start translation and load the completed subtitles over the player." },
        ],
        sections: [
          { title: "Step 1: connect a provider and model", paragraphs: ["Install VidLingo and sign in with your email. In API settings, choose Gemini, DeepSeek, OpenAI, Claude, Qwen, or Xiaomi MiMo, paste a key you are authorized to use, and select a compatible model.", "The key is encrypted when saved. During beta, model requests use your provider account and are subject to that provider's pricing and limits."] },
          { title: "Step 2: open a video with captions", paragraphs: ["Navigate to a YouTube video with an available caption track. VidLingo detects the source captions and prefers a manually uploaded track when one is available.", "Videos with no captions cannot be translated in the current beta because VidLingo does not transcribe audio yet."] },
          { title: "Step 3: generate, review, and watch", paragraphs: ["Start the translation from the extension. VidLingo cleans fragmented source captions, sends the relevant text and context to the selected model, and creates a translated track with timing derived from the cleaned source.", "Load the result over the player and review important names or technical terms. Completed work remains available in subtitle history after you sign in."] },
        ],
        faqTitle: "Translation setup FAQ",
        faq: [
          { question: "Which source caption should I use?", answer: "A manually uploaded caption track is generally preferable when available. VidLingo can also work from an available automatic caption track." },
          { question: "Will translation start automatically?", answer: "No. You choose the provider, model, target language, and when to begin the translation." },
          { question: "Can I reuse a completed subtitle?", answer: "Yes. Signed-in users can access completed subtitles in their subtitle history." },
        ],
        relatedTitle: "Related VidLingo guides",
        ctaTitle: "Ready to translate a captioned video?",
        ctaDescription: "Install VidLingo, connect your model, and generate a subtitle track when you are ready.",
      },
      zh: {
        meta: { title: "如何用 AI 翻译 YouTube 字幕｜VidLingo", description: "三步使用自己的 AI 服务商和 API Key 翻译已有的 YouTube 字幕，并生成更自然、易读的字幕。", keywords: ["如何翻译 YouTube 字幕", "翻译 YouTube 字幕", "YouTube 字幕插件"] },
        shortTitle: "如何翻译 YouTube 字幕",
        eyebrow: "三步使用指南",
        title: "如何用自己的 AI 模型翻译 YouTube 字幕",
        introduction: "VidLingo 会把 YouTube 已有的字幕轨道整理并翻译成更自然的新字幕。整个过程分为三步：连接支持的模型、打开已有字幕的视频，然后生成并观看。",
        highlights: [
          { title: "1. 连接", description: "登录后选择 AI 服务商和模型，再保存你的 API Key。" },
          { title: "2. 打开", description: "打开一个存在可用字幕轨道的 YouTube 视频。" },
          { title: "3. 生成", description: "开始翻译，并把完成后的字幕加载到播放器上。" },
        ],
        sections: [
          { title: "第一步：连接服务商和模型", paragraphs: ["安装 VidLingo 并使用邮箱登录。在 API 设置中选择 Gemini、DeepSeek、OpenAI、Claude、Qwen 或 Xiaomi MiMo，填入你有权使用的 API Key，然后选择兼容模型。", "API Key 保存时会被加密。Beta 期间的模型请求使用你的服务商账户，并受该服务商价格和额度限制。"] },
          { title: "第二步：打开已有字幕的视频", paragraphs: ["进入一个存在可用字幕轨道的 YouTube 视频。VidLingo 会检测原字幕，并在存在人工上传字幕时优先选择它。", "当前 Beta 版还不提供音频转写，因此没有任何字幕轨道的视频暂时不能翻译。"] },
          { title: "第三步：生成、检查并观看", paragraphs: ["从扩展中开始翻译。VidLingo 会整理破碎的原字幕，把必要文本和上下文发送给你选择的模型，再根据整理后的原字幕生成翻译时间轴。", "完成后可以把字幕加载到播放器上。建议复核重要人名和专业术语；登录用户还可以从字幕历史再次打开结果。"] },
        ],
        faqTitle: "翻译设置常见问题",
        faq: [
          { question: "应该选择哪一种原字幕？", answer: "如果视频存在人工上传字幕，通常应优先使用；VidLingo 也可以处理可用的自动字幕轨道。" },
          { question: "翻译会自动开始吗？", answer: "不会。服务商、模型、目标语言和开始翻译的时间都由你选择。" },
          { question: "完成的字幕可以再次使用吗？", answer: "可以。登录用户可以在字幕历史中找到已经完成的翻译。" },
        ],
        relatedTitle: "相关 VidLingo 指南",
        ctaTitle: "准备好翻译一个已有字幕的视频了吗？",
        ctaDescription: "安装 VidLingo，连接你的模型，需要时再生成字幕。",
      },
      ja: {
        meta: { title: "AIでYouTube字幕を翻訳する方法 | VidLingo", description: "自分のAIプロバイダーとAPIキーを使い、既存のYouTube字幕を3ステップで自然に翻訳する方法。", keywords: ["YouTube 字幕 翻訳 方法", "YouTube 字幕を翻訳", "YouTube 字幕 拡張機能"] },
        shortTitle: "YouTube字幕の翻訳方法",
        eyebrow: "3ステップガイド",
        title: "自分のAIモデルでYouTube字幕を翻訳する方法",
        introduction: "VidLingoは、既存のYouTube字幕トラックを整理し、より自然な翻訳字幕を作ります。対応モデルを接続し、字幕のある動画を開き、生成して視聴する3ステップです。",
        highlights: [
          { title: "1. 接続", description: "ログインし、AIプロバイダーとモデルを選んでAPIキーを保存します。" },
          { title: "2. 開く", description: "利用可能な字幕トラックがあるYouTube動画を開きます。" },
          { title: "3. 生成", description: "翻訳を開始し、完成した字幕をプレーヤー上に読み込みます。" },
        ],
        sections: [
          { title: "ステップ1：プロバイダーとモデルを接続", paragraphs: ["VidLingoをインストールし、メールでログインします。API設定でGemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMoから選び、利用権限のあるAPIキーと対応モデルを登録します。", "APIキーは保存時に暗号化されます。ベータ中のモデル利用は、各プロバイダーの料金と制限に従います。"] },
          { title: "ステップ2：字幕のある動画を開く", paragraphs: ["利用可能な字幕トラックがあるYouTube動画を開きます。VidLingoは元字幕を検出し、手動でアップロードされた字幕があれば優先します。", "現在のベータは音声文字起こしに対応していないため、字幕がない動画は翻訳できません。"] },
          { title: "ステップ3：生成、確認、視聴", paragraphs: ["拡張機能から翻訳を開始します。VidLingoは断片的な元字幕を整理し、必要なテキストと文脈を選択したモデルへ送り、整理済み字幕から時間を計算します。", "完成後はプレーヤー上に読み込めます。重要な名前や専門用語を確認し、ログイン後は字幕履歴から再利用できます。"] },
        ],
        faqTitle: "翻訳設定のよくある質問",
        faq: [
          { question: "どの元字幕を選べばよいですか？", answer: "手動でアップロードされた字幕があれば、通常はそちらを優先します。利用可能な自動字幕も処理できます。" },
          { question: "翻訳は自動で始まりますか？", answer: "いいえ。プロバイダー、モデル、翻訳先言語、開始タイミングは自分で選びます。" },
          { question: "完成した字幕を再利用できますか？", answer: "はい。ログインユーザーは字幕履歴から完成済みの翻訳を開けます。" },
        ],
        relatedTitle: "関連するVidLingoガイド",
        ctaTitle: "字幕のある動画を翻訳してみませんか？",
        ctaDescription: "VidLingoをインストールし、モデルを接続して、必要なときに字幕を生成できます。",
      },
    },
  },
  "ai-providers": {
    updatedAt: "2026-07-22",
    copy: {
      en: {
        meta: { title: "AI Providers for YouTube Subtitle Translation | VidLingo", description: "Use Gemini, DeepSeek, OpenAI, Claude, Qwen, or Xiaomi MiMo to translate YouTube subtitles in VidLingo.", keywords: ["AI subtitle providers", "Gemini YouTube subtitles", "DeepSeek subtitle translation"] },
        shortTitle: "Supported AI providers",
        eyebrow: "Choose your model",
        title: "Six AI providers, one subtitle workflow",
        introduction: "VidLingo supports Gemini, DeepSeek, OpenAI, Claude, Qwen, and Xiaomi MiMo. You choose the provider and compatible model; VidLingo handles caption cleanup, contextual requests, timing, and subtitle history.",
        highlights: [
          { title: "No forced provider", description: "Choose among the supported services instead of being locked to one model vendor." },
          { title: "Model-level control", description: "Select a compatible model available through your own provider account." },
          { title: "One consistent workflow", description: "Caption preparation and final subtitle timing stay consistent across providers." },
        ],
        sections: [
          { title: "Currently supported providers", paragraphs: ["The public beta currently supports Gemini, DeepSeek, OpenAI, Claude, Qwen, and Xiaomi MiMo. Availability of individual models depends on the provider and your account.", "Provider features, model names, quotas, and pricing may change independently of VidLingo. Check the provider's current documentation before adding a key."] },
          { title: "What changes when you switch models", paragraphs: ["The selected model produces the translation, so wording, terminology, speed, and provider cost can differ. VidLingo keeps the surrounding workflow consistent: it cleans caption fragments, supplies relevant context, and derives timing from the source track.", "This makes it easier to choose a model based on your language pair, preferred style, and provider account rather than rebuilding the subtitle process."] },
          { title: "What VidLingo sends", paragraphs: ["To generate subtitles, VidLingo sends the caption text and relevant video context to the provider you selected. The saved API key is used only for that selected provider and model.", "Do not add a credential you are not authorized to use. Provider requests remain subject to the provider's own terms, quotas, and billing."] },
        ],
        faqTitle: "AI provider FAQ",
        faq: [
          { question: "Which provider is best for every video?", answer: "There is no single best choice for every language, topic, or account. Select a model based on your needs and review important translations." },
          { question: "Can I change providers later?", answer: "Yes. You can update the provider and model in API settings before starting another translation." },
          { question: "Does VidLingo add a model markup?", answer: "No model usage is bundled during beta. Your selected provider bills your account directly under its own pricing." },
        ],
        relatedTitle: "Understand the full workflow",
        ctaTitle: "Use the AI provider you already trust",
        ctaDescription: "Install VidLingo and connect one of the supported providers with your own API key.",
      },
      zh: {
        meta: { title: "VidLingo 支持的 AI 字幕翻译模型", description: "使用 Gemini、DeepSeek、OpenAI、Claude、Qwen 或 Xiaomi MiMo 翻译 YouTube 字幕。", keywords: ["AI 字幕模型", "Gemini 字幕翻译", "DeepSeek 字幕翻译"] },
        shortTitle: "支持的 AI 服务商",
        eyebrow: "选择你的模型",
        title: "六个 AI 服务商，一套字幕工作流",
        introduction: "VidLingo 支持 Gemini、DeepSeek、OpenAI、Claude、Qwen 和 Xiaomi MiMo。你选择服务商与兼容模型，VidLingo 负责字幕清理、上下文请求、时间轴和字幕历史。",
        highlights: [
          { title: "不绑定单一服务商", description: "可以在支持的服务中选择，不必被锁定在一个模型厂商。" },
          { title: "选择具体模型", description: "使用自己的服务商账户，选择其中可用的兼容模型。" },
          { title: "统一字幕流程", description: "无论选择哪个服务商，字幕准备和最终时间轴逻辑保持一致。" },
        ],
        sections: [
          { title: "当前支持的 AI 服务商", paragraphs: ["Beta 公测目前支持 Gemini、DeepSeek、OpenAI、Claude、Qwen 和 Xiaomi MiMo。具体模型能否使用，取决于服务商和你的账户。", "服务商功能、模型名称、额度和价格可能独立变化。添加 API Key 前，应查看对应服务商的最新说明。"] },
          { title: "切换模型会改变什么", paragraphs: ["翻译由所选模型完成，因此用词、术语处理、速度和服务商费用可能不同。VidLingo 会保持外围流程一致：整理字幕碎片、提供必要上下文，并根据原字幕生成时间轴。", "你可以根据语言组合、翻译风格和已有服务商账户选择模型，而不需要重新搭建字幕处理流程。"] },
          { title: "VidLingo 会发送哪些内容", paragraphs: ["生成字幕时，VidLingo 会把字幕文本和相关视频上下文发送给你选择的服务商。保存的 API Key 只用于调用该服务商和模型。", "请勿添加无权使用的凭据。所有模型请求仍受服务商自己的条款、额度和计费规则约束。"] },
        ],
        faqTitle: "AI 服务商常见问题",
        faq: [
          { question: "哪个服务商适合所有视频？", answer: "不存在适合所有语言、主题和账户的唯一选择。请根据实际需求选择模型，并复核重要翻译。" },
          { question: "以后可以切换服务商吗？", answer: "可以。开始下一次翻译前，可以在 API 设置中更新服务商和模型。" },
          { question: "VidLingo 会在模型费用上加价吗？", answer: "Beta 期间不包含模型用量。费用由所选服务商按其价格直接向你的账户收取。" },
        ],
        relatedTitle: "了解完整字幕流程",
        ctaTitle: "使用你已经信任的 AI 服务商",
        ctaDescription: "安装 VidLingo，并使用自己的 API Key 连接支持的服务商。",
      },
      ja: {
        meta: { title: "VidLingo対応AI字幕翻訳プロバイダー", description: "Gemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMoでYouTube字幕を翻訳できます。", keywords: ["AI 字幕 モデル", "Gemini 字幕翻訳", "DeepSeek 字幕翻訳"] },
        shortTitle: "対応AIプロバイダー",
        eyebrow: "モデルを選択",
        title: "6つのAIプロバイダー、1つの字幕ワークフロー",
        introduction: "VidLingoはGemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMoに対応します。プロバイダーとモデルは自分で選び、字幕整理、文脈付きリクエスト、時間、履歴はVidLingoが処理します。",
        highlights: [
          { title: "特定の会社に固定しない", description: "一つのモデル会社に限定されず、対応サービスから選択できます。" },
          { title: "モデル単位で選択", description: "自分のプロバイダーアカウントで利用できる対応モデルを選びます。" },
          { title: "共通の字幕フロー", description: "どのプロバイダーでも字幕準備と最終タイミングの処理は共通です。" },
        ],
        sections: [
          { title: "現在対応しているプロバイダー", paragraphs: ["パブリックベータではGemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMoに対応しています。個別モデルの利用可否はプロバイダーとアカウントによって異なります。", "機能、モデル名、利用上限、料金は各社が変更する場合があります。APIキーを追加する前に最新情報を確認してください。"] },
          { title: "モデルを切り替えると変わること", paragraphs: ["翻訳は選択したモデルが行うため、表現、用語、速度、料金が異なる場合があります。VidLingoは字幕断片の整理、必要な文脈の提供、元字幕に基づく時間計算を共通化します。", "言語、好みの表現、既存アカウントに合わせてモデルを選びながら、字幕作成の流れは維持できます。"] },
          { title: "VidLingoが送信する内容", paragraphs: ["字幕生成では、字幕テキストと関連する動画文脈を選択したプロバイダーへ送ります。保存したAPIキーは、そのプロバイダーとモデルの呼び出しにのみ使われます。", "利用権限のない認証情報は登録しないでください。モデルリクエストには各社の規約、上限、請求が適用されます。"] },
        ],
        faqTitle: "AIプロバイダーのよくある質問",
        faq: [
          { question: "すべての動画に最適なプロバイダーはありますか？", answer: "言語、テーマ、アカウントによって適した選択は変わります。目的に合わせてモデルを選び、重要な翻訳は確認してください。" },
          { question: "後からプロバイダーを変更できますか？", answer: "はい。次の翻訳を始める前に、API設定でプロバイダーとモデルを変更できます。" },
          { question: "モデル料金にVidLingoの上乗せがありますか？", answer: "ベータ中はモデル利用を含みません。選択したプロバイダーが自身の料金に基づき直接請求します。" },
        ],
        relatedTitle: "字幕ワークフローを詳しく見る",
        ctaTitle: "信頼するAIプロバイダーを使う",
        ctaDescription: "VidLingoをインストールし、自分のAPIキーで対応プロバイダーを接続できます。",
      },
    },
  },
  "bring-your-own-api-key": {
    updatedAt: "2026-07-22",
    copy: {
      en: {
        meta: { title: "Bring Your Own AI API Key for Subtitles | VidLingo", description: "Learn how VidLingo's BYOK beta stores your encrypted API key and uses it with the AI provider and model you select.", keywords: ["bring your own API key", "BYOK subtitle translator", "AI API key security"] },
        shortTitle: "Bring your own API key",
        eyebrow: "BYOK explained",
        title: "Your API key, your model, your provider account",
        introduction: "VidLingo uses a bring-your-own-key model during public beta. You connect an API key from a supported AI provider, choose a model, and stay in control of which provider receives translation requests.",
        highlights: [
          { title: "Encrypted at rest", description: "Your API key is encrypted before it is stored by the VidLingo backend." },
          { title: "Limited purpose", description: "The saved key is used to call only the provider and model you selected." },
          { title: "Direct provider billing", description: "Model usage is billed by your provider according to its pricing and account limits." },
        ],
        sections: [
          { title: "What BYOK means in VidLingo", paragraphs: ["BYOK means VidLingo does not choose or bundle a hidden model account for you during beta. You select a supported provider, save a key you are authorized to use, and choose the compatible model used for subtitle translation.", "The website does not ask for your API key. API settings are managed after you sign in through the extension workflow."] },
          { title: "How the saved key is handled", paragraphs: ["The key is encrypted before storage. It is decrypted only when needed to send a translation request to the provider and model you selected, and the settings API does not return the full key after it has been saved.", "Subtitle text and relevant video context are sent to the selected provider because they are required to generate the translation."] },
          { title: "Costs, quotas, and responsible use", paragraphs: ["VidLingo does not promise bundled or free model usage during beta. Your provider may charge for requests, enforce quotas, change model availability, or restrict an account under its own terms.", "Use only credentials you own or are authorized to use. Review provider usage dashboards and remove or rotate a key if you no longer want it used for translation."] },
        ],
        faqTitle: "BYOK and API key FAQ",
        faq: [
          { question: "Do I enter an API key on this website?", answer: "No. The public website does not collect an account or API key. API settings are managed in the signed-in extension workflow." },
          { question: "Can VidLingo show my full saved key?", answer: "No. After a key is saved, the settings API does not return the complete credential." },
          { question: "Who charges for model usage?", answer: "The AI provider connected to your key charges your provider account according to its own pricing and limits." },
        ],
        relatedTitle: "Related security and setup pages",
        ctaTitle: "Connect a provider when you are ready",
        ctaDescription: "Install the beta and add your API key through the signed-in VidLingo extension workflow.",
      },
      zh: {
        meta: { title: "自备 AI API Key 的字幕翻译方式｜VidLingo", description: "了解 VidLingo Beta 如何加密保存你的 API Key，并仅用于调用你选择的 AI 服务商和模型。", keywords: ["自备 API Key", "BYOK 字幕翻译", "AI API Key 安全"] },
        shortTitle: "自备 API Key",
        eyebrow: "说明 BYOK",
        title: "你的 API Key、你的模型、你的服务商账户",
        introduction: "VidLingo Beta 采用自备 API Key 的方式。你连接支持的 AI 服务商、选择模型，并决定由哪个服务商接收字幕翻译请求。",
        highlights: [
          { title: "加密保存", description: "API Key 在 VidLingo 后端保存前会被加密。" },
          { title: "限定用途", description: "保存的 Key 只用于调用你选择的服务商和模型。" },
          { title: "服务商直接计费", description: "模型用量由服务商根据其价格和账户额度直接计费。" },
        ],
        sections: [
          { title: "VidLingo 中的 BYOK 是什么", paragraphs: ["BYOK 表示 Beta 期间 VidLingo 不替你选择或捆绑隐藏的模型账户。你选择支持的服务商，保存自己有权使用的 API Key，再选择用于字幕翻译的兼容模型。", "官网不会要求你输入 API Key。登录后，API 设置通过扩展内的流程进行管理。"] },
          { title: "保存后的 API Key 如何处理", paragraphs: ["API Key 保存前会被加密。只有在向你选择的服务商和模型发送翻译请求时才会解密；保存完成后，设置接口不会返回完整 Key。", "由于生成翻译需要，字幕文本和相关视频上下文会发送给你选择的服务商。"] },
          { title: "费用、额度与合理使用", paragraphs: ["VidLingo 在 Beta 期间不承诺内置或免费的模型用量。服务商可能按请求收费、设置额度、调整模型可用性，或根据自身条款限制账户。", "只能使用自己拥有或已获授权的凭据。建议查看服务商用量记录；不再使用时，可以移除或轮换 API Key。"] },
        ],
        faqTitle: "BYOK 与 API Key 常见问题",
        faq: [
          { question: "需要在这个官网输入 API Key 吗？", answer: "不需要。公开官网不收集账号或 API Key，API 设置在登录后的扩展流程中管理。" },
          { question: "VidLingo 可以再次显示完整 Key 吗？", answer: "不可以。保存后，设置接口不会返回完整凭据。" },
          { question: "模型费用由谁收取？", answer: "与你的 Key 对应的 AI 服务商会根据自身价格和额度向你的服务商账户收取。" },
        ],
        relatedTitle: "相关安全与设置页面",
        ctaTitle: "准备好后再连接你的服务商",
        ctaDescription: "安装 Beta 版，并在登录后的 VidLingo 扩展流程中添加 API Key。",
      },
      ja: {
        meta: { title: "自分のAI APIキーで字幕翻訳する方法 | VidLingo", description: "VidLingoベータがAPIキーを暗号化し、選択したAIプロバイダーとモデルだけに使う仕組みを説明します。", keywords: ["自分の API キー", "BYOK 字幕翻訳", "AI API キー セキュリティ"] },
        shortTitle: "自分のAPIキーを使用",
        eyebrow: "BYOKの仕組み",
        title: "自分のAPIキー、モデル、プロバイダーアカウント",
        introduction: "VidLingoのパブリックベータはBYOK方式です。対応AIプロバイダーのAPIキーを接続し、モデルを選び、どの会社へ翻訳リクエストを送るかを自分で管理します。",
        highlights: [
          { title: "暗号化して保存", description: "APIキーはVidLingoバックエンドに保存される前に暗号化されます。" },
          { title: "目的を限定", description: "保存したキーは選択したプロバイダーとモデルの呼び出しだけに使われます。" },
          { title: "プロバイダーから直接請求", description: "モデル利用は各社の料金とアカウント上限に基づいて請求されます。" },
        ],
        sections: [
          { title: "VidLingoにおけるBYOKとは", paragraphs: ["BYOKとは、ベータ中にVidLingoが非公開のモデルアカウントを選択、同梱しない方式です。対応プロバイダーを選び、利用権限のあるAPIキーを保存し、字幕翻訳に使うモデルを選びます。", "公開WebサイトでAPIキーの入力を求めることはありません。API設定はログイン後の拡張機能フローで管理します。"] },
          { title: "保存したAPIキーの扱い", paragraphs: ["APIキーは保存前に暗号化されます。選択したプロバイダーとモデルへ翻訳リクエストを送る際にのみ復号し、保存後に設定APIから完全なキーを返すことはありません。", "翻訳生成に必要なため、字幕テキストと関連する動画文脈は選択したプロバイダーへ送信されます。"] },
          { title: "料金、上限、適切な利用", paragraphs: ["ベータ中、VidLingoはモデルの無料利用や同梱を約束しません。プロバイダーは自身の規約に基づいて料金、上限、モデル提供、アカウント制限を変更できます。", "自分が所有するか、利用を許可された認証情報だけを登録してください。利用状況を確認し、不要になったキーは削除または更新してください。"] },
        ],
        faqTitle: "BYOKとAPIキーのよくある質問",
        faq: [
          { question: "このWebサイトにAPIキーを入力しますか？", answer: "いいえ。公開WebサイトはアカウントやAPIキーを収集しません。API設定はログイン後の拡張機能で管理します。" },
          { question: "保存済みの完全なキーを再表示できますか？", answer: "できません。保存後、設定APIは完全な認証情報を返しません。" },
          { question: "モデル利用料金は誰が請求しますか？", answer: "APIキーを発行したAIプロバイダーが、自身の料金と上限に従ってプロバイダーアカウントへ請求します。" },
        ],
        relatedTitle: "関連するセキュリティと設定",
        ctaTitle: "準備ができたらプロバイダーを接続",
        ctaDescription: "ベータ版をインストールし、ログイン後のVidLingo拡張機能でAPIキーを追加します。",
      },
    },
  },
} satisfies Record<SeoPageSlug, SeoPageDefinition>;
