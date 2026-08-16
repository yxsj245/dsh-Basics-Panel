# dsh-basics-panel 设计文档

> 日期：2026-08-16 · 状态：v0.1 已实现（MCP 展示/开关 + 技能展示/编辑）

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

## 5. 工程

- 构建：`tsc`（声明，lib/types）+ `tsdown`（Host ESM `lib/index.js`；Client 双通道 CJS bundle `lib/client.js`（官方通道，id=包名）与 `lib/client-registry.js`（注册表通道，id=dsh-external/dsh-basics-panel））。
- 客户端 bundle 遵守 purity gate：跨插件值导入被拒，react / 模块表条目 external，其余内联；CSS Modules 编译为哈希 class + 注入 `<style data-plugin>`。
- 测试：vitest，覆盖 frontmatter、yaml 行编辑、脱敏、组合解析（纯函数 + 临时 fixture）。

## 6. 后续规划

- 技能：新建 / 删除 / 重命名（目录操作）、排序；
- MCP：增改服务器表单（完整校验 + 明文凭据往返需谨慎）、连接日志、重连状态；
- 新增可视化候选：agent preset 组合查看、设置命名空间、工具清单、后台任务、子代理拓扑；
- 项目级 MCP：待 DSH 支持项目级组合文件后，在 `composition-scan` 增加一个来源即可。
