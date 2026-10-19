/**
 * 基础能力面板宿主入口：经宿主 Connection 认证后分派 /basics JSON API。
 * 路径授权由各功能重新解析，不信任客户端直接提交的文件路径。
 */
import { resolveBasicsConfig, Config, type ResolvedBasicsConfig } from './config.ts'
import { BasicsError, readJsonBody, writeOk, writeError } from './wire.ts'
import { collectApi, type HostFeature } from './features/registry.ts'
import { registerSkills } from './features/skills/skills-service.ts'
import { registerMcp } from './features/mcp/mcp-service.ts'
import { registerRules } from './features/rules/rules-service.ts'
import { registerArchived } from './features/archived/archived-service.ts'
import type { Context, BasicsHttpRequest } from './context-types.ts'

export { Config }
export type { ResolvedBasicsConfig }
export type { Context }

export const name = 'dsh-basics-panel'

// DSH 0.2.1 的浏览器认证和可信来源校验统一由 Connection 提供。
export const inject = ['webServer', 'connection', 'sessions', 'skills', 'tools']

/** 优先使用宿主会话记录的工作目录，尚未装载时才采用客户端摘要。 */
function sessionCwdOf(ctx: Context, payload: unknown): string {
  const record = payload as Record<string, unknown> | null
  const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
  if (sessionId !== '') {
    const headerCwd = ctx.sessions.get(sessionId)?.header.cwd
    if (headerCwd !== undefined && headerCwd !== '') return headerCwd
  }
  const clientCwd = typeof record?.cwd === 'string' ? record.cwd : ''
  if (clientCwd !== '') return clientCwd
  return process.cwd()
}

/** 挂载四类功能的管理接口；认证拒绝时不读取请求体、不调用功能后端。 */
export function apply(ctx: Context, config?: Partial<ResolvedBasicsConfig>): void {
  const resolved = resolveBasicsConfig(config)
  const fc = { ctx, resolved, sessionCwdOf: (payload: unknown) => sessionCwdOf(ctx, payload) }
  const features: HostFeature[] = [
    { id: 'skills', register: registerSkills },
    { id: 'mcp', register: registerMcp },
    { id: 'rules', register: registerRules },
    { id: 'archived', register: registerArchived },
  ]
  const api = collectApi(features, fc)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/basics/api',
    handler: async (req, res) => {
      try {
        const admission = ctx.connection.admit(req)
        if ('rejection' in admission) {
          const unauthorized = admission.rejection === 401
          throw new BasicsError(
            unauthorized ? 'unauthorized' : 'forbidden',
            unauthorized ? '登录状态已失效，请重新登录 DSH。' : '请求来源未通过 DSH 安全校验。',
            admission.rejection,
          )
        }
        // 配置、规则与归档管理仅向宿主所有者开放，不向受限 API Peer 放权。
        if (admission.peer.principal.kind !== 'owner') {
          throw new BasicsError('forbidden', '当前身份无权管理基础能力。', 403)
        }
        if (req.method !== 'POST') {
          throw new BasicsError('method-error', '接口仅接受 POST 请求。', 405)
        }
        const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        const method = pathname.startsWith('/basics/api/') ? pathname.slice('/basics/api/'.length) : undefined
        const handler = method !== undefined && Object.hasOwn(api, method) ? api[method] : undefined
        if (method === undefined || method.includes('/') || handler === undefined) {
          throw new BasicsError('not-found', '未知的基础能力接口。', 404)
        }
        const payload = await readJsonBody(req as BasicsHttpRequest, resolved.maxBodyBytes)
        writeOk(res, await handler(payload))
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dsh-basics-panel: /basics/api routes')
}
