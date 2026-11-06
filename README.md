# dsh-basics-panel

DSH Web 插件「基础能力面板」：在 **设置 → 基础能力** 中可视化管理 **MCP 服务器、技能、规则与归档会话**。

## 当前兼容版本

**插件 0.4.3 要求 DSH `>=0.2.2-rc.1 <0.3.0-0`、Node `>=24.9.0`。** 2026-11-06 核对当前安装与 npm `latest` 均为 `0.2.2-rc.1`；未来版本仍需复验。

- 开发依赖对齐 DSH `0.2.2-rc.1`、Cordis `4.1.0` 与 schemastery `3.19.0`；Context 使用官方 `@deepseek-ai/cordis`，移除旧裸 `cordis` 依赖。
- 管理请求继续走 `connection.admit()`，继承 Host/Origin、Cookie/API 认证，只允许所有者；原有 HTTP 405 修复保留。
- 适配新版未物化会话：归档删除必须核对宿主 JSONL `location` 和实际目录，清单读取失败、根目录错误、重复目录、链接或布局不明时保留归档记录。
- MCP 展示补齐 `--token=value` 等号形式与 URL 敏感查询参数脱敏；原样保存会恢复原凭据，修改含占位符的地址需提供完整新值。
- 真实宿主回归覆盖认证、JSONL 创建/物化以及两种客户端 bundle 在 SlotRegistry 中的注册与卸载。完整回归 14 文件、124 项通过，0 跳过。

较早 DSH 请使用相应旧版插件。详细操作见 [使用文档](<docs/使用文档.md>)；本轮证据与边界见 [0.2.2 兼容记录](<docs/dsh-0.2.2-compatibility.md>)，历史 HTTP 405 根因见 [0.2.1 兼容记录](<docs/dsh-0.2.1-compatibility.md>)。

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
pnpm build
pnpm test
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
pnpm build
pnpm test
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
