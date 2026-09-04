<div align="center">

<img src="docs/logo.png" alt="文脉 Wenmai" width="480">

# 文脉 Wenmai

当前版本：**v0.6.0**

把写过的东西织成可查的文脉。

</div>

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

2026 年「Markdown 开放 + Agent 可读写 + lint」已经是入场券。文脉不靠这些能力做差异，靠的是约束：

> **在你动笔的那一刻，用你不上传的全部旧稿，告诉你这个已经写过了。**

| | 文脉 Wenmai | memory.wiki | Basic Memory | gosidian |
|---|---|---|---|---|
| 用户是谁 | 文字工作者、自媒体、脚本/文案/文档作者 | 要把知识变成任何 AI 都能 fetch 的公开 URL | 要给 Agent 长期记忆的个人/团队 | 要在仓库里编排 Agent 的开发者 |
| 核心问题 | 这篇是不是已经写过了？ | 知识如何跨模型公开交付 | Agent 如何记住与检索 | Agent 如何 self-check / 编排 |
| 内容是否上传 | 默认不出本机 | 结构上要求上传且公开可读 | 有托管版（内容上云） | 本地仓库，面向代码工作流 |
| 介入时机 | 动笔前拦截 | 事后整理、公开查询 | 对话中记忆与检索 | 开发任务中的知识读写 |
| 杀手功能 | `wenmai_written`：NEW / REVIEW / DUPLICATE | 公开 hub URL + 自动 schema | 语义搜索 + 双向同步 | 57 个 MCP 工具 |

一句话：**文脉不是又一个 Agent 记忆插件，而是文字工作者的选题防撞：写之前告诉你。**

## 怎么开始用

### 1. 安装插件

npm 包 [`dsh-wenmai`](https://www.npmjs.com/package/dsh-wenmai) 已发布，当前 **0.6.0**。需要 Node.js 22.19+（或 24+）。已在 DeepSeek Harness `0.1.0-rc.8` 上测过。

已安装 `dsh` 时：

```sh
dsh plugin --profile web add dsh-wenmai
dsh --profile web --dump-config
dsh web
```

本机若没有 `dsh` 命令，用 npx 装插件并启动（与官方文档一致，会拉当前的 `@deepseek-ai/dsh`）：

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-wenmai
npx --yes @deepseek-ai/dsh --profile web --dump-config
npx --yes @deepseek-ai/dsh web
```

若要钉死已测过的宿主版本，把上面的 `@deepseek-ai/dsh` 换成 `@deepseek-ai/dsh@0.1.0-rc.8`。

`dump-config` 里应出现 `dsh-wenmai` 层和 `id: wenmai`。浏览器打开 <http://127.0.0.1:3080>。

从本仓库源码开发时，才用本地路径（改 TypeScript 后执行 `pnpm build` 并重启 `dsh web`）：

```sh
dsh plugin --profile web add /path/to/wenmai
```

默认数据目录是 `~/wenmai`。若该目录还不存在，会自动沿用本机已有的旧版默认目录。卸载插件不会删除文脉数据：

```sh
dsh plugin --profile web remove dsh-wenmai
```

### 2. 选工作区

在 Web UI 左上角选一个本地文件夹作为工作区。未选中时输入框是灰色的，这是 DeepSeek Harness 本身的限制，与文脉无关。

工作区就是你的文稿目录：选中后，`wenmai_written` 默认扫描这个工作区。不必再手写 `sourceRoots`。

### 3. 额外原文目录（可选）

默认已经够用。只有工作区之外还有别的文稿仓时，才需要加路径。

**让 Agent 配：**

> 以后也扫 `~/Documents/scripts` 这个文件夹

会写入文脉库里的 `source-roots.json`。当前会话工作区始终在扫描列表里。要去掉或换成别的目录，直接说「别扫那个了」或「改成只扫这些」。

**或写在插件配置里**（profile 的 `cordis.patch.yml`，按 `id` 整行替换，不会深合并）：

```yaml
- id: wenmai
  config:
    root: '~/wenmai'
    sourceRoots:
      - '~/Documents/writing/scripts'
    orientBudgetChars: 8000
    ingestAdapters: false
```

- `root`：文脉数据根，默认 `~/wenmai`
- `sourceRoots`：额外扫描根，叠加在会话工作区之上
- `ingestAdapters`：是否用本机 `pdftotext` / `pandoc` 转写 PDF / Word，默认关。核心不解析这些格式
- 不要把家目录整盘配进去

### 4. 初始化

对新库说一句：

> 按「个人文字工作：文章、脚本、文案、文档」初始化文脉。

或在输入框用斜杠命令看状态：先输入 `/wenmai` 选中命令，再补参数发送。

```text
/wenmai status
/wenmai lint
/wenmai orient
```

### 5. 日常三件事

对 Agent **说人话**就行，不必记工具名。插件会告诉它什么意图该调什么工具。

**查有没有写过**

> 这个选题我写过没有：「本地 Web UI 三步打开」

**收录一篇成稿**

> 把这篇收进文脉，再整理成概念页：  
> `/path/to/your/draft.md`

**收录整个文稿目录（会先列出清单，你点头后再写入）**

> 扫一下 `~/Documents/writing`，先告诉我会收哪些文件

确认后再说「按这个清单收进去」。原文会进 `raw/`（之后不能改），概念页要另说「整理成概念页」。一次最多 600 篇；更多就拆目录再收。

按材料类型，Agent 会放到对应子目录（你也可以随口说「这是脚本 / 文章 / 纪要」）：

| 你口头说的 | 实际进哪个目录 |
|---|---|
| 文章、博客、推文 | `raw/articles/` |
| 视频脚本、口播、分镜 | `raw/scripts/` |
| 工作文档、SOP、纪要、讲义 | `raw/docs/` |
| 录音/成片转写 | `raw/transcripts/` |
| 论文、白皮书 | `raw/papers/` |
| 草稿、素材、还没分类 | `raw/workspace/` |
| 附件说明 | `raw/assets/` |

**查阅**

> 文脉里搜一下「Harness」，把相关概念页读给我听

## 和 AI Agent 怎么用

你在 DeepSeek Harness 的对话框里正常说话。**不用点名 `wenmai_*`。** 开局会自动带上 SCHEMA、目录和最近日志，Agent 先看这些，再动手。

### 开局它已经知道什么

- 这个库覆盖什么、页面怎么写（`SCHEMA.md`）
- 现在有哪些概念 / 实体（`index.md`）
- 最近写过什么（`log.md` 尾部）

### 你怎么说

| 你想做的事 | 直接这么说 |
|---|---|
| 看库在不在、有多少页 | 「看一下文脉状态」 |
| 第一次建库 | 「按我写文章、脚本、文案这个用途，初始化文脉」 |
| 选题防撞 | 「这个选题我写过没有？」 |
| 收录成稿 | 「把这篇收进文脉，再整理成概念页：`/绝对路径/draft.md`」 |
| 收录整个目录 | 「先列出这个文稿目录会收哪些文件，别急着写入」 |
| 查概念 | 「文脉里搜 xxx，读一下对应那页」 |
| 体检 | 「帮我体检一下文脉，有没有断链」 |
| 重复 / 过期 / 冲突 | 「看看知识库有没有重复或过期」 |
| 今天该修什么 | 「今天该修什么」 |
| 合并 / 改名 / 归档 | 「先预览把这两页合并会改哪些链接，别急着写」 |
| 看关联 | 「生成关联图并打开」 |
| 加原文目录 | 「以后也扫 `~/Documents/scripts` 这个文件夹」 |

斜杠命令是可选快捷方式，给想自己点的人：输入 `/wenmai` 再选 `status` / `lint` / `orient` / `graph` / `review` / `tasks` / `refactor`。日常用对话即可。

### Agent 会自己遵守的规则

这些不用你提醒，插件已经写进系统提示：

1. 问「写过没有」必须查库，不能凭印象回答
2. 原文进 `raw/` 之后不能改；纠错写在概念页
3. 新概念页要有标题等元数据、互链，并更新目录
4. 体检和审视只报告，不擅自改文件；重构默认先列影响面，你点头后再写；任务来自审视结果，没有 finding 就没有任务
5. 不扫描你家目录；额外文件夹必须你先点头
6. 不编造原文路径；核心不解析 PDF / Word。可选本地适配器转写（默认关）。不负责抓网页
7. 关联图按需生成，不会每句话都画一张

### 常见流程（你只要说目标）

**选题防撞：** 「写过没有」→ 若可能重合，它会列出旧稿让你看。

**收录一篇：** 「收进文脉」→ 你确认 → 「整理成概念页」。

**收录一批：** 「先列出会收哪些」→ 你确认「按清单收」→ 需要成页的再一篇篇说「整理成概念页」，不会整批自动写。

**体检：** 「体检一下」或「有没有重复过期」；要修再说修哪一页。

**重构：** 「先预览把 `concepts/a.md` 并进 `concepts/b.md`」→ 看影响面 → 「按这个写进去」。只动编译页，不改 `raw/`。

**知识任务：** 「今天该修什么」→ 若有重复 finding，先预览合并 → 「按这个写进去」。选题防撞时，相关未完成任务会一并带上。

给 Agent 的更短对照表在包内 `skills/wenmai/SKILL.md`（意图 → 工具）。人不用读。

也可用 Obsidian 直接打开 `~/wenmai`。

## 目录

```text
~/wenmai/
├── SCHEMA.md
├── index.md
├── log.md
├── .wenmai/
│   ├── pack.json         # 结构包，缺省按 writer
│   └── raw-hashes.json   # 原文 sha256 索引
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

在 DSH 里可以说「生成关联图并打开」，或自己点：

```text
/wenmai graph
```

会在文脉根目录写出 `graph.html`（例如 `file:///Users/你/wenmai/graph.html`）。浏览器里可拖拽、缩放、搜索；左上角可切换 **力导向** / **目录簇**。局部图可以带 `focus`（页面 slug）和 `depth`。

## 斜杠命令

在 DSH 输入框输入 `/wenmai`，再补子命令：

| 命令 | 作用 |
|---|---|
| `/wenmai` 或 `/wenmai status` | 是否已初始化、编译页/原文数量、sourceRoots 是否可读 |
| `/wenmai lint` | 只读体检，输出错误和警告数 |
| `/wenmai orient` | 重新读取并展示开局定向（SCHEMA + index + 近期 log） |
| `/wenmai review` | 只读审视：源漂移传播、重复、冲突候选、结构问题；不改编译页 |
| `/wenmai tasks` | 说明任务来自 finding；具体列表与完成仍用对话 |
| `/wenmai refactor` | 说明重构默认 dry-run；具体合并/改名仍用对话 |
| `/wenmai graph` | 生成 `graph.html` 并用系统浏览器打开 |
| `/wenmai graph <slug>` | 以某页为中心生成局部图 |

## 工具（给开发者 / 想看参数的人）

日常对话不必记这些名字。Agent 根据你的意图自己选。参数未写的表示可省略。

| 工具 | 做什么 | 主要参数 |
|---|---|---|
| `wenmai_status` | 库是否已初始化、编译页/原文数量、当前会扫哪些 sourceRoots | 无 |
| `wenmai_init` | 按领域创建目录树，以及 `SCHEMA.md` / `index.md` / `log.md`；新库写出 `.wenmai/pack.json` | **`domain`**（必填）：这个库覆盖什么；`pack`（可选，默认 `writer`） |
| `wenmai_ingest` | 把文件、粘贴文本或整个目录复制进 `raw/`，之后不可改。编译是下一步 `write`。目录模式默认 dry-run。PDF / Word 默认拒收，需打开 `ingestAdapters` | 单篇：`filePath` 和/或 `content`；`title`。目录：`dir`（必须在工作区或 sourceRoots 内）；`dryRun`（默认 true）。`kind`（`articles` / `scripts` / `docs` / `papers` / `workspace` / `transcripts` / `assets`） |
| `wenmai_written` | 动笔前拦截：搜编译页与工作区原文，给出 NEW / REVIEW / DUPLICATE，并附重叠片段。命中页若落在未完成任务里会带上 `openTasks`。词法查重抓不到换词重写 | **`query`**（必填）；`limit`（默认 20） |
| `wenmai_search` | 在文脉库内做词法搜索（编译页 + `raw/`） | **`query`**（必填）；`limit`（默认 20） |
| `wenmai_read` | 按相对路径读文脉根下的文件，例如 `concepts/foo.md` | **`path`**（必填）；`offset`（从第几行）；`limit`（读多少行） |
| `wenmai_write` | 写编译页（YAML + Markdown）。**拒绝写入 `raw/`** | **`path`**、**`content`**（必填）；`log`（追加到 `log.md`）；`updateIndex`（是否把 `[[slug]]` 写入 index） |
| `wenmai_lint` | 只读体检：孤儿页、断掉的 `[[wikilinks]]`、缺 frontmatter、raw sha256 漂移。不自动修复 | 无 |
| `wenmai_review` | 只读审视：把 raw 哈希漂移传播到编译页、词法重复、冲突候选、结构问题、健康度数字。不改页面。可用 finding id 做 ack / snooze / wontfix | `includeDismissed`；`ttlDays`（默认 180）；`duplicateThreshold`（默认 0.5）；`ack` / `snooze` / `wontfix`；`snoozeDays` |
| `wenmai_tasks` | 把 finding 投影成任务队列（Why / Related Pages / Expected Result / Priority / Status）。不另建编号。完成即 ack | `op`（`list` 默认 / `start` / `done` / `snooze` / `wontfix`）；`id`；`priority`；`snoozeDays`；`includeDismissed` |
| `wenmai_refactor` | 重构编译页：merge / split / rename / move / link / rewrite / archive。默认 dry-run。禁止改 `raw/`。不生成正文。成功 apply 后可 ack finding；`undo` 只撤销上一笔 | **`op`** 或 `undo`；`dryRun`（默认 true）；`source`；`target`；`title`；`content` / `contentB`；`finding` |
| `wenmai_config` | 查看或改额外原文目录。当前会话工作区始终在扫描列表里，改的是「额外」项，写入库内 `source-roots.json` | `add` 增加一条；`remove` 删一条；`set` 整表替换（逗号分隔，空字符串清空额外目录） |
| `wenmai_graph` | 根据编译页 `[[wikilinks]]`、工作区/sourceRoots 里的 Markdown、标签和 sources 生成关联图，写出 `graph.html` | `focus`、`depth`（默认 2）；`includeTags` / `includeSources` / `includeMissing` / `includeArticles`（默认都为 true）；`open`（macOS 下用系统浏览器打开） |

## 开发

```sh
pnpm install
pnpm test
pnpm build
```

端到端功能测试（使用仓库内示例文稿，不读取你的私人目录）：

```sh
pnpm accept
```

发版前必须两者都过：`pnpm test` 与 `pnpm accept`（或一条 `pnpm release-check`）。推送版本 tag 后，GitHub Actions 会先跑 `release-check` 再发 npm。

## 许可

MIT
