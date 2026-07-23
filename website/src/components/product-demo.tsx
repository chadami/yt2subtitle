import Image from "next/image";
import type { CSSProperties } from "react";
import type { SiteCopy } from "@/lib/i18n";

const rollingSubtitles = [
  { language: "中文", text: "假设你想在每次下班时告诉伴侣你什么时候到家。" },
  { language: "日本語", text: "仕事を終えるたびに、何時に帰宅するかをパートナーに知らせたいとします。" },
  { language: "한국어", text: "퇴근할 때마다 파트너에게 몇 시에 집에 도착할지 알려주고 싶다고 가정해 봅시다." },
  { language: "ไทย", text: "สมมติว่าคุณต้องการบอกคนรักว่าคุณจะถึงบ้านกี่โมงทุกครั้งที่เลิกงาน" },
] as const;

export function ProductDemo({ copy }: { copy: SiteCopy["demo"] }) {
  return (
    <div className="product-demo" role="img" aria-label={copy.aria}>
      <div className="browser-bar">
        <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
        <div className="address-bar"><span aria-hidden="true">◉</span> youtube.com/watch</div>
      </div>
      <div className="demo-body">
        <div className="video-side">
          <div className="video-frame">
            <div className="video-scene">
              <Image
                src="/demo-video-frame.jpg"
                alt=""
                fill
                sizes="(max-width: 760px) 92vw, 64vw"
                priority
              />
            </div>
            <div className="caption-stack">
              <div className="caption raw-caption"><small>{copy.original}</small>{copy.originalText}</div>
              <div className="caption translated-caption" aria-live="off">
                {rollingSubtitles.map((subtitle, index) => (
                  <span
                    className="rolling-subtitle"
                    style={{ "--subtitle-index": index } as CSSProperties}
                    key={subtitle.language}
                  >
                    <small>{subtitle.language}</small>{subtitle.text}
                  </span>
                ))}
              </div>
            </div>
            <div className="timeline"><span /></div>
          </div>
          <div className="video-meta"><strong>{copy.videoTitle}</strong><span>{copy.channel}</span></div>
        </div>
        <aside className="settings-panel">
          <div className="panel-heading">
            <Image className="mini-mark" src="/vidlingo-icon.png" width={128} height={128} alt="" aria-hidden="true" />
            <div><strong>VidLingo</strong><span>Subtitle workspace</span></div>
          </div>
          <div className="status-row"><span className="status-dot" />{copy.status}</div>
          <div className="context-chip">{copy.context}</div>
          <div className="field-grid">
            <div className="demo-field"><span>{copy.provider}</span><strong>DeepSeek</strong></div>
            <div className="demo-field"><span>{copy.model}</span><strong>DeepSeekV4</strong></div>
            <div className="demo-field full"><span>{copy.target}</span><strong>{copy.targetValue}</strong></div>
          </div>
          <div className="saved-row"><span aria-hidden="true">✓</span>{copy.saved}</div>
        </aside>
      </div>
    </div>
  );
}
