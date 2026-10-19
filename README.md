# dsh-basics-panel

DSH Web 插件「基础能力面板」：在 **设置 → 基础能力** 中可视化管理 **MCP 服务器、技能、规则与归档会话**。

## 当前兼容版本

**插件 0.4.2 要求 DSH `>=0.2.1-rc.2 <0.3.0-0`。** 本次实际核对与回归的宿主是 `0.2.1-rc.2`；范围内未来版本仍需复验，不代表预先认证。

- 修复升级后四个页签的空 HTTP 405：旧插件等待已移除的 `webRuntime`，后端未挂载，请求落到静态页面 fallback。
- 宿主注入改为 `webServer / connection / sessions / skills / tools`，所有管理请求先走公开的 `connection.admit()`：沿用宿主 Host/Origin 栅栏、浏览器登录 Cookie 和 API Peer 认证，并只允许 `owner` 身份。
- 不提供免认证降级，不再维护旧的独立信任栅栏。401 提示重新登录；空 405 提示检查安装副本并重启。
- 全局规则补齐 `$DSH_AGENTS_HOME/AGENTS.md`（默认 `~/.agents/AGENTS.md`），与 `$DSH_HOME/AGENTS.md` 一起发现；新建全局规则仍只写 DSH 根。
- 四个 DSH 开发依赖对齐 `0.2.1-rc.2`，Cordis 对齐 `4.0.5`；两个插件清单版本同步为 `0.4.2`。

较早 DSH 请保留旧插件版本；0.4.1 之前的兼容记录不代表 0.4.2 继续支持旧宿主。详细操作见 [使用文档](<docs/使用文档.md>)；本轮证据与限制见 [0.2.1 兼容记录](<docs/dsh-0.2.1-compatibility.md>)。

## 功能与范围

| 页签 | 功能与边界 |
|---|---|
| MCP | 按 profile / preset 分组、配置脱敏、启用与禁用、修改配置。预设修改对新会话生效。无可用激活证据时显示未知，不伪报连接成功。 |
| 技能 | 按当前会话 Agent 的作用域列出技能、查看与编辑可写技能；内置/运行时技能只读。作用域兜底时提示实际使用的会话。 |
| 规则 | 两个全局根和项目根至 cwd 的规则链；查看、编辑、新建。规则基线通常对新会话生效。 |
| 归档会话 | 列出、恢复和确认后删除；运行中拒绝删除，已装载空闲会话仍须注意重新落盘风险。事件条数仅在后端提供时显示。 |

配置文件、规则和会话产物使用 **DSH 宿主本地文件系统**，不是当前远程工作区的 SSH 文件系统。归档删除不清理附件、查询 SQLite 索引等派生数据，也不承诺协调其他进程的会话写入锁；有其他进程使用同一会话时不要删除。

## 安装与更新

此包当前没有 npm registry 发布包。先在源码目录构建，再用官方 CLI 安装本地依赖：

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
dsh plugin --profile web add file:<源码目录绝对路径>
```

当前 web profile 已经是 `file:` 依赖时，可使用本仓库的定向同步通道；构建本身不会更新安装副本：

```bash
pnpm run sync
pnpm run sync:check
```

同步目标默认为 `$DSH_HOME/profiles/web/node_modules/dsh-basics-panel`，可用 `--profile`、`DSH_PROFILE`、`DSH_HOME` 覆盖。同步前请备份安装副本和 profile；同步脚本会整体替换本插件的发布目录，不修改其他插件。不要把尚未完成的构建同步到运行环境。

**更新后必须重启原 DSH 进程，并在原页面 Ctrl+F5 刷新。** 只刷新浏览器不会重新挂载宿主路由；不需要另开 Web 服务。401 时通过 DSH 启动提供的登录链接重新进入，不要关闭认证。

## 开发与回归

```bash
pnpm typecheck
pnpm test
pnpm build
```

真实宿主契约测试需要将 `DSH_RUNTIME_NODE_MODULES` 指向所测试 DSH 的 `node_modules`；未指定时该组明确跳过，指定无效路径或宿主缺少服务时必须失败。PowerShell 示例：

```powershell
$env:DSH_RUNTIME_NODE_MODULES = '<当前 DSH 安装目录>/node_modules'
pnpm test
dsh --profile web --dump-config
```

真实测试加载官方 Cordis、Connection、BrowserAuth 与兼容性预检，使用隔离内存凭据；不会读取用户凭据、调用模型或启动替代 GUI。HTTP 回归另外覆盖四类读取、只读写入拒绝、请求体上限、认证失败、原型属性拒绝及路由卸载。`--dump-config` 只是组合预检，不等同于全部服务实际激活或浏览器点击验收。

### 可选服务必须在调用时刻解析

`workspaceRegistry`、`sessionPersistence`、`agentPresets` 等可能晚于本插件就绪，因此各功能每次请求重新 `ctx.get()`，不在启动时固化空值，也不将可选服务变成强制依赖。

## 安全

- 每个管理请求先通过宿主认证和来源校验，拒绝后不读取请求体、不调用功能后端。
- MCP 配置敏感值脱敏；文件写入须重新发现路径白名单；技能/规则保存有大小与 mtime 检查。
- `readOnly` 禁止所有修改；`allowSessionDelete: false` 可单独禁止删除归档。
- 归档删除只接受归档集合里的 ID，重新定位并验证宿主本地会话目录；不是上游会话删除 API，也不是跨进程回收服务。

## License

MIT
