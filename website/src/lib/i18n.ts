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
  intro: { eyebrow: string; title: string; description: string };
  features: Array<{ number: string; title: string; description: string }>;
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
      title: "VidLingo: AI YouTube Subtitle Translator for Chrome",
      description: "Translate YouTube subtitles with your own AI API key. Get more natural phrasing, readable timing, and a synced subtitle history.",
      keywords: ["YouTube subtitle translator", "AI subtitles", "YouTube translation Chrome extension"],
    },
    nav: { features: "Why VidLingo", how: "How it works", privacy: "Your API key", install: "Add to Chrome", aria: "Primary navigation" },
    hero: {
      eyebrow: "Public beta · Bring your own API key",
      title: "YouTube subtitles that",
      accent: "read like someone meant them.",
      description: "VidLingo uses video context to reshape awkward captions into natural, readable translations—without taking control away from you.",
      cta: "Add VidLingo to Chrome",
      note: "Chrome extension · Your provider bills you directly",
    },
    demo: {
      aria: "VidLingo translation workflow preview",
      videoTitle: "Why our brains need quiet",
      channel: "Field Notes · 18:42",
      original: "RAW CAPTION",
      translated: "VIDLINGO",
      originalText: "and that is why / the quiet moments are / not actually empty",
      translatedText: "所以，安静的时刻并不是一片空白。",
      status: "Context-aware translation complete",
      context: "Title + channel + nearby dialogue",
      provider: "Provider",
      model: "Model",
      target: "Translate to",
      targetValue: "Simplified Chinese",
      saved: "Saved to your subtitle history",
    },
    intro: {
      eyebrow: "Built for watching, not word swapping",
      title: "Better translation is only half the job.",
      description: "VidLingo also cleans the caption structure, preserves timing, and remembers the result so the subtitle experience stays smooth from first click to repeat viewing.",
    },
    features: [
      { number: "01", title: "Understands the video", description: "Uses the title, channel, description, and nearby dialogue to resolve names, terms, and intent." },
      { number: "02", title: "Rebuilds broken captions", description: "Turns overlapping auto-captions and fragments into natural subtitle units before translation." },
      { number: "03", title: "Keeps timing dependable", description: "Derives final timing from cleaned source captions instead of asking the AI to invent timestamps." },
      { number: "04", title: "Remembers your work", description: "Email sign-in keeps API settings and subtitle history available across your VidLingo sessions." },
    ],
    how: {
      eyebrow: "Three steps",
      title: "From a YouTube tab to better subtitles.",
      steps: [
        { title: "Connect your model", description: "Sign in, choose a supported AI provider, paste your API key, and select a model." },
        { title: "Open a video", description: "VidLingo detects available captions and prefers a manually uploaded track when one exists." },
        { title: "Generate and watch", description: "Start translation with one click. Completed subtitles load over the YouTube player and stay in your history." },
      ],
    },
    byok: {
      eyebrow: "Your key. Your model. Your bill.",
      title: "VidLingo provides the subtitle workflow—not a hidden AI markup.",
      description: "The public beta only translates with an API key you provide. Your provider charges your account directly according to its own pricing.",
      points: ["Keys are encrypted before they are stored.", "Your saved key is only used to call the provider and model you selected.", "VidLingo never promises bundled or free model usage during beta."],
      providersLabel: "Supports the following AI models",
    },
    faq: {
      eyebrow: "Questions, answered plainly",
      title: "Before you install",
      items: [
        { question: "Do I need my own AI API key?", answer: "Yes. During the public beta, VidLingo only supports personal API keys. You choose the provider and model, and your provider bills you directly." },
        { question: "Which AI providers are supported?", answer: "Gemini, DeepSeek, OpenAI, Claude, Qwen, and Xiaomi MiMo are currently supported." },
        { question: "Where is my API key stored?", answer: "After you sign in and save it, the key is encrypted on the VidLingo backend. It is not displayed again in the extension and is used to run translations with your selected provider." },
        { question: "Does VidLingo work on every YouTube video?", answer: "The beta requires an available YouTube caption track. Videos without captions and audio transcription are not supported yet." },
        { question: "What languages can I translate into?", answer: "VidLingo currently offers 16 target languages in the extension, including English, Chinese, Japanese, Korean, Spanish, French, and German." },
      ],
    },
    finalCta: { eyebrow: "Public beta", title: "Make the next video easier to follow.", description: "Install VidLingo, connect your preferred AI provider, and give one YouTube video a better subtitle track.", button: "Add to Chrome" },
    footer: { product: "AI subtitles for people who actually watch the whole video.", privacy: "Privacy", terms: "Terms", beta: "Public beta · BYOK required" },
    legal: {
      back: "Back to VidLingo",
      updated: "Last updated: July 14, 2026",
      privacyTitle: "Privacy Policy",
      privacyIntro: "This policy explains what VidLingo processes when you use the website and Chrome extension during the public beta.",
      privacySections: [
        { title: "Information we process", paragraphs: ["We process the email address you use to sign in, account and session identifiers, the AI provider and model you select, translation job status, subtitle history, and the YouTube video metadata and caption text needed to generate subtitles.", "The website itself does not ask for an account or API key."] },
        { title: "Your AI API key", paragraphs: ["Your API key is encrypted before storage. VidLingo decrypts it only when needed to send a translation request to the provider and model you selected. The key is not returned by the settings API after it is saved."] },
        { title: "How information is used", paragraphs: ["We use this information to authenticate your account, process subtitle jobs, restore your settings and history, prevent duplicate work, maintain security, and diagnose failures."] },
        { title: "Third-party services", paragraphs: ["Caption text and relevant video context are sent to the AI provider you choose. YouTube, your AI provider, email delivery, hosting, and infrastructure services process data under their own terms and privacy policies."] },
        { title: "Retention and choices", paragraphs: ["We retain account settings, jobs, and subtitle history while the beta service operates or as needed for security and reliability. You may stop using the service at any time and contact the operator through the Chrome Web Store support channel to request account-data deletion."] },
      ],
      termsTitle: "Terms of Use",
      termsIntro: "These terms apply to the VidLingo website and Chrome extension during the public beta.",
      termsSections: [
        { title: "Beta service", paragraphs: ["VidLingo is experimental software. Features, availability, supported providers, and data formats may change. The service is provided without a guarantee of uninterrupted operation or error-free subtitles."] },
        { title: "Your responsibilities", paragraphs: ["You must use an API key you are authorized to use, follow the terms of YouTube and your selected AI provider, and review generated subtitles before relying on them for important decisions."] },
        { title: "Costs", paragraphs: ["VidLingo does not include AI model usage during the beta. Your selected provider may charge you directly. VidLingo is not responsible for provider charges, quotas, suspensions, or model availability."] },
        { title: "Acceptable use", paragraphs: ["Do not use VidLingo to violate law, intellectual-property rights, platform restrictions, or provider policies; probe other accounts; disrupt the service; or distribute credentials you do not own."] },
        { title: "Changes and termination", paragraphs: ["We may change, suspend, or end the beta and may restrict access when needed for security, abuse prevention, or service reliability. Continued use after published changes means you accept the updated terms."] },
      ],
    },
  },
  zh: {
    meta: { title: "VidLingo：YouTube AI 字幕翻译插件", description: "使用你自己的 AI API Key 翻译 YouTube 字幕，获得更自然的表达、更易读的时间轴和可同步的字幕历史。", keywords: ["YouTube 字幕翻译", "字幕翻译插件", "AI 字幕翻译"] },
    nav: { features: "为什么用 VidLingo", how: "使用方式", privacy: "你的 API Key", install: "添加到 Chrome", aria: "主导航" },
    hero: {
      eyebrow: "Beta 公测 · 需要自备 API Key",
      title: "让 YouTube 字幕",
      accent: "像字幕也像人话",
      description: "VidLingo 会理解视频上下文，把生硬、破碎的原字幕整理成自然且易读的翻译，同时保留你对模型的选择权。",
      cta: "将 VidLingo 添加到 Chrome",
      note: "Chrome 扩展 · AI 服务商直接向你计费",
    },
    demo: {
      aria: "VidLingo 翻译流程预览",
      videoTitle: "为什么我们的大脑需要安静",
      channel: "Field Notes · 18:42",
      original: "原始字幕",
      translated: "VIDLINGO",
      originalText: "and that is why / the quiet moments are / not actually empty",
      translatedText: "所以，安静的时刻并不是一片空白。",
      status: "已完成上下文感知翻译",
      context: "标题 + 频道 + 前后对话",
      provider: "服务商",
      model: "模型",
      target: "翻译为",
      targetValue: "简体中文",
      saved: "已保存到你的字幕历史",
    },
    intro: { eyebrow: "为观看体验而做，不只是替换单词", title: "翻译得好，只做完了一半。", description: "VidLingo 还会清理字幕结构、稳定时间轴并保留结果，让从首次生成到再次观看都保持顺畅。" },
    features: [
      { number: "01", title: "理解这个视频", description: "结合标题、频道、简介和前后对话，正确处理人名、术语和语气。" },
      { number: "02", title: "重新整理破碎字幕", description: "在翻译前，把重叠的自动字幕和句子碎片整理成自然的字幕单元。" },
      { number: "03", title: "保持可靠的时间轴", description: "根据清理后的原字幕计算最终时间，不让 AI 自由编造时间戳。" },
      { number: "04", title: "记住你已做的工作", description: "通过邮箱登录，在 VidLingo 会话间保留 API 设置和字幕历史。" },
    ],
    how: {
      eyebrow: "只需三步",
      title: "从 YouTube 页面到更好的字幕。",
      steps: [
        { title: "连接你的模型", description: "登录后选择支持的 AI 服务商，填入 API Key 并选择模型。" },
        { title: "打开一个视频", description: "VidLingo 会检测可用字幕，存在人工上传字幕时优先使用。" },
        { title: "生成并开始观看", description: "一键开始翻译。完成后字幕会显示在 YouTube 播放器上，并保留在历史记录中。" },
      ],
    },
    byok: {
      eyebrow: "你的 Key、你的模型、你的账单",
      title: "VidLingo 提供字幕工作流，不在 AI 调用费上隐藏加价。",
      description: "Beta 公测只能使用你提供的 API Key 翻译。AI 服务商会按其价格直接向你的账户计费。",
      points: ["API Key 会在保存前加密。", "已保存的 Key 只用于调用你选择的服务商和模型。", "Beta 期间不承诺内置或免费的模型额度。"],
      providersLabel: "支持以下 AI 大模型",
    },
    faq: {
      eyebrow: "把问题说清楚",
      title: "安装之前",
      items: [
        { question: "需要我自己准备 AI API Key 吗？", answer: "需要。Beta 公测期间，VidLingo 只支持个人 API Key。你选择服务商和模型，调用费由服务商直接收取。" },
        { question: "支持哪些 AI 服务商？", answer: "目前支持 Gemini、DeepSeek、OpenAI、Claude、Qwen 和 Xiaomi MiMo。" },
        { question: "我的 API Key 保存在哪里？", answer: "登录并保存后，API Key 会加密存储在 VidLingo 后端。扩展不会再显示完整 Key，仅在使用你选择的服务商执行翻译时调用。" },
        { question: "VidLingo 支持所有 YouTube 视频吗？", answer: "Beta 版需要视频存在可用的 YouTube 字幕轨道。暂不支持对无字幕视频进行音频转写。" },
        { question: "可以翻译成哪些语言？", answer: "扩展目前提供 16 种目标语言，包括中文、英语、日语、韩语、西班牙语、法语和德语等。" },
      ],
    },
    finalCta: { eyebrow: "Beta 公测", title: "让下一个视频更容易看懂。", description: "安装 VidLingo，连接你信任的 AI 服务商，先为一个 YouTube 视频生成更好的字幕。", button: "添加到 Chrome" },
    footer: { product: "为真正会把视频看完的人做的 AI 字幕。", privacy: "隐私政策", terms: "使用条款", beta: "Beta 公测 · 需要自备 API Key" },
    legal: {
      back: "返回 VidLingo", updated: "最后更新：2026 年 7 月 14 日", privacyTitle: "隐私政策", privacyIntro: "本政策说明你在 Beta 公测期间使用 VidLingo 官网和 Chrome 扩展时，我们会处理哪些信息。",
      privacySections: [
        { title: "我们处理的信息", paragraphs: ["我们会处理你用于登录的邮箱、账号与会话标识、你选择的 AI 服务商和模型、翻译任务状态、字幕历史，以及生成字幕所需的 YouTube 视频信息和字幕文本。", "官网本身不会要求你输入账号或 API Key。"] },
        { title: "你的 AI API Key", paragraphs: ["API Key 会在保存前加密。VidLingo 仅在向你选择的服务商和模型发送翻译请求时解密。保存后，设置接口不会返回完整 Key。"] },
        { title: "信息的用途", paragraphs: ["我们用这些信息验证账号、处理字幕任务、恢复设置与历史、避免重复处理、保障安全并排查故障。"] },
        { title: "第三方服务", paragraphs: ["字幕文本和相关视频上下文会发送给你选择的 AI 服务商。YouTube、AI 服务商、邮件、托管和基础设施服务会按其自身条款与隐私政策处理数据。"] },
        { title: "保留与你的选择", paragraphs: ["在 Beta 服务运行期间，或出于安全与可靠性需要，我们会保留账号设置、任务和字幕历史。你可随时停止使用，并通过 Chrome Web Store 支持渠道申请删除账号数据。"] },
      ],
      termsTitle: "使用条款", termsIntro: "本条款适用于 Beta 公测期间的 VidLingo 官网和 Chrome 扩展。",
      termsSections: [
        { title: "Beta 服务", paragraphs: ["VidLingo 是实验性软件。功能、可用性、支持的服务商和数据格式均可能变化。我们不保证服务永不中断或字幕完全无误。"] },
        { title: "你的责任", paragraphs: ["你必须使用有权使用的 API Key，遵守 YouTube 和所选 AI 服务商的条款，并在将生成字幕用于重要决策前自行复核。"] },
        { title: "费用", paragraphs: ["Beta 期间 VidLingo 不包含 AI 模型用量。你选择的服务商可能直接收费。VidLingo 不对服务商费用、额度、封禁或模型可用性负责。"] },
        { title: "可接受的使用", paragraphs: ["不得使用 VidLingo 违反法律、知识产权、平台限制或服务商政策；探查他人账号；干扰服务；或散布你不拥有的凭据。"] },
        { title: "变更与终止", paragraphs: ["我们可能变更、暂停或结束 Beta，并在安全、防止滥用或保障可靠性时限制访问。变更公布后继续使用即表示接受更新后的条款。"] },
      ],
    },
  },
  ja: {
    meta: { title: "VidLingo：YouTube AI字幕翻訳 Chrome拡張機能", description: "自分の AI API キーで YouTube 字幕を翻訳。自然な表現、読みやすいタイミング、同期された字幕履歴を提供します。", keywords: ["YouTube 字幕 翻訳", "AI 字幕翻訳", "YouTube 翻訳 拡張機能"] },
    nav: { features: "VidLingo の特徴", how: "使い方", privacy: "API キー", install: "Chrome に追加", aria: "メインナビゲーション" },
    hero: {
      eyebrow: "パブリックベータ · 個人の API キーが必要です",
      title: "YouTube の字幕を、",
      accent: "本当に読める言葉へ。",
      description: "VidLingo は動画の文脈を理解し、不自然で断片的な字幕を、読みやすい翻訳に整えます。モデルを選ぶのはあなたです。",
      cta: "VidLingo を Chrome に追加",
      note: "Chrome 拡張機能 · 利用料金は AI プロバイダーから直接請求",
    },
    demo: {
      aria: "VidLingo 翻訳ワークフローのプレビュー",
      videoTitle: "脳に静けさが必要な理由",
      channel: "Field Notes · 18:42",
      original: "元の字幕",
      translated: "VIDLINGO",
      originalText: "and that is why / the quiet moments are / not actually empty",
      translatedText: "だから、静かな時間は決して空っぽなのではありません。",
      status: "文脈を理解した翻訳が完了",
      context: "タイトル + チャンネル + 前後の会話",
      provider: "プロバイダー",
      model: "モデル",
      target: "翻訳先",
      targetValue: "日本語",
      saved: "字幕履歴に保存しました",
    },
    intro: { eyebrow: "単語の置き換えではなく、視聴体験のために", title: "良い翻訳だけでは、まだ半分です。", description: "VidLingo は字幕の構造を整え、タイミングを守り、結果を履歴に残します。最初の生成から再視聴まで、スムーズな字幕体験を保ちます。" },
    features: [
      { number: "01", title: "動画の文脈を理解", description: "タイトル、チャンネル、概要、前後の会話から、名前、用語、話者の意図を読み取ります。" },
      { number: "02", title: "壊れた字幕を再構成", description: "重なりや断片の多い自動字幕を、翻訳前に自然な字幕単位へ整えます。" },
      { number: "03", title: "信頼できるタイミング", description: "AI に時間を作らせず、整理した元字幕から最終タイミングを計算します。" },
      { number: "04", title: "作業を履歴に保存", description: "メールログインにより、API 設定と字幕履歴を VidLingo セッション間で保持します。" },
    ],
    how: {
      eyebrow: "3 ステップ",
      title: "YouTube のタブから、より良い字幕へ。",
      steps: [
        { title: "モデルを接続", description: "ログインし、対応 AI プロバイダーとモデルを選び、API キーを保存します。" },
        { title: "動画を開く", description: "VidLingo が利用可能な字幕を検出し、手動でアップロードされた字幕があれば優先します。" },
        { title: "生成して視聴", description: "1 クリックで翻訳を開始。完成した字幕は YouTube プレーヤー上に表示され、履歴に保存されます。" },
      ],
    },
    byok: {
      eyebrow: "あなたのキー、モデル、請求",
      title: "VidLingo が提供するのは字幕のワークフロー。AI 料金への上乗せではありません。",
      description: "パブリックベータでは、あなたが登録した API キーのみを使用します。利用料金は各プロバイダーの価格に従い、直接あなたのアカウントに請求されます。",
      points: ["API キーは保存前に暗号化されます。", "保存されたキーは、選択したプロバイダーとモデルの呼び出しにのみ使用されます。", "ベータ中、モデルの無料利用枠やバンドル提供はありません。"],
      providersLabel: "以下の AI モデルに対応",
    },
    faq: {
      eyebrow: "よくある質問",
      title: "インストールの前に",
      items: [
        { question: "自分の AI API キーが必要ですか？", answer: "はい。パブリックベータでは個人の API キーのみに対応します。プロバイダーとモデルは自分で選び、料金は直接請求されます。" },
        { question: "どの AI プロバイダーに対応していますか？", answer: "現在は Gemini、DeepSeek、OpenAI、Claude、Qwen、Xiaomi MiMo に対応しています。" },
        { question: "API キーはどこに保存されますか？", answer: "ログインして保存すると、キーは VidLingo のバックエンドで暗号化されます。拡張機能が完全なキーを再表示することはなく、選択したプロバイダーでの翻訳に使用されます。" },
        { question: "すべての YouTube 動画で使えますか？", answer: "ベータ版では利用可能な YouTube 字幕トラックが必要です。字幕のない動画の音声起こしにはまだ対応していません。" },
        { question: "どの言語に翻訳できますか？", answer: "現在、英語、中国語、日本語、韓国語、スペイン語、フランス語、ドイツ語など 16 の翻訳先言語を選択できます。" },
      ],
    },
    finalCta: { eyebrow: "パブリックベータ", title: "次の動画を、もっと理解しやすく。", description: "VidLingo をインストールし、信頼する AI プロバイダーを接続して、YouTube 動画により良い字幕を作ってみましょう。", button: "Chrome に追加" },
    footer: { product: "動画を最後まで見る人のための AI 字幕。", privacy: "プライバシー", terms: "利用規約", beta: "パブリックベータ · API キーが必要" },
    legal: {
      back: "VidLingo に戻る", updated: "最終更新：2026 年 7 月 14 日", privacyTitle: "プライバシーポリシー", privacyIntro: "本ポリシーは、パブリックベータ中に VidLingo の Web サイトと Chrome 拡張機能を利用する際に処理される情報を説明します。",
      privacySections: [
        { title: "処理する情報", paragraphs: ["ログインに使うメールアドレス、アカウントとセッション識別子、選択した AI プロバイダーとモデル、翻訳ジョブの状態、字幕履歴、および字幕生成に必要な YouTube 動画情報と字幕テキストを処理します。", "Web サイト上でアカウントや API キーの入力を求めることはありません。"] },
        { title: "AI API キー", paragraphs: ["API キーは保存前に暗号化されます。選択したプロバイダーとモデルに翻訳リクエストを送る必要がある場合にのみ復号され、保存後に設定 API から完全なキーが返されることはありません。"] },
        { title: "情報の利用目的", paragraphs: ["アカウント認証、字幕ジョブの処理、設定と履歴の復元、重複作業の防止、セキュリティ維持、障害調査のために利用します。"] },
        { title: "外部サービス", paragraphs: ["字幕テキストと関連する動画文脈は、選択した AI プロバイダーに送信されます。YouTube、AI プロバイダー、メール配信、ホスティング、インフラサービスはそれぞれの規約とポリシーに従いデータを処理します。"] },
        { title: "保持と選択", paragraphs: ["ベータ運用中、またはセキュリティと信頼性のために必要な期間、設定、ジョブ、字幕履歴を保持します。利用はいつでも停止でき、Chrome Web Store のサポート窓口からアカウントデータの削除を依頼できます。"] },
      ],
      termsTitle: "利用規約", termsIntro: "本規約は、パブリックベータ中の VidLingo Web サイトと Chrome 拡張機能に適用されます。",
      termsSections: [
        { title: "ベータサービス", paragraphs: ["VidLingo は実験的なソフトウェアです。機能、稼働状況、対応プロバイダー、データ形式は変更される場合があり、中断のない運用や完全に正確な字幕は保証されません。"] },
        { title: "利用者の責任", paragraphs: ["利用権限のある API キーを使い、YouTube と選択した AI プロバイダーの規約に従ってください。重要な判断に利用する前に、生成された字幕を確認してください。"] },
        { title: "費用", paragraphs: ["ベータ中、VidLingo に AI モデル利用枠は含まれません。プロバイダーから直接課金される場合があり、VidLingo は料金、制限、停止、モデルの可用性に責任を負いません。"] },
        { title: "禁止事項", paragraphs: ["法律、知的財産権、プラットフォームの制限、プロバイダーのポリシーに違反する利用、他者のアカウントの調査、サービスの妨害、所有権のない認証情報の配布を禁止します。"] },
        { title: "変更と終了", paragraphs: ["セキュリティ、不正利用防止、信頼性のために、ベータを変更、一時停止、終了し、アクセスを制限する場合があります。変更公開後の継続利用は、更新後の規約への同意とみなされます。"] },
      ],
    },
  },
} satisfies Record<Locale, SiteCopy>;

export const providers = ["Gemini", "DeepSeek", "OpenAI", "Claude", "Qwen", "Xiaomi MiMo"];
