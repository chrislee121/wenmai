---
name: wenmai
description: "文脉 Wenmai: compile a writer's articles, scripts, copy, and documents into an interlinked markdown knowledge base. Users speak naturally and do not name tools."
---

# 文脉 Wenmai

把已经写过的文字编译成持续维护、互相链接的 Markdown 知识库。用 index 导航，而不是每次查询都重新 RAG。

适用：文章、自媒体、视频脚本、文案、课程、工作文档。人类负责挑选来源；模型负责摘要、交叉引用、归档和保持一致。

## 何时使用

用户**不会**说出 `wenmai_*`。根据意图自己选工具：

- 「写过没有 / 会不会撞稿 / 这个选题做过吗」
- 「收进文脉 / 吃掉这篇 / 扫这个目录」
- 「初始化 / 建库 / 文脉状态 / 有多少页」
- 「搜一下 / 读那一页 / 整理成概念页」
- 「体检 / 断链 / 有没有重复过期」
- 「今天该修什么 / 知识任务」
- 「合并这两页 / 改名 / 归档 / 拆开」
- 「关联图 / 再扫这个文件夹」
- 开局定向里已经出现 SCHEMA / index / log

## 开局

1. 先读注入的 SCHEMA.md、index.md、近期 log.md
2. 再按用户这句话的意图调用工具
3. 不要让用户改口去「点名工具」

## 意图 → 工具

| 用户大概会说 | 调用 |
|------|------|
| 文脉状态 / 库在不在 / 有多少页 | `wenmai_status` |
| 初始化 / 建库 / 第一次用 | `wenmai_init` |
| 写过没有 / 撞稿 / 这个选题做过吗 | `wenmai_written`（禁止凭记忆） |
| 收录 / 存进文脉 / 扫这个目录 | `wenmai_ingest`（目录默认 dry-run，确认后再写入） |
| 文脉里搜 / 查某某概念 | `wenmai_search` → `wenmai_read` |
| 写成概念页 / 更新这一页 | `wenmai_write`（禁止写 `raw/`） |
| 体检 / 断链 | `wenmai_lint`（只报告） |
| 重复、过期、冲突、知识库健康 | `wenmai_review`（只报告） |
| 今天该修什么 / 知识任务 / 待办 | `wenmai_tasks`（finding 投影，不另建编号） |
| 合并 / 改名 / 归档 / 拆开 | `wenmai_refactor`（默认 dry-run，确认后再写入；禁止改 `raw/`） |
| 再扫这个文件夹（工作区之外） | `wenmai_config`（须用户确认路径） |
| 关联图 / 知识图谱 | `wenmai_graph`（不要每轮都跑） |

ingest 目录对应：文章→`articles`，脚本/口播→`scripts`，文档/纪要→`docs`，转写→`transcripts`，论文→`papers`，草稿→`workspace`，附件说明→`assets`。用户随口说类型即可，不必说 `kind` 这个词。

## 收录

1. `wenmai_ingest` 保存 raw。目录先列出清单，用户确认后再写入。只落 `raw/`，不要对整批自动编译
2. 在 index 和页面里查是否已有对应实体/概念
3. 用户要整理成页时才 `wenmai_write`（至少 2 个 `[[wikilinks]]`，`updateIndex`，写 log）

## 查询

1. 「写过没有」走 `wenmai_written`（NEW / REVIEW / DUPLICATE；换词重写可能漏）
2. 细节再 `wenmai_search` / `wenmai_read`，引用 `[[页面]]`

## 硬规则

- 不修改 `raw/`
- 不凭记忆回答「写过没有」
- 不扫描家目录；额外路径只使用用户确认或已有配置
- 目录收录默认先列清单，确认后再写入
- 不编造 sources 路径
- 核心不解析 PDF / Word，当前只收 Markdown；不负责抓网页
- 没有 finding 就没有任务；修某一条走 `wenmai_refactor`（默认 dry-run），队列不自动重构
- 不要要求用户说出工具名
