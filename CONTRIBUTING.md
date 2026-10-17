# 参与测试与贡献

欢迎通过 [测试招募 Issue](https://github.com/huihuidawang231222-del/social-media/issues/1) 报告测试结果，或提交适配修复PR。

## V2 测试入口

先运行 `npm ci`、`npm start`，用合成演示检查任务，再在采集窗口正常登录做小规模真实测试。详见 [V2说明](v2/README.md)。请分别报告搜索链接发现、逐帖打开、评论提取、停止/续采和导出结果。`npm test` 与 `npm run test:dom` 是合成测试；`npm run test:v2:browser` 只验证本地合成界面，不代表平台实测。

## 优先欢迎的贡献

- 小红书、抖音正常登录后的评论容器与字段适配。
- B站多层Shadow DOM、回复、表情和富文本的回归样例。
- Chrome / Edge安装、滚动、停止、存储与文件导出端到端测试。
- 减少误采、修复漏采与改善零条结果时的提示。

## 最小测试流程

1. 下载仓库并加载 `extension` 文件夹；仅使用获准处理的页面。
2. 手动加载少量评论，记录页面可见条数与工具提取条数。
3. 重复采集同一页面，检查是否去重。
4. 添加关键词，验证筛选；手动展开回复后重新采集。
5. 开始滚动采集后停止，检查是否停止新增；导出CSV/JSON，检查中文、表情、换行。
6. 通过新Issue提供系统/浏览器版本、平台、操作步骤、预期与实际结果；不要将合成测试结果写成真实平台结果。

## 本地开发

```bash
npm install
npm test
npm run test:dom
npx playwright install chromium
npm run test:browser
```

核心逻辑在 `extension/core.js`，DOM采集在 `extension/content.js`，存储在 `extension/worker.js`，弹窗在 `extension/popup.*`。修改涉及的测试须通过。修复选择器时请附合成、最小化HTML样例，明确是否真实站点验证。

## 提交范围

不提交真实评论数据、用户资料、Cookie、Token、密码或手机号。截图和日志先脱敏；公开链接去除签名和跟踪参数。测试反馈不要求上传采集结果。代码与说明不得加入登录、验证码或平台限制绕过。新依赖请解释用途，不引入计费服务。

发布到GitHub不会自动带来曝光；当前仅有本仓库招募入口，没有对外平台自动推广或运营。
