"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import type { Cue, DemoClip } from "@/lib/demo-clips";
import type { Locale, SiteCopy } from "@/lib/i18n";

type Track = "youtube" | "vidlingo";

const cueAt = (cues: Cue[], time: number) => cues.find((cue) => time >= cue.start && time < cue.end);

export function SubtitleCompare({ clips, copy, locale }: { clips: DemoClip[]; copy: SiteCopy["compare"]; locale: Locale }) {
  const [clipIndex, setClipIndex] = useState(0);
  const [track, setTrack] = useState<Track>("youtube");
  // 用户点过轨道或片段后不再自动切换，避免和用户抢控制权
  const [auto, setAuto] = useState(true);
  const [time, setTime] = useState(0);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip = clips[clipIndex];

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 每播完一遍：YouTube → VidLingo → 下一个片段；系统要求减少动态效果时不自动切换
  const onLoop = useEffectEvent(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (track === "youtube") setTrack("vidlingo");
    else {
      setTrack("youtube");
      setTime(0);
      setClipIndex((index) => (index + 1) % clips.length);
    }
  });

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (visible) void video.play().catch(() => {});
      else video.pause();
    }
    if (!visible) return;

    let frame = 0;
    let last = performance.now();
    let previous = video ? video.currentTime : 0;
    let elapsed = previous;
    const tick = (now: number) => {
      if (video) {
        const current = video.currentTime;
        if (current + 0.5 < previous) onLoop();
        previous = current;
        setTime(current);
      } else {
        elapsed += (now - last) / 1000;
        last = now;
        if (elapsed >= clip.duration) {
          elapsed = 0;
          onLoop();
        }
        setTime(elapsed);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, clip]);

  const choose = (next: Track) => {
    setAuto(false);
    setTrack(next);
  };
  const chooseClip = (index: number) => {
    setAuto(false);
    setTime(0);
    setClipIndex(index);
  };

  const active = cueAt(clip[track], time);
  const progress = Math.min(time / clip.duration, 1);
  const tracks: Array<{ id: Track; label: string }> = [
    { id: "youtube", label: copy.youtubeLabel },
    { id: "vidlingo", label: copy.vidlingoLabel },
  ];

  return (
    <div className="subtitle-compare" ref={rootRef}>
      <div className="compare-toolbar">
        <div className="clip-tabs" role="tablist" aria-label={copy.clipsLabel}>
          {clips.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === clipIndex}
              className={index === clipIndex ? "is-active" : undefined}
              onClick={() => chooseClip(index)}
            >
              {item.label[locale]}
            </button>
          ))}
        </div>
        <div className="track-switch" role="group" aria-label={copy.tracksLabel}>
          {tracks.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={track === item.id}
              className={`track-${item.id}${track === item.id ? " is-active" : ""}`}
              onClick={() => choose(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="compare-stage">
        {clip.video ? (
          <video
            key={clip.id}
            ref={videoRef}
            src={clip.video}
            poster={clip.poster}
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <Image src={clip.poster} alt="" fill sizes="(max-width: 760px) 92vw, 1080px" priority />
        )}
        <span className={`stage-tag tag-${track}`}>{track === "youtube" ? copy.youtubeLabel : copy.vidlingoLabel}</span>
        {clip.isSample && <span className="sample-badge">{copy.sampleBadge}</span>}
        <div className="stage-caption-area" aria-live="off">
          {active && (
            <p key={`${clip.id}-${track}-${active.start}`} className={`stage-caption caption-${track}`}>
              {active.text}
            </p>
          )}
        </div>
        <div className="stage-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
      </div>

      <div className="cue-timeline" aria-hidden="true">
        {tracks.map((item) => (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            className={`cue-row row-${item.id}${track === item.id ? " is-active" : ""}`}
            onClick={() => choose(item.id)}
          >
            <span className="cue-row-label">
              {item.label}
              <small>{copy.cueCount.replace("{count}", String(clip[item.id].length))}</small>
            </span>
            <span className="cue-row-track">
              {clip[item.id].map((cue) => (
                <span
                  key={cue.start}
                  className={`cue-block${time >= cue.start && time < cue.end ? " is-current" : ""}`}
                  style={{ left: `${(cue.start / clip.duration) * 100}%`, width: `${((cue.end - cue.start) / clip.duration) * 100}%` } as CSSProperties}
                >
                  <span>{cue.text}</span>
                </span>
              ))}
              <i className="cue-playhead" style={{ left: `${progress * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
      {clip.source.url && (
        <p className="compare-source">
          {copy.sourceLabel} <a href={clip.source.url} target="_blank" rel="noopener noreferrer">{clip.source.channel} · {clip.source.title}</a>
        </p>
      )}
    </div>
  );
}
