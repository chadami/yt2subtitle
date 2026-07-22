# Japanese subtitle pilot report

- Videos: 5
- Target: ja-JP
- Provider/model: deepseek / deepseek-v4-flash
- Strategy: ja / 2026-07-21.2
- Per-video cap: 900s
- Translation chunk size: 2400 chars

| Video | Source | Minutes | Cues | >18 cps | >42 chars | Hard issues |
|---|---|---:|---:|---:|---:|---:|
| are you still watching? | manual | 15.0 | 259 | 0 | 7 | 4 |
| Claude Design is Insanely Easy (even for beginners) | auto | 14.6 | 237 | 2 | 33 | 0 |
| Why Japan Loves Raw Eggs | auto | 15.0 | 175 | 0 | 5 | 1 |
| The People Trying to Control Language | manual | 7.5 | 109 | 0 | 14 | 1 |
| The global baby bust \| The Gray Area | auto | 15.0 | 201 | 1 | 7 | 0 |

## Aggregate deterministic findings

```json
{
  "cueCount": 981,
  "fullwidthComma": 0,
  "openingQuoteComma": 0,
  "leadingPunctuation": 5,
  "doubleJapaneseComma": 0,
  "detachedAttributiveModifier": 0,
  "splitFileExtension": 0,
  "splitLatinName": 1,
  "possibleSplitKatakana": 0,
  "unbalancedJapaneseQuotes": 0,
  "overlaps": 0,
  "underOneSecond": 0,
  "overSixSeconds": 69,
  "overFortyTwoCharacters": 66,
  "overEighteenCharactersPerSecond": 3
}
```
