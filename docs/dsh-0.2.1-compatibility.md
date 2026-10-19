# DSH 0.2.1-rc.2 兼容性修复记录（插件 0.4.2）

日期：2026-10-19。范围：当前基础能力面板，不修改其他插件、模型配置或用户真实规则/归档。

## 一、现场与根因

- 当前 DSH：`0.2.1-rc.2`，Cordis `4.0.5`。
- 当前 GUI：`http://127.0.0.1:3080`；未启动替代 GUI。
- 旧插件：`0.4.1`。源码 `git pull --ff-only` 无更新；默认镜像和官方 npm registry 均没有本包（404），因此本地修复。
- 对原 GUI 的 `POST /basics/api/mcp.list` 返回空 405，与未匹配路由的静态页面 POST 一致。
- 旧入口强制注入 `webRuntime`，而当前 `dsh-web-app` 不再提供该服务。客户端注册独立成功不意味着宿主半边成功；路由未挂载后落入静态 fallback。
- 新版认证由 `dsh-client-connection` 的 `connection` 服务提供。只删除旧依赖、沿用自抄 Host 检查会漏掉登录认证，因此必须一起迁移。

## 二、改动

1. 宿主强制注入改 `connection`；每次请求调用公开 `admit()`，继承真实 Host/Origin、Cookie/API 认证；401/403 原意保留，限制所有者身份。认证异常不降级。
2. 方法仅 POST；方法表使用 `Object.hasOwn()`，不让 `constructor` 等原型属性被当作接口。
3. 客户端保留同源 POST JSON，补空 401/405 的中文可操作提示，非成功 HTTP 即使带 `ok:true` 也不误报成功；不自动重试修改请求。
4. 删除未使用的旧 trust-fence 实现，避免复制宿主安全逻辑继续漂移。
5. 版本/旧插件清单统一 `0.4.2`；Connection 与 home-paths peer 明确要求 `>=0.2.1-rc.2 <0.3.0-0`，不再声称支持旧 DSH，也不放行未验证的 0.3 预发布。
6. 四个 DSH dev 包升 `0.2.1-rc.2`，开发 Cordis 升 `~4.0.5`；本地 lockfile 同步，未升级不相关依赖。
7. 补齐共享全局规则根 `resolveAgentsHome()/agentsHomeDisplay()`，发现/读写均重新走白名单；缺失不创建，新建全局规则保持 DSH 根语义。
8. 发布文件包含文档与旧 manifest，便于安装副本版本和说明一致。

## 三、全面核查结果

| 面 | 当前宿主事实 | 结论 |
|---|---|---|
| 路由 | WebServer `register({kind,path,handler})` 不变 | 可继续挂 `/basics/api`，生命周期释放 |
| 安全 | `connection.admit()` 统一信任栅栏和认证 | 已迁移；真实签名 Cookie 回归 |
| 技能 | Agent 本身是 scope，`snapshot/get` 和来源枚举未漂移 | 保留按当前会话读技能及明确兜底 |
| MCP | Loader entries 与 `compositionInventory()` 字段仍在，ACTIVE 数值为 2 | 保留；嵌套 group 无精确关联时安全退为未知 |
| MCP 开关 | `disabled` 属 Loader 行，不是 MCP config | 现有写回位置正确；不修改真实服务开关验收 |
| 规则 | 当前有 DSH 与共享 agents 两个全局根 | 补齐后者；项目候选/根标记不变 |
| 归档恢复 | 公开 `unarchiveSession()` 存在 | 现有优先通道正确，保留延迟解析可选服务 |
| 会话产物 | 当前 JSONL 仍是 project/session 目录与 vN jsonl/zstd 代际 | 现有白名单布局匹配；未真实删用户会话 |
| 客户端 | 独立 slots/locale/sessions 注册方式 | 按当前依赖类型构建；端到端点击需重启后验收 |

## 四、验证与边界

新增回归分为：

- HTTP：真实 Node HTTP 流、四类读取、401/403、非 owner、认证服务异常、POST/未知方法/原型方法、JSON/体积上限、只读所有修改接口和路由卸载。
- 客户端 API：同源协议、非 JSON 错误提示、业务错误保留、HTTP 错误不误报成功、网络失败不重放删除。
- 真实宿主：通过 `DSH_RUNTIME_NODE_MODULES` 加载实际 DSH 的 Cordis、Connection、BrowserAuth 和兼容预检；凭据存储仅隔离内存，签名及令牌交换由真实宿主代码完成。验证无 webRuntime 时装配、登录 Cookie、篡改拒绝、Host/Origin、路由和卸载。
- 规则：双全局根顺序/去重/缺失、环境覆盖、服务列表/读取/保存白名单、新建语义和只读。

最终验证：**13 个测试文件、112/112 通过，0 失败、0 跳过**（含真实宿主 2 项）；类型检查和生产构建通过，Git 暂存/工作树空白校验通过。代码与文档分批独立审查无阻塞项。

已用当前宿主官方 `plugin --profile web add file:<仓库>` 安装；pnpm 复用目录缓存使安装包仍显示 0.4.1，随后使用仓库既有 `sync-profile` 定向同步。独立审查确认安装副本 **69 个文件 SHA256 全部与仓库一致**，含宿主/客户端 bundle、类型、源码、文档及两个 0.4.2 清单；`sync:check` 通过。

profile 的 `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml` 与备份逐字节一致；`pnpm-lock.yaml` 仅本插件的 Connection/home-paths 两条 peer 元数据变化，其他插件配置未改。`dsh --profile web --dump-config` 退出 0、stderr 为空，包含基础面板挂载行，无 incompatible / waiting for service / fatal / entry not found。

**未重启原 DSH。** 用隔离 Playwright 浏览器访问原 GUI 返回 **401 Unauthorized**（无用户登录态），因此没有完成登录后的四页签点击与修改操作验收，也不宣称运行中的旧进程已经热更新。测试不代表用户实际环境的远程 MCP 服务都健康。

已知既存边界（不伪称全部消除）：

- 预设嵌套 group 的 MCP 激活关联可退为未知，不用 ID 后缀模糊匹配以免重名误判。
- JSONL 列表通常不提供 eventCount，UI 仅在存在时显示；不为显示计数读取全部日志。
- 面板使用宿主本地 Node 文件系统，不是远程工作区的可替换 fs 提供方。
- 归档文件级删除不协调其他进程写租约、不清理附件/查询索引，不应对其他进程使用的会话执行删除。
- 本轮没有调用付费模型测试，没有改登录凭据，也没有为验收修改真实 MCP/规则或删除真实会话。正常主/子代理交互仍按各自模型配置计费。

## 五、生效与回退

更新后 **重启原 DSH + 原 GUI Ctrl+F5**；401 时重新使用启动登录链接。不要另开服务器或关闭认证。

更新前已备份 web profile 的四个配置文件与旧插件完整安装副本到：

```text
C:/Users/17737/.dsh/profiles/web/_backup-before-basics-panel-042-20261019-1935/
```

若需回退，请先退出 DSH，只还原此备份中的本插件目录，再校验 profile 四个文件；未改 profile 时无需整份回灌旧配置。旧插件在当前宿主仍有 webRuntime 不兼容，回退只是恢复改动前状态，不是修复 405。未自动 commit/push。
