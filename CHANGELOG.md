# Changelog

本文件记录文脉 Wenmai 的公开变更。版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.6.0] - 2026-09-04

把知识库结构改成 pack 配置，并补上原文哈希索引与可选的本地 PDF/Word 转写。核心仍不解析这些格式。

### 新增

- 新库写出 `.wenmai/pack.json`；内置 writer 包。旧库没有该文件则按 writer 工作
- `wenmai_init` 可选 `pack`（目前只有 `writer`）
- `.wenmai/raw-hashes.json`：ingest 去重先查索引，miss 再全扫重建
- 可选本地适配器：插件配置 `ingestAdapters: true` 后，用本机 `pdftotext` / `pandoc` 收 PDF / `.docx`；原件与转写并存。默认关

### 说明

- 核心不解析 PDF/Word；关适配器时仍只收 Markdown。解析逻辑不进 store / written / review
- 插件注册拆到 `src/plugin/`，装配入口不变
- 对应 SemVer MINOR（核心底座，不是领域方案）

## [0.5.0] - 2026-09-03

把审视结果变成可执行的任务队列。问「今天该修什么」即可；选题防撞时会带上相关未完成任务。

### 新增

- `wenmai_tasks` / `/wenmai tasks`：任务 ID 就是 finding 指纹，不另建编号；`list` / `start` / `done` / `snooze` / `wontfix`
- 状态住 `review-state.json`：无记录为 open，新增 `in_progress`，ack 即完成（与 refactor 带 `finding` 同一条）
- `wenmai_written` 命中页若落在未完成任务里，附带 `openTasks`；没有则省略该键

### 说明

- 没有 finding 就没有任务；队列只建议动作，不自动 refactor
- 完整 P2，对应 SemVer MINOR

## [0.4.0] - 2026-09-02

按审视结果改知识库结构：合并、拆分、改名、搬家、补链、重写、归档。默认先预览再写入。

### 新增

- `wenmai_refactor` / `/wenmai refactor`：七个动作一律默认预览；确认后只改编译页与 `index.md` / `log.md`，不改 `raw/`
- 归档用 `archived: true`；选题防撞和搜索默认跳过已归档页
- 撤销只保留上一笔编译页快照；apply 时可 ack 对应的 review finding
- Split / Rewrite / 语义合并的正文由对话里的 Agent 提供，工具不调模型写稿

### 说明

- 目录收录与重构都是「先看影响面，点头后再写」
- 完整 P1，对应 SemVer MINOR

## [0.3.1] - 2026-09-01

修复 DeepSeek Harness 里调用知识库审视失败。

### 修复

- `wenmai_review` 不再返回 `undefined` 字段，Harness 能正常接收工具结果（不再报 `value is not lossless JSON`）

## [0.3.0] - 2026-08-31

动笔前拦住已写过的选题；普通对话即可调用，不必点名工具。

### 新增

- `wenmai_review` / `/wenmai review`：只读审视（源漂移传播到编译页、词法重复、冲突候选、结构问题、健康度）。findings 可 ack / snooze / wontfix
- `wenmai_written` 改为 NEW / REVIEW / DUPLICATE 三态，并给出相似度与重叠片段
- 系统提示按中文意图选工具，用户不必说出 `wenmai_*`

### 说明

- 词法查重声明盲区：同一论点换词重写可能检不出
- review 不改编译页、不改 `raw/`；内容默认不出本机

## [0.2.0] - 2026-08-24

降低安装门槛：可用 npm 包安装；支持目录批量 ingest（默认 dry-run）。

### 新增

- npm 包 `dsh-wenmai`：`dsh plugin --profile web add dsh-wenmai`
- `wenmai_ingest` 支持 `dir`：扫描工作区或已配置 sourceRoots 下的 Markdown，默认 dry-run，确认后再 `dryRun: false`
- 批量 ingest 复用现有扫描（跳过 `CLAUDE.md` 等、超过 512KB 的文件），sha256 去重，一次最多 600 篇；超出时提示拆目录
- 目录 ingest 只写 `raw/`，不自动编译概念页

### 说明

- 测试过的宿主：DeepSeek Harness `0.1.0-rc.8`
- 从源码安装的本地路径方式仍然可用

## [0.1.0] - 2026-08-22

首个公开版本。面向文字工作者的 DeepSeek Harness 插件：把已写成稿编译成可查的 Markdown 知识库。

### 新增

- `wenmai_init` / `wenmai_status`：按领域初始化文脉根目录，查看页数与 sourceRoots
- `wenmai_ingest`：把成稿落入 `raw/`（不可变），支持文件路径或粘贴正文
- `wenmai_written`：查编译页与工作区原文，回答「这个选题写过没有」
- `wenmai_search` / `wenmai_read` / `wenmai_write`：词法搜索、按路径读页、写编译页（拒绝写 `raw/`）
- `wenmai_lint`：只读体检（断链、缺 frontmatter、raw 哈希漂移），不自动修复
- `wenmai_config`：增减额外原文目录；当前会话工作区默认已在扫描列表里
- `wenmai_graph`：根据 `[[wikilinks]]` 与工作区 Markdown 生成 `graph.html`（力导向 / 目录簇）
- 斜杠命令：`/wenmai status|lint|orient|graph`
- 包内 Skill：`skills/wenmai/SKILL.md`

### 说明

- 数据根默认 `~/wenmai`。若该目录不存在，会沿用本机已有的旧版默认目录
- 安装目前走本地路径：`dsh plugin --profile web add /path/to/wenmai`
- MIT 协议，仓库：https://github.com/chrislee121/wenmai

[0.6.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.6.0
[0.5.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.5.0
[0.4.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.4.0
[0.3.1]: https://github.com/chrislee121/wenmai/releases/tag/v0.3.1
[0.3.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.3.0
[0.2.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.2.0
[0.1.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.1.0
