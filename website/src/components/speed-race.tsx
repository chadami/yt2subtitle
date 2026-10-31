"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteCopy } from "@/lib/i18n";

const LOOP_SECONDS = 9;
// 每条流程中各步骤亮起的时间点（秒）；示意节奏，不代表实测耗时
const TRADITIONAL_AT = [0, 1.6, 5.2, Infinity];
const VIDLINGO_AT = [0, 0.4, 1];

export function SpeedRace({ copy }: { copy: SiteCopy["speed"] }) {
  const [time, setTime] = useState(0);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 减少动态效果时直接显示结束状态
    const observer = new IntersectionObserver(([entry]) => {
      if (reduced) setTime(LOOP_SECONDS - 0.01);
      else setVisible(entry.isIntersecting);
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      setTime(((now - startedAt) / 1000) % LOOP_SECONDS);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const done = time >= VIDLINGO_AT[VIDLINGO_AT.length - 1];
  const traditionalStep = TRADITIONAL_AT.filter((at) => time >= at).length - 1;

  return (
    <div className="speed-race" ref={rootRef}>
      <div className="race-lane lane-traditional">
        <div className="lane-head">
          <strong>{copy.traditional.label}</strong>
          <span>{copy.traditional.unit}</span>
        </div>
        <ol className="lane-steps">
          {copy.traditional.steps.map((step, index) => (
            <li key={step} className={index < traditionalStep ? "is-done" : index === traditionalStep ? "is-current" : undefined}>
              {step}
            </li>
          ))}
        </ol>
        <div className="lane-bar"><span style={{ transform: `scaleX(${Math.min(time / LOOP_SECONDS, 1) * 0.72})` }} /></div>
        <p className="lane-status">{copy.traditional.status}</p>
        <div className="lane-preview" aria-hidden="true" />
      </div>

      <div className={`race-lane lane-vidlingo${done ? " is-finished" : ""}`}>
        <div className="lane-head">
          <strong>VidLingo</strong>
          <span>{copy.vidlingo.unit}</span>
        </div>
        <ol className="lane-steps">
          {copy.vidlingo.steps.map((step, index) => (
            <li key={step} className={time >= VIDLINGO_AT[index] ? "is-done" : undefined}>{step}</li>
          ))}
        </ol>
        <div className="lane-bar"><span style={{ transform: `scaleX(${Math.min(time / VIDLINGO_AT[2], 1)})` }} /></div>
        <p className="lane-status">
          {done ? <><b aria-hidden="true">✓</b> {copy.vidlingo.status}</> : copy.vidlingo.pending}
        </p>
        <div className="lane-preview" aria-hidden="true"><span>{copy.vidlingo.preview}</span></div>
      </div>
      <p className="race-note">{copy.note}</p>
    </div>
  );
}
