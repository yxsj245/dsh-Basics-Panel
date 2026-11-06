# DSH 0.2.2-rc.1 兼容适配（插件 0.4.3）

日期：2026-11-06。范围为当前 `dsh-basics-panel` 源码与 web profile 安装副本；另外对全部已安装插件做宿主兼容声明预检，不代表逐个完成其它插件的行为验收。

## 版本与基线

- 当前 DSH 和配置的 npm registry `latest` 均为 `0.2.2-rc.1`，Node `24.16.0`。
- 宿主运行时：`C:/Users/17737/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules`。
- 当前 GUI：`http://127.0.0.1:3081`；不启动替代服务器。
- 源码仓库初始干净，`git pull --ff-only` 返回 Already up to date；旧版插件为 `0.4.2`，开发依赖仍为 DSH `0.2.1-rc.2`。
- 新版声明：DSH `>=0.2.2-rc.1 <0.3.0-0`、Node `>=24.9.0`、Cordis `~4.1.0`、schemastery `~3.19.0`。旧版 DSH 需使用相应旧插件。

## 核查与改动

| 范围 | 宿主事实与适配结果 |
| --- | --- |
| 认证与 HTTP | `connection.admit()`、WebServer 路由结构仍在；继续继承真实认证和来源校验，仅允许所有者。新版真实宿主契约通过。 |
| Cordis 与依赖 | 改用官方作用域 Context 类型，移除独立旧裸 `cordis`；五个 DSH 开发包与 lockfile 对齐 0.2.2-rc.1。 |
| 客户端 | 新版 `settings.section`、SlotRegistry 注册机制仍兼容；两个构建入口在真实 Cordis/SlotRegistry 下完成等待声明、注册、渲染四页签和卸载验证。 |
| 技能 | `snapshot/get`、Agent 作用域和来源字段仍兼容；保留按当前会话及明确兜底的行为。 |
| MCP | transport、Loader、预设 `compositionInventory` 的使用接口保留；无法精确关联嵌套组时仍显示未知。补齐等号参数和 URL 敏感查询字段脱敏及保存回填。 |
| 规则 | 两个全局根与默认项目规则候选仍匹配；文档明确自定义候选配置与面板默认扫描的边界。 |
| 归档恢复 | 公开 `unarchiveSession()` 仍可用，保留按请求解析服务。 |
| 归档删除 | 新版清单可包含未物化会话，新增 `snapshot.location` 提供物化位置；删除先读取清单，再核对 JSONL location、唯一目录及代际文件。扫描错误或不明布局拒绝删除和摘归档记录。 |

### 归档删除的关键修复

旧逻辑将扫描未找到、根目录读取失败、候选布局不匹配统一当成“悬空归档”。在新版宿主中，`create()` 后会话可先出现在 `list()` 中，尚无文件或 `location`；这不能视为已删除的会话。

0.4.3 的处理为：

1. 归档不可写、持久化清单不可读时拒绝文件删除。
2. 清单中存在的会话必须有 JSONL 的绝对 `location.path`。未物化会话、其他后端不做文件级删除。
3. 实际代际日志必须与宿主位置一致；根路径错误、目标不在根内、链接/junction、同名重复或布局无效均保留文件和归档记录。
4. 只有清单不含 ID 且完整扫描成功、确无候选目录时才清理悬空记账。
5. 删除前再次检查本进程 Agent 的运行状态，并重新验证目录。

这仍不是持久化服务的公开删除 API。DSH 的持久化服务没有提供 delete；本插件不协调其他进程写租约，不清理附件/查询索引/投影缓存，空闲但仍有存储句柄的会话也有重新落盘风险。用户仍应先关闭对应会话，并避免在其他进程使用该会话时删除。

### MCP 脱敏与保存

新增识别常见敏感键的 `--token=value` 等号形式和 URL 查询值，原样保存脱敏展示时回填当前原值；对修改后仍含占位符的参数/地址拒绝保存，避免写入占位符或把旧凭据套在新地址。

任意位置参数、嵌套 shell 文本和自定义敏感键名无法可靠识别。本面板不应作为任意字符串的通用秘密检测器。

## 验证

- 修改前：认证、HTTP 与会话作用域基线在真实 0.2.2-rc.1 上 23/23 通过。
- 修改后专项：归档、产物扫描、MCP 展示/保存及真实宿主 5 文件、56/56 通过。
- 最终完整回归：14 个文件、124/124 通过，0 失败、0 跳过。
- 类型检查、生产构建、Git diff 空白检查通过。
- 真实 JSONL：在自动清理的临时根内创建未物化会话，确认拒绝删除；随后 flush、close，核对真实 location，再删除临时产物。未操作用户真实会话。
- 真实客户端：执行两个已构建 bundle，使用新版实际 SlotRegistry 与 Cordis，locale/session 仅为隔离内存夹具；slots 纯共享核从与实际 renderer 相同版本的发布包加载，版本不符则测试失败。验证注册/卸载及 React 静态渲染四页签，不冒充浏览器点击验收。
- 独立代码审查完成：无阻断或高风险必修项。列表的 `deletable` 仅表示候选资格，删除时的完整核查仍可能安全拒绝；配置根内存在项目级链接/junction，或目标目录缺少可验证日志时，扫描保守拒绝操作。Windows 路径别名或大小写不一致也可能导致位置校验拒绝，遇到时先核对实际路径。
- MCP 当前编辑器不发送 headers；若未来增加请求头编辑，必须先实现与参数相同的脱敏占位符回填，不能直接把展示占位符写入配置。
- 全 web profile 12 个已安装条目调用宿主 `evaluatePluginCompatibility` 均返回兼容；`--dump-config` 退出 0、stderr 为空，未出现 incompatible / waiting for service / entry not found / fatal / [error]。唯一 pending 文本属于 PR 审查预设提示词。

## 安装与生效

通过当前宿主官方命令更新本地 file 依赖，安装副本清单已为 0.4.3；最终通过本仓库定向同步通道补齐源码映射及最新文档，并校验发布内容一致性。

升级前备份（旧插件完整副本及 profile 四件套）：

```text
C:/Users/17737/.dsh/profiles/web/_backup-before-basics-panel-043-20261106-115229/
```

官方安装后 profile 的 package.json、cordis.patch.yml、pnpm-workspace.yaml 与备份一致；锁文件更新本插件元数据，并重新解析了已有 Orange30 本地源的新版兼容元数据。本任务没有编辑 Orange30 源码或配置，不回滚其已有调整。

profile 配置了 `autoInstallPeers: false`，因此 `pnpm peers check` 会报告由宿主或浏览器共享表提供的 peer 未安装在 profile 顶层；不能仅据此重复安装另一份宿主依赖。此处通过真实宿主契约和组合预检验证本面板。

**完成后需重启原 DSH 进程，并在原 GUI Ctrl+F5。** 本任务不重启正在承载会话的进程，也未进行登录后四页签的浏览器端到端操作。没有修改真实 MCP 启停、规则内容、用户归档或登录凭据，没有专门调用付费模型探针。尚未自动 commit/push。

## 后续复验

重新构建后设置 `DSH_RUNTIME_NODE_MODULES` 并运行测试；显式指定的宿主缺包必须失败，未指定时真实宿主组会明确跳过。客户端产物契约需要先构建：

```powershell
pnpm typecheck
pnpm build
$env:DSH_RUNTIME_NODE_MODULES = '<实际 DSH 安装目录>/node_modules'
pnpm test
pnpm run sync
pnpm run sync:check
dsh --profile web --dump-config
```

宿主自定义规则候选/根标记时，面板仍采用默认扫描。远程工作区文件操作仍使用宿主本地 Node 文件系统，不等同于远端 SSH 文件提供方。
