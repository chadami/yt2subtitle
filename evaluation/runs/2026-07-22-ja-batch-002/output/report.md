# Japanese subtitle pilot report

- Videos: 19
- Target: ja-JP
- Provider/model: deepseek / deepseek-v4-flash
- Strategy: ja / 2026-07-22.1
- Per-video cap: 900s
- Translation chunk size: 2400 chars

| Video | Source | Minutes | Cues | >18 cps | >42 chars | Hard issues |
|---|---|---:|---:|---:|---:|---:|
| are you still watching? | manual | 15.0 | 265 | 0 | 5 | 3 |
| The man behind the viral color dictionary | auto | 14.9 | 209 | 0 | 4 | 0 |
| Alone in New York City! | auto | 15.0 | 190 | 0 | 0 | 0 |
| How to Make the BEST Korean Fried Chicken (+ Science) | auto | 15.0 | 232 | 0 | 1 | 0 |
| Everything Is Weirdly Cheap in Korea | auto | 15.0 | 278 | 0 | 1 | 0 |
| The Ridiculous Engineering Of Short Form Content | auto | 15.0 | 267 | 1 | 16 | 0 |
| Claude Design is Insanely Easy (even for beginners) | auto | 14.6 | 228 | 0 | 32 | 0 |
| I Asked My Cab Driver To Take Me Anywhere. He Took Me to His Past. | auto | 15.0 | 270 | 1 | 2 | 2 |
| I Wasn’t a Football Fan… Then I Went to the World Cup | auto | 15.0 | 246 | 0 | 0 | 0 |
| Why Japan Loves Raw Eggs | auto | 15.0 | 177 | 0 | 2 | 0 |
| Becoming Yourself in Paris \| Parisian Conversations | auto | 15.0 | 242 | 0 | 4 | 2 |
| 5 days in hokkaido (hakodate + sapporo) | manual | 15.0 | 106 | 0 | 0 | 0 |
| Why Your Travel Photos Are Disappointing | auto | 15.0 | 232 | 1 | 8 | 0 |
| I Built The Cheapest Possible Medium Format Digital Camera | auto | 12.3 | 205 | 0 | 10 | 1 |
| A Rookies Guide to Watches | auto | 15.0 | 214 | 0 | 4 | 0 |
| The People Trying to Control Language | manual | 7.5 | 108 | 0 | 13 | 1 |
| The global baby bust \| The Gray Area | auto | 15.0 | 201 | 0 | 8 | 0 |
| I bought a 30 year old Land Rover Discovery 1 | auto | 15.0 | 226 | 0 | 3 | 2 |
| the trip to China I didn't know I needed | auto | 15.0 | 162 | 1 | 6 | 0 |

## Aggregate deterministic findings

```json
{
  "cueCount": 4058,
  "fullwidthComma": 0,
  "openingQuoteComma": 0,
  "leadingPunctuation": 10,
  "doubleJapaneseComma": 0,
  "detachedAttributiveModifier": 0,
  "splitFileExtension": 0,
  "splitLatinName": 1,
  "possibleSplitKatakana": 0,
  "unbalancedJapaneseQuotes": 0,
  "overlaps": 0,
  "underOneSecond": 0,
  "overSixSeconds": 169,
  "overFortyTwoCharacters": 119,
  "overEighteenCharactersPerSecond": 4
}
```
