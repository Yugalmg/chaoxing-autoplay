# dev/ — 开发期调试脚本

这里是在摸清学习通平台行为过程中写的一次性探针、实验和诊断脚本。**运行主程序不需要它们**，但它们记录了每个结论是怎么得出来的，对后续修改和二次开发有参考价值。

## 为什么保留

学习通的播放器行为有很多反直觉的地方（进度是累计值、0 进度禁止 seek、播完自动重播覆盖进度、章节 tab 编号不一致……）。这些结论不是猜的，每一个都对应这里的某个脚本。改代码前想验证某个假设，直接找对应脚本改改跑一下，比重新摸索快得多。

## 脚本分类

| 前缀 | 用途 | 例子 |
|---|---|---|
| `probe_*` | 试探接口/页面结构，把结果打印出来 | `probe_84x.mjs` 打印视频的 fastforward / playState 等字段 |
| `diag*` | 诊断具体故障 | `diag_noiframe.mjs` 查章节为什么找不到播放器 |
| `test_*` | 验证某个机制是否成立 | `test_rate_vs_src.mjs` 分离「倍速」和「视频源」两个变量 |
| `check_*` / `chk_*` | 查服务端当前状态 | `chk_126.mjs` 查指定章节所有视频的 playTime / passed |
| `resume*` | 早期刷课逻辑的迭代版本 | `resume2` → `resume12`，可以看到思路怎么演进的 |
| `explore*` | 页面 DOM 结构探索 | `explore_player.mjs` 找 videojs 实例 |
| `fetch_*` / `parse_*` | 接口数据抓取与解析 | `fetch_cards.mjs` 拉章节任务点 |
| `dump_*` | 导出原始数据 | `dump_fields.mjs` 导出 attachment 全部字段 |

## 使用方式

都依赖 `../lib/` 里的模块，需要在**项目根目录**执行：

```bash
node dev/probe_84x.mjs
```

多数脚本直接打印结果到控制台，不需要改参数。少数脚本里写死了课程 ID / 章节号，用之前改一下顶部的常量。

## 重要提醒

- 这些脚本**没有做任何容错**，是探索性质的，报错是常态
- 有些脚本会**修改服务端状态**（触发上报），不要在正式刷课的同时跑
- 脚本里出现的课程名、章节号都是开发时的样例，与任何具体账号无关
- **不含任何凭据**：所有脚本都通过 `lib/core.mjs` 的 `getCookies()` 读取本地 `state/cookies.json`，没有硬编码

## 关键结论的出处

| 结论 | 对应脚本 |
|---|---|
| `playingTime` 是累计时长，seek 会清零 | `test_rate_vs_src.mjs`、`test_fullplay.mjs` |
| 0 进度视频 seek 后被弹回 0 | `test_zero.mjs`、`diag_stuck0.mjs` |
| 播完自动重播会覆盖进度 | `test_seek3.mjs`、`check_play.mjs` |
| 章节 tab 编号各课程不同 | `diag_tab.mjs`、`probe_ml_num.mjs` |
| `isPassed` 不等于「看完」 | `dump_fields.mjs`、`chk_126.mjs` |
| 倍速设置会打断播放 | `test_rate_ui2.mjs`、`probe_speed.mjs` |
| blob 加载对超大文件失效 | `diag_codec.mjs` |
