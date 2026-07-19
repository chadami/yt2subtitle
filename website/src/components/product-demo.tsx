import Image from "next/image";
import type { SiteCopy } from "@/lib/i18n";

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
              <span className="scene-orbit orbit-one" />
              <span className="scene-orbit orbit-two" />
              <span className="scene-core" />
            </div>
            <div className="caption-stack">
              <div className="caption raw-caption"><small>{copy.original}</small>{copy.originalText}</div>
              <div className="caption translated-caption"><small>{copy.translated}</small>{copy.translatedText}</div>
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
