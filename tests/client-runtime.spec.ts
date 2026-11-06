/** 对构建后的浏览器 bundle 使用真实 Cordis 与新版 SlotRegistry 验证生命周期。 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { Context } from '../src/context-types.ts'

const runtimeRoot = process.env.DSH_RUNTIME_NODE_MODULES
const require = createRequire(import.meta.url)
const suite = runtimeRoot ? describe : describe.skip

type ModuleFactory = (requireModule: (id: string) => unknown) => Record<string, unknown>

/** 只执行 DSH 的模块注册包装，不启动浏览器或建立网络连接。 */
async function loadBundle(path: string, modules: Record<string, unknown>) {
  let factory: ModuleFactory | undefined
  let id = ''
  runInNewContext(await readFile(path, 'utf8'), {
    window: { __ModuleLoader__: { load: (entry: { id: string; factory: ModuleFactory }) => { id = entry.id; factory = entry.factory } } },
    console, queueMicrotask, setTimeout, clearTimeout,
  }, { filename: path })
  if (factory === undefined) throw new Error('构建产物未向宿主模块加载器注册')
  const exports = factory(key => {
    if (Object.hasOwn(modules, key)) return modules[key]
    throw new Error(`浏览器 bundle 引用了未共享的模块：${key}`)
  })
  return { id, exports }
}

suite('新版宿主客户端契约', () => {
  it('产物在真实 slots 上等待声明、注册四页签入口并随插件卸载清理', async () => {
    const cordis = await import(pathToFileURL(join(runtimeRoot!, '@deepseek-ai/cordis/lib/index.js')).href)
    // 安装版把纯共享模块编入 Web 壳，未必保留独立包；测试使用同版本发布包并强制核对版本。
    const sharedPackage = JSON.parse(await readFile(require.resolve('@deepseek-ai/dsh-client-ui-slots/package.json'), 'utf8'))
    const rendererPackage = JSON.parse(await readFile(join(runtimeRoot!, '@deepseek-ai/dsh-client-ui-renderer/package.json'), 'utf8'))
    expect(sharedPackage.version, '共享 slots 与实际宿主 renderer 版本必须一致').toBe(rendererPackage.version)
    const modules = {
      react: require('react'),
      'react/jsx-runtime': require('react/jsx-runtime'),
      'react-dom': require('react-dom'),
      'react-dom/client': require('react-dom/client'),
      '@deepseek-ai/cordis': cordis,
      '@deepseek-ai/dsh-client-ui-slots': await import('@deepseek-ai/dsh-client-ui-slots'),
    }
    const renderer = await loadBundle(join(runtimeRoot!, '@deepseek-ai/dsh-client-ui-renderer/lib/client.js'), modules)
    const root = new cordis.Context() as Context
    const dictionaries = new Set<string>()
    const fibers: { dispose(): Promise<void> }[] = []
    const slotsReady = new Promise<void>(resolve => { root.inject(['slots'], () => resolve()) })
    fibers.push(root.plugin({ apply: (ctx: Context) => {
      const Registry = renderer.exports.SlotRegistry as new (ctx: Context) => unknown
      new Registry(ctx)
    } }))
    await slotsReady
    root.provide('sessions', { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } })
    root.provide('locale', {
      getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {},
      register: (ns: string, locale: string) => {
        const key = `${ns}/${locale}`
        if (dictionaries.has(key)) throw new Error('字典重复登记')
        dictionaries.add(key)
        return () => { dictionaries.delete(key) }
      },
    })
    const slots = root.slots as typeof root.slots & {
      entries(key: string): { options: { id: string; label?: () => string }; component: unknown }[]
    }
    try {
      for (const [file, expectedId] of [['client.js', 'dsh-basics-panel'], ['client-registry.js', 'dsh-external/dsh-basics-panel']]) {
        const bundle = await loadBundle(fileURLToPath(new URL(`../lib/${file}`, import.meta.url)), modules)
        expect(bundle.id).toBe(expectedId)
        const mounted = new Promise<void>(resolve => { root.inject(['slots', 'sessions', 'locale'], ctx => {
          fibers.push(ctx.plugin({ apply: bundle.exports.apply as (ctx: Context) => void }))
          resolve()
        }) })
        await mounted
        expect(dictionaries.size).toBe(2)
        expect(slots.entries('settings.section')).toHaveLength(0)
        const declare = slots.register as unknown as (options: unknown, component: unknown) => () => void
        const offShell = declare.call(slots, { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } }, () => null)
        expect(slots.entries('settings.section')).toHaveLength(1)
        const entry = slots.entries('settings.section')[0]!
        expect(entry.options.id).toBe('basics-panel')
        expect(entry.options.label?.()).toBe('基础能力')
        const html = renderToStaticMarkup(createElement(entry.component as ComponentType<{ ctx: Context; close: () => void }>, { ctx: root, close: () => {} }))
        for (const label of ['MCP 服务器', '技能', '规则', '归档会话']) expect(html).toContain(label)
        await fibers.pop()!.dispose()
        expect(slots.entries('settings.section')).toHaveLength(0)
        expect(dictionaries.size).toBe(0)
        offShell()
      }
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
  })
})
