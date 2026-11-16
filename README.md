# 学习通代挂控制台

图形界面版的课程视频自动播放工具。**真实播放、真实上报，不伪造进度。**

从学习通 PC 客户端提取登录态 → 扫描全部课程的视频任务点 → 选课后台自动刷完。

---

## 一、环境要求

| 项目 | 要求 |
|---|---|
| 操作系统 | Windows 10 / 11 |
| Node.js | 18 或更高（`https://nodejs.org/` 下载 LTS 即可） |
| 学习通客户端 | **必须先安装并登录过一次**（程序从这里读取登录态） |
| 浏览器 | Chrome 或 Edge（程序会自动探测，优先 Chrome） |

没有 Chrome 也能用，会自动回退到 Edge —— 两者同为 Chromium 内核，CDP 协议一致。

---

## 二、快速开始

1. 双击 `启动.bat`
2. 浏览器会自动打开 `http://127.0.0.1:7788`
3. 页面四步：**提取登录态 → 扫描课程 → 点选课程行 → 开始刷课**

那个黑窗口不要关，关掉服务就停了。

> 首次提取登录态时程序会**自动关闭学习通客户端**（Electron 占用凭据文件无法读取）。
> 提取完成后**不会自动重启**客户端，需要用时自己打开。

---

## 三、项目结构

```
xxt/
├── 启动.bat              启动器（优先系统 Node，回退 runtime/）
├── server.mjs            本地控制台服务（:7788，SSE 实时日志）
├── autoplay.mjs          刷课引擎（核心）
├── run_batch.mjs         多课程串行调度
├── watchdog.mjs          守护进程（崩溃自动重启，可选）
├── config.example.json   配置模板（复制为 config.json 使用）
├── config.json           本地配置（已 gitignore，含账号信息）
├── lib/
│   ├── core.mjs          配置、Cookie 读取、浏览器探测、HTTP
│   ├── auth.mjs          从客户端提取并解密登录凭据
│   ├── cdp.mjs           零依赖 CDP 客户端（原生 WebSocket）
│   └── scan.mjs          课程/章节/任务点枚举
├── public/
│   └── index.html        控制台界面
├── dev/                  开发期调试脚本（探针、实验、诊断，非运行必需）
├── state/                运行时数据（凭据、缓存，已 gitignore）
└── log/                  运行日志（已 gitignore）
```

---

## 四、工作原理

### 登录态提取

学习通客户端是 Electron 应用，Cookie 存在 `%APPDATA%\cxstudy\Network\Cookies`（SQLite），值用 AES-256-GCM 加密。

```
关闭客户端释放文件锁
  → 复制 Cookies 数据库
  → 从 Local State 读 os_crypt.encrypted_key，DPAPI 解出 32 字节 AES 密钥
  → 逐条解密 v10 格式 cookie
```

提取结果存在 `state/cookies.json`，**等同于账号访问权，切勿分享**。

### 视频播放

不依赖 Playwright / Puppeteer，直接用 Node 原生 `fetch` + `WebSocket` 驱动 CDP：

```
导航到章节页 → 如有多 tab 则切到「视频」tab
  → 预加载整段视频为 blob，切给播放器（保证稳定 1.0x+ 播放）
  → 恢复服务端已记录进度，线性播放到结尾
  → 轮询服务端确认完成
```

### 弹题处理

播放中途弹出的题目（`li.ans-videoquiz-opt`）会自动选答并提交，然后继续播放。

---

## 五、踩过的坑（重要）

这些是实测得出的平台行为，改动相关代码前请先理解：

**1. `playingTime` 是「累计播放时长」，不是播放位置**

任何 `currentTime` 跳转都会让累计值清零。跳到 90% 再播 10%，服务端只记 10%。

→ 所以**绝不 seek**：恢复到服务端进度后一路线性播到结尾。

**2. 播放器禁止对「从未观看过」的视频 seek**

0 进度的视频一旦 seek 会被弹回 0，表现为 `paused:false` 但 `currentTime` 永远不动。

**3. 播完会自动重播，重播会覆盖进度**

播放器 `ended` 后立即从 0 重播，而服务端记的是最后一次上报值 → 进度被冲回 0。

→ 必须监听 `ended` 事件立刻暂停。

**4. 上报周期是 60 秒墙钟，1.5x 下相当于 90 秒视频**

最后一次上报常常落后视频结尾 1~2 分钟，所以进度会停在 93%~99%，属于正常现象。

**5. `isPassed` 不是「看完」的判定**

```
isPassed = 任务点判定，没有 jobid 的视频永远是 false
ywbf = 1 = 真正的「已完成」标记
```

只看 `isPassed` 会把已完成的视频当成未完成反复重刷。

**6. 章节可能有多个 tab，编号各课程不一致**

```
美的历程   num=0 学习目标  num=1 视频  num=2 章节测验
艺术哲学   num=0 视频      num=1 章节测验
```

枚举时必须 `num=0/1/2` 逐个试，取含视频的那个。

**7. 少数章节未开放**

教师可设置时间锁，页面返回「章节未开放」，这类课程只能等。

**8. 倍速不是所有课程都支持**

`videojs.getPlayer('video').options_.playbackRates` 为数组时才可设置，否则强行设置会打断播放。

---

## 六、配置

复制 `config.example.json` 为 `config.json` 后修改。`config.json` 已被 gitignore。

主要字段：

| 字段 | 说明 |
|---|---|
| `playback.rate` | 目标倍速，默认 1.5（课程不支持时自动降为 1.0） |
| `playback.mute` | 静音播放 |
| `schedule.window` | 允许运行的时间窗 |
| `safety.stop_on_face_capture` | 遇到人脸识别立即停止 |

---

## 七、命令行用法

```bash
# 单课程
node autoplay.mjs --course "高等数学A1" --max-hours 12

# 多课程串行
node run_batch.mjs --courses "高等数学A1" "大学英语1（基础）" --max-hours 8

# 只扫描不播放
node autoplay.mjs --course "高等数学A1" --dry
```

---

## 八、注意

- `state/cookies.json` 和 `state/key.b64` 合起来就是账号访问权，**打包分发前务必清空 `state/`**
- 同一账号不要多终端同时登录，会触发风控
- 人脸识别、验证码类拦截无法自动处理，程序会停止并提示
- 章节测验题目是**字体混淆编码**的（`惗西斯主惑` 实际是 `法西斯主义`），自动化成本极高，建议手动完成

---

## 九、免责

仅供个人学习研究使用。请遵守所在平台的服务条款，因使用本工具产生的一切后果由使用者自行承担。
