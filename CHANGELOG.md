# Changelog

本文件记录文脉 Wenmai 的公开变更。版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[0.1.0]: https://github.com/chrislee121/wenmai/releases/tag/v0.1.0
