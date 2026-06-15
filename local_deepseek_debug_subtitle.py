#!/usr/bin/env python3
"""
Local DeepSeek subtitle debugging script.

Fill DEEPSEEK_API_KEY below, then run:

  python3 local_deepseek_debug_subtitle.py "https://www.youtube.com/watch?v=VIDEO_ID"

This script reuses the existing YouTube caption download/cleanup helpers from
ai_youtube_subtitle.py, but keeps AI timing strict: the model may only return
source_indexes. Returned start/end fields are ignored.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import tempfile
import urllib.error
from pathlib import Path
from typing import Any

from ai_youtube_subtitle import (
    CaptionCue,
    VideoContext,
    cues_from_vtt,
    extract_video_id,
    fetch_cues,
    fetch_player_response,
    format_timestamp,
    http_post_json,
    make_ai_units,
    normalize_text,
    parse_caption_tracks,
    parse_video_context,
    resolve_overlaps,
    safe_filename,
    sanitize_timing,
    select_track,
    write_srt,
    write_vtt,
)


# Fill this locally. Keep the quotes.
DEEPSEEK_API_KEY = "sk-cde9e7123e7d4c05acd2f8c029ad20e4"

# Change this if DeepSeek exposes the V4 flash model under a different model id.
DEEPSEEK_MODEL = "deepseek-v4-flash"
DEEPSEEK_API_BASE = "https://api.deepseek.com"

# Thinking control for local debugging.
# DEEPSEEK_THINKING_PARAMETER:
# - "reasoning_effort": send {"reasoning_effort": "high"}
# - "thinking": send {"thinking": {"type": "enabled", "effort": "high"}}
# - "none": do not send a thinking control field
DEEPSEEK_REASONING_EFFORT = "high"
DEEPSEEK_THINKING_PARAMETER = "reasoning_effort"
MIN_DURATION = 0.8
BOUNDARY_PUNCTUATION = "，,。.!！?？；;：:……"
SENTENCE_END_MARKS = ("...", "……", "。", ".", "！", "!", "？", "?", "；", ";")


def get_max_chars(target_language: str) -> int:
    lang = target_language.lower()
    if any(code in lang for code in ["zh", "cn", "tw", "hk", "ja", "ko"]):
        return 35
    return 75


def debug_system_prompt(target_language: str) -> str:
    target_lang_lower = target_language.lower()
    if any(code in target_lang_lower for code in ["zh", "cn", "tw", "hk", "ja", "ko"]):
        char_limit_rule = "Hard limit: Max 26 visible characters per cue."
    else:
        char_limit_rule = "Hard limit: Max 60 characters (about 1-2 short lines) per cue."

    return f"""
You are a senior subtitle translator.

Translate YouTube caption cues into natural, concise {target_language} subtitles.

Understanding and correction workflow:
1. Context Analysis: Read video_context.title, video_context.description, and context to infer the video's domain (e.g., consumer electronics, software, finance).
2. Terminology: Extract key domain-specific terms, brands, and proper nouns from context. Decide their correct {target_language} translations.
3. ASR Correction: The English raw_cues are speech-recognition transcripts. Fix spelling, homophone, and punctuation mistakes using your domain knowledge.
4. Translation: Translate the intended meaning into concise {target_language}.

Hard timing rules:
- Return strict JSON only.
- Translate only the words present in raw_cues. Do not complete an unfinished sentence using later context.
- Do not output start or end times.
- Each translated cue must use complete raw cue indexes from source_indexes.
- source_indexes should usually be one cue or contiguous cues, such as [12] or [12, 13].
- Do not reuse the same source index in multiple output cues.
- Do not merge more than 3 source_indexes into one translated cue unless the speech is extremely fast.
- Do not split one complete sentence across multiple subtitle cues.
- Only split subtitles at natural punctuation boundaries.
- Every subtitle cue should end at a natural punctuation boundary whenever it is part of a longer sentence.
- If a translated clause does not naturally end with punctuation, merge it with the next clause instead of outputting it as a separate cue.
- {char_limit_rule}

Return exactly:
{{
  "context_analysis": {{
    "topic": "Brief topic summary",
    "key_terms": {{"English term": "Translated term"}}
  }},
  "cues": [
    {{"source_indexes":[12,13],"source":"source text","translation":"translated subtitle"}}
  ]
}}
""".strip()


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def parse_source_indexes(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    indexes: list[int] = []
    for item in value:
        try:
            indexes.append(int(item))
        except (TypeError, ValueError):
            continue
    return sorted(set(indexes))


def build_debug_user_payload(
    cues: list[CaptionCue],
    *,
    video_context: VideoContext,
    previous_context: list[CaptionCue],
) -> str:
    rows = [
        {"i": cue.index, "start": round(cue.start, 3), "end": round(cue.end, 3), "text": cue.text}
        for cue in cues
    ]
    prev_rows = [
        {"i": cue.index, "start": round(cue.start, 3), "end": round(cue.end, 3), "text": cue.text}
        for cue in previous_context
    ]
    return json.dumps(
        {
            "instruction": (
                "Translate raw_cues only. previous_context and video_context are only for "
                "domain, terminology, tone, and pronoun understanding. Do not translate, "
                "summarize, or complete content from previous_context or any future context. "
                "If a sentence in raw_cues is unfinished, translate only the unfinished part "
                "that is present in raw_cues."
            ),
            "video_context": {
                "title": video_context.title,
                "channel": video_context.channel,
                "description": video_context.description,
            },
            "previous_context": prev_rows,
            "raw_cues": rows,
        },
        ensure_ascii=False,
    )


def split_text_by_punctuation(text: str) -> tuple[str, str]:
    text = normalize_text(text)
    if len(text) <= 1:
        return text, ""

    midpoint = len(text) / 2
    punctuation = ("...", "……", "，", ",", "。", ".", "！", "!", "？", "?", "；", ";", "：", ":")
    candidates = [
        index + len(mark)
        for mark in punctuation
        for index in find_all(text, mark)
        if 0 < index + len(mark) < len(text)
    ]
    if not candidates:
        return text, ""

    split_at = min(candidates, key=lambda index: abs(index - midpoint))

    part1 = normalize_text(text[:split_at])
    part2 = normalize_text(text[split_at:])
    return part1, part2


def find_all(text: str, needle: str) -> list[int]:
    indexes: list[int] = []
    start = 0
    while True:
        index = text.find(needle, start)
        if index < 0:
            return indexes
        indexes.append(index)
        start = index + len(needle)


def ends_at_natural_boundary(text: str) -> bool:
    return normalize_text(text).rstrip().endswith(tuple(BOUNDARY_PUNCTUATION))


def first_sentence_split_index(text: str) -> int | None:
    candidates = [
        index + len(mark)
        for mark in SENTENCE_END_MARKS
        for index in find_all(text, mark)
        if 0 < index + len(mark) < len(text)
    ]
    return min(candidates) if candidates else None


def split_cue_text_at(cue: CaptionCue, split_at: int) -> tuple[CaptionCue, CaptionCue | None]:
    text = normalize_text(cue.text)
    first_text = normalize_text(text[:split_at])
    rest_text = normalize_text(text[split_at:])
    if not first_text:
        return cue, None
    ratio = len(first_text) / max(1, len(text))
    split_time = cue.start + (cue.end - cue.start) * ratio
    if (cue.end - cue.start) >= MIN_DURATION * 2:
        split_time = min(max(split_time, cue.start + MIN_DURATION), cue.end - MIN_DURATION)
    else:
        split_time = cue.start + (cue.end - cue.start) / 2
    first = CaptionCue(cue.start, split_time, first_text)
    rest = CaptionCue(split_time, cue.end, rest_text) if rest_text else None
    return first, rest


def split_long_cue_by_punctuation(cue: CaptionCue, max_chars: int) -> list[CaptionCue]:
    text = normalize_text(cue.text)
    if len(text) <= max_chars:
        return [cue]
    part1, part2 = split_text_by_punctuation(text)
    if not part1 or not part2 or part1 == text:
        return [cue]
    if cue.end - cue.start < MIN_DURATION * 2:
        return [cue]
    ratio = len(part1) / max(1, len(text))
    split_time = cue.start + (cue.end - cue.start) * ratio
    split_time = min(max(split_time, cue.start + MIN_DURATION), cue.end - MIN_DURATION)
    first = CaptionCue(cue.start, split_time, part1)
    second = CaptionCue(split_time, cue.end, part2)
    return split_long_cue_by_punctuation(first, max_chars) + split_long_cue_by_punctuation(second, max_chars)


def split_long_cues_by_punctuation(cues: list[CaptionCue], max_chars: int) -> list[CaptionCue]:
    output: list[CaptionCue] = []
    for cue in cues:
        output.extend(split_long_cue_by_punctuation(cue, max_chars))
    return output


def merge_incomplete_sentence_cues(cues: list[CaptionCue], max_chars: int) -> list[CaptionCue]:
    if not cues:
        return cues

    merged: list[CaptionCue] = []
    buffer: CaptionCue | None = None

    for cue in sorted(cues, key=lambda item: (item.start, item.end)):
        text = normalize_text(cue.text)
        if not text:
            continue
        current = CaptionCue(cue.start, cue.end, text)
        if buffer is None:
            buffer = current
        else:
            buffer = CaptionCue(
                start=buffer.start,
                end=max(buffer.end, current.end),
                text=normalize_text(f"{buffer.text}{current.text}"),
            )

        while buffer is not None:
            split_at = first_sentence_split_index(buffer.text)
            if split_at is not None:
                completed, rest = split_cue_text_at(buffer, split_at)
                merged.append(completed)
                buffer = rest
                continue
            if ends_at_natural_boundary(buffer.text):
                merged.append(buffer)
                buffer = None
            break

    if buffer is not None:
        merged.append(buffer)
    return split_long_cues_by_punctuation(merged, max_chars)


def apply_deepseek_thinking(payload: dict[str, Any], *, effort: str, parameter: str) -> None:
    effort = effort.strip().lower()
    parameter = parameter.strip().lower()
    if parameter == "none" or not effort:
        return
    if effort not in {"low", "medium", "high"}:
        raise ValueError("--reasoning-effort must be low, medium, high, or empty")
    if parameter == "reasoning_effort":
        payload["reasoning_effort"] = effort
        return
    if parameter == "thinking":
        payload["thinking"] = {"type": "enabled", "effort": effort}
        return
    raise ValueError("--thinking-parameter must be reasoning_effort, thinking, or none")


def translate_one_group_strict(
    group: list[CaptionCue],
    *,
    video_context: VideoContext,
    previous_context: list[CaptionCue],
    target_language: str,
    api_key: str,
    model: str,
    api_base: str,
    reasoning_effort: str,
    thinking_parameter: str,
) -> tuple[list[CaptionCue], list[dict[str, Any]]]:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": debug_system_prompt(target_language)},
            {
                "role": "user",
                "content": build_debug_user_payload(
                    group,
                    video_context=video_context,
                    previous_context=previous_context,
                ),
            },
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    apply_deepseek_thinking(payload, effort=reasoning_effort, parameter=thinking_parameter)
    response = http_post_json(
        api_base.rstrip("/") + "/chat/completions",
        payload,
        api_key=api_key,
    )
    content = response["choices"][0]["message"]["content"]
    data = parse_json_object(content)

    group_by_index = {cue.index: cue for cue in group}
    used_indexes: set[int] = set()
    output: list[CaptionCue] = []
    debug_rows: list[dict[str, Any]] = []

    max_chars = get_max_chars(target_language)

    for item in data.get("cues", []):
        if not isinstance(item, dict):
            continue
        source_indexes = parse_source_indexes(item.get("source_indexes"))
        source_indexes = [index for index in source_indexes if index in group_by_index]
        if not source_indexes:
            continue
        if any(index in used_indexes for index in source_indexes):
            continue
        if max(source_indexes) - min(source_indexes) > 10:
            continue

        source_cues = [group_by_index[index] for index in source_indexes]
        text = normalize_text(str(item.get("translation") or item.get("text") or ""))
        if not text:
            continue

        start = min(cue.start for cue in source_cues)
        end = max(cue.end for cue in source_cues)
        if (end - start) < MIN_DURATION:
            end = start + MIN_DURATION

        if len(text) > max_chars:
            part1, part2 = split_text_by_punctuation(text)
            if part1 and part2:
                if (end - start) < MIN_DURATION * 2:
                    end = start + MIN_DURATION * 2
                ratio = len(part1) / len(text)
                mid_time = start + (end - start) * ratio
                mid_time = min(max(mid_time, start + MIN_DURATION), end - MIN_DURATION)
                output.append(CaptionCue(start=start, end=mid_time, text=part1))
                output.append(CaptionCue(start=mid_time, end=end, text=part2))
                used_indexes.update(source_indexes)
                debug_rows.append(
                    {
                        "source_indexes": source_indexes,
                        "start": round(start, 3),
                        "end": round(mid_time, 3),
                        "source": " ".join(cue.text for cue in source_cues),
                        "translation": part1,
                        "split_part": 1,
                    }
                )
                debug_rows.append(
                    {
                        "source_indexes": source_indexes,
                        "start": round(mid_time, 3),
                        "end": round(end, 3),
                        "source": " ".join(cue.text for cue in source_cues),
                        "translation": part2,
                        "split_part": 2,
                    }
                )
                continue

        output.append(CaptionCue(start=start, end=end, text=text))
        used_indexes.update(source_indexes)
        debug_rows.append(
            {
                "source_indexes": source_indexes,
                "start": round(start, 3),
                "end": round(end, 3),
                "source": " ".join(cue.text for cue in source_cues),
                "translation": text,
            }
        )

    if not output:
        raise ValueError("AI returned no valid strict source_indexes for a chunk.")
    return output, debug_rows


def translate_groups_strict(
    groups: list[list[CaptionCue]],
    *,
    target_language: str,
    api_key: str,
    model: str,
    api_base: str,
    reasoning_effort: str,
    thinking_parameter: str,
    video_context: VideoContext,
) -> tuple[list[CaptionCue], list[dict[str, Any]]]:
    translated: list[CaptionCue] = []
    debug_rows: list[dict[str, Any]] = []

    for group_number, group in enumerate(groups, start=1):
        print(f"DeepSeek processing chunk {group_number}/{len(groups)}...", file=sys.stderr)
        previous_context = groups[group_number - 2][-8:] if group_number > 1 else []
        cues, rows = translate_one_group_strict(
            group,
            video_context=video_context,
            previous_context=previous_context,
            target_language=target_language,
            api_key=api_key,
            model=model,
            api_base=api_base,
            reasoning_effort=reasoning_effort,
            thinking_parameter=thinking_parameter,
        )
        translated.extend(cues)
        debug_rows.extend(rows)
        time.sleep(0.2)

    max_chars = get_max_chars(target_language)
    merged = merge_incomplete_sentence_cues(translated, max_chars)
    if len(merged) != len(translated):
        print(
            f"Merged {len(translated) - len(merged)} subtitle fragments without punctuation boundaries.",
            file=sys.stderr,
        )
    return sanitize_timing(merged), debug_rows


def write_debug_json(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def print_preview(cues: list[CaptionCue], limit: int = 8) -> None:
    print("Preview:", file=sys.stderr)
    for cue in cues[:limit]:
        start = format_timestamp(cue.start, sep=".")
        end = format_timestamp(cue.end, sep=".")
        print(f"  {start} --> {end}  {cue.text}", file=sys.stderr)


def fetch_cues_with_ytdlp(video_id: str, source_lang: str) -> list[CaptionCue]:
    yt_dlp = shutil.which("yt-dlp")
    if not yt_dlp:
        return []

    with tempfile.TemporaryDirectory(prefix="yt-sub-debug-") as temp_dir:
        output_template = str(Path(temp_dir) / "%(id)s.%(ext)s")
        command = [
            yt_dlp,
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            source_lang,
            "--sub-format",
            "vtt",
            "-o",
            output_template,
            f"https://www.youtube.com/watch?v={video_id}",
        ]
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        if result.returncode != 0:
            print(result.stderr.strip(), file=sys.stderr)
            return []

        vtt_files = sorted(Path(temp_dir).glob("*.vtt"))
        if not vtt_files:
            return []
        cues = cues_from_vtt(vtt_files[0].read_text(encoding="utf-8", errors="replace"))
        return collapse_ytdlp_auto_cues(cues)


def collapse_ytdlp_auto_cues(cues: list[CaptionCue]) -> list[CaptionCue]:
    short_cues = [cue for cue in cues if cue.end - cue.start <= 0.08 and cue.text]
    if len(short_cues) < max(3, len(cues) // 8):
        return cues

    collapsed: list[CaptionCue] = []
    pending_start: float | None = None
    pending_end: float | None = None
    for cue in cues:
        duration = cue.end - cue.start
        if duration > 0.08:
            pending_start = cue.start
            pending_end = cue.end
            continue
        if pending_start is None or (pending_end is not None and cue.start - pending_end > 0.35):
            pending_start = max(collapsed[-1].end if collapsed else 0, cue.end - MIN_DURATION)
        text = normalize_text(cue.text)
        if not text:
            continue
        collapsed.append(CaptionCue(start=pending_start, end=max(cue.end, pending_start + 0.2), text=text))
        pending_start = None
        pending_end = None

    return collapsed or cues


def main() -> int:
    parser = argparse.ArgumentParser(description="Local DeepSeek V4 flash YouTube subtitle debugger.")
    parser.add_argument("url", nargs="?", help="YouTube URL or 11-character video id")
    parser.add_argument("--source-lang", default="en", help="Preferred source caption language, default: en")
    parser.add_argument("--target-lang", default="zh-Hans", help="Target language, default: zh-Hans")
    parser.add_argument("--format", choices=["vtt", "srt"], default="vtt", help="Output format")
    parser.add_argument("--output", help="Output subtitle path")
    parser.add_argument("--debug-json", help="Output timing/debug JSON path")
    parser.add_argument("--model", default=os.getenv("DEEPSEEK_MODEL", DEEPSEEK_MODEL))
    parser.add_argument("--api-base", default=os.getenv("DEEPSEEK_API_BASE", DEEPSEEK_API_BASE))
    parser.add_argument("--api-key", default=os.getenv("DEEPSEEK_API_KEY", DEEPSEEK_API_KEY))
    parser.add_argument(
        "--reasoning-effort",
        default=os.getenv("DEEPSEEK_REASONING_EFFORT", DEEPSEEK_REASONING_EFFORT),
        help="Thinking effort to send to DeepSeek: low, medium, high, or empty. Default: high",
    )
    parser.add_argument(
        "--thinking-parameter",
        choices=["reasoning_effort", "thinking", "none"],
        default=os.getenv("DEEPSEEK_THINKING_PARAMETER", DEEPSEEK_THINKING_PARAMETER),
        help="How to send thinking control. Default: reasoning_effort",
    )
    parser.add_argument("--no-auto", action="store_true", help="Do not use auto-generated captions")
    args = parser.parse_args()

    url = args.url or input("YouTube URL: ").strip()
    api_key = (args.api_key or "").strip()
    if not api_key:
        print("Error: fill DEEPSEEK_API_KEY in this script, or pass --api-key.", file=sys.stderr)
        return 1

    try:
        video_id = extract_video_id(url)
        player = fetch_player_response(video_id)
        video_context = parse_video_context(player)
        if video_context.title:
            print(f"Video title: {video_context.title}", file=sys.stderr)
        if video_context.channel:
            print(f"Channel: {video_context.channel}", file=sys.stderr)

        tracks = parse_caption_tracks(player)
        track = select_track(tracks, language=args.source_lang, allow_auto=not args.no_auto)
        track_kind = "auto" if track.is_auto else "manual"
        print(f"Selected caption track: {track.language_code} ({track_kind}) {track.name}", file=sys.stderr)

        raw_cues = fetch_cues(track)
        if not raw_cues:
            print("Timedtext returned no cues; trying yt-dlp subtitle fallback...", file=sys.stderr)
            raw_cues = fetch_cues_with_ytdlp(video_id, track.language_code or args.source_lang)
        if not raw_cues:
            raise ValueError("Caption track exists, but no usable cue text was downloaded.")
        print(f"Downloaded {len(raw_cues)} raw cues.", file=sys.stderr)

        clean_cues = resolve_overlaps(raw_cues)
        print(f"Cleaned to {len(clean_cues)} non-overlapping cues.", file=sys.stderr)

        groups = make_ai_units(clean_cues)
        translated_cues, debug_rows = translate_groups_strict(
            groups,
            target_language=args.target_lang,
            api_key=api_key,
            model=args.model,
            api_base=args.api_base,
            reasoning_effort=args.reasoning_effort,
            thinking_parameter=args.thinking_parameter,
            video_context=video_context,
        )

        output_path = Path(args.output or f"{safe_filename(video_id)}.{args.target_lang}.{args.format}")
        if args.format == "srt":
            write_srt(translated_cues, output_path)
        else:
            write_vtt(translated_cues, output_path)

        debug_path = Path(args.debug_json or f"{safe_filename(video_id)}.{args.target_lang}.debug.json")
        write_debug_json(debug_path, debug_rows)

        print_preview(translated_cues)
        print(f"Subtitle saved: {output_path}")
        print(f"Debug JSON saved: {debug_path}")
        return 0
    except urllib.error.HTTPError as exc:
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
