/**
 * 在指定的真实 DSH 安装上验证服务装配、信任栅栏及签名 Cookie。
 * 普通 CI 未设置 DSH_RUNTIME_NODE_MODULES 时明确跳过；显式指定错误路径必须失败。
 * 凭据仅使用内存替身，不读取用户凭据、不启动 Web 服务或调用模型。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as basics from '../src/index.ts'
import type { BasicsWebRoute, Context } from '../src/context-types.ts'

const runtimeRoot = process.env.DSH_RUNTIME_NODE_MODULES

interface RuntimeContext {
  root: RuntimeContext
  connection: {
    admit(req: { headers: Record<string, string> }): unknown
    authenticatedUrl(origin: string): string
    authorizeIndex(req: { headers: Record<string, string>; method: string; url: string }, res: { writeHead(status: number, headers?: Record<string, string>): void; end(): void }): boolean
  }
  plugin(plugin: unknown, config?: unknown): { dispose(): Promise<void> }
  inject(names: string[], fn: (ctx: RuntimeContext) => void): unknown
  provide(name: string, value: unknown): void
  get(name: string): unknown
}

const suite = runtimeRoot ? describe : describe.skip
if (!runtimeRoot) console.warn('[dsh-runtime] 未指定 DSH_RUNTIME_NODE_MODULES，真实宿主测试跳过。')

suite('DSH 真实宿主兼容契约', () => {
  it('公开 Connection + Cordis 使插件在无 webRuntime 下装配，并继承真实认证', async () => {
    const load = (name: string) => import(pathToFileURL(join(runtimeRoot!, '@deepseek-ai', name, 'lib', 'index.js')).href)
    const { Context: RealContext } = await load('cordis')
    const connectionModule = await load('dsh-client-connection')
    const root = new RealContext() as RuntimeContext
    const routes = new Map<string, BasicsWebRoute>()
    const fibers: { dispose(): Promise<void> }[] = []
    let credential: unknown
    // 真实 BrowserAuth 生成并验证签名；只把持久凭据存储替换为隔离内存。
    root.provide('credentials', {
      modifyRecord: async (_key: string, update: (current: unknown) => Promise<unknown>) => {
        const next = await update(credential)
        if (next !== undefined) credential = next
        return credential
      },
    })
    root.provide('webServer', {
      host: '127.0.0.1', protocol: 'http:',
      register: (route: BasicsWebRoute) => {
        if (routes.has(route.path)) throw new Error('测试路由重复登记')
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    })
    root.provide('sessions', { get: () => undefined })
    root.provide('skills', { snapshot: async () => ({ skills: [], complete: true }) })
    root.provide('tools', { schemas: () => [] })
    try {
      const ready = new Promise<void>(resolve => { root.inject(['connection'], () => resolve()) })
      fibers.push(root.plugin(connectionModule, { trustedHosts: ['panel.example:3080'] }))
      await ready
      expect(root.get('webRuntime')).toBeUndefined()
      const mounted = new Promise<void>(resolve => {
        root.inject(basics.inject, ctx => {
          fibers.push(ctx.plugin(basics))
          resolve()
        })
      })
      await mounted
      expect(routes.has('/basics/api')).toBe(true)
      expect(root.connection.admit({ headers: { host: '127.0.0.1:3080' } })).toEqual({ rejection: 401 })
      expect(root.connection.admit({ headers: { host: 'evil.example' } })).toEqual({ rejection: 403 })
      expect(root.connection.admit({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } })).toEqual({ rejection: 403 })
      expect(root.connection.admit({ headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' } })).toEqual({ rejection: 403 })
      // 通过官方入口交换本测试进程的启动令牌，绝不读取正在运行的 DSH 令牌。
      const login = new URL(root.connection.authenticatedUrl('http://127.0.0.1:3080'))
      let cookie = ''
      let status = 0
      root.connection.authorizeIndex({ method: 'GET', url: `${login.pathname}${login.search}`, headers: { host: login.host } }, {
        writeHead: (value, headers) => { status = value; cookie = headers?.['set-cookie']?.split(';')[0] ?? '' },
        end: () => {},
      })
      expect(status).toBe(303)
      expect(cookie).not.toBe('')
      expect(root.connection.admit({ headers: { host: login.host, cookie } })).toMatchObject({ peer: { principal: { kind: 'owner' } } })
      expect(root.connection.admit({ headers: { host: login.host, cookie: `${cookie}tampered` } })).toEqual({ rejection: 401 })
      expect(root.connection.admit({ headers: { host: 'panel.example:3080', cookie } })).toEqual({ rejection: 401 })
      const route = routes.get('/basics/api')!
      let responseBody = ''
      await route.handler({
        method: 'POST', url: '/basics/api/skills.list', headers: { host: login.host, cookie },
        async *[Symbol.asyncIterator]() { yield new TextEncoder().encode('{}') },
      }, {
        statusCode: 0,
        writeHead: value => { status = value },
        end: body => { responseBody = String(body) },
      })
      expect(status).toBe(200)
      expect(JSON.parse(responseBody)).toMatchObject({ ok: true, value: { groups: [], complete: true } })
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
    expect(routes.has('/basics/api')).toBe(false)
  }, 10_000)

  it('peer/旧版 manifest 的支持范围与真实宿主预检一致', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const legacy = JSON.parse(await readFile(new URL('../dsh.plugin.json', import.meta.url), 'utf8'))
    const { evaluatePluginCompatibility } = await import(pathToFileURL(join(runtimeRoot!, '@deepseek-ai/dsh-app-boot/lib/index.js')).href)
    expect(evaluatePluginCompatibility(packageJson, {}, '0.2.1-rc.2')).toBeUndefined()
    expect(evaluatePluginCompatibility(packageJson, {}, '0.2.0-rc.2')).toBeDefined()
    expect(evaluatePluginCompatibility(packageJson, {}, '0.3.0-rc.1')).toBeDefined()
    expect(legacy.version).toBe(packageJson.version)
    expect(legacy.engines.dsh).toBe(packageJson.peerDependencies['@deepseek-ai/dsh-client-connection'])
  })
})
