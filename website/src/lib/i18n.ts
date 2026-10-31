export const locales = ["en", "zh", "ja"] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
};

export const htmlLanguages: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  ja: "ja",
};

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export type SiteCopy = {
  meta: { title: string; description: string; keywords: string[] };
  nav: { features: string; how: string; privacy: string; install: string; aria: string };
  hero: {
    eyebrow: string;
    title: string;
    accent: string;
    description: string;
    cta: string;
    note: string;
  };
  demo: {
    aria: string;
    videoTitle: string;
    channel: string;
    original: string;
    translated: string;
    originalText: string;
    translatedText: string;
    status: string;
    context: string;
    provider: string;
    model: string;
    target: string;
    targetValue: string;
    saved: string;
  };
  compare: {
    clipsLabel: string;
    tracksLabel: string;
    youtubeLabel: string;
    vidlingoLabel: string;
    sampleBadge: string;
    cueCount: string;
    sourceLabel: string;
    hint: string;
  };
  quality: {
    eyebrow: string;
    title: string;
    description: string;
    originalLabel: string;
    points: Array<{ title: string; description: string }>;
  };
  speed: {
    eyebrow: string;
    title: string;
    description: string;
    traditional: { label: string; unit: string; steps: string[]; status: string };
    vidlingo: { unit: string; steps: string[]; status: string; pending: string; preview: string };
    facts: Array<{ title: string; description: string }>;
    note: string;
  };
  how: {
    eyebrow: string;
    title: string;
    steps: Array<{ title: string; description: string }>;
  };
  byok: {
    eyebrow: string;
    title: string;
    description: string;
    points: string[];
    providersLabel: string;
  };
  faq: { eyebrow: string; title: string; items: Array<{ question: string; answer: string }> };
  finalCta: { eyebrow: string; title: string; description: string; button: string };
  footer: { product: string; privacy: string; terms: string; beta: string };
  legal: {
    back: string;
    updated: string;
    privacyTitle: string;
    privacyIntro: string;
    privacySections: Array<{ title: string; paragraphs: string[] }>;
    termsTitle: string;
    termsIntro: string;
    termsSections: Array<{ title: string; paragraphs: string[] }>;
  };
};

export const copy = {
  en: {
    meta: {
      title: "VidLingo: Readable AI Subtitles for YouTube on Mac",
      description: "VidLingo pairs a Mac app with a Chrome extension to rebuild YouTube captions into whole sentences and translate them with your own AI API key—no video download or transcription.",
      keywords: ["YouTube subtitle translator", "AI subtitles", "YouTube translation Chrome extension"],
    },
    nav: { features: "See the difference", how: "Get started", privacy: "Models & data", install: "Download for Mac", aria: "Primary navigation" },
    hero: {
      eyebrow: "Public beta · Mac + Chrome · Bring your own API key",
      title: "YouTube subtitles,",
      accent: "in whole sentences, in seconds.",
      description: "VidLingo rebuilds captions into complete sentences and translates them with AI that knows what the video is about. No downloading, no waiting for transcription—just watch on YouTube.",
      cta: "Download for Mac",
      note: "Mac app + Chrome extension · Your AI provider bills you directly",
    },
    demo: {
      aria: "VidLingo translation workflow preview",
      videoTitle: "Why our brains need quiet",
      channel: "Field Notes · 18:42",
      original: "RAW CAPTION",
      translated: "VIDLINGO",
      originalText: "Say you want to let your partner know what time you'll get home every time you leave work.",
      translatedText: "所以，安静的时刻并不是一片空白。",
      status: "Context-aware translation complete",
      context: "Title + channel + nearby dialogue",
      provider: "Provider",
      model: "Model",
      target: "Translate to",
      targetValue: "Simplified Chinese",
      saved: "Saved to your subtitle history",
    },
    compare: {
      clipsLabel: "Sample clips",
      tracksLabel: "Subtitle source",
      youtubeLabel: "YouTube auto-translate",
      vidlingoLabel: "VidLingo",
      sampleBadge: "Sample",
      cueCount: "{count} cues",
      sourceLabel: "Clip source:",
      hint: "Switch between the two tracks, or watch the timeline: the same speech, split into far more fragments by YouTube.",
    },
    quality: {
      eyebrow: "Advantage 01 · Easy to follow",
      title: "One spoken sentence deserves one subtitle sentence.",
      description: "YouTube auto-translate converts each speech-recognition fragment on its own, so a single sentence is often cut into two or three pieces and translated piece by piece. VidLingo first restores the full sentence, then translates it using the video title, description, and nearby dialogue, and shows it in lengths that are comfortable to read.",
      originalLabel: "Original caption",
      points: [
        { title: "Split by sentence", description: "Each thought appears whole instead of breaking in the middle of a phrase." },
        { title: "Aware of context", description: "In a tech talk, “ship” means launching a product—not mailing a package." },
        { title: "Translates meaning", description: "“Bite the bullet” becomes the idiom it is, not a literal bullet." },
      ],
    },
    speed: {
      eyebrow: "Advantage 02 · Ready when you are",
      title: "No download. No transcription. Just open the video.",
      description: "Many subtitle tools download the video, transcribe it with a model like Whisper, then translate—great for creators who need frame-perfect subtitles. VidLingo is built for watching: it reads the caption track YouTube already has and starts translating where you are.",
      traditional: { label: "Download + transcribe tools", unit: "Takes minutes", steps: ["Download video", "Transcribe audio", "Translate", "Import subtitles"], status: "Still transcribing…" },
      vidlingo: { unit: "Takes seconds", steps: ["Open video", "Read caption track", "Subtitles appear"], status: "Subtitles on screen, translating as you watch", pending: "Reading captions…", preview: "关于睡眠，大多数人有个误区，" },
      facts: [
        { title: "Uses existing captions", description: "Reads YouTube’s uploaded or auto-generated captions. No audio processing." },
        { title: "Starts where you are", description: "The part you are watching is translated first; the rest follows in the background." },
        { title: "No second wait", description: "Reopen a translated video and the saved subtitles load right away." },
      ],
      note: "Illustrative animation. Actual speed depends on your network and chosen model.",
    },
    how: {
      eyebrow: "Four steps",
      title: "Set up once, then just watch.",
      steps: [
        { title: "Download and open the Mac app", description: "Move VidLingo to Applications and open it. Translation runs through this app on your Mac, so keep it running while you watch." },
        { title: "Set up your AI provider", description: "Pick a preset provider or enter a custom endpoint, add your API key and model, then click Save & Apply." },
        { title: "Load and connect the Chrome extension", description: "Open the bundled extension folder from the app’s Chrome Extension page, load it in Chrome with Developer mode on, then click Connect to Mac app in the extension settings." },
        { title: "Translate on YouTube", description: "Open a video with captions and click the VidLingo button in the player. Adjust subtitle style right in the player." },
      ],
    },
    byok: {
      eyebrow: "Your key. Your model. Your Mac.",
      title: "Use your own AI. Your settings and data stay on your Mac.",
      description: "VidLingo has no bundled model credits and no account to create. You choose the provider and model, and the provider bills you directly at its own rates.",
      points: ["Your API key is stored in the macOS Keychain and used only to call the service you chose.", "Jobs, history, and cached subtitles are saved on your Mac.", "For AI translation, caption text and context such as the video title are sent to the provider or custom endpoint you configured."],
      providersLabel: "Works with these AI models",
    },
    faq: {
      eyebrow: "Questions, answered plainly",
      title: "Before you install",
      items: [
        { question: "Can I use just the Chrome extension?", answer: "No. The Mac app handles translation on your computer and the extension shows subtitles on YouTube, so keep the app running while you watch." },
        { question: "Do I need an account?", answer: "No. Click Connect to Mac app once in the extension settings and you are ready." },
        { question: "Do I need my own AI API key?", answer: "Yes. AI translation uses your own key, and model usage is billed by your provider. It is not included with the app." },
        { question: "Which AI providers are supported?", answer: "Presets for DeepSeek, Gemini, OpenAI, Claude, Qwen, and Xiaomi MiMo. You can also enter a custom base URL for a proxy, self-hosted gateway, or other compatible API." },
        { question: "Which videos can be translated?", answer: "The video needs an available caption track—uploaded or YouTube auto-generated. Audio transcription for videos without captions and Shorts are not supported." },
        { question: "Does it work on Windows or mobile?", answer: "Not right now. VidLingo is a macOS app used together with the Chrome extension." },
        { question: "Where is my data stored?", answer: "History and subtitles stay on your Mac, and your API key is in the Keychain. AI translation requests go to the provider you chose." },
        { question: "What if AI translation fails or is slow?", answer: "You can turn on machine translation as a backup: built-in macOS translation (macOS 26 or later) or Google Translate (requires its own key). AI subtitles take over once they are ready." },
      ],
    },
    finalCta: { eyebrow: "Public beta", title: "Make the next video easier to read.", description: "Download VidLingo, connect an AI provider you trust, and try it on a YouTube video.", button: "Download for Mac" },
    footer: { product: "AI subtitles for people who actually watch the whole video.", privacy: "Privacy", terms: "Terms", beta: "Public beta · macOS + Chrome · BYOK required" },
    legal: {
      back: "Back to VidLingo",
      updated: "Last updated: October 31, 2026",
      privacyTitle: "Privacy Policy",
      privacyIntro: "This policy explains how information is handled when you use the VidLingo website, Mac app, and Chrome extension during the public beta. VidLingo does not require an account, and we do not run a server that stores your data.",
      privacySections: [
        { title: "Information stored on your Mac", paragraphs: ["The Mac app keeps your settings, translation jobs, subtitle history, and subtitle cache on your computer in ~/Library/Application Support/VidLingo. This data is not uploaded to VidLingo.", "The Chrome extension stores display preferences, such as subtitle style and the auto-translate switch, in your browser and communicates only with the Mac app running on the same computer."] },
        { title: "Your AI API key", paragraphs: ["Your API key is stored in the macOS Keychain, not in a configuration file, and is used only to call the provider or custom endpoint you configured.", "On first launch, the Mac app creates a local connection token and stores it in the Keychain so the extension can connect to the app. Ordinary web pages cannot obtain this token."] },
        { title: "Information sent to third parties", paragraphs: ["To generate subtitles, the app reads captions and video information from YouTube and sends the caption text, along with context such as the video title, channel, and description, to the AI provider or custom endpoint you configured.", "If you turn on Google Translate, caption text is sent to Google Cloud Translation. Built-in macOS translation runs on your Mac.", "YouTube, AI providers, and translation services process this data under their own terms and privacy policies."] },
        { title: "The website", paragraphs: ["The website does not ask you to sign in or enter an API key. It is hosted on Vercel, uses your approximate country to choose the page language when you visit the home address, and uses Vercel Web Analytics to count page views without cookies.", "Hosting providers may process technical information such as IP addresses and request logs to deliver and protect the site."] },
        { title: "Retention and deletion", paragraphs: ["You control the data on your Mac. Deleting the VidLingo app and the data folder above removes your history and cache. You can replace your API key in the app or delete it in Keychain Access.", "Because we do not store accounts or subtitle data on our servers, there is no account data for us to delete on your behalf."] },
      ],
      termsTitle: "Terms of Use",
      termsIntro: "These terms apply to the VidLingo website, Mac app, and Chrome extension during the public beta.",
      termsSections: [
        { title: "Beta software", paragraphs: ["VidLingo is experimental software. Features, supported providers, system requirements, and data formats may change. It is provided without a guarantee of uninterrupted operation or error-free subtitles."] },
        { title: "Your responsibilities", paragraphs: ["You must use an API key you are authorized to use, follow the terms of YouTube and your selected AI or translation provider, keep your Mac and Keychain secure, and review generated subtitles before relying on them for important decisions."] },
        { title: "Costs", paragraphs: ["VidLingo does not include AI model or translation-service usage. Your selected provider may charge you directly. VidLingo is not responsible for provider charges, quotas, suspensions, or model availability."] },
        { title: "Acceptable use", paragraphs: ["Do not use VidLingo to violate law, intellectual-property rights, platform restrictions, or provider policies, or to use credentials you are not authorized to use. Generated subtitles are for your own viewing; check the rights to the original content before sharing them."] },
        { title: "Changes and termination", paragraphs: ["We may change, suspend, or stop offering the beta, its downloads, or this website. Continued use after published changes means you accept the updated terms."] },
      ],
    },
  },
  zh: {
    meta: { title: "VidLingo：YouTube AI 字幕翻译，打开就能看", description: "VidLingo 由 Mac 应用和 Chrome 插件组成，按完整句子重新断句，结合上下文用你自己的 AI API Key 翻译 YouTube 字幕，无需下载视频或语音转写。", keywords: ["YouTube 字幕翻译", "字幕翻译插件", "AI 字幕翻译"] },
    nav: { features: "字幕对比", how: "使用方式", privacy: "模型与数据", install: "下载 Mac 版", aria: "主导航" },
    hero: {
      eyebrow: "Beta 公测 · Mac + Chrome · 自备 API Key",
      title: "打开视频，",
      accent: "好读的字幕就在。",
      description: "VidLingo 按完整句子重新断句，结合视频上下文用 AI 翻译。不用下载视频，不用等待转写，在 YouTube 里直接看。",
      cta: "下载 Mac 版",
      note: "Mac 应用 + Chrome 插件配合使用 · AI 服务商直接向你计费",
    },
    demo: {
      aria: "VidLingo 翻译流程预览",
      videoTitle: "为什么我们的大脑需要安静",
      channel: "Field Notes · 18:42",
      original: "原始字幕",
      translated: "VIDLINGO",
      originalText: "Say you want to let your partner know what time you'll get home every time you leave work.",
      translatedText: "所以，安静的时刻并不是一片空白。",
      status: "已完成上下文感知翻译",
      context: "标题 + 频道 + 前后对话",
      provider: "服务商",
      model: "模型",
      target: "翻译为",
      targetValue: "简体中文",
      saved: "已保存到你的字幕历史",
    },
    compare: {
      clipsLabel: "示例片段",
      tracksLabel: "字幕来源",
      youtubeLabel: "YouTube 自动翻译",
      vidlingoLabel: "VidLingo",
      sampleBadge: "示例",
      cueCount: "{count} 条字幕",
      sourceLabel: "片段来源：",
      hint: "点击切换两种字幕，或看下方时间轴：同样一段话，YouTube 拆成了更多碎片。",
    },
    quality: {
      eyebrow: "优势一 · 读得懂",
      title: "听的是一句话，字幕也该是一句话。",
      description: "YouTube 自动翻译逐条翻译语音识别切出来的碎片，一句话常被拆成两三段，每段单独翻译。VidLingo 先把碎片还原成完整句子，再结合视频标题、简介和前后文翻译，按适合阅读的长度显示。",
      originalLabel: "原字幕",
      points: [
        { title: "按句子断句", description: "一句话完整出现，不会在“大多数 / 人们”这种地方断开。" },
        { title: "结合上下文", description: "知道技术分享里的 ship 是“上线”，不是“运送”。" },
        { title: "翻译的是意思", description: "bite the bullet 是“硬着头皮”，不是“咬紧子弹”。" },
      ],
    },
    speed: {
      eyebrow: "优势二 · 打开就有",
      title: "不用下载，不用转写，打开视频就能看。",
      description: "很多字幕工具要先下载视频，再用 Whisper 等模型转写语音，最后翻译，适合需要逐字精校的字幕制作。VidLingo 为看视频而做：直接读取 YouTube 已有的字幕轨道，从你正在看的位置开始翻译。",
      traditional: { label: "下载 + 转写类工具", unit: "以分钟计", steps: ["下载视频", "语音转写", "翻译", "导入字幕"], status: "还在转写…" },
      vidlingo: { unit: "以秒计", steps: ["打开视频", "读取字幕轨道", "字幕出现"], status: "字幕已显示，边看边翻", pending: "正在读取字幕…", preview: "关于睡眠，大多数人有个误区，" },
      facts: [
        { title: "直接用现成字幕", description: "读取 YouTube 已有的人工或自动字幕，不处理音频。" },
        { title: "从当前位置开始", description: "优先翻译正在播放的这一段，后面的字幕在后台陆续准备好。" },
        { title: "看过的不用再等", description: "翻译过的视频再次打开，直接加载已保存的字幕。" },
      ],
      note: "示意动画，实际速度取决于网络和所选模型。",
    },
    how: {
      eyebrow: "四步开始",
      title: "设置一次，之后打开就看。",
      steps: [
        { title: "下载并打开 Mac 应用", description: "把 VidLingo 拖进「应用程序」后打开。翻译由这个应用在本机处理，看视频时请保持它在运行。" },
        { title: "配置 AI 服务", description: "在应用里选择预设服务商，或填写自定义接口地址，再填入 API Key 和模型，点「保存并应用」。" },
        { title: "加载并连接 Chrome 插件", description: "在应用的「Chrome 插件」页打开内置插件目录，在 Chrome 开启开发者模式后加载它，再到插件设置里点「连接本机应用」。" },
        { title: "在 YouTube 开始翻译", description: "打开一个有字幕的视频，点播放器里的 VidLingo 按钮。字幕样式可以直接在播放器里调整。" },
      ],
    },
    byok: {
      eyebrow: "你的 Key、你的模型、你的 Mac",
      title: "用你自己的 AI，设置和数据都留在本机。",
      description: "VidLingo 不内置模型额度，也不需要注册账号。你选择服务商和模型，调用费由服务商按其价格直接收取。",
      points: ["API Key 保存在 macOS 钥匙串，只在调用你选择的服务时使用。", "任务、历史和字幕缓存都保存在你的 Mac 上。", "AI 翻译时，字幕文本和视频标题等上下文会发送给你配置的服务商或自定义接口。"],
      providersLabel: "支持以下 AI 大模型",
    },
    faq: {
      eyebrow: "把问题说清楚",
      title: "安装之前",
      items: [
        { question: "只装 Chrome 插件可以吗？", answer: "不可以。翻译由 Mac 应用在本机处理，插件负责在 YouTube 上显示字幕，看视频时需要保持应用运行。" },
        { question: "需要注册账号吗？", answer: "不需要。在插件设置里点一次「连接本机应用」就能用。" },
        { question: "需要自己准备 AI API Key 吗？", answer: "需要。AI 翻译使用你自己的 Key，模型调用费由服务商直接收取，不包含在应用里。" },
        { question: "支持哪些 AI 服务商？", answer: "预设 DeepSeek、Gemini、OpenAI、Claude、通义千问和小米 MiMo；也可以填写自定义 Base URL，接入代理、自建网关或其他兼容接口。" },
        { question: "哪些视频可以翻译？", answer: "视频需要有可用的字幕轨道，作者上传的字幕或 YouTube 自动字幕都可以。不支持对无字幕视频做语音转写，也不支持 Shorts。" },
        { question: "支持 Windows 或手机吗？", answer: "暂不支持。目前只提供 macOS 应用，配合 Chrome 插件使用。" },
        { question: "数据保存在哪里？", answer: "历史和字幕保存在你的 Mac 上，API Key 保存在钥匙串。AI 翻译请求会发给你选择的服务商。" },
        { question: "AI 翻译失败或较慢怎么办？", answer: "可以开启机器翻译作为补充：macOS 自带翻译（需要 macOS 26 或更新版本）或 Google 翻译（需单独配置 Key）。AI 译文生成后会优先显示。" },
      ],
    },
    finalCta: { eyebrow: "Beta 公测", title: "让下一支视频，更好读。", description: "下载 VidLingo，连接你信任的 AI 服务商，打开一个 YouTube 视频试试。", button: "下载 Mac 版" },
    footer: { product: "为真正会把视频看完的人做的 AI 字幕。", privacy: "隐私政策", terms: "使用条款", beta: "Beta 公测 · macOS + Chrome · 需要自备 API Key" },
    legal: {
      back: "返回 VidLingo",
      updated: "最后更新：2026 年 10 月 31 日",
      privacyTitle: "隐私政策",
      privacyIntro: "本政策说明你在 Beta 公测期间使用 VidLingo 官网、Mac 应用和 Chrome 插件时，信息如何被处理。VidLingo 不需要注册账号，我们也不运营保存你数据的服务器。",
      privacySections: [
        { title: "保存在你 Mac 上的信息", paragraphs: ["Mac 应用把你的设置、翻译任务、字幕历史和字幕缓存保存在本机的 ~/Library/Application Support/VidLingo 目录中，这些数据不会上传给 VidLingo。", "Chrome 插件在浏览器本地保存字幕样式、自动翻译开关等显示设置，并且只与同一台电脑上运行的 Mac 应用通信。"] },
        { title: "你的 AI API Key", paragraphs: ["API Key 保存在 macOS 钥匙串，不写入配置文件，只在调用你配置的服务商或自定义接口时使用。", "Mac 应用首次启动时会生成一个本机连接令牌并保存在钥匙串，用于让插件连接本机应用，普通网页无法获取这个令牌。"] },
        { title: "发送给第三方的信息", paragraphs: ["生成字幕时，应用会从 YouTube 读取字幕和视频信息，并把字幕文本以及视频标题、频道、简介等上下文发送给你配置的 AI 服务商或自定义接口。", "如果你开启 Google 翻译，字幕文本会发送给 Google Cloud Translation；macOS 自带翻译在本机执行。", "YouTube、AI 服务商和翻译服务会按其自身条款与隐私政策处理这些数据。"] },
        { title: "官网", paragraphs: ["官网不要求你登录或输入 API Key。官网托管在 Vercel，访问首页时会根据你的大致国家或地区选择页面语言，并使用 Vercel Web Analytics 在不使用 Cookie 的情况下统计页面访问。", "托管服务商可能为提供和保护网站而处理 IP 地址、请求日志等技术信息。"] },
        { title: "保留与删除", paragraphs: ["本机数据由你自己掌控。删除 VidLingo 应用和上述数据目录，即可清除历史和缓存；API Key 可以在应用中更换，也可以在「钥匙串访问」中删除。", "由于我们不在服务器上保存账号或字幕数据，因此不存在需要我们代为删除的账号数据。"] },
      ],
      termsTitle: "使用条款",
      termsIntro: "本条款适用于 Beta 公测期间的 VidLingo 官网、Mac 应用和 Chrome 插件。",
      termsSections: [
        { title: "Beta 软件", paragraphs: ["VidLingo 是实验性软件。功能、支持的服务商、系统要求和数据格式均可能变化。我们不保证软件永不中断，也不保证字幕完全无误。"] },
        { title: "你的责任", paragraphs: ["你必须使用有权使用的 API Key，遵守 YouTube 和所选 AI 或翻译服务商的条款，保护好你的 Mac 和钥匙串安全，并在将生成的字幕用于重要决策前自行复核。"] },
        { title: "费用", paragraphs: ["VidLingo 不包含 AI 模型或翻译服务的用量，你选择的服务商可能直接向你收费。VidLingo 不对服务商的费用、额度、封禁或模型可用性负责。"] },
        { title: "可接受的使用", paragraphs: ["不得使用 VidLingo 违反法律、知识产权、平台限制或服务商政策，也不得使用你无权使用的凭据。生成的字幕供你个人观看使用；如需分享，请先确认你对原内容拥有相应权利。"] },
        { title: "变更与终止", paragraphs: ["我们可能变更、暂停或停止提供 Beta 版、安装包下载或本官网。变更公布后继续使用即表示接受更新后的条款。"] },
      ],
    },
  },
  ja: {
    meta: { title: "VidLingo：Mac で読みやすい YouTube AI 字幕", description: "VidLingo は Mac アプリと Chrome 拡張機能で、YouTube の字幕を完全な文に組み直し、自分の AI API キーで翻訳します。動画のダウンロードや文字起こしは不要です。", keywords: ["YouTube 字幕 翻訳", "AI 字幕翻訳", "YouTube 翻訳 拡張機能"] },
    nav: { features: "字幕の比較", how: "使い方", privacy: "モデルとデータ", install: "Mac 版をダウンロード", aria: "メインナビゲーション" },
    hero: {
      eyebrow: "パブリックベータ · Mac + Chrome · 個人の API キーが必要",
      title: "動画を開けば、",
      accent: "読みやすい字幕がすぐに。",
      description: "VidLingo は字幕を完全な文に組み直し、動画の文脈を踏まえて AI で翻訳します。ダウンロードも文字起こしの待ち時間もなく、YouTube でそのまま視聴できます。",
      cta: "Mac 版をダウンロード",
      note: "Mac アプリと Chrome 拡張機能をセットで使用 · 料金は AI プロバイダーから直接請求",
    },
    demo: {
      aria: "VidLingo 翻訳ワークフローのプレビュー",
      videoTitle: "脳に静けさが必要な理由",
      channel: "Field Notes · 18:42",
      original: "元の字幕",
      translated: "VIDLINGO",
      originalText: "Say you want to let your partner know what time you'll get home every time you leave work.",
      translatedText: "だから、静かな時間は決して空っぽなのではありません。",
      status: "文脈を理解した翻訳が完了",
      context: "タイトル + チャンネル + 前後の会話",
      provider: "プロバイダー",
      model: "モデル",
      target: "翻訳先",
      targetValue: "日本語",
      saved: "字幕履歴に保存しました",
    },
    compare: {
      clipsLabel: "サンプルクリップ",
      tracksLabel: "字幕の種類",
      youtubeLabel: "YouTube 自動翻訳",
      vidlingoLabel: "VidLingo",
      sampleBadge: "サンプル",
      cueCount: "{count} 件の字幕",
      sourceLabel: "クリップの出典：",
      hint: "2 つの字幕を切り替えるか、下のタイムラインを見てください。同じ話でも、YouTube はより多くの断片に分けています。",
    },
    quality: {
      eyebrow: "強み 01 · 読みやすい",
      title: "話しているのが一文なら、字幕も一文で。",
      description: "YouTube の自動翻訳は、音声認識が区切った断片を一つずつ翻訳するため、一つの文が 2〜3 個に分かれたまま訳されがちです。VidLingo はまず断片を完全な文に戻し、動画のタイトルや概要、前後の会話を踏まえて翻訳し、読みやすい長さで表示します。",
      originalLabel: "元の字幕",
      points: [
        { title: "文単位で区切る", description: "フレーズの途中で切れず、一つの意味がまとまって表示されます。" },
        { title: "文脈を理解する", description: "技術トークの “ship” は「リリース」であって「発送」ではありません。" },
        { title: "意味を訳す", description: "“bite the bullet” は慣用句として訳し、直訳の「弾をかむ」にはしません。" },
      ],
    },
    speed: {
      eyebrow: "強み 02 · 開けばすぐ",
      title: "ダウンロードも文字起こしも不要。動画を開くだけ。",
      description: "多くの字幕ツールは、動画をダウンロードし、Whisper などのモデルで文字起こししてから翻訳します。精密な字幕を作る用途には最適です。VidLingo は視聴のためのツールです。YouTube にある字幕トラックを読み取り、今見ている位置から翻訳を始めます。",
      traditional: { label: "ダウンロード + 文字起こし型", unit: "数分単位", steps: ["動画をダウンロード", "音声を文字起こし", "翻訳", "字幕を読み込む"], status: "文字起こし中…" },
      vidlingo: { unit: "数秒単位", steps: ["動画を開く", "字幕トラックを読む", "字幕を表示"], status: "字幕を表示中、見ながら翻訳", pending: "字幕を読み込み中…", preview: "关于睡眠，大多数人有个误区，" },
      facts: [
        { title: "既存の字幕を使う", description: "YouTube の手動字幕や自動字幕を読み取り、音声は処理しません。" },
        { title: "今の位置から", description: "再生中の部分を先に翻訳し、続きはバックグラウンドで準備します。" },
        { title: "二度目は待たない", description: "翻訳済みの動画を開き直すと、保存された字幕をすぐに読み込みます。" },
      ],
      note: "イメージ用のアニメーションです。実際の速度はネットワークと選んだモデルによって異なります。",
    },
    how: {
      eyebrow: "4 ステップ",
      title: "一度設定すれば、あとは開くだけ。",
      steps: [
        { title: "Mac アプリをダウンロードして開く", description: "VidLingo を「アプリケーション」に移動して開きます。翻訳はこのアプリが Mac 上で処理するため、視聴中は起動したままにしてください。" },
        { title: "AI サービスを設定する", description: "プリセットのプロバイダーを選ぶか、カスタムのエンドポイントを入力し、API キーとモデルを入れて「保存して適用」をクリックします。" },
        { title: "Chrome 拡張機能を読み込んで接続する", description: "アプリの「Chrome 拡張機能」ページから内蔵フォルダを開き、Chrome でデベロッパーモードをオンにして読み込みます。その後、拡張機能の設定で「Mac アプリに接続」をクリックします。" },
        { title: "YouTube で翻訳する", description: "字幕のある動画を開き、プレーヤーの VidLingo ボタンをクリックします。字幕のスタイルはプレーヤー上で調整できます。" },
      ],
    },
    byok: {
      eyebrow: "自分のキー、自分のモデル、自分の Mac",
      title: "自分の AI を使い、設定とデータは Mac に。",
      description: "VidLingo にはモデルの利用枠は含まれず、アカウント登録も不要です。プロバイダーとモデルを選ぶと、利用料金はプロバイダーから直接請求されます。",
      points: ["API キーは macOS のキーチェーンに保存され、選んだサービスを呼び出すときだけ使われます。", "ジョブ、履歴、字幕キャッシュは Mac に保存されます。", "AI 翻訳では、字幕テキストと動画タイトルなどの文脈が、設定したプロバイダーまたはカスタムエンドポイントに送信されます。"],
      providersLabel: "対応している AI モデル",
    },
    faq: {
      eyebrow: "率直にお答えします",
      title: "インストールの前に",
      items: [
        { question: "Chrome 拡張機能だけで使えますか？", answer: "いいえ。翻訳は Mac アプリが処理し、拡張機能は YouTube に字幕を表示します。視聴中はアプリを起動したままにしてください。" },
        { question: "アカウント登録は必要ですか？", answer: "不要です。拡張機能の設定で「Mac アプリに接続」を一度クリックすれば使えます。" },
        { question: "自分の AI API キーが必要ですか？", answer: "はい。AI 翻訳には自分のキーを使い、モデルの利用料金はプロバイダーから直接請求されます。アプリには含まれていません。" },
        { question: "どの AI プロバイダーに対応していますか？", answer: "DeepSeek、Gemini、OpenAI、Claude、Qwen、Xiaomi MiMo のプリセットがあります。カスタムの Base URL を入力して、プロキシや自前のゲートウェイ、互換 API も使えます。" },
        { question: "どの動画を翻訳できますか？", answer: "利用可能な字幕トラックが必要です。投稿者の字幕でも YouTube の自動字幕でも構いません。字幕のない動画の文字起こしと Shorts には対応していません。" },
        { question: "Windows やスマートフォンで使えますか？", answer: "現在は使えません。macOS アプリと Chrome 拡張機能の組み合わせでのみ提供しています。" },
        { question: "データはどこに保存されますか？", answer: "履歴と字幕は Mac に、API キーはキーチェーンに保存されます。AI 翻訳のリクエストは選んだプロバイダーに送信されます。" },
        { question: "AI 翻訳が失敗したり遅かったりする場合は？", answer: "補助として機械翻訳をオンにできます。macOS 標準の翻訳（macOS 26 以降）または Google 翻訳（別途キーが必要）です。AI 翻訳ができ次第、そちらが優先表示されます。" },
      ],
    },
    finalCta: { eyebrow: "パブリックベータ", title: "次の動画を、もっと読みやすく。", description: "VidLingo をダウンロードし、信頼できる AI プロバイダーを接続して、YouTube の動画で試してみてください。", button: "Mac 版をダウンロード" },
    footer: { product: "動画を最後まで見る人のための AI 字幕。", privacy: "プライバシー", terms: "利用規約", beta: "パブリックベータ · macOS + Chrome · 個人の API キーが必要" },
    legal: {
      back: "VidLingo に戻る",
      updated: "最終更新：2026 年 10 月 31 日",
      privacyTitle: "プライバシーポリシー",
      privacyIntro: "本ポリシーは、パブリックベータ中に VidLingo の Web サイト、Mac アプリ、Chrome 拡張機能を利用する際の情報の扱いを説明します。VidLingo はアカウント登録が不要で、データを保存するサーバーも運営していません。",
      privacySections: [
        { title: "Mac に保存される情報", paragraphs: ["Mac アプリは、設定、翻訳ジョブ、字幕履歴、字幕キャッシュを ~/Library/Application Support/VidLingo に保存します。これらのデータが VidLingo にアップロードされることはありません。", "Chrome 拡張機能は、字幕のスタイルや自動翻訳スイッチなどの表示設定をブラウザ内に保存し、同じコンピューターで動作する Mac アプリとだけ通信します。"] },
        { title: "AI API キー", paragraphs: ["API キーは設定ファイルではなく macOS のキーチェーンに保存され、設定したプロバイダーまたはカスタムエンドポイントの呼び出しにのみ使われます。", "Mac アプリは初回起動時にローカル接続用のトークンを作成してキーチェーンに保存し、拡張機能がアプリに接続できるようにします。通常の Web ページがこのトークンを取得することはできません。"] },
        { title: "第三者に送信される情報", paragraphs: ["字幕を生成する際、アプリは YouTube から字幕と動画情報を読み取り、字幕テキストと動画のタイトル、チャンネル、概要などの文脈を、設定した AI プロバイダーまたはカスタムエンドポイントに送信します。", "Google 翻訳をオンにした場合、字幕テキストは Google Cloud Translation に送信されます。macOS 標準の翻訳は Mac 上で実行されます。", "YouTube、AI プロバイダー、翻訳サービスは、それぞれの規約とプライバシーポリシーに従ってデータを処理します。"] },
        { title: "Web サイト", paragraphs: ["Web サイトではログインや API キーの入力を求めません。サイトは Vercel でホストされ、トップページにアクセスした際におおよその国・地域から表示言語を選び、Cookie を使わない Vercel Web Analytics でページの閲覧数を計測します。", "ホスティング事業者は、サイトの提供と保護のために IP アドレスやリクエストログなどの技術情報を処理する場合があります。"] },
        { title: "保持と削除", paragraphs: ["Mac 上のデータはご自身で管理できます。VidLingo アプリと上記のデータフォルダを削除すると、履歴とキャッシュが消去されます。API キーはアプリで変更でき、「キーチェーンアクセス」から削除することもできます。", "アカウントや字幕データをサーバーに保存していないため、当方が代わりに削除するアカウントデータはありません。"] },
      ],
      termsTitle: "利用規約",
      termsIntro: "本規約は、パブリックベータ中の VidLingo Web サイト、Mac アプリ、Chrome 拡張機能に適用されます。",
      termsSections: [
        { title: "ベータソフトウェア", paragraphs: ["VidLingo は実験的なソフトウェアです。機能、対応プロバイダー、動作要件、データ形式は変更される場合があり、中断のない動作や完全に正確な字幕は保証されません。"] },
        { title: "利用者の責任", paragraphs: ["利用権限のある API キーを使い、YouTube と選択した AI・翻訳プロバイダーの規約に従い、Mac とキーチェーンを安全に保ってください。重要な判断に利用する前に、生成された字幕を確認してください。"] },
        { title: "費用", paragraphs: ["VidLingo には AI モデルや翻訳サービスの利用枠は含まれません。プロバイダーから直接課金される場合があり、VidLingo は料金、制限、停止、モデルの可用性に責任を負いません。"] },
        { title: "禁止事項", paragraphs: ["法律、知的財産権、プラットフォームの制限、プロバイダーのポリシーに違反する利用や、利用権限のない認証情報の使用を禁止します。生成した字幕は個人での視聴用です。共有する場合は、元のコンテンツに関する権利を確認してください。"] },
        { title: "変更と終了", paragraphs: ["ベータ版、インストーラーの配布、本 Web サイトを変更、一時停止、終了する場合があります。変更公開後の継続利用は、更新後の規約への同意とみなされます。"] },
      ],
    },
  },
} satisfies Record<Locale, SiteCopy>;

export const providers = ["Gemini", "DeepSeek", "OpenAI", "Claude", "Qwen", "Xiaomi MiMo"];
