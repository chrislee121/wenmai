# 文脉 Wenmai

把写过的东西织成可查的文脉。

面向文字工作者：写文章、做自媒体、写视频脚本、写文案、写课程、写工作文档的人。DeepSeek Harness 插件。不依赖 Hermes，不用向量库，也不会把每一轮闲聊写进笔记。

本地就是一套 Markdown 目录，可用 Obsidian 打开。

## 它解决什么

文字工作越做越多，真正的问题往往不是「搜不到网上资料」，而是：

- 这个选题我写过没有？
- 脚本、文案、文章是不是各写各的，互相打架？
- 聊天里刚整理过的结论，下一轮又要重新发现一遍？

文脉把**你已经写过的原文**收进 `raw/`，再编译成互相链接的概念页。Agent 开局只读 SCHEMA、目录和最近日志，而不是每轮做一遍 RAG。

适用材料包括：公众号/博客/推文、视频脚本与口播稿、广告与社媒文案、课程讲义、SOP 与会议纪要、以及其它工作文档。

## 和其他开源项目有何不同

npm 上已经有通用 wiki 插件。文脉不和它们抢「Agent 记忆」这件事：

| | 文脉 Wenmai | EveGoodEvening llmwiki | chancelu llmwiki | Hermes llm-wiki |
|---|---|---|---|---|
| 用户是谁 | 文字工作者、自媒体、脚本/文案/文档作者 | 要可追溯证据的 Agent | 要会话记忆的 Agent | Karpathy 式通用 wiki Agent |
| 核心问题 | 这个选题我写过没有？ | 这条结论从哪条源来？ | 上一轮聊过什么？ | 怎么维护一本可链接的 wiki |
| 写入从哪来 | 主动 ingest 成稿/素材 | `add_source` + 证据链 | 可 autoCapture 对话 | Agent 编译对话与资料 |
| 目录长什么样 | `entities/` `concepts/` 等人可读页 | `sources/<sha256>/` | vault + chronicle | 类似三层 wiki |
| 开局怎么用 | 只注入 SCHEMA + index + log 尾 | 偏检索/证据 | 每轮检索注入 | 按会话维护 |
| 杀手功能 | `wenmai_written`：写过没有 | 源 ID 必须真实存在 | RRF 多路召回 | 完整 Agent 运行时 |
| 运行时 | 轻量 DSH 插件 | DSH 插件 | DSH 插件 | Hermes（更重） |

一句话：**文脉不是又一个 Agent 记忆插件，而是文字工作者的「选题防撞 + 成稿编译」知识库。**

## 怎么开始用

### 1. 安装插件

需要 Node.js 22.19+（或 24+）。把本仓库路径换成你 clone 之后的位置。

本机若没有 `dsh` 命令：

```sh
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 plugin --profile web add /path/to/wenmai
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 --profile web --dump-config
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 web
```

已安装 CLI 时：

```sh
dsh plugin --profile web add /path/to/wenmai
dsh --profile web --dump-config
dsh web
```

`dump-config` 里应出现 `dsh-wenmai` 层和 `id: wenmai`。浏览器打开 <http://127.0.0.1:3080>。

默认数据目录是 `~/wenmai`。若该目录还不存在、但本机已有 `~/tongjian`，会自动沿用旧目录。卸载插件不会删除文脉数据：

```sh
dsh plugin --profile web remove dsh-wenmai
```

### 2. 选工作区

在 Web UI 左上角选一个本地文件夹作为工作区。未选中时输入框是灰色的，这是 DeepSeek Harness 本身的限制，与文脉无关。

工作区就是你的文稿目录：选中后，`wenmai_written` 默认扫描这个工作区。不必再手写 `sourceRoots`。

### 3. 额外原文目录（可选）

默认已经够用。只有工作区之外还有别的文稿仓时，才需要加路径。

**让 Agent 配：**

> 用 wenmai_config 把 `~/Documents/scripts` 加成额外原文目录

会写入文脉库里的 `source-roots.json`。也可以让 Agent `remove` 或 `set`（逗号分隔，空字符串清空额外目录）。当前会话工作区始终在扫描列表里。

**或写在插件配置里**（profile 的 `cordis.patch.yml`，按 `id` 整行替换，不会深合并）：

```yaml
- id: wenmai
  config:
    root: '~/wenmai'
    sourceRoots:
      - '~/Documents/writing/scripts'
    orientBudgetChars: 8000
```

- `root`：文脉数据根，默认 `~/wenmai`
- `sourceRoots`：额外扫描根，叠加在会话工作区之上
- 不要把家目录整盘配进去

改 TypeScript 后执行 `pnpm build` 并重启 `dsh web`。

### 4. 初始化

对新库说一句：

> 用 wenmai_init 初始化文脉，领域是「个人文字工作：文章、脚本、文案、文档」。

或在输入框用斜杠命令看状态：先输入 `/wenmai` 选中命令，再补参数发送。

```text
/wenmai status
/wenmai lint
/wenmai orient
```

### 5. 日常三件事

对 Agent 直接说人话即可，不必自己拼工具参数。

**查有没有写过**

> 用 wenmai_written 查一下「某某选题」我写过没有

**收录一篇成稿**

> 把这篇 ingest 进文脉，再编译成概念页：  
> `/path/to/your/draft.md`

流程：`ingest` 只复制到 `raw/`（之后不可改）→ `write` 写 `concepts/` 或 `entities/` → 更新 `index.md` 和 `log.md`。

按材料类型指定 `kind`（对应 `raw/` 子目录）：

| kind | 放什么 |
|---|---|
| `articles` | 文章、博客、推文长文 |
| `scripts` | 视频脚本、口播稿、分镜 |
| `docs` | 工作文档、SOP、会议纪要、讲义 |
| `transcripts` | 录音/成片转写 |
| `papers` | 论文、白皮书、长研究 |
| `workspace` | 草稿、素材、未分类 |
| `assets` | 附件说明 |

**查阅**

> 在文脉里搜关键词，读一下 `concepts/某个概念.md`

## 和 AI Agent 怎么用

文脉是 DeepSeek Harness 插件：你在 Web UI 里跟 Agent 说话，Agent 调下面的工具读写 `~/wenmai`。开局会注入 SCHEMA、目录和最近日志，**不必每轮做一遍 RAG**。

### Agent 开局会看到什么

会话开始时插件会注入一段「文脉定向」：

- `SCHEMA.md`：领域、frontmatter、标签、何时建页
- `index.md`：现有实体 / 概念 / 对比 / 查询
- `log.md` 尾部：最近写入

所以 Agent 先读这份定向，再决定要不要 `wenmai_status` / `wenmai_search`。你也可以 `/wenmai orient` 再看一遍。

### 你怎么下指令

用自然语言点名工具，或只说目标。例如：

| 你想做的事 | 可以这样说 |
|---|---|
| 看库在不在、有多少页 | 「看一下文脉状态」 |
| 第一次建库 | 「用 wenmai_init 初始化，领域是……」 |
| 选题防撞 | 「这个选题我写过没有？」 |
| 收录成稿 | 「把这篇 ingest 再编译成概念页：`/绝对路径/draft.md`」 |
| 查概念 | 「在文脉里搜 xxx，读一下对应概念页」 |
| 体检 | 「对文脉跑一遍 lint」 |
| 看关联 | 「生成关联图并打开」 |
| 加原文目录 | 「用 wenmai_config 把 `~/Documents/scripts` 加成额外原文目录」 |

斜杠命令适合你自己点：`/wenmai` 再补 `status` / `lint` / `orient` / `graph`。复杂读写仍走对话里的工具。

### Agent 必须遵守的规则

把这些当作给 Agent 的站规（插件 system prompt 里也有）：

1. **「写过没有」必须走 `wenmai_written`**，不要凭训练记忆或闲聊印象回答。
2. **`raw/` 只进不出**：`wenmai_ingest` 之后原文不可改；纠错写在 `concepts/` / `entities/` 等编译页。
3. **`wenmai_write` 禁止写 `raw/`**。新编译页要有 YAML frontmatter，至少 2 个 `[[wikilinks]]`，并视情况 `updateIndex` + 写 log。
4. **lint 只报告不自动修**。要修再用 `wenmai_write`。
5. **不扫描家目录**。默认只扫当前会话工作区；额外路径由你确认，或 `wenmai_config` / 插件 `sourceRoots`。
6. **不编造 sources 路径**，不负责抓网页或解析 PDF。有正文之后再 ingest。
7. **关联图按需生成**，不要每轮都跑 `wenmai_graph`。

### 推荐工作流

**查询 / 选题防撞**

1. 看开局定向里的 index
2. `wenmai_written`（编译页 + 工作区文件名/标题）
3. 需要细节再 `wenmai_search` → `wenmai_read`
4. 基于编译页作答，引用 `[[页面]]`

**收录一篇**

1. `wenmai_ingest`（文件路径或粘贴正文 + `kind`）
2. 在 index / 已有页里查有没有对应实体或概念
3. `wenmai_write` 创建或更新编译页
4. `updateIndex: true`，并写一条 log

**体检**

1. `wenmai_lint`：缺 frontmatter、断链、孤儿页、raw 哈希漂移
2. 只改编译页，不改 `raw/`

更短的操作说明在包内 `skills/wenmai/SKILL.md`，可复制或软链到 DSH 的 skills 扫描目录。

也可用 Obsidian 直接打开 `~/wenmai`。

## 目录

```text
~/wenmai/
├── SCHEMA.md
├── index.md
├── log.md
├── raw/                 # 不可变
│   ├── articles/
│   ├── scripts/
│   ├── docs/
│   ├── papers/
│   ├── workspace/
│   ├── transcripts/
│   └── assets/
├── entities/
├── concepts/
├── comparisons/
├── queries/
└── graph.html            # 关联图，用浏览器打开
```

## 关联图

类似 Obsidian 的知识图谱：文脉编译页的 `[[wikilinks]]`，加上当前工作区 / sourceRoots 里的 Markdown 文章（按目录成簇，并识别 wiki 链接和相对 `.md` 链接）。

在 DSH 里：

```text
/wenmai graph
```

或对 Agent 说：

> 用 wenmai_graph 生成关联图并打开

会在文脉根目录写出 `graph.html`（例如 `file:///Users/你/wenmai/graph.html`）。浏览器里可拖拽、缩放、搜索；左上角可切换 **力导向** / **目录簇**。局部图可以带 `focus`（页面 slug）和 `depth`。

## 斜杠命令

在 DSH 输入框输入 `/wenmai`，再补子命令：

| 命令 | 作用 |
|---|---|
| `/wenmai` 或 `/wenmai status` | 是否已初始化、编译页/原文数量、sourceRoots 是否可读 |
| `/wenmai lint` | 只读体检，输出错误和警告数 |
| `/wenmai orient` | 重新读取并展示开局定向（SCHEMA + index + 近期 log） |
| `/wenmai graph` | 生成 `graph.html` 并用系统浏览器打开 |
| `/wenmai graph <slug>` | 以某页为中心生成局部图 |

## 工具

Agent 在对话里调用的工具如下。参数未写的表示可省略。

| 工具 | 做什么 | 主要参数 |
|---|---|---|
| `wenmai_status` | 库是否已初始化、编译页/原文数量、当前会扫哪些 sourceRoots | 无 |
| `wenmai_init` | 按领域创建目录树，以及 `SCHEMA.md` / `index.md` / `log.md` | **`domain`**（必填）：这个库覆盖什么 |
| `wenmai_ingest` | 把一篇文件或粘贴文本复制进 `raw/`，之后不可改。编译是下一步 `write` | `filePath` 和/或 `content`；`title`；`kind`（`articles` / `scripts` / `docs` / `papers` / `workspace` / `transcripts` / `assets`） |
| `wenmai_written` | 选题防撞：搜编译页标题/正文，以及工作区、额外 sourceRoots 里的文件名和标题 | **`query`**（必填）；`limit`（默认 20） |
| `wenmai_search` | 在文脉库内做词法搜索（编译页 + `raw/`） | **`query`**（必填）；`limit`（默认 20） |
| `wenmai_read` | 按相对路径读文脉根下的文件，例如 `concepts/foo.md` | **`path`**（必填）；`offset`（从第几行）；`limit`（读多少行） |
| `wenmai_write` | 写编译页（YAML + Markdown）。**拒绝写入 `raw/`** | **`path`**、**`content`**（必填）；`log`（追加到 `log.md`）；`updateIndex`（是否把 `[[slug]]` 写入 index） |
| `wenmai_lint` | 只读体检：孤儿页、断掉的 `[[wikilinks]]`、缺 frontmatter、raw sha256 漂移。不自动修复 | 无 |
| `wenmai_config` | 查看或改额外原文目录。当前会话工作区始终在扫描列表里，改的是「额外」项，写入库内 `source-roots.json` | `add` 增加一条；`remove` 删一条；`set` 整表替换（逗号分隔，空字符串清空额外目录） |
| `wenmai_graph` | 根据编译页 `[[wikilinks]]`、工作区/sourceRoots 里的 Markdown、标签和 sources 生成关联图，写出 `graph.html` | `focus`、`depth`（默认 2）；`includeTags` / `includeSources` / `includeMissing` / `includeArticles`（默认都为 true）；`open`（macOS 下用系统浏览器打开） |

## 开发

```sh
pnpm install
pnpm test
pnpm build
```

端到端验收（使用仓库内示例文稿，不读取你的私人目录）：

```sh
pnpm accept
```

## 许可

MIT
