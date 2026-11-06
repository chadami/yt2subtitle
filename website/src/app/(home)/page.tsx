import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { chromeWebStoreUrl, getDownloadUrl, siteName, siteUrl } from "@/lib/site";

const title = "VidLingo：点开英文视频，马上看到像样的中文字幕";
const description = "VidLingo 获取 YouTube 现成的字幕，交给 AI 重新分句，并结合上下文翻译。不用下载视频，不用等待识别。由 Mac 应用和 Chrome 插件配合使用。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: siteName,
  alternates: { canonical: siteUrl },
  openGraph: {
    type: "website",
    siteName,
    locale: "zh_CN",
    url: siteUrl,
    title,
    description,
    images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "VidLingo" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og-card.png"] },
};

export default function HomePage() {
  const downloadUrl = getDownloadUrl();

  return (
    <div className="page">
      <header>
        <BrandMark />
        <a className="btn" href={downloadUrl}>下载 Mac 版</a>
      </header>

      <main>
        <section>
          <h1>我只是想点开一个英文视频，马上看到像样的中文字幕。</h1>
          <p>大概从 2022 年开始，我发现 YouTube 自动生成的英文字幕不仅识别不准，断句也不好，自动翻译的结果自然也很糟。那时 AI 刚兴起，还没有又便宜又好用的工具能解决这件事。</p>
          <p>后来有了一款软件，印象里叫 Memo。它把视频下载下来，用 Whisper 之类的模型重新识别，得到准确的字幕和时间点。断句好了，翻译质量也明显上去了。</p>
          <p>直到今天，市面上的方案基本还是这个路子。它很适合字幕组和搬运工，但我只想把视频看完，等不了那么久。</p>
          <p>现在的 AI 聪明、快，而且便宜，YouTube 的英文识别也比以前准了。我想，以现在的水平，完全可以直接把 YouTube 现成的字幕断好句、翻译好。</p>
          <p>于是有了 VidLingo。</p>
        </section>

        <section>
          <h2>原理很简单。</h2>
          <p>VidLingo 获取 YouTube 自动生成或作者上传的字幕，先在本地清洗一遍，再交给 AI 重新分句，并结合上下文翻译。</p>
          <p>花时间的地方是给 AI 的指令。一开始断句问题很多，我反复调了很久，才到现在的水准。</p>
        </section>

        <figure>
          <div className="frame">
            <div className="track">
              <h3>YouTube 自带翻译</h3>
              <div className="cue"><span className="time">00:12</span><span className="en">never have I seen a</span><span className="zh">我从未见过一个</span></div>
              <div className="cue"><span className="time">00:13</span><span className="en">model improve this</span><span className="zh">模型改进这个</span></div>
              <div className="cue"><span className="time">00:15</span><span className="en">quickly</span><span className="zh">很快</span></div>
              <div className="cue"><span className="time">00:16</span><span className="en">[music]</span><span className="zh">[音乐]</span></div>
            </div>
            <div className="track ours">
              <h3>VidLingo</h3>
              <div className="cue"><span className="time">00:12</span><span className="en">Never have I seen a model improve this quickly.</span><span className="zh">我从没见过哪个模型进步得这么快。</span></div>
              <div className="skipped">[music] 已跳过</div>
            </div>
          </div>
          <figcaption>示意图：同一句倒装句的两种结果，不是真实输出。</figcaption>
        </figure>

        <section>
          <h2>比 YouTube 自带的翻译更准，断句也更聪明。</h2>
          <p>专有名词能翻对，用词和句式更符合中文习惯，[music]、[applause] 这类无关内容会自动跳过。</p>
          <p>YouTube 自带的翻译是流式输出的，大部分时候看着很爽，但遇到倒装句之类的就容易卡壳。翻得不准的时候，真的很让人恼火。</p>
        </section>

        <section>
          <h2>比本地 Whisper 快得多。</h2>
          <p>不用等视频下载，不用等识别，机身也不会发烫。字幕几乎秒出，有时画面还没出来，第一条字幕就已经到了。</p>
        </section>

        <section>
          <h2>它也有不完美的地方。</h2>
          <p>第一是时间轴。Whisper 能给每个单词打上时间戳，字幕可以和口型对齐。VidLingo 拿到的时间戳比较粗略，为了断句合理，有时要把一段字幕拆开，拆出来的时间只能估算。所以字幕偶尔会和声音、口型有轻微偏移，不过实际看的时候并不明显。</p>
          <p>第二是完全依赖 YouTube 的字幕。如果视频没有字幕，或者字幕时间线混乱（日语视频尤其明显），VidLingo 就没有办法了。YouTube 对英语的识别最准，其他语言还差一点，所以目前它最适合看英语视频。</p>
        </section>

        <section id="try">
          <p>如果你也只是想把一个英文视频看完，欢迎试试它。</p>
          <p>VidLingo 由 Mac 应用和 Chrome 插件配合使用，翻译走你自己的 AI API Key。目前只支持 macOS。</p>
          <div className="cta">
            <a className="btn" href={downloadUrl}>下载 Mac 版</a>
            <a className="btn btn-quiet" href={chromeWebStoreUrl} target="_blank" rel="noopener">添加到 Chrome</a>
          </div>
        </section>
      </main>

      <SiteFooter locale="zh" />
    </div>
  );
}
