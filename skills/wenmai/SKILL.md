---
name: wenmai
description: "文脉 Wenmai: compile a writer's articles, scripts, copy, and documents into an interlinked markdown knowledge base."
---

# 文脉 Wenmai

把已经写过的文字编译成持续维护、互相链接的 Markdown 知识库。用 index 导航，而不是每次查询都重新 RAG。

适用：文章、自媒体、视频脚本、文案、课程、工作文档。人类负责挑选来源；模型负责摘要、交叉引用、归档和保持一致。

## 何时使用

- 用户要创建、摄入、查询或检查文脉 / 知识库
- 用户问「这个选题 / 脚本 / 文案我写过没有」
- 开局定向里已经出现 SCHEMA / index / log

## 开局（每次会话先做）

1. 读开局注入的 SCHEMA.md、index.md、近期 log.md
2. 需要时再 `wenmai_status` 或 `wenmai_search`
3. 然后才 ingest / write / 回答「写过没有」

## 工具

| 工具 | 用途 |
|------|------|
| `wenmai_status` | 是否已初始化、页数、sourceRoots |
| `wenmai_init` | 按领域创建目录与 SCHEMA / index / log |
| `wenmai_ingest` | 把一篇文件、粘贴文本或整个目录落入 `raw/`（不可变）。目录默认 dry-run |
| `wenmai_written` | 查编译页 + 原文目录：写过没有 |
| `wenmai_search` | 在文脉内词法搜索 |
| `wenmai_read` / `wenmai_write` | 读/写相对路径；write 拒绝 `raw/` |
| `wenmai_lint` | 只读体检，不自动修复 |
| `wenmai_config` | 查看或增减额外原文目录；默认已含当前会话工作区 |
| `wenmai_graph` | 生成 Obsidian 式关联图，写出 `graph.html` |

ingest 的 `kind`：`articles`（文章/博客/推文）、`scripts`（视频脚本/口播）、`docs`（工作文档/SOP/讲义）、`transcripts`（转写）、`papers`（论文/白皮书）、`workspace`（草稿/素材）、`assets`（附件说明）。

## Ingest

1. `wenmai_ingest` 保存 raw，得到 sha256 与路径。目录模式先 dry-run，用户确认后再 `dryRun: false`。只落 `raw/`，不要对整批自动编译
2. 在 index 和页面里查是否已有对应实体/概念
3. 用 `wenmai_write` 创建或更新编译页（至少 2 个 `[[wikilinks]]`）
4. `updateIndex: true`，并写 log

## Query

1. 先看 index，必要时 `wenmai_search` / `wenmai_read`
2. 基于编译页作答，引用 `[[页面]]`
3. 有价值的综合可写入 `queries/` 或 `comparisons/`

## Lint

发现问题只报告。修复用 `wenmai_write` 改编译页，不要改 `raw/`。

## 关联图

`wenmai_graph` 根据编译页 `[[wikilinks]]`、当前工作区 / sourceRoots 里的 Markdown、标签和 `sources` 生成 `graph.html`。局部图传 `focus` + `depth`。需要可视化时再生成，不要每轮都跑。

## 硬规则

- 不修改 `raw/`
- 不凭记忆回答「写过没有」，走 `wenmai_written`
- 不扫描家目录；默认用当前会话工作区，额外路径只使用用户确认或 `wenmai_config` / 插件 `sourceRoots`
- 目录 ingest 默认 dry-run，用户确认后再写入
- 不编造 sources 路径
