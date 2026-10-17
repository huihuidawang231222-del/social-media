# Social Comment Collector V2｜自动评论采集工作台

**输入关键词，自动搜索帖子、逐帖采集、保存进度并统一导出。** 本地运行，无服务器或API Key，数据保存在你自己的电脑。

[下载项目 ZIP](https://github.com/huihuidawang231222-del/social-media/archive/refs/heads/main.zip) · [V2使用说明](v2/README.md) · [测试记录](TEST_RESULTS.md) · [反馈问题](https://github.com/huihuidawang231222-del/social-media/issues/new/choose)

## V2 开始使用

需要电脑安装 **Node.js 22+和Chrome**。下载ZIP并解压后：

- **Windows**：双击 `启动V2.cmd`，首次安装依赖后自动打开本地工作台。
- **macOS / Linux**：在项目目录执行 `sh 启动V2.sh`。
- 手动启动：`npm ci` → `npm start` → 打开 `http://127.0.0.1:8765`。

首次先在界面选择“合成演示”试用；真实采集时在采集专用浏览器窗口正常登录平台，后续复用本地登录状态。

## V2 能做什么

| 功能 | 行为 |
|---|---|
| 自动搜索 | 按关键词打开平台搜索页，发现可见帖子链接，去重加入队列 |
| 自动逐帖采集 | 依次打开帖子、读取已加载评论、滚动，按关键词过滤 |
| 任务管理 | 进度、日志、暂停、继续、取消与失败帖子重试 |
| 断点续采 | 持续写入本地检查点；重启后继续，已保存评论去重 |
| 导出 | 每任务CSV/JSON，保留来源和原始字段 |
| 合成演示 | 不访问平台，运行完整模拟流程；数据明确标注合成 |

**V2仍为实验版：自动搜索与登录后逐帖采集尚未完成三个真实平台的全流程验证。** 之前B站的5条真实页面结果仅验证提取函数，不代表V2自动流程已通过。任务遇登录、验证码或访问限制会暂停，需你处理后手动继续。仅采集已加载样本，不保证全量，不自动展开全部楼中楼。

English: A local task dashboard that discovers posts from keywords, collects loaded comments sequentially, saves checkpoints and exports CSV/JSON. Experimental adapters for Xiaohongshu, Douyin and Bilibili; live end-to-end coverage is not yet verified.

# V1 浏览器扩展（保留）

免费、数据保存在本机的 Chrome / Edge 评论采集实验工具：面向小红书、抖音、B站已加载评论，支持关键词筛选、去重与 CSV/JSON 导出。正在招募开发者验证页面适配和完整使用流程。

**v0.1.0 实验版 · 欢迎测试与贡献**

[下载源码 ZIP](https://github.com/huihuidawang231222-del/social-media/archive/refs/heads/main.zip) · [参与开发者测试招募](https://github.com/huihuidawang231222-del/social-media/issues/1) · [报告问题](https://github.com/huihuidawang231222-del/social-media/issues/new/choose) · [贡献指南](CONTRIBUTING.md)

适合想把页面已显示的评论整理为表格、研究网页组件结构，或参与浏览器扩展适配的开发者。B站提取函数已有真实页面探测记录，小红书和抖音登录后的适配仍需协助验证。请先阅读下方实测状态。

**English:** An experimental, local-only Chrome/Edge extension for collecting comments already loaded on Xiaohongshu, Douyin and Bilibili pages. Keyword filtering, deduplication and CSV/JSON export. Looking for developers to test adapters and the full extension workflow. Platform coverage remains experimental.

## 安装

1. 下载本仓库 ZIP 并解压。
2. 电脑 Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`，开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择本项目的 `extension` 文件夹。
4. 正常登录目标平台，打开单个帖子并展开评论；点击工具栏扩展图标。
5. 确认采集用途后，选择当前页面采集或滚动采集，随后导出CSV/JSON。

需电脑端支持扩展的浏览器，未发布应用商店；Android原生ChatGPT无法安装此扩展。

## 功能

- 从已加载页面提取评论正文、作者显示名称、原始时间、点赞文本及来源链接。
- 关键词筛选、跨次去重、本地保存、CSV/JSON导出。
- 每3秒最多扫描/滚动一次，最多120轮，连续5轮无新增停止；单次新增1–5000条，本地最多20000条。
- 刷新后可重新采集并去重，不保存滚动位置、不自动恢复任务；关闭弹窗不会停止，关闭/刷新页面会停止。
- 自定义CSS选择器，支持开放Shadow DOM和表情图片alt文本。

## 实测状态

| 平台 | 结果 |
|---|---|
| 小红书 | 离线DOM通过；真实帖子遇登录窗口，评论适配未验证 |
| 抖音 | 离线DOM通过；真实帖子遇登录窗口，评论适配未验证 |
| B站 | 修复后的提取函数在真实页面读到5条预览评论/回复，各字段非空；扩展完整端到端未验证 |

6项单元测试、4组离线DOM测试通过。完整浏览器安装、真实滚动新增及导出文件下载尚未实测通过，当前仍为实验版。详细证据见[测试记录](TEST_RESULTS.md)。

## 限制与数据

只采集页面已加载内容，不保证全量。楼中楼需手动展开，不自动搜索或点击加载更多。不提供登录、验证码或平台限制绕过。

作者是显示名称，不代表身份核验；时间和点赞保留页面文本。无ID的相同作者/时间/正文可能合并。来源URL会去掉跟踪参数，含签名参数的链接可能无法重开。所有记录默认待核实、许可未审核，不自动产生企业评价。

数据保存在本机扩展存储；导出按当前关键词筛选所有本地记录，包括以前帖子。工具不读取Cookie或密码，不上传数据，不自动匿名化正文。仅处理你有权采集的内容，导出后自行检查个人信息与再分发权限，不要把原始评论提交到GitHub。

## 开发测试

```bash
npm install
npm test
npm run test:dom
npx playwright install chromium
npm run test:browser
```

离线DOM测试模拟布局、消息和存储，不替代真实浏览器。CI仅运行合成测试，不登录平台、不抓取真实评论。浏览器测试配置已提供，尚无运行通过证据。

扩展规范参考：https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
