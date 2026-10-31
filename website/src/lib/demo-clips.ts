// 首页字幕对比演示的数据。
//
// 替换为真实素材时：
// 1. 把录好的无字幕短片放进 public/demo/，填到 video；poster 用同一片段的首帧截图。
// 2. youtube 填 YouTube 自动翻译的实际显示内容（逐条照抄，包括断错的地方）。
// 3. vidlingo 填 VidLingo 对同一片段的实际输出（可从插件或本机应用的字幕导出中复制）。
// 4. 时间以片段开头为 0 秒，单位为秒。全部换成实录后把 isSample 改为 false，页面上的「示例」标记会消失。

export type Cue = { start: number; end: number; text: string };

export type DemoClip = {
  id: string;
  /** 片段在页面上的标签，如“播客”“技术分享” */
  label: { zh: string; en: string; ja: string };
  /** 来源视频，用于标注出处 */
  source: { title: string; channel: string; url: string };
  video?: string;
  poster: string;
  duration: number;
  isSample: boolean;
  youtube: Cue[];
  vidlingo: Cue[];
  /** 用于“为什么不同”卡片：取出最能说明问题的一组对照 */
  highlight: { original: string; youtube: string; vidlingo: string };
};

export const demoClips: DemoClip[] = [
  {
    id: "sleep",
    label: { zh: "访谈", en: "Interview", ja: "インタビュー" },
    source: { title: "示例片段", channel: "VidLingo", url: "" },
    poster: "/demo-video-frame.jpg",
    duration: 13,
    isSample: true,
    youtube: [
      { start: 0, end: 2.2, text: "所以关于睡眠的事情，大多数" },
      { start: 2.2, end: 4.4, text: "人们弄错的是他们认为它是" },
      { start: 4.4, end: 6.6, text: "只是关于你得到多少小时，但是" },
      { start: 6.6, end: 8.8, text: "时间实际上更重要得多" },
      { start: 8.8, end: 11, text: "比总数，特别是如果你" },
      { start: 11, end: 13, text: "试图修复你的能量水平" },
    ],
    vidlingo: [
      { start: 0, end: 3.3, text: "关于睡眠，大多数人有个误区，" },
      { start: 3.3, end: 6.6, text: "以为关键只在于睡了几个小时。" },
      { start: 6.6, end: 9.6, text: "其实什么时候睡，比睡多久重要得多，" },
      { start: 9.6, end: 13, text: "尤其是当你想改善精力的时候。" },
    ],
    highlight: {
      original: "so the thing about sleep that most / people get wrong is they think it's",
      youtube: "所以关于睡眠的事情，大多数 / 人们弄错的是他们认为它是",
      vidlingo: "关于睡眠，大多数人有个误区，以为关键只在于睡了几个小时。",
    },
  },
  {
    id: "launch",
    label: { zh: "技术分享", en: "Tech talk", ja: "技術トーク" },
    source: { title: "示例片段", channel: "VidLingo", url: "" },
    poster: "/demo-video-frame.jpg",
    duration: 9,
    isSample: true,
    youtube: [
      { start: 0, end: 2.2, text: "当我们运送新的" },
      { start: 2.2, end: 4.4, text: "模型到生产延迟" },
      { start: 4.4, end: 6.6, text: "下降了一半，这老实说" },
      { start: 6.6, end: 9, text: "让团队里的每个人都感到惊讶" },
    ],
    vidlingo: [
      { start: 0, end: 4.4, text: "新模型上线后，延迟直接降了一半，" },
      { start: 4.4, end: 9, text: "说实话，团队里所有人都很意外。" },
    ],
    highlight: {
      original: "and when we shipped the new / model to production the latency",
      youtube: "当我们运送新的 / 模型到生产延迟",
      vidlingo: "新模型上线后，延迟直接降了一半。",
    },
  },
  {
    id: "bullet",
    label: { zh: "播客", en: "Podcast", ja: "ポッドキャスト" },
    source: { title: "示例片段", channel: "VidLingo", url: "" },
    poster: "/demo-video-frame.jpg",
    duration: 8,
    isSample: true,
    youtube: [
      { start: 0, end: 2.6, text: "我的意思是在一天结束时你" },
      { start: 2.6, end: 5.2, text: "只需要咬紧子弹并" },
      { start: 5.2, end: 8, text: "即使它不完美也要运送它" },
    ],
    vidlingo: [
      { start: 0, end: 4, text: "说到底，你只能硬着头皮，" },
      { start: 4, end: 8, text: "先发布出去，哪怕还不完美。" },
    ],
    highlight: {
      original: "you just have to bite the bullet and / ship it even if it's not perfect",
      youtube: "只需要咬紧子弹并 / 即使它不完美也要运送它",
      vidlingo: "你只能硬着头皮，先发布出去，哪怕还不完美。",
    },
  },
];
