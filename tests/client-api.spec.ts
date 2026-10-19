import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/client/api.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('客户端 API 协议', () => {
  it('沿用同源 POST JSON，不擅自附加身份或请求重试', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, value: { groups: [] } }))
    vi.stubGlobal('fetch', fetcher)
    expect(await api.mcpList()).toEqual({ groups: [] })
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/basics/api/mcp.list', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
  })

  it.each([
    [401, '登录状态已失效'],
    [405, '接口尚未挂载'],
    [502, 'HTTP 502'],
  ])('非 JSON HTTP %s 给出可操作提示', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: Number(status) })))
    await expect(api.mcpList()).rejects.toThrow(String(message))
  })

  it('保留后端的业务错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: { code: 'conflict', message: '文件已修改' } }, { status: 409 })))
    await expect(api.mcpList()).rejects.toMatchObject({ code: 'conflict', message: '文件已修改' })
  })

  it('非成功 HTTP 即使带 ok:true 也不能误报成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, value: {} }, { status: 500 })))
    await expect(api.mcpList()).rejects.toThrow('HTTP 500')
  })

  it('网络失败只报告，不重放修改请求', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetcher)
    await expect(api.archivedDelete(['test-session'])).rejects.toThrow('网络请求失败')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
