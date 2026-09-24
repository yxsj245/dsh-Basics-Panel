# dsh-basics-panel 设计文档

> 日期：2026-08-16 · 状态：v0.3 已实现（MCP 展示/开关 + 技能展示/编辑 + 规则查看/创建/编辑 + 归档会话恢复/删除）

## 1. 目标

DSH Web「基础能力面板」：把 DSH 中缺失的可视化逐步补齐。首个里程碑交付两个 feature，并建立可扩展的 feature 注册表，后续可视化只增不改骨架。

## 2. 架构

插件分 Host / Client 两半：

- **Host**（`src/index.ts`）：注册 fenced `/basics/api` JSON 路由，合并各 feature 后端的方法。
- **Client**（`src/client/index.tsx`）：向 DSH 设置面板注册 `settings.section`（`ctx.slots.inject` 等待声明），面板内是 feature 页签栏。

两侧各有一个 feature 注册表，是唯一的扩展点：

- Host：`src/features/registry.ts` —— 每个 feature 贡献 `{id, register(fc) → 方法表}`，重复方法名报错。
- Client：`src/client/feature-registry.tsx` —— 每个 feature 贡献 `{id, label, Component}`。

### 数据流

```
浏览器 fetch /basics/api/<method>（sessionId + cwd）
  → 信任围栏（loopback / webRuntime.trustedHosts）
  → 按方法分发到 feature 后端
  → feature 自行向权威来源解析（skills 注册表 / 组合扫描），不信任客户端路径
```

## 3. Feature 一：MCP

### 数据来源

- 用户 patch 层：`$DSH_HOME/cordis.patch.yml`、`$DSH_HOME/profiles/*/cordis.patch.yml`
- 预设组合：`ctx.agentPresets.list()`（服务缺失时回退扫描 `~/.dsh/.agent-presets/*/agent.cordis.yml`）；`trust==='system'` 只读
- 部署方 `extraMcpFiles` 白名单

### 开关语义

`disabled` 是 Loader 行级开关。开关 = 在来源文件中增删该行 `disabled` 字段（`yaml` Document 往返，保留注释与其它键）：

- profile 文件：`watchUserPatches` 热重载立即生效；
- preset 文件：新会话生效（DSH 语义），UI 提示。

### 安全

- 敏感值（env / headers / `--password` 类参数 / URL 密码）只脱敏为 `••••`，绝不回传明文；
- 写文件白名单 = 扫描发现且非 system 的组合文件；`samePath` 做 Windows 大小写归一；
- 原子写（临时文件 + rename）。

### 已知限制

- DSH 核心无项目级 MCP 组合文件，项目级 MCP 留待后续；
- 运行时状态（已连接 · N 工具）对 profile 服务器准确，对 preset 服务器为尽力而为（预设作用域的工具不在全局 `ctx.tools` 视图内）。

## 4. Feature 二：技能

### 数据来源

`ctx.skills.snapshot({cwd})`（获胜技能按 rank 去重），`source` → 作用域：

| source | 作用域 | rank |
|---|---|---|
| project-dsh / project-agents | 项目级 | 100 / 200 |
| custom | 自定义 | 300 |
| user-dsh / user-agents | 用户级 | 400 / 500 |
| bundled | 内置（只读） | 600 |
| runtime | 运行时（只读） | 250 |

### 编辑语义

- 只读判定：`path` 存在且 `source ∉ {bundled, runtime}`；
- `skills.save` 以 `name` 重新向注册表解析权威路径（防路径伪造），比对 `expectedMtime` 拒绝并发修改；
- frontmatter 经 `yaml` Document 往返，未知键与注释保留；`disable-model-invocation`/`user-invocable` 默认省略、非默认才落键；
- 保存后 filesystem watcher 自动失效缓存（热刷新）。

## 5. Feature 三：规则

### 数据来源

镜像 `@deepseek-ai/dsh-agent-instructions` 的权威发现（`src/features/rules/scan.ts` 纯函数，可注入探测）：

- 用户全局：`$DSH_HOME/AGENTS.md`（`resolveDshHome` + `dshHomeDisplay` 展示为 `~/.dsh/...`）；
- 项目链：项目根（向上找 `.git` 标记）至 session cwd 的目录链，每目录探测候选 `AGENTS.md`/`CLAUDE.md`/`AGENTS.local.md`/`CLAUDE.local.md`。

### API 语义

- `rules.list`：返回分组（全局/项目）+ 每行 size/mtime/editable + `cwd`/`projectRoot`；
- `rules.get` / `rules.save`：以 `key`（绝对路径）重解析并 `samePath` 校验在白名单内；save 带 `expectedMtime` 冲突检测 + `maxRuleBytes` 上限 + 原子写；
- `rules.create`：作用域白名单（global 仅 `AGENTS.md`；project 写入项目根；cwd 写入工作目录）+ 文件名白名单，已存在返回 conflict，创建写入中文模板。

### 安全

- 客户端路径永不直接采信：读/写/建全部重新 discover 后比对；
- 全局规则是行为约束源，创建仅允许固定文件名，杜绝任意路径写入。

### 已知限制

- 规则基线在会话启动时加载，保存仅对新会话生效（DSH 语义，UI 已提示）；
- 不提供删除功能（误删全局规则风险大），后续可按需评估。

## 6. Feature 四：归档会话

### 上游语义（为什么需要这个 feature）

`@deepseek-ai/dsh-workspace` 的归档集合是**注册表全局的单向显示过滤器**：归档后的会话从所有分组面隐藏，但日志与工作区记账槽位都保留（便于恢复原位）。当前 DSH（0.1.5-rc.3）只暴露 `archiveSession`，没有取消归档与删除会话的接口；上游 0.1.7-rc.1 已提供 `unarchiveSession`（该 API 的引入版本未逐版核对，代码按“有则优先用”处理）。

### 数据来源

- 归档集合：`ctx.workspaceRegistry.archivedSessionIds`；
- 会话事实：`ctx.sessionPersistence.list()`（header/cwd/createdAt/sizeBytes/eventCount，一次调用拿全）；
- 运行状态：`ctx.sessions.get(id)`；
- 标题与最近活动：不额外读日志，直接复用客户端会话列表 `ctx.sessions.list`（侧边栏同一份 Host 投影）；
- 会话产物根：配置 `sessionsRoot`，留空取 `$DSH_HOME/sessions`。

### 服务可见性（务必延迟解析）

Cordis 的 `ctx.get(name)`（默认严格模式）在**提供该服务的 fiber 尚未 ACTIVE** 时返回 `undefined`（见 `@deepseek-ai/cordis` 的 `reflect.get(name, strict = true)`）。`dsh-workspace` 在发布 `workspaceRegistry` 之前要 `await` 打开工作区域域存储、恢复未完成的写入并索引会话头，而本面板的 `inject` 只声明 `webServer/webRuntime/sessions/skills/tools`，于是它恰好在这个窗口内 apply —— 此时把 `ctx.get('workspaceRegistry')` 的结果捕获进闭包，就会得到 `undefined` 并**在整个进程生命周期内固化**（症状：页签一直提示「未挂载工作区注册表」，尽管注册表几毫秒后已就绪）。

因此本面板一律**在调用时刻**解析可选服务：`archive-store` 提供 `registryOf()` / `globalOf()` 两个解析函数，其余 feature 的 `ctx.get(...)` 也都写在处理函数体内，`apply()` 阶段不缓存任何服务句柄。同样不要把这些服务写进 `inject`：那会让本面板在未挂载 `dsh-workspace` 的 profile 上永不挂载，并随该 fiber 的更替反复卸载重载。

### API 语义

- `archived.list`：归档集合 × 存储列表联表，输出 `stored/loaded/running/restorable/deletable` 等判定与合计大小；归档集合里的悬空条目也会列出（`stored=false`，可直接清理）。
- `archived.restore`：`workspaceRegistry` 归档集合去 id；日志与工作区槽位不动，`domain/changed` 事件让侧边栏实时复位。
- `archived.delete`：删除会话日志目录 → 摘除工作区记账（`Workspace.detachSession`） → 清理归档记录；仅限**已归档且未运行**的会话，路径由 Host 在会话根内重新扫描校验（目录名必须等于会话 ID、必须含日志代际文件、必须在根内），单次数量受 `maxBatchIds` 限制（客户端按该上限自动分批，并合并各批结果）。

### 会话「存活」的两个层级

面板的行状态刻意区分两个互不等价的概念，因为它们对应完全不同的操作后果：

| 字段 | 判定 | 含义 | 对删除的影响 |
|---|---|---|---|
| `running` | `ctx.agents.get(id)?.status === 'running'` | Agent 正在处理回合（上游 `AgentStatus` 只有 `idle`/`running`，销毁即从注册表移除） | **硬拦**：删产物会与正在进行的落盘交错 |
| `loaded` | `ctx.sessions.get(id) !== undefined` | 会话对象仍在本次进程的内存会话表里 | 不拦，但确认条点名提示风险 |

要点：**归档不卸载会话**（归档只是 `archivedSessionIds` 这层显示过滤），所以一个归档会话完全可能长期 `loaded`——典型情形是浏览器标签页还开着它。早期实现用「`loaded` 即拒绝删除」并把它标成「运行中」，既把「已装载」误报成「正在生成」（官方侧边栏用的是上面那条 `running` 判定），也让这两类会话永远删不掉；现在按上表拆分。

删除 `loaded` 但空闲的会话之所以仍要提示：产物被删后该会话对象还在内存中，之后任何一次落盘（`persistBatch` 对已落盘会话走 `appendLines` → `open(path,'a')`，目录已不存在会 ENOENT；若走创建路径则 `mkdir -p` 会把目录重新建出来）都可能报错或让日志复现。

### 归档集合的写入通道（兼容策略）

1. `registry.unarchiveSession(id)` —— 上游公开 API，存在即优先使用（`0.1.7-rc.1` 已提供，运行中的 `0.1.5-rc.3` 尚无；引入的确切版本未逐版核对）；
2. 否则走注册表自身的写入路径：读 `workspace` 域 global 的权威状态，构造下一份 state，经 `registry.enqueueOperation`（与注册表自身写入串行）+ `registry.setState` 提交 —— 磁盘、进程内快照与 `domain/changed` 事件三者一致；
3. 通道都不可用（含无法写入进程内快照的版本）时**明确报错**，绝不只改磁盘：否则注册表下一次写入会把已恢复的会话又写回归档。

### 安全与已知限制

- 删除绕过 DSH 会话存储（上游无删除 API）：正在运行（`running`）的会话一律拒绝；`loaded` 但空闲的会话允许删除，但确认条会点名提示「仍装载在本次进程中」；只删日志目录，不回收消息引用的附件与其它派生数据；
- 客户端列表基线在页面加载时拉取，删除后由面板主动 `ctx.sessions.refresh()` 重拉，必要时刷新页面；
- 侧边栏中已删除会话的行在基线重拉前可能残留（点击会 404），属预期。

## 7. 工程

- 构建：`tsc`（声明，lib/types）+ `tsdown`（Host ESM `lib/index.js`；Client 双通道 CJS bundle `lib/client.js`（官方通道，id=包名）与 `lib/client-registry.js`（注册表通道，id=dsh-external/dsh-basics-panel））。
- 客户端 bundle 遵守 purity gate：跨插件值导入被拒，react / 模块表条目 external，其余内联；CSS Modules 编译为哈希 class + 注入 `<style data-plugin>`。
- 测试：vitest，覆盖 frontmatter、yaml 行编辑、脱敏、组合解析、会话产物定位/删除与归档集合写入（纯函数 + 临时 fixture + 假 ctx）；假 ctx 的 `get` 可切换服务可用性，用于回归「注册表在本插件 apply 之后才挂载」这一时序（见 §6 服务可见性）。

## 8. 后续规划

- 技能：新建 / 删除 / 重命名（目录操作）、排序；
- 规则：删除（需谨慎评估）、规则生效预览（渲染后的 baseline）；
- MCP：增改服务器表单（完整校验 + 明文凭据往返需谨慎）、连接日志、重连状态；
- 归档会话：附件与派生缓存的回收、导出会话日志后再删除、按工作区/时间过滤；
- 新增可视化候选：agent preset 组合查看、设置命名空间、工具清单、后台任务、子代理拓扑；
- 项目级 MCP：待 DSH 支持项目级组合文件后，在 `composition-scan` 增加一个来源即可。
