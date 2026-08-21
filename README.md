# 通鉴 Tongjian

把写过的东西编成一本可查的通鉴。

面向文字工作者：写文章、做自媒体、写视频脚本、写文案、写课程、写工作文档的人。DeepSeek Harness 插件。不依赖 Hermes，不用向量库，也不会把每一轮闲聊写进笔记。

本地就是一套 Markdown 目录，可用 Obsidian 打开。

## 它解决什么

文字工作越做越多，真正的问题往往不是「搜不到网上资料」，而是：

- 这个选题我写过没有？
- 脚本、文案、文章是不是各写各的，互相打架？
- 聊天里刚整理过的结论，下一轮又要重新发现一遍？

通鉴把**你已经写过的原文**收进 `raw/`，再编译成互相链接的概念页。Agent 开局只读 SCHEMA、目录和最近日志，而不是每轮做一遍 RAG。

适用材料包括：公众号/博客/推文、视频脚本与口播稿、广告与社媒文案、课程讲义、SOP 与会议纪要、以及其它工作文档。

## 和其他开源项目有何不同

npm 上已经有通用 wiki 插件。通鉴不和它们抢「Agent 记忆」这件事：

| | 通鉴 Tongjian | EveGoodEvening llmwiki | chancelu llmwiki | Hermes llm-wiki |
|---|---|---|---|---|
| 用户是谁 | 文字工作者、自媒体、脚本/文案/文档作者 | 要可追溯证据的 Agent | 要会话记忆的 Agent | Karpathy 式通用 wiki Agent |
| 核心问题 | 这个选题我写过没有？ | 这条结论从哪条源来？ | 上一轮聊过什么？ | 怎么维护一本可链接的 wiki |
| 写入从哪来 | 主动 ingest 成稿/素材 | `add_source` + 证据链 | 可 autoCapture 对话 | Agent 编译对话与资料 |
| 目录长什么样 | `entities/` `concepts/` 等人可读页 | `sources/<sha256>/` | vault + chronicle | 类似三层 wiki |
| 开局怎么用 | 只注入 SCHEMA + index + log 尾 | 偏检索/证据 | 每轮检索注入 | 按会话维护 |
| 杀手功能 | `tongjian_written`：写过没有 | 源 ID 必须真实存在 | RRF 多路召回 | 完整 Agent 运行时 |
| 运行时 | 轻量 DSH 插件 | DSH 插件 | DSH 插件 | Hermes（更重） |

一句话：**通鉴不是又一个 Agent 记忆插件，而是文字工作者的「选题防撞 + 成稿编译」知识库。**

## 怎么开始用

### 1. 安装插件

需要 Node.js 22.19+（或 24+）。把本仓库路径换成你 clone 之后的位置。

本机若没有 `dsh` 命令：

```sh
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 plugin --profile web add /path/to/tongjian
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 --profile web --dump-config
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 web
```

已安装 CLI 时：

```sh
dsh plugin --profile web add /path/to/tongjian
dsh --profile web --dump-config
dsh web
```

`dump-config` 里应出现 `dsh-tongjian` 层和 `id: tongjian`。浏览器打开 <http://127.0.0.1:3080>。

默认数据目录是 `~/tongjian`，不会占用 Hermes 的 `~/wiki`。卸载插件不会删除通鉴数据：

```sh
dsh plugin --profile web remove dsh-tongjian
```

### 2. 选工作区

在 Web UI 左上角选一个本地文件夹作为工作区。未选中时输入框是灰色的，这是 DeepSeek Harness 本身的限制，与通鉴无关。

工作区就是你的文稿目录：选中后，`tongjian_written` 默认扫描这个工作区。不必再手写 `sourceRoots`。

### 3. 额外原文目录（可选）

默认已经够用。只有工作区之外还有别的文稿仓时，才需要加路径。

**让 Agent 配：**

> 用 tongjian_config 把 `~/Documents/scripts` 加成额外原文目录

会写入通鉴库里的 `source-roots.json`。也可以让 Agent `remove` 或 `set`（逗号分隔，空字符串清空额外目录）。当前会话工作区始终在扫描列表里。

**或写在插件配置里**（profile 的 `cordis.patch.yml`，按 `id` 整行替换，不会深合并）：

```yaml
- id: tongjian
  config:
    root: '~/tongjian'
    sourceRoots:
      - '~/Documents/writing/scripts'
    orientBudgetChars: 8000
```

- `root`：通鉴数据根，默认 `~/tongjian`
- `sourceRoots`：额外扫描根，叠加在会话工作区之上
- 不要把家目录整盘配进去

改 TypeScript 后执行 `pnpm build` 并重启 `dsh web`。

### 4. 初始化

对新库说一句：

> 用 tongjian_init 初始化通鉴，领域是「个人文字工作：文章、脚本、文案、文档」。

或在输入框用斜杠命令看状态：先输入 `/tongjian` 选中命令，再补参数发送。

```text
/tongjian status
/tongjian lint
/tongjian orient
```

### 5. 日常三件事

**查有没有写过**

> 用 tongjian_written 查一下「某某选题」我写过没有

**收录一篇成稿**

> 把这篇 ingest 进通鉴，再编译成概念页：  
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

> 在通鉴里搜关键词，读一下 `concepts/某个概念.md`

规则：

- 「写过没有」不要凭记忆，走 `tongjian_written`
- 禁止修改 `raw/`；修正写在编译页上
- 不负责抓网页或解析 PDF。有正文之后再 ingest
- 也可用 Obsidian 直接打开 `~/tongjian`

## 目录

```text
~/tongjian/
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

类似 Obsidian 的知识图谱：通鉴编译页的 `[[wikilinks]]`，加上当前工作区 / sourceRoots 里的 Markdown 文章（按目录成簇，并识别 wiki 链接和相对 `.md` 链接）。

在 DSH 里：

```text
/tongjian graph
```

或对 Agent 说：

> 用 tongjian_graph 生成关联图并打开

会在通鉴根目录写出 `graph.html`。用浏览器打开即可拖拽、搜索、切换标签/原文/未解析链接。局部图可以带 focus（页面 slug）和 depth。

## 工具

`tongjian_status`、`tongjian_init`、`tongjian_ingest`、`tongjian_written`、`tongjian_search`、`tongjian_read`、`tongjian_write`、`tongjian_lint`、`tongjian_config`、`tongjian_graph`。

包内 `skills/tongjian/SKILL.md` 描述 Ingest / Query / Lint。可复制或软链到 DSH 的 skills 扫描目录（以当天官方路径为准）。

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
