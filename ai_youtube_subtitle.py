#!/usr/bin/env python3
"""
Generate AI-translated YouTube subtitles from an existing caption track.

The script intentionally uses only Python standard-library modules so the first
prototype can run without package installation.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any


# Optional local API keys. Fill these in if you do not want to export env vars.
# Keep the quotes. Do not commit this file with a real key.
DEEPSEEK_API_KEY_HERE = ""
OPENAI_API_KEY_HERE = ""

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)
INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player"
INNERTUBE_CONTEXT = {"client": {"clientName": "ANDROID", "clientVersion": "20.10.38"}}


@dataclass
class CaptionTrack:
    name: str
    language_code: str
    is_auto: bool
    base_url: str
    vss_id: str = ""


@dataclass
class CaptionCue:
    start: float
    end: float
    text: str
    index: int = -1


@dataclass
class VideoContext:
    title: str = ""
    channel: str = ""
    description: str = ""


def http_get(url: str, *, headers: dict[str, str] | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def http_post_json(url: str, payload: dict[str, Any], *, api_key: str) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def provider_defaults(provider: str) -> tuple[str, str, str]:
    if provider == "deepseek":
        return (
            "DEEPSEEK_API_KEY",
            "https://api.deepseek.com",
            "deepseek-v4-pro",
        )
    return (
        "OPENAI_API_KEY",
        "https://api.openai.com/v1",
        "gpt-4.1-mini",
    )


def configured_api_key(provider: str, cli_key: str | None) -> str | None:
    if cli_key:
        return cli_key
    if provider == "deepseek":
        return DEEPSEEK_API_KEY_HERE.strip() or os.getenv("DEEPSEEK_API_KEY")
    return OPENAI_API_KEY_HERE.strip() or os.getenv("OPENAI_API_KEY")


def default_provider() -> str:
    if os.getenv("AI_PROVIDER"):
        return os.getenv("AI_PROVIDER", "openai")
    if DEEPSEEK_API_KEY_HERE.strip() or os.getenv("DEEPSEEK_API_KEY"):
        return "deepseek"
    return "openai"


def extract_video_id(value: str) -> str:
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value

    parsed = urllib.parse.urlparse(value)
    host = parsed.netloc.lower()
    if "youtu.be" in host:
        video_id = parsed.path.strip("/").split("/")[0]
    elif parsed.path.startswith("/shorts/") or parsed.path.startswith("/embed/"):
        video_id = parsed.path.strip("/").split("/")[1]
    else:
        video_id = urllib.parse.parse_qs(parsed.query).get("v", [""])[0]

    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError(f"Could not extract a YouTube video id from: {value}")
    return video_id


def find_balanced_json(text: str, marker: str) -> dict[str, Any]:
    marker_index = text.find(marker)
    if marker_index < 0:
        raise ValueError(f"Could not find {marker}")

    start = text.find("{", marker_index)
    if start < 0:
        raise ValueError(f"Could not find JSON object after {marker}")

    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(text[start : idx + 1])

    raise ValueError(f"Could not parse JSON object after {marker}")


def fetch_player_response(video_id: str) -> dict[str, Any]:
    url = f"https://www.youtube.com/watch?v={video_id}&hl=en"
    page = http_get(url, headers={"Accept-Language": "en-US"}).decode("utf-8", errors="replace")
    if 'action="https://consent.youtube.com/s"' in page:
        consent_match = re.search(r'name="v" value="(.*?)"', page)
        if consent_match:
            page = http_get(
                url,
                headers={
                    "Accept-Language": "en-US",
                    "Cookie": f"CONSENT=YES+{consent_match.group(1)}",
                },
            ).decode("utf-8", errors="replace")

    api_key_match = re.search(r'"INNERTUBE_API_KEY":\s*"([A-Za-z0-9_-]+)"', page)
    if api_key_match:
        try:
            return fetch_innertube_player(video_id, api_key_match.group(1))
        except Exception as exc:
            print(f"InnerTube player request failed, falling back to page JSON: {exc}", file=sys.stderr)

    return find_balanced_json(page, "ytInitialPlayerResponse")


def fetch_innertube_player(video_id: str, api_key: str) -> dict[str, Any]:
    url = f"{INNERTUBE_URL}?key={urllib.parse.quote(api_key)}"
    payload = {"context": INNERTUBE_CONTEXT, "videoId": video_id}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    status = data.get("playabilityStatus", {}).get("status")
    if status and status != "OK":
        reason = data.get("playabilityStatus", {}).get("reason", "")
        raise ValueError(f"YouTube player status is {status}: {reason}")
    return data


def parse_caption_tracks(player_response: dict[str, Any]) -> list[CaptionTrack]:
    renderer = (
        player_response.get("captions", {})
        .get("playerCaptionsTracklistRenderer", {})
    )
    tracks = []
    for raw in renderer.get("captionTracks", []) or []:
        name_obj = raw.get("name", {})
        name = "".join(run.get("text", "") for run in name_obj.get("runs", []))
        if not name:
            name = name_obj.get("simpleText", "") or raw.get("languageCode", "")
        tracks.append(
            CaptionTrack(
                name=name,
                language_code=raw.get("languageCode", ""),
                is_auto=raw.get("kind") == "asr",
                base_url=raw.get("baseUrl", ""),
                vss_id=raw.get("vssId", ""),
            )
        )
    return [track for track in tracks if track.base_url]


def parse_video_context(player_response: dict[str, Any], *, max_description_chars: int = 1800) -> VideoContext:
    details = player_response.get("videoDetails", {}) or {}
    microformat = player_response.get("microformat", {}).get("playerMicroformatRenderer", {}) or {}
    title = details.get("title") or text_from_runs(microformat.get("title")) or ""
    channel = details.get("author") or microformat.get("ownerChannelName") or ""
    description = (
        details.get("shortDescription")
        or text_from_runs(microformat.get("description"))
        or ""
    )
    description = normalize_text(description)
    if len(description) > max_description_chars:
        description = description[:max_description_chars].rstrip() + "..."
    return VideoContext(
        title=normalize_text(title),
        channel=normalize_text(channel),
        description=description,
    )


def text_from_runs(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    if isinstance(value.get("simpleText"), str):
        return value["simpleText"]
    runs = value.get("runs")
    if isinstance(runs, list):
        return "".join(str(run.get("text", "")) for run in runs if isinstance(run, dict))
    return ""


def select_track(
    tracks: list[CaptionTrack],
    *,
    language: str | None,
    allow_auto: bool,
) -> CaptionTrack:
    candidates = [track for track in tracks if allow_auto or not track.is_auto]
    if language:
        exact = [track for track in candidates if track.language_code == language]
        if exact:
            return prefer_manual(exact)
        prefix = [track for track in candidates if track.language_code.startswith(language)]
        if prefix:
            return prefer_manual(prefix)

    if candidates:
        return prefer_manual(candidates)
    raise ValueError("No usable caption track found with the current filters.")


def prefer_manual(tracks: list[CaptionTrack]) -> CaptionTrack:
    manual = [track for track in tracks if not track.is_auto]
    return manual[0] if manual else tracks[0]


def with_query(url: str, **params: str) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    for key, value in params.items():
        query[key] = [value]
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(query, doseq=True))
    )


def fetch_cues(track: CaptionTrack) -> list[CaptionCue]:
    json_url = with_query(track.base_url, fmt="json3")
    try:
        data = json.loads(http_get(json_url).decode("utf-8"))
        cues = cues_from_json3(data)
        if cues:
            return cues
    except Exception:
        pass

    xml_url = with_query(track.base_url, fmt="srv3")
    try:
        xml_text = http_get(xml_url).decode("utf-8", errors="replace")
        if xml_text.strip():
            cues = cues_from_xml(xml_text)
            if cues:
                return cues
    except Exception:
        pass

    vtt_url = with_query(track.base_url, fmt="vtt")
    vtt_text = http_get(vtt_url).decode("utf-8", errors="replace")
    return cues_from_vtt(vtt_text)


def cues_from_json3(data: dict[str, Any]) -> list[CaptionCue]:
    cues = []
    for event in data.get("events", []) or []:
        if "segs" not in event:
            continue
        start = float(event.get("tStartMs", 0)) / 1000
        duration = float(event.get("dDurationMs", 0)) / 1000
        text = "".join(seg.get("utf8", "") for seg in event.get("segs", []))
        text = normalize_text(text)
        if text:
            cues.append(CaptionCue(start=start, end=start + duration, text=text))
    return merge_zero_length(cues)


def cues_from_xml(xml_text: str) -> list[CaptionCue]:
    root = ET.fromstring(xml_text)
    cues = []
    for node in root.findall(".//text"):
        start = float(node.attrib.get("start", "0"))
        duration = float(node.attrib.get("dur", "0"))
        text = normalize_text(html.unescape(node.text or ""))
        if text:
            cues.append(CaptionCue(start=start, end=start + duration, text=text))
    return merge_zero_length(cues)


def cues_from_vtt(vtt_text: str) -> list[CaptionCue]:
    cues = []
    lines = vtt_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        if "-->" not in line:
            idx += 1
            continue

        start_raw, end_raw = [part.strip().split(" ")[0] for part in line.split("-->", 1)]
        start = parse_vtt_timestamp(start_raw)
        end = parse_vtt_timestamp(end_raw)
        idx += 1

        text_lines = []
        while idx < len(lines) and lines[idx].strip():
            text_lines.append(lines[idx].strip())
            idx += 1

        text = normalize_text(strip_vtt_tags(" ".join(text_lines)))
        if text:
            cues.append(CaptionCue(start=start, end=end, text=text))
    return merge_zero_length(cues)


def parse_vtt_timestamp(value: str) -> float:
    match = re.fullmatch(r"(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})", value)
    if not match:
        raise ValueError(f"Invalid VTT timestamp: {value}")
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2))
    seconds = int(match.group(3))
    millis = int(match.group(4))
    return hours * 3600 + minutes * 60 + seconds + millis / 1000


def strip_vtt_tags(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    return html.unescape(value)


def merge_zero_length(cues: list[CaptionCue]) -> list[CaptionCue]:
    cleaned = []
    for idx, cue in enumerate(cues):
        end = cue.end
        if end <= cue.start:
            if idx + 1 < len(cues):
                end = max(cue.start + 0.4, cues[idx + 1].start)
            else:
                end = cue.start + 2.0
        cleaned.append(CaptionCue(cue.start, end, cue.text))
    return cleaned


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\n", " ")).strip()


def strip_speaker_marker(text: str) -> str:
    text = re.sub(r"^\s*>+\s*", "", text)
    text = re.sub(r"^\s*[A-Z][A-Za-z ._-]{0,24}:\s+", "", text)
    return normalize_text(text)


def is_short_backchannel(text: str) -> bool:
    normalized = strip_speaker_marker(text).lower().strip(" .!?")
    if normalized in {
        "yes",
        "yeah",
        "yep",
        "no",
        "okay",
        "ok",
        "right",
        "sure",
        "exactly",
        "mm-hmm",
        "uh-huh",
    }:
        return True
    return len(normalized) <= 12 and len(normalized.split()) <= 3


def join_caption_text(first: str, second: str) -> str:
    first = strip_speaker_marker(first)
    second = strip_speaker_marker(second)
    if not first:
        return second
    if not second:
        return first
    return normalize_text(f"{first} {second}")


def resolve_overlaps(cues: list[CaptionCue]) -> list[CaptionCue]:
    """Convert overlapping YouTube caption cues into a single-track timeline."""
    normalized = [
        CaptionCue(cue.start, cue.end, strip_speaker_marker(cue.text))
        for cue in sorted(cues, key=lambda item: (item.start, item.end))
        if strip_speaker_marker(cue.text)
    ]
    resolved: list[CaptionCue] = []
    idx = 0
    while idx < len(normalized):
        cue = normalized[idx]
        if idx + 1 < len(normalized):
            next_cue = normalized[idx + 1]
            overlap = cue.end - next_cue.start
            if overlap > 0.05:
                if is_short_backchannel(cue.text) and len(next_cue.text) > len(cue.text):
                    normalized[idx + 1] = CaptionCue(
                        start=min(cue.start, next_cue.start),
                        end=max(cue.end, next_cue.end),
                        text=join_caption_text(cue.text, next_cue.text),
                    )
                    idx += 1
                    continue
                if is_short_backchannel(next_cue.text):
                    cue = CaptionCue(
                        start=cue.start,
                        end=max(cue.end, next_cue.end),
                        text=join_caption_text(cue.text, next_cue.text),
                    )
                    idx += 1
                else:
                    cue = CaptionCue(
                        start=cue.start,
                        end=max(cue.start + 0.2, next_cue.start),
                        text=cue.text,
                    )
        resolved.append(cue)
        idx += 1

    final: list[CaptionCue] = []
    for cue in resolved:
        if final and cue.start < final[-1].end:
            previous = final[-1]
            if cue.end - previous.start <= 0.6:
                final[-1] = CaptionCue(
                    start=previous.start,
                    end=max(previous.end, cue.end),
                    text=join_caption_text(previous.text, cue.text),
                )
                continue
            cue = CaptionCue(
                start=previous.end,
                end=max(previous.end + 0.2, cue.end),
                text=cue.text,
            )
        final.append(cue)

    return [
        CaptionCue(cue.start, cue.end, cue.text, index=index)
        for index, cue in enumerate(final)
        if cue.end > cue.start and cue.text
    ]


def make_ai_units(cues: list[CaptionCue], *, max_chars: int = 4200) -> list[list[CaptionCue]]:
    groups: list[list[CaptionCue]] = []
    current: list[CaptionCue] = []
    current_chars = 0
    for cue in cues:
        extra = len(cue.text) + 24
        if current and current_chars + extra > max_chars:
            groups.append(current)
            current = []
            current_chars = 0
        current.append(cue)
        current_chars += extra
    if current:
        groups.append(current)
    return groups


def system_prompt(target_language: str) -> str:
    return f"""
You are a senior subtitle translator and timing editor.

You translate YouTube captions for viewers who want natural, accurate, easy-to-read subtitles.
Your translation should sound like fluent spoken Chinese, not literal machine translation.

Task:
- First understand the video title, channel, description, the whole chunk, and nearby context.
- Re-segment raw YouTube caption cues into natural subtitle lines.
- Translate the intended meaning accurately into {target_language}.
- Preserve technical terms, names, numbers, and logical relations.
- Select which source cue indexes belong to each translated subtitle.

Translation style:
- Use natural, conversational wording suitable for subtitles.
- Prefer idiomatic meaning over word-by-word translation.
- Keep the tone of the speaker: casual, humorous, serious, skeptical, excited, etc.
- Resolve pronouns and references using context when the meaning is clear.
- Use the video title and description to infer topic, speaker identity, domain-specific terms, abbreviations, and named entities.
- Keep terminology consistent within the chunk and with surrounding context.
- Remove filler words only when they do not affect meaning.
- Do not add explanations, notes, brackets, or translator comments.
- Avoid stiff phrases like "因此/所以说/这意味着" unless the speaker actually sounds formal.
- For Chinese output, prefer concise spoken Chinese with clear rhythm.
- Compress harmless filler words and repeated phrasing.
- Do not force every English word into Chinese if it hurts subtitle readability.
- Prefer 8-18 Chinese characters per cue when possible.
- Hard limit: 26 visible Chinese characters per cue unless the source is impossible to compress.

Timing rules:
- Do not output start/end times.
- The script will calculate timing from source_indexes.
- Each output cue should be readable and semantically complete.
- Prefer 1 complete sentence or a short clause per cue.
- Keep each translated cue concise enough for on-screen reading.
- If one original idea spans multiple raw cues, merge it and use the combined time.
- Prefer contiguous source_indexes, such as [12, 13, 14].
- Do not reuse the same source index in multiple output cues.

Return strict JSON only:
{{
  "cues": [
    {{
      "source_indexes": [12, 13, 14],
      "source": "source sentence or clause",
      "translation": "translated subtitle"
    }}
  ]
}}
""".strip()


def build_user_payload(
    cues: list[CaptionCue],
    *,
    video_context: VideoContext,
    previous_context: list[CaptionCue],
    next_context: list[CaptionCue],
) -> str:
    rows = [
        {"i": cue.index, "start": round(cue.start, 3), "end": round(cue.end, 3), "text": cue.text}
        for cue in cues
    ]
    prev_rows = [
        {"i": cue.index, "start": round(cue.start, 3), "end": round(cue.end, 3), "text": cue.text}
        for cue in previous_context
    ]
    next_rows = [
        {"i": cue.index, "start": round(cue.start, 3), "end": round(cue.end, 3), "text": cue.text}
        for cue in next_context
    ]
    return json.dumps(
        {
            "instruction": (
                "Use video_context, previous_context, and next_context only to understand "
                "topic, meaning, tone, references, names, and terminology. "
                "Do not translate or summarize video_context. Output cues only for raw_cues. "
                "Use source_indexes from raw_cues, not context."
            ),
            "video_context": {
                "title": video_context.title,
                "channel": video_context.channel,
                "description": video_context.description,
            },
            "previous_context": prev_rows,
            "raw_cues": rows,
            "next_context": next_rows,
        },
        ensure_ascii=False,
    )


def translate_groups(
    groups: list[list[CaptionCue]],
    *,
    target_language: str,
    model: str,
    api_key: str,
    api_base: str,
    provider: str,
    compress: bool,
    video_context: VideoContext,
) -> list[CaptionCue]:
    output: list[CaptionCue] = []
    for index, group in enumerate(groups, start=1):
        print(f"AI processing chunk {index}/{len(groups)}...", file=sys.stderr)
        previous_context = groups[index - 2][-8:] if index > 1 else []
        next_context = groups[index][:8] if index < len(groups) else []
        translated = translate_one_group(
            group,
            video_context=video_context,
            previous_context=previous_context,
            next_context=next_context,
            target_language=target_language,
            model=model,
            api_key=api_key,
            api_base=api_base,
            provider=provider,
        )
        output.extend(translated)
        time.sleep(0.2)
    cleaned = sanitize_timing(output)
    if not compress:
        return cleaned
    return compress_long_cues(
        cleaned,
        target_language=target_language,
        model=model,
        api_key=api_key,
        api_base=api_base,
        provider=provider,
    )


def translate_one_group(
    group: list[CaptionCue],
    *,
    video_context: VideoContext,
    previous_context: list[CaptionCue],
    next_context: list[CaptionCue],
    target_language: str,
    model: str,
    api_key: str,
    api_base: str,
    provider: str,
) -> list[CaptionCue]:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt(target_language)},
            {
                "role": "user",
                "content": build_user_payload(
                    group,
                    video_context=video_context,
                    previous_context=previous_context,
                    next_context=next_context,
                ),
            },
        ],
        "temperature": 0.35,
        "response_format": {"type": "json_object"},
    }
    if provider == "deepseek":
        payload["thinking"] = {"type": "disabled"}
    url = api_base.rstrip("/") + "/chat/completions"
    response = http_post_json(url, payload, api_key=api_key)
    content = response["choices"][0]["message"]["content"]
    data = json.loads(content)

    group_by_index = {cue.index: cue for cue in group}
    cues = []
    for item in data.get("cues", []):
        source_indexes = parse_source_indexes(item.get("source_indexes"))
        source_cues = [group_by_index[index] for index in source_indexes if index in group_by_index]
        if not source_cues and "start" in item and "end" in item:
            start = clamp(float(item["start"]), group[0].start, group[-1].end)
            end = clamp(float(item["end"]), start + 0.2, group[-1].end)
        elif source_cues:
            start = min(cue.start for cue in source_cues)
            end = max(cue.end for cue in source_cues)
        else:
            continue
        text = normalize_text(str(item.get("translation") or item.get("text") or ""))
        if text:
            cues.append(CaptionCue(start=start, end=end, text=text))

    if not cues:
        raise ValueError("AI returned no cues for a chunk.")
    return cues


def parse_source_indexes(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    indexes = []
    for item in value:
        try:
            indexes.append(int(item))
        except (TypeError, ValueError):
            continue
    return sorted(set(indexes))


def visible_text_len(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def max_chars_for_duration(duration: float) -> int:
    if duration < 1.2:
        return 8
    if duration < 2.0:
        return 14
    if duration < 3.5:
        return 22
    if duration < 5.0:
        return 30
    return 36


def compress_long_cues(
    cues: list[CaptionCue],
    *,
    target_language: str,
    model: str,
    api_key: str,
    api_base: str,
    provider: str,
) -> list[CaptionCue]:
    compressed: list[CaptionCue] = []
    for index, cue in enumerate(cues, start=1):
        duration = cue.end - cue.start
        max_chars = max_chars_for_duration(duration)
        if visible_text_len(cue.text) <= max_chars:
            compressed.append(cue)
            continue

        print(
            f"Compressing long subtitle {index}: {visible_text_len(cue.text)} > {max_chars} chars",
            file=sys.stderr,
        )
        shorter = compress_one_subtitle(
            cue.text,
            duration=duration,
            max_chars=max_chars,
            target_language=target_language,
            model=model,
            api_key=api_key,
            api_base=api_base,
            provider=provider,
        )
        compressed.append(CaptionCue(cue.start, cue.end, shorter or cue.text))
        time.sleep(0.1)
    return compressed


def compress_one_subtitle(
    text: str,
    *,
    duration: float,
    max_chars: int,
    target_language: str,
    model: str,
    api_key: str,
    api_base: str,
    provider: str,
) -> str:
    prompt = f"""
You are optimizing one translated subtitle line for readability.

Compress it into natural {target_language} for on-screen subtitles.

Rules:
- Keep the core meaning and tone.
- Make it conversational and concise.
- Remove filler and redundant wording.
- Do not add explanations or notes.
- Target maximum visible characters: {max_chars}.
- The subtitle is displayed for {duration:.2f} seconds.
- Return strict JSON only: {{"text": "compressed subtitle"}}
""".strip()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps({"text": text}, ensure_ascii=False)},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    if provider == "deepseek":
        payload["thinking"] = {"type": "disabled"}
    url = api_base.rstrip("/") + "/chat/completions"
    response = http_post_json(url, payload, api_key=api_key)
    content = response["choices"][0]["message"]["content"]
    data = json.loads(content)
    compressed = normalize_text(str(data.get("text", "")))
    if not compressed:
        return text
    return compressed


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def sanitize_timing(cues: list[CaptionCue]) -> list[CaptionCue]:
    if not cues:
        return cues
    cues = sorted(cues, key=lambda cue: (cue.start, cue.end))
    cleaned = []
    for cue in cues:
        start = cue.start
        end = max(cue.end, start + 0.2)
        if cleaned and start < cleaned[-1].end:
            start = cleaned[-1].end
            end = max(end, start + 0.2)
        cleaned.append(CaptionCue(start, end, cue.text))
    return cleaned


def format_timestamp(seconds: float, *, sep: str) -> str:
    millis = int(round(seconds * 1000))
    hours, rem = divmod(millis, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{ms:03d}"


def write_vtt(cues: list[CaptionCue], path: Path) -> None:
    lines = ["WEBVTT", ""]
    for cue in cues:
        lines.append(
            f"{format_timestamp(cue.start, sep='.')} --> {format_timestamp(cue.end, sep='.')}"
        )
        lines.append(cue.text)
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_srt(cues: list[CaptionCue], path: Path) -> None:
    lines = []
    for idx, cue in enumerate(cues, start=1):
        lines.append(str(idx))
        lines.append(
            f"{format_timestamp(cue.start, sep=',')} --> {format_timestamp(cue.end, sep=',')}"
        )
        lines.append(cue.text)
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def safe_filename(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return value or "subtitle"


def print_tracks(tracks: list[CaptionTrack]) -> None:
    if not tracks:
        print("No caption tracks found.")
        return
    for idx, track in enumerate(tracks, start=1):
        kind = "auto" if track.is_auto else "manual"
        print(f"{idx:02d}. {track.language_code:10s} {kind:6s} {track.name}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check YouTube captions and generate AI-translated subtitle files."
    )
    parser.add_argument("url", help="YouTube URL or 11-character video id")
    parser.add_argument("--list", action="store_true", help="List caption tracks only")
    parser.add_argument("--source-lang", help="Preferred source caption language, e.g. en")
    parser.add_argument("--target-lang", default="zh-Hans", help="Target language")
    parser.add_argument("--no-auto", action="store_true", help="Do not use auto-generated captions")
    parser.add_argument("--format", choices=["vtt", "srt"], default="vtt")
    parser.add_argument("--output", help="Output subtitle path")
    parser.add_argument("--raw-output", help="Optional raw caption JSON path")
    parser.add_argument("--clean-output", help="Optional cleaned caption JSON path")
    parser.add_argument("--raw-only", action="store_true", help="Download raw captions and exit")
    parser.add_argument("--no-compress", action="store_true", help="Disable post-translation length compression")
    parser.add_argument(
        "--provider",
        choices=["openai", "deepseek"],
        default=default_provider(),
        help="AI provider for re-segmentation and translation",
    )
    parser.add_argument("--model", help="Chat completion model")
    parser.add_argument(
        "--api-base",
        help="OpenAI-compatible API base URL",
    )
    parser.add_argument("--api-key", help="API key. Defaults to provider-specific env var")
    args = parser.parse_args()
    api_key_env, default_api_base, default_model = provider_defaults(args.provider)
    api_base = args.api_base or os.getenv("AI_API_BASE") or os.getenv(
        "DEEPSEEK_API_BASE" if args.provider == "deepseek" else "OPENAI_API_BASE",
        default_api_base,
    )
    model = args.model or os.getenv("AI_MODEL") or os.getenv(
        "DEEPSEEK_MODEL" if args.provider == "deepseek" else "OPENAI_MODEL",
        default_model,
    )
    api_key = configured_api_key(args.provider, args.api_key)

    try:
        video_id = extract_video_id(args.url)
        player = fetch_player_response(video_id)
        video_context = parse_video_context(player)
        if video_context.title:
            print(f"Video title: {video_context.title}", file=sys.stderr)
        if video_context.channel:
            print(f"Channel: {video_context.channel}", file=sys.stderr)
        tracks = parse_caption_tracks(player)

        if args.list:
            print_tracks(tracks)
            return 0 if tracks else 2

        track = select_track(
            tracks,
            language=args.source_lang,
            allow_auto=not args.no_auto,
        )
        kind = "auto-generated" if track.is_auto else "manual"
        print(f"Selected caption track: {track.language_code} ({kind}) {track.name}", file=sys.stderr)

        raw_cues = fetch_cues(track)
        if not raw_cues:
            raise ValueError("Caption track exists, but no usable cue text was downloaded.")
        print(f"Downloaded {len(raw_cues)} raw caption cues.", file=sys.stderr)
        clean_cues = resolve_overlaps(raw_cues)
        print(f"Cleaned timeline to {len(clean_cues)} non-overlapping cues.", file=sys.stderr)

        if args.raw_output:
            raw_path = Path(args.raw_output)
            raw_payload = [
                {"start": cue.start, "end": cue.end, "text": cue.text}
                for cue in raw_cues
            ]
            raw_path.write_text(json.dumps(raw_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Raw captions saved: {raw_path}", file=sys.stderr)

        if args.clean_output:
            clean_path = Path(args.clean_output)
            clean_payload = [
                {"i": cue.index, "start": cue.start, "end": cue.end, "text": cue.text}
                for cue in clean_cues
            ]
            clean_path.write_text(json.dumps(clean_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Clean captions saved: {clean_path}", file=sys.stderr)

        if args.raw_only:
            return 0

        if not api_key:
            raise ValueError(
                f"{api_key_env} is required for AI re-segmentation and translation. "
                "Use --list or --raw-only to only check/download available captions."
            )

        groups = make_ai_units(clean_cues)
        translated_cues = translate_groups(
            groups,
            target_language=args.target_lang,
            model=model,
            api_key=api_key,
            api_base=api_base,
            provider=args.provider,
            compress=not args.no_compress,
            video_context=video_context,
        )

        out = Path(args.output or f"{safe_filename(video_id)}.{args.target_lang}.{args.format}")
        if args.format == "vtt":
            write_vtt(translated_cues, out)
        else:
            write_srt(translated_cues, out)
        print(str(out))
        return 0
    except urllib.error.HTTPError as exc:
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
