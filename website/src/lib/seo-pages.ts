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
    updatedAt: "2026-10-31",
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
        introduction: "VidLingo is a Mac app with a Chrome extension that translates existing YouTube captions with the AI provider you choose. It uses video context, rebuilds fragmented captions, and keeps timing readable instead of replacing words line by line.",
        highlights: [
          { title: "Context-aware", description: "Uses the video title, channel, description, and nearby dialogue to understand terms and intent." },
          { title: "Readable timing", description: "Cleans source captions first, then derives timing from the cleaned subtitle track." },
          { title: "Your AI provider", description: "Connect Gemini, DeepSeek, OpenAI, Claude, Qwen, Xiaomi MiMo, or a compatible custom endpoint with your own API key." },
        ],
        sections: [
          { title: "Translate meaning, not isolated fragments", paragraphs: ["YouTube auto-captions often split one thought across several lines. Translating those fragments separately produces awkward wording and unstable subtitles.", "VidLingo groups related caption fragments before translation and includes useful video context in the request. This gives the selected AI model a better chance to preserve names, technical terms, tone, and the relationship between nearby sentences."] },
          { title: "Keep subtitles comfortable to read", paragraphs: ["Translation quality is only useful when viewers can follow it. VidLingo builds the final timeline from cleaned source captions rather than asking an AI model to invent timestamps.", "Completed subtitles load over the YouTube player and are saved in the subtitle history on your Mac."] },
          { title: "A transparent BYOK workflow", paragraphs: ["During the public beta, VidLingo does not include model usage. You provide an API key for a supported provider, choose a model, and the provider bills your account according to its own terms.", "Your key is stored in the macOS Keychain and used only to call the provider and model you selected."] },
        ],
        faqTitle: "YouTube subtitle translator FAQ",
        faq: [
          { question: "Can VidLingo translate a video without captions?", answer: "Not during the current beta. The YouTube video must have an available caption track; audio transcription is not supported yet." },
          { question: "Does VidLingo replace YouTube's captions?", answer: "No. It generates a separate translated subtitle result and loads it over the player without modifying the original video." },
          { question: "Do I need to choose an AI model?", answer: "Yes. You select a supported provider and model, then use your own API key for translation." },
        ],
        relatedTitle: "Learn more about VidLingo",
        ctaTitle: "Translate your next YouTube video with better subtitles",
        ctaDescription: "Download the Mac app, connect your preferred AI provider, and start from a video with captions.",
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
        introduction: "VidLingo 由 Mac 应用和 Chrome 插件组成，可使用你选择的 AI 服务商翻译 YouTube 已有字幕。它会结合视频上下文、重新整理破碎字幕，并保持易读的时间轴，而不是逐行生硬替换单词。",
        highlights: [
          { title: "理解上下文", description: "结合视频标题、频道、简介和前后对话理解术语与表达意图。" },
          { title: "字幕更易读", description: "先清理原字幕，再根据清理结果生成稳定的字幕时间轴。" },
          { title: "自由选择模型", description: "使用自己的 API Key 连接 Gemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMo 或兼容的自定义接口。" },
        ],
        sections: [
          { title: "翻译完整意思，而不是字幕碎片", paragraphs: ["YouTube 自动字幕经常把一句话拆成多段。如果逐段直接翻译，很容易出现语序生硬、上下句脱节和术语不一致。", "VidLingo 会先整理相关字幕片段，并把必要的视频信息交给你选择的 AI 模型，帮助模型正确处理人名、专业词汇、语气和前后句关系。"] },
          { title: "让翻译结果真正适合观看", paragraphs: ["只有翻译正确还不够，字幕还需要在合适的时间出现。VidLingo 根据清理后的原字幕计算最终时间，不让 AI 模型自由编造时间戳。", "生成完成后，字幕会加载到 YouTube 播放器上，并保存在你 Mac 上的字幕历史中，可以再次使用。"] },
          { title: "透明的 BYOK 使用方式", paragraphs: ["Beta 公测期间，VidLingo 不提供内置模型额度。你需要选择支持的服务商和模型，并提供自己的 API Key，调用费用由服务商按其规则直接收取。", "API Key 保存在 macOS 钥匙串，只用于调用你选择的服务商和模型。"] },
        ],
        faqTitle: "YouTube 字幕翻译常见问题",
        faq: [
          { question: "没有字幕的 YouTube 视频可以翻译吗？", answer: "当前 Beta 版不支持。视频必须存在可用的字幕轨道，目前还不提供音频转写。" },
          { question: "VidLingo 会修改视频原字幕吗？", answer: "不会。VidLingo 会生成独立的翻译结果并加载到播放器上，不会修改原视频。" },
          { question: "必须自己选择 AI 模型吗？", answer: "是的。你需要选择支持的服务商和模型，并使用自己的 API Key 发起翻译。" },
        ],
        relatedTitle: "继续了解 VidLingo",
        ctaTitle: "用更自然的字幕看下一个 YouTube 视频",
        ctaDescription: "下载 Mac 版，连接你信任的 AI 服务商，然后打开一个已有字幕的视频。",
      },
      ja: {
        meta: {
          title: "YouTube AI字幕翻訳 Macアプリ + Chrome拡張機能 | VidLingo",
          description: "自分のAPIキーでGemini、DeepSeek、OpenAI、Claude、Qwen、MiMoを使い、YouTube字幕を自然に翻訳します。",
          keywords: ["YouTube 字幕 翻訳", "字幕翻訳 拡張機能", "AI 字幕翻訳"],
        },
        shortTitle: "AI字幕翻訳",
        eyebrow: "YouTubeのためのAI字幕",
        title: "視聴のために作られたYouTube字幕翻訳",
        introduction: "VidLingoは、選択したAIプロバイダーで既存のYouTube字幕を翻訳するMacアプリとChrome拡張機能です。単語を行ごとに置き換えるのではなく、動画の文脈を使い、断片的な字幕を再構成して読みやすいタイミングを保ちます。",
        highlights: [
          { title: "文脈を理解", description: "動画タイトル、チャンネル、概要、前後の会話から用語と意図を読み取ります。" },
          { title: "読みやすいタイミング", description: "元字幕を整理してから、その結果を基準に字幕の時間を決めます。" },
          { title: "モデルを自分で選択", description: "自分のAPIキーでGemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMo、互換のカスタムエンドポイントを利用できます。" },
        ],
        sections: [
          { title: "断片ではなく、文全体の意味を翻訳", paragraphs: ["YouTubeの自動字幕は、一つの発言を複数行に分割することがあります。そのまま個別に翻訳すると、不自然な語順や用語のずれが生まれます。", "VidLingoは関連する字幕を先に整理し、必要な動画情報と一緒に選択したAIモデルへ送ります。人名、専門用語、話し方、前後のつながりを保ちやすくなります。"] },
          { title: "実際に読める字幕を作る", paragraphs: ["翻訳が正しくても、表示時間が不安定では視聴しにくくなります。VidLingoはAIに時間を作らせず、整理した元字幕から最終タイミングを計算します。", "完成した字幕はYouTubeプレーヤー上に表示され、Mac上の字幕履歴にも保存されます。"] },
          { title: "透明なBYOKワークフロー", paragraphs: ["パブリックベータではモデル利用枠を提供しません。対応プロバイダーとモデルを選び、自分のAPIキーを登録します。料金はプロバイダーから直接請求されます。", "APIキーはmacOSのキーチェーンに保存され、選択したプロバイダーとモデルの呼び出しにのみ使われます。"] },
        ],
        faqTitle: "YouTube字幕翻訳のよくある質問",
        faq: [
          { question: "字幕がない動画も翻訳できますか？", answer: "現在のベータではできません。利用可能なYouTube字幕トラックが必要で、音声文字起こしにはまだ対応していません。" },
          { question: "元のYouTube字幕は変更されますか？", answer: "変更されません。独立した翻訳結果を生成し、プレーヤー上に表示します。" },
          { question: "AIモデルを自分で選ぶ必要がありますか？", answer: "はい。対応プロバイダーとモデルを選び、自分のAPIキーを使用します。" },
        ],
        relatedTitle: "VidLingoについて詳しく見る",
        ctaTitle: "次のYouTube動画を、より自然な字幕で",
        ctaDescription: "Mac版をダウンロードし、利用するAIプロバイダーを接続して、字幕のある動画を開いてください。",
      },
    },
  },
  "how-to-translate-youtube-subtitles": {
    updatedAt: "2026-10-31",
    copy: {
      en: {
        meta: { title: "How to Translate YouTube Subtitles with AI | VidLingo", description: "A practical three-step guide to translating existing YouTube captions with the VidLingo Mac app, Chrome extension, and your own AI API key.", keywords: ["how to translate YouTube subtitles", "translate YouTube captions", "YouTube subtitle Chrome extension"] },
        shortTitle: "How to translate subtitles",
        eyebrow: "Three-step guide",
        title: "How to translate YouTube subtitles with your own AI model",
        introduction: "VidLingo turns an existing YouTube caption track into a more natural translated track. Setup takes three steps: prepare the Mac app, connect the Chrome extension, then translate on YouTube.",
        highlights: [
          { title: "1. Set up", description: "Download the Mac app and add your AI provider, model, and API key." },
          { title: "2. Connect", description: "Load the bundled Chrome extension and click Connect to Mac app." },
          { title: "3. Translate", description: "Open a captioned YouTube video and click the VidLingo button in the player." },
        ],
        sections: [
          { title: "Step 1: install the Mac app and set up a model", paragraphs: ["Download and open the VidLingo Mac app. In AI Model, choose a preset provider (DeepSeek, Gemini, OpenAI, Claude, Qwen, or Xiaomi MiMo) or enter a custom base URL and API protocol, then add a key you are authorized to use and a model name, and click Save & Apply.", "Your key is stored in the macOS Keychain. Model requests use your provider account and are subject to that provider's pricing and limits."] },
          { title: "Step 2: load and connect the Chrome extension", paragraphs: ["On the app's Chrome Extension page, click Open bundled extension folder. In Chrome's extensions page, turn on Developer mode and load that folder.", "Open the extension settings and click Connect to Mac app once. No account or sign-in is needed. Keep the Mac app running while you watch."] },
          { title: "Step 3: open a video with captions and translate", paragraphs: ["Open a YouTube video with an available caption track and click the VidLingo button in the player. VidLingo cleans fragmented source captions, sends the relevant text and context to the selected model, and creates a translated track with timing derived from the cleaned source.", "Videos with no captions cannot be translated in the current beta because VidLingo does not transcribe audio. Completed subtitles are saved on your Mac; review important names and technical terms."] },
        ],
        faqTitle: "Translation setup FAQ",
        faq: [
          { question: "Which source caption is used?", answer: "By default VidLingo prefers YouTube's auto-generated captions. You can switch Source captions to prefer uploaded captions in the player settings; if the preferred type is missing, the other one is used." },
          { question: "Will translation start automatically?", answer: "Not by default. Click the VidLingo button in the player, or turn on Auto-translate in the player panel to start automatically on captioned videos." },
          { question: "Can I reuse a completed subtitle?", answer: "Yes. When you reopen a translated video, the subtitles saved on your Mac load again, and you can browse them in the Mac app's history." },
        ],
        relatedTitle: "Related VidLingo guides",
        ctaTitle: "Ready to translate a captioned video?",
        ctaDescription: "Download the Mac app, connect your model, and generate a subtitle track when you are ready.",
      },
      zh: {
        meta: { title: "如何用 AI 翻译 YouTube 字幕｜VidLingo", description: "三步用 VidLingo Mac 应用、Chrome 插件和你自己的 AI API Key，把已有的 YouTube 字幕翻译成更自然、易读的字幕。", keywords: ["如何翻译 YouTube 字幕", "翻译 YouTube 字幕", "YouTube 字幕插件"] },
        shortTitle: "如何翻译 YouTube 字幕",
        eyebrow: "三步使用指南",
        title: "如何用自己的 AI 模型翻译 YouTube 字幕",
        introduction: "VidLingo 会把 YouTube 已有的字幕轨道整理并翻译成更自然的新字幕。整个过程分为三步：准备 Mac 应用、连接 Chrome 插件，然后在 YouTube 上翻译。",
        highlights: [
          { title: "1. 准备", description: "下载 Mac 应用，填入 AI 服务商、模型和 API Key。" },
          { title: "2. 连接", description: "加载应用内置的 Chrome 插件，点「连接本机应用」。" },
          { title: "3. 翻译", description: "打开有字幕的 YouTube 视频，点播放器里的 VidLingo 按钮。" },
        ],
        sections: [
          { title: "第一步：安装 Mac 应用并配置模型", paragraphs: ["下载并打开 VidLingo Mac 应用。在「AI 模型」中选择预设服务商（DeepSeek、Gemini、OpenAI、Claude、通义千问或小米 MiMo），或填写自定义 Base URL 和接口协议；再填入你有权使用的 API Key 和模型名称，点「保存并应用」。", "API Key 保存在 macOS 钥匙串。模型请求使用你的服务商账户，并受该服务商价格和额度限制。"] },
          { title: "第二步：加载并连接 Chrome 插件", paragraphs: ["在应用的「Chrome 插件」页点「打开内置插件目录」，在 Chrome 的扩展程序页面开启开发者模式，加载这个目录。", "打开插件设置页，点一次「连接本机应用」即可，不需要注册或登录。看视频时请保持 Mac 应用运行。"] },
          { title: "第三步：打开有字幕的视频并翻译", paragraphs: ["进入一个存在可用字幕轨道的 YouTube 视频，点播放器里的 VidLingo 按钮。VidLingo 会整理破碎的原字幕，把必要文本和上下文发送给你选择的模型，再根据整理后的原字幕生成翻译时间轴。", "当前 Beta 版不提供音频转写，没有字幕轨道的视频暂时不能翻译。完成的字幕会保存在你的 Mac 上；建议复核重要人名和专业术语。"] },
        ],
        faqTitle: "翻译设置常见问题",
        faq: [
          { question: "使用哪一种原字幕？", answer: "VidLingo 默认优先使用 YouTube 自动生成的字幕，也可以在播放器设置的「原文字幕来源」中改为作者上传优先；缺少首选类型时会自动改用另一种。" },
          { question: "翻译会自动开始吗？", answer: "默认不会，需要点播放器里的 VidLingo 按钮。也可以在播放器面板中打开「自动翻译」，之后打开有字幕的视频会自动开始。" },
          { question: "完成的字幕可以再次使用吗？", answer: "可以。翻译过的视频再次打开时，会加载保存在你 Mac 上的字幕，也可以在 Mac 应用的历史记录中查看。" },
        ],
        relatedTitle: "相关 VidLingo 指南",
        ctaTitle: "准备好翻译一个已有字幕的视频了吗？",
        ctaDescription: "下载 Mac 版，连接你的模型，需要时再生成字幕。",
      },
      ja: {
        meta: { title: "AIでYouTube字幕を翻訳する方法 | VidLingo", description: "VidLingoのMacアプリ、Chrome拡張機能、自分のAI APIキーを使い、既存のYouTube字幕を3ステップで自然に翻訳する方法。", keywords: ["YouTube 字幕 翻訳 方法", "YouTube 字幕を翻訳", "YouTube 字幕 拡張機能"] },
        shortTitle: "YouTube字幕の翻訳方法",
        eyebrow: "3ステップガイド",
        title: "自分のAIモデルでYouTube字幕を翻訳する方法",
        introduction: "VidLingoは、既存のYouTube字幕トラックを整理し、より自然な翻訳字幕を作ります。Macアプリを準備し、Chrome拡張機能を接続し、YouTubeで翻訳する3ステップです。",
        highlights: [
          { title: "1. 準備", description: "Macアプリをダウンロードし、AIプロバイダー、モデル、APIキーを設定します。" },
          { title: "2. 接続", description: "内蔵のChrome拡張機能を読み込み、「Macアプリに接続」をクリックします。" },
          { title: "3. 翻訳", description: "字幕のあるYouTube動画を開き、プレーヤーのVidLingoボタンをクリックします。" },
        ],
        sections: [
          { title: "ステップ1：Macアプリを入れてモデルを設定", paragraphs: ["VidLingoのMacアプリをダウンロードして開きます。「AIモデル」でプリセットのプロバイダー（DeepSeek、Gemini、OpenAI、Claude、Qwen、Xiaomi MiMo）を選ぶか、カスタムのBase URLとAPIプロトコルを入力し、利用権限のあるAPIキーとモデル名を入れて「保存して適用」をクリックします。", "APIキーはmacOSのキーチェーンに保存されます。モデル利用は各プロバイダーの料金と制限に従います。"] },
          { title: "ステップ2：Chrome拡張機能を読み込んで接続", paragraphs: ["アプリの「Chrome拡張機能」ページで「内蔵フォルダを開く」をクリックし、Chromeの拡張機能ページでデベロッパーモードをオンにしてそのフォルダを読み込みます。", "拡張機能の設定で「Macアプリに接続」を一度クリックすれば完了です。アカウント登録やログインは不要です。視聴中はMacアプリを起動したままにしてください。"] },
          { title: "ステップ3：字幕のある動画を開いて翻訳", paragraphs: ["利用可能な字幕トラックがあるYouTube動画を開き、プレーヤーのVidLingoボタンをクリックします。VidLingoは断片的な元字幕を整理し、必要なテキストと文脈を選択したモデルへ送り、整理済み字幕から時間を計算します。", "現在のベータは音声文字起こしに対応していないため、字幕がない動画は翻訳できません。完成した字幕はMacに保存されます。重要な名前や専門用語は確認してください。"] },
        ],
        faqTitle: "翻訳設定のよくある質問",
        faq: [
          { question: "どの元字幕が使われますか？", answer: "既定ではYouTubeの自動生成字幕を優先します。プレーヤー設定の「元字幕のソース」で投稿者の字幕を優先に変更でき、優先する種類がない場合はもう一方を使います。" },
          { question: "翻訳は自動で始まりますか？", answer: "既定では始まりません。プレーヤーのVidLingoボタンをクリックするか、プレーヤーパネルで「自動翻訳」をオンにすると、字幕のある動画で自動的に始まります。" },
          { question: "完成した字幕を再利用できますか？", answer: "はい。翻訳済みの動画を開き直すとMacに保存された字幕が読み込まれ、Macアプリの履歴からも確認できます。" },
        ],
        relatedTitle: "関連するVidLingoガイド",
        ctaTitle: "字幕のある動画を翻訳してみませんか？",
        ctaDescription: "Mac版をダウンロードし、モデルを接続して、必要なときに字幕を生成できます。",
      },
    },
  },
  "ai-providers": {
    updatedAt: "2026-10-31",
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
          { title: "Currently supported providers", paragraphs: ["The public beta includes presets for Gemini, DeepSeek, OpenAI, Claude, Qwen, and Xiaomi MiMo. You can also enter a custom base URL and API protocol to use a proxy, self-hosted gateway, or other compatible service. Availability of individual models depends on the provider and your account.", "Provider features, model names, quotas, and pricing may change independently of VidLingo. Check the provider's current documentation before adding a key."] },
          { title: "What changes when you switch models", paragraphs: ["The selected model produces the translation, so wording, terminology, speed, and provider cost can differ. VidLingo keeps the surrounding workflow consistent: it cleans caption fragments, supplies relevant context, and derives timing from the source track.", "This makes it easier to choose a model based on your language pair, preferred style, and provider account rather than rebuilding the subtitle process."] },
          { title: "What VidLingo sends", paragraphs: ["To generate subtitles, VidLingo sends the caption text and relevant video context to the provider you selected. The saved API key is used only for that selected provider and model.", "Do not add a credential you are not authorized to use. Provider requests remain subject to the provider's own terms, quotas, and billing."] },
        ],
        faqTitle: "AI provider FAQ",
        faq: [
          { question: "Which provider is best for every video?", answer: "There is no single best choice for every language, topic, or account. Select a model based on your needs and review important translations." },
          { question: "Can I change providers later?", answer: "Yes. Change the provider and model in the Mac app's AI Model settings and click Save & Apply before your next translation." },
          { question: "Does VidLingo add a model markup?", answer: "No model usage is bundled during beta. Your selected provider bills your account directly under its own pricing." },
        ],
        relatedTitle: "Understand the full workflow",
        ctaTitle: "Use the AI provider you already trust",
        ctaDescription: "Download the Mac app and connect one of the supported providers with your own API key.",
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
          { title: "当前支持的 AI 服务商", paragraphs: ["Beta 公测预设了 Gemini、DeepSeek、OpenAI、Claude、Qwen 和 Xiaomi MiMo，也可以填写自定义 Base URL 和接口协议，接入代理、自建网关或其他兼容服务。具体模型能否使用，取决于服务商和你的账户。", "服务商功能、模型名称、额度和价格可能独立变化。添加 API Key 前，应查看对应服务商的最新说明。"] },
          { title: "切换模型会改变什么", paragraphs: ["翻译由所选模型完成，因此用词、术语处理、速度和服务商费用可能不同。VidLingo 会保持外围流程一致：整理字幕碎片、提供必要上下文，并根据原字幕生成时间轴。", "你可以根据语言组合、翻译风格和已有服务商账户选择模型，而不需要重新搭建字幕处理流程。"] },
          { title: "VidLingo 会发送哪些内容", paragraphs: ["生成字幕时，VidLingo 会把字幕文本和相关视频上下文发送给你选择的服务商。保存的 API Key 只用于调用该服务商和模型。", "请勿添加无权使用的凭据。所有模型请求仍受服务商自己的条款、额度和计费规则约束。"] },
        ],
        faqTitle: "AI 服务商常见问题",
        faq: [
          { question: "哪个服务商适合所有视频？", answer: "不存在适合所有语言、主题和账户的唯一选择。请根据实际需求选择模型，并复核重要翻译。" },
          { question: "以后可以切换服务商吗？", answer: "可以。在 Mac 应用的「AI 模型」中更换服务商和模型，点「保存并应用」后，下一次翻译就会使用新设置。" },
          { question: "VidLingo 会在模型费用上加价吗？", answer: "Beta 期间不包含模型用量。费用由所选服务商按其价格直接向你的账户收取。" },
        ],
        relatedTitle: "了解完整字幕流程",
        ctaTitle: "使用你已经信任的 AI 服务商",
        ctaDescription: "下载 Mac 版，并使用自己的 API Key 连接支持的服务商。",
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
          { title: "現在対応しているプロバイダー", paragraphs: ["パブリックベータではGemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMoのプリセットがあり、カスタムのBase URLとAPIプロトコルを入力して、プロキシや自前のゲートウェイ、互換サービスも使えます。個別モデルの利用可否はプロバイダーとアカウントによって異なります。", "機能、モデル名、利用上限、料金は各社が変更する場合があります。APIキーを追加する前に最新情報を確認してください。"] },
          { title: "モデルを切り替えると変わること", paragraphs: ["翻訳は選択したモデルが行うため、表現、用語、速度、料金が異なる場合があります。VidLingoは字幕断片の整理、必要な文脈の提供、元字幕に基づく時間計算を共通化します。", "言語、好みの表現、既存アカウントに合わせてモデルを選びながら、字幕作成の流れは維持できます。"] },
          { title: "VidLingoが送信する内容", paragraphs: ["字幕生成では、字幕テキストと関連する動画文脈を選択したプロバイダーへ送ります。保存したAPIキーは、そのプロバイダーとモデルの呼び出しにのみ使われます。", "利用権限のない認証情報は登録しないでください。モデルリクエストには各社の規約、上限、請求が適用されます。"] },
        ],
        faqTitle: "AIプロバイダーのよくある質問",
        faq: [
          { question: "すべての動画に最適なプロバイダーはありますか？", answer: "言語、テーマ、アカウントによって適した選択は変わります。目的に合わせてモデルを選び、重要な翻訳は確認してください。" },
          { question: "後からプロバイダーを変更できますか？", answer: "はい。Macアプリの「AIモデル」でプロバイダーとモデルを変更し、「保存して適用」をクリックすると、次の翻訳から反映されます。" },
          { question: "モデル料金にVidLingoの上乗せがありますか？", answer: "ベータ中はモデル利用を含みません。選択したプロバイダーが自身の料金に基づき直接請求します。" },
        ],
        relatedTitle: "字幕ワークフローを詳しく見る",
        ctaTitle: "信頼するAIプロバイダーを使う",
        ctaDescription: "Mac版をダウンロードし、自分のAPIキーで対応プロバイダーを接続できます。",
      },
    },
  },
  "bring-your-own-api-key": {
    updatedAt: "2026-10-31",
    copy: {
      en: {
        meta: { title: "Bring Your Own AI API Key for Subtitles | VidLingo", description: "Learn how VidLingo's BYOK beta keeps your API key in the macOS Keychain and uses it only with the AI provider and model you select.", keywords: ["bring your own API key", "BYOK subtitle translator", "AI API key security"] },
        shortTitle: "Bring your own API key",
        eyebrow: "BYOK explained",
        title: "Your API key, your model, your provider account",
        introduction: "VidLingo uses a bring-your-own-key model during public beta. You connect an API key from a supported AI provider, choose a model, and stay in control of which provider receives translation requests.",
        highlights: [
          { title: "Kept in your Keychain", description: "Your API key is stored in the macOS Keychain on your Mac, not on a VidLingo server." },
          { title: "Limited purpose", description: "The saved key is used to call only the provider and model you selected." },
          { title: "Direct provider billing", description: "Model usage is billed by your provider according to its pricing and account limits." },
        ],
        sections: [
          { title: "What BYOK means in VidLingo", paragraphs: ["BYOK means VidLingo does not choose or bundle a hidden model account for you during beta. You select a supported provider, save a key you are authorized to use, and choose the compatible model used for subtitle translation.", "The website does not ask for your API key. You enter it in the VidLingo Mac app."] },
          { title: "How the saved key is handled", paragraphs: ["The key is stored in the macOS Keychain and read only when the app sends a translation request to the provider and model you selected. It is never sent to VidLingo.", "Subtitle text and relevant video context are sent to the selected provider because they are required to generate the translation."] },
          { title: "Costs, quotas, and responsible use", paragraphs: ["VidLingo does not promise bundled or free model usage during beta. Your provider may charge for requests, enforce quotas, change model availability, or restrict an account under its own terms.", "Use only credentials you own or are authorized to use. Review provider usage dashboards and remove or rotate a key if you no longer want it used for translation."] },
        ],
        faqTitle: "BYOK and API key FAQ",
        faq: [
          { question: "Do I enter an API key on this website?", answer: "No. The public website does not collect an account or API key. You enter the key in the VidLingo Mac app." },
          { question: "Can I change or remove my key?", answer: "Yes. Replace it in the Mac app at any time, or delete the VidLingo entry in Keychain Access." },
          { question: "Who charges for model usage?", answer: "The AI provider connected to your key charges your provider account according to its own pricing and limits." },
        ],
        relatedTitle: "Related security and setup pages",
        ctaTitle: "Connect a provider when you are ready",
        ctaDescription: "Download the Mac app and add your API key in its AI Model settings.",
      },
      zh: {
        meta: { title: "自备 AI API Key 的字幕翻译方式｜VidLingo", description: "了解 VidLingo Beta 如何把你的 API Key 保存在 macOS 钥匙串，并仅用于调用你选择的 AI 服务商和模型。", keywords: ["自备 API Key", "BYOK 字幕翻译", "AI API Key 安全"] },
        shortTitle: "自备 API Key",
        eyebrow: "说明 BYOK",
        title: "你的 API Key、你的模型、你的服务商账户",
        introduction: "VidLingo Beta 采用自备 API Key 的方式。你连接支持的 AI 服务商、选择模型，并决定由哪个服务商接收字幕翻译请求。",
        highlights: [
          { title: "保存在钥匙串", description: "API Key 保存在你 Mac 的钥匙串中，不在 VidLingo 的服务器上。" },
          { title: "限定用途", description: "保存的 Key 只用于调用你选择的服务商和模型。" },
          { title: "服务商直接计费", description: "模型用量由服务商根据其价格和账户额度直接计费。" },
        ],
        sections: [
          { title: "VidLingo 中的 BYOK 是什么", paragraphs: ["BYOK 表示 Beta 期间 VidLingo 不替你选择或捆绑隐藏的模型账户。你选择支持的服务商，保存自己有权使用的 API Key，再选择用于字幕翻译的兼容模型。", "官网不会要求你输入 API Key，你只需要在 VidLingo Mac 应用中填写。"] },
          { title: "保存后的 API Key 如何处理", paragraphs: ["API Key 保存在 macOS 钥匙串，只在应用向你选择的服务商和模型发送翻译请求时读取，不会发送给 VidLingo。", "由于生成翻译需要，字幕文本和相关视频上下文会发送给你选择的服务商。"] },
          { title: "费用、额度与合理使用", paragraphs: ["VidLingo 在 Beta 期间不承诺内置或免费的模型用量。服务商可能按请求收费、设置额度、调整模型可用性，或根据自身条款限制账户。", "只能使用自己拥有或已获授权的凭据。建议查看服务商用量记录；不再使用时，可以移除或轮换 API Key。"] },
        ],
        faqTitle: "BYOK 与 API Key 常见问题",
        faq: [
          { question: "需要在这个官网输入 API Key 吗？", answer: "不需要。公开官网不收集账号或 API Key，Key 在 VidLingo Mac 应用中填写。" },
          { question: "可以更换或删除 API Key 吗？", answer: "可以。随时在 Mac 应用中更换，或在「钥匙串访问」中删除 VidLingo 的条目。" },
          { question: "模型费用由谁收取？", answer: "与你的 Key 对应的 AI 服务商会根据自身价格和额度向你的服务商账户收取。" },
        ],
        relatedTitle: "相关安全与设置页面",
        ctaTitle: "准备好后再连接你的服务商",
        ctaDescription: "下载 Mac 版，在应用的「AI 模型」中添加 API Key。",
      },
      ja: {
        meta: { title: "自分のAI APIキーで字幕翻訳する方法 | VidLingo", description: "VidLingoベータがAPIキーをmacOSのキーチェーンに保存し、選択したAIプロバイダーとモデルだけに使う仕組みを説明します。", keywords: ["自分の API キー", "BYOK 字幕翻訳", "AI API キー セキュリティ"] },
        shortTitle: "自分のAPIキーを使用",
        eyebrow: "BYOKの仕組み",
        title: "自分のAPIキー、モデル、プロバイダーアカウント",
        introduction: "VidLingoのパブリックベータはBYOK方式です。対応AIプロバイダーのAPIキーを接続し、モデルを選び、どの会社へ翻訳リクエストを送るかを自分で管理します。",
        highlights: [
          { title: "キーチェーンに保存", description: "APIキーはMacのキーチェーンに保存され、VidLingoのサーバーには保存されません。" },
          { title: "目的を限定", description: "保存したキーは選択したプロバイダーとモデルの呼び出しだけに使われます。" },
          { title: "プロバイダーから直接請求", description: "モデル利用は各社の料金とアカウント上限に基づいて請求されます。" },
        ],
        sections: [
          { title: "VidLingoにおけるBYOKとは", paragraphs: ["BYOKとは、ベータ中にVidLingoが非公開のモデルアカウントを選択、同梱しない方式です。対応プロバイダーを選び、利用権限のあるAPIキーを保存し、字幕翻訳に使うモデルを選びます。", "公開WebサイトでAPIキーの入力を求めることはありません。キーはVidLingoのMacアプリで入力します。"] },
          { title: "保存したAPIキーの扱い", paragraphs: ["APIキーはmacOSのキーチェーンに保存され、選択したプロバイダーとモデルへ翻訳リクエストを送るときだけ読み取られます。VidLingoに送信されることはありません。", "翻訳生成に必要なため、字幕テキストと関連する動画文脈は選択したプロバイダーへ送信されます。"] },
          { title: "料金、上限、適切な利用", paragraphs: ["ベータ中、VidLingoはモデルの無料利用や同梱を約束しません。プロバイダーは自身の規約に基づいて料金、上限、モデル提供、アカウント制限を変更できます。", "自分が所有するか、利用を許可された認証情報だけを登録してください。利用状況を確認し、不要になったキーは削除または更新してください。"] },
        ],
        faqTitle: "BYOKとAPIキーのよくある質問",
        faq: [
          { question: "このWebサイトにAPIキーを入力しますか？", answer: "いいえ。公開WebサイトはアカウントやAPIキーを収集しません。キーはVidLingoのMacアプリで入力します。" },
          { question: "APIキーを変更・削除できますか？", answer: "はい。Macアプリでいつでも変更でき、「キーチェーンアクセス」からVidLingoの項目を削除することもできます。" },
          { question: "モデル利用料金は誰が請求しますか？", answer: "APIキーを発行したAIプロバイダーが、自身の料金と上限に従ってプロバイダーアカウントへ請求します。" },
        ],
        relatedTitle: "関連するセキュリティと設定",
        ctaTitle: "準備ができたらプロバイダーを接続",
        ctaDescription: "Mac版をダウンロードし、アプリの「AIモデル」でAPIキーを追加します。",
      },
    },
  },
} satisfies Record<SeoPageSlug, SeoPageDefinition>;
