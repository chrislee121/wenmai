# Changelog

本文件记录文脉 Wenmai 的公开变更。版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

- 推送 `v*` tag 时由 GitHub Actions 自动 `npm publish`（Trusted Publishing，不存 token）

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

- 数据根默认 `~/wenmai`。若该目录不存在且本机仍有 `~/tongjian`，会沿用旧目录
- 安装目前走本地路径：`dsh plugin --profile web add /path/to/wenmai`
- MIT 协议，仓库：https://github.com/chrislee121/wenmai

[0.3.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.3.0
[0.2.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.2.0
[0.1.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.1.0
