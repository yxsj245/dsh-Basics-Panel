import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/index.ts'
import type { BasicsHostConnection, BasicsWebRoute, Context } from '../src/context-types.ts'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close(error => error ? reject(error) : resolve())
  })))
})

/** 用真实 HTTP 流验证路由和请求体；认证判断本身在宿主契约测试中验证。 */
async function boot(admit: BasicsHostConnection['admit'] = () => ({ peer: { principal: { kind: 'owner' } } }), maxBodyBytes = 1024) {
  let route: BasicsWebRoute | undefined
  let dispose: (() => void) | undefined
  const snapshot = vi.fn(async () => ({ skills: [], complete: true }))
  const ctx = {
    connection: { admit },
    sessions: { get: () => undefined },
    skills: { snapshot },
    tools: { schemas: () => [] },
    get: () => undefined,
    effect: (fn: () => () => void) => { dispose = fn() },
    webServer: { register: (value: BasicsWebRoute) => { route = value; return () => { route = undefined } } },
  } as unknown as Context
  apply(ctx, { maxBodyBytes, readOnly: true })
  const server = createServer((req, res) => {
    if (route === undefined) { res.writeHead(404); res.end(); return }
    void route.handler(req, res)
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('未得到测试监听端口')
  const origin = `http://127.0.0.1:${address.port}`
  const call = (method: string, body = '{}', verb = 'POST') => fetch(`${origin}/basics/api/${method}`, {
    method: verb,
    ...(verb === 'GET' ? {} : { body }),
    headers: { 'content-type': 'application/json' },
  })
  return { ctx, call, snapshot, dispose: () => dispose?.() }
}

describe('基础能力 HTTP 路由', () => {
  it('依赖 Connection，不等待已移除的 webRuntime', () => {
    expect(inject).toContain('connection')
    expect(inject).not.toContain('webRuntime')
  })

  it.each(['skills.list', 'mcp.list', 'rules.list', 'archived.list'])('认证后 %s 能调用真实功能后端', async method => {
    const { call } = await boot()
    const response = await call(method)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  it.each([401, 403] as const)('宿主拒绝 %s 时不调用后端、不解析非法请求体', async rejection => {
    const { call, snapshot } = await boot(() => ({ rejection }))
    const response = await call('skills.list', '{invalid')
    expect(response.status).toBe(rejection)
    expect(await response.json()).toMatchObject({ ok: false, error: { code: rejection === 401 ? 'unauthorized' : 'forbidden' } })
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('受限 Peer 即使通过认证也不能进入管理 API', async () => {
    const { call, snapshot } = await boot(() => ({ peer: { principal: { kind: 'agent' } } }))
    expect((await call('skills.list')).status).toBe(403)
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('认证服务异常不会降级为免认证', async () => {
    const { call, snapshot } = await boot(() => { throw new Error('认证服务不可用') })
    expect((await call('skills.list')).status).toBe(500)
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('拒绝非 POST、未知方法和原型属性', async () => {
    const { call } = await boot()
    expect((await call('skills.list', '', 'GET')).status).toBe(405)
    for (const method of ['missing', 'constructor', 'toString', '__proto__', 'skills/list', '']) {
      expect((await call(method)).status).toBe(404)
    }
  })

  it('拒绝非法 JSON 和超限请求体', async () => {
    const { call, snapshot } = await boot(undefined, 16)
    expect((await call('skills.list', '{invalid')).status).toBe(400)
    expect((await call('skills.list', JSON.stringify({ data: 'x'.repeat(32) }))).status).toBe(400)
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('只读部署仍拒绝全部修改方法', async () => {
    const { call } = await boot()
    for (const method of ['skills.save', 'mcp.save', 'mcp.setEnabled', 'rules.save', 'rules.create', 'archived.restore', 'archived.delete']) {
      expect((await call(method)).status).toBe(403)
    }
  })

  it('作用域卸载移除路由', async () => {
    const { call, dispose } = await boot()
    dispose()
    expect((await call('skills.list')).status).toBe(404)
  })
})
