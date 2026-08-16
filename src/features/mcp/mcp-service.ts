/**
 * MCP feature (host): list every MCP server grouped by source scope, report
 * its masked config and live runtime status, and toggle a server on/off by
 * flipping the `disabled` flag in its source file (profile patches hot-reload;
 * preset compositions take effect for new sessions).
 */
import { readFile } from 'node:fs/promises'
import type { Context, BasicsLoader } from '../../context-types.ts'
import type { FeatureContext } from '../registry.ts'
import { BasicsError } from '../../wire.ts'
import { requireString, optionalString, requireBoolean } from '../../wire.ts'
import { atomicWrite, samePath } from '../../atomic.ts'
import { scanMcpSources, type McpRowFile, type McpSourceFile } from './composition-scan.ts'
import { setRowDisabled, setRowConfig, type RowConfigPatch } from './yaml-edit.ts'
import { MASK, maskArgs, maskValues, maskUrl } from './secret-mask.ts'

/** One masked server view shipped to the client. */
export interface McpServerRow {
  rowId: string | null
  serverName: string
  transport: 'stdio' | 'streamable-http' | 'unknown'
  disabled: boolean
  editable: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number
  runtime: { mounted: boolean; toolCount: number }
}

/** One scope group in the list. */
export interface McpGroup {
  scope: 'profile' | 'preset'
  scopeLabel: string
  path: string
  readOnly: boolean
  servers: McpServerRow[]
}

function maskedView(row: McpRowFile, editable: boolean, mounted: boolean, toolCount: number): McpServerRow {
  const c = row.config
  const transport = c.transport === 'streamable-http' ? 'streamable-http' : c.transport === 'stdio' ? 'stdio' : 'unknown'
  return {
    rowId: row.rowId,
    serverName: row.serverName,
    transport,
    disabled: row.disabled,
    editable,
    ...(typeof c.command === 'string' ? { command: c.command } : {}),
    ...(Array.isArray(c.args) ? { args: maskArgs(c.args as string[]) } : {}),
    ...(typeof c.env === 'object' && c.env !== null ? { env: maskValues(c.env as Record<string, string>) } : {}),
    ...(typeof c.cwd === 'string' && c.cwd !== '' ? { cwd: c.cwd } : {}),
    ...(typeof c.url === 'string' ? { url: maskUrl(c.url) } : {}),
    ...(typeof c.headers === 'object' && c.headers !== null ? { headers: maskValues(c.headers as Record<string, string>) } : {}),
    ...(typeof c.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: c.toolCallTimeoutMs } : {}),
    runtime: { mounted, toolCount },
  }
}

/** Restore masked placeholders against the raw config so unchanged secrets survive a save. */
function resolveMaskedPatch(patch: RowConfigPatch, raw: Record<string, unknown>): RowConfigPatch {
  const out = { ...patch }
  const rawArgs = Array.isArray(raw.args) ? raw.args as string[] : undefined
  if (Array.isArray(out.args) && rawArgs !== undefined) {
    out.args = out.args.map((value, index) => (value === MASK && rawArgs[index] !== undefined ? rawArgs[index] : value))
  }
  const rawEnv = typeof raw.env === 'object' && raw.env !== null ? raw.env as Record<string, string> : undefined
  if (out.env !== null && out.env !== undefined && rawEnv !== undefined) {
    const env = { ...out.env }
    for (const key of Object.keys(env)) {
      if (env[key] === MASK && rawEnv[key] !== undefined) env[key] = rawEnv[key]
    }
    out.env = env
  }
  if (typeof out.url === 'string' && out.url.includes(MASK) && typeof raw.url === 'string') {
    out.url = raw.url
  }
  return out
}

/** Cross-reference the loader tree and tool registry for live status. */
function runtimeFacts(ctx: Context): { mountedByServer: Map<string, boolean>; toolNames: string[] } {
  const mountedByServer = new Map<string, boolean>()
  try {
    const loader = ctx.get('loader') as BasicsLoader | undefined
    if (loader !== undefined && typeof loader.entries === 'function') {
      for (const entry of loader.entries()) {
        const name = entry.options?.name ?? ''
        if (!/mcp-client/.test(name)) continue
        const cfg = entry.options?.config
        const serverName = cfg !== undefined && typeof cfg.serverName === 'string' ? cfg.serverName : ''
        if (serverName !== '') mountedByServer.set(serverName, !entry.disabled)
      }
    }
  } catch {
    // loader unreadable → status degrades to "unknown" (mounted=false)
  }
  let toolNames: string[] = []
  try {
    toolNames = ctx.tools.schemas().map(schema => schema.name)
  } catch {
    toolNames = []
  }
  return { mountedByServer, toolNames }
}

function toolCountFor(serverName: string, toolNames: string[]): number {
  const prefix = `mcp__${serverName}__`
  let count = 0
  for (const name of toolNames) if (name.startsWith(prefix)) count += 1
  return count
}

/** Build the MCP feature API. */
export function registerMcp(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
  const { ctx, resolved } = fc

  const list = async (): Promise<{ groups: McpGroup[] }> => {
    const sources = await scanMcpSources(ctx, resolved)
    const { mountedByServer, toolNames } = runtimeFacts(ctx)
    const groups: McpGroup[] = sources.map((source: McpSourceFile) => ({
      scope: source.scope,
      scopeLabel: source.scopeLabel,
      path: source.path,
      readOnly: source.readOnly,
      servers: source.rows.map(row => {
        const editable = !resolved.readOnly && !source.readOnly
        const mounted = mountedByServer.get(row.serverName) ?? false
        return maskedView(row, editable, mounted, toolCountFor(row.serverName, toolNames))
      }),
    }))
    return { groups }
  }

  const setEnabled = async (payload: unknown): Promise<{ ok: true; disabled: boolean; takesEffect: 'live' | 'new-session' }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const path = requireString(payload, 'path')
    const serverName = requireString(payload, 'serverName')
    const rowId = optionalString(payload, 'rowId') ?? null
    const enabled = requireBoolean(payload, 'enabled')

    const sources = await scanMcpSources(ctx, resolved)
    const source = sources.find(s => samePath(s.path, path) && !s.readOnly)
    if (source === undefined) {
      throw new BasicsError('forbidden', '该文件不在可编辑范围内', 403)
    }
    const row = source.rows.find(r => r.serverName === serverName || (rowId !== null && r.rowId === rowId))
    if (row === undefined) {
      throw new BasicsError('not-found', `未找到 MCP 服务器 "${serverName}"`, 404)
    }

    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const result = setRowDisabled(text, { rowId, serverName }, !enabled)
    if (!result.ok) {
      throw new BasicsError('mcp-error', `配置中未找到服务器 "${serverName}" 对应的行`, 400)
    }
    try {
      await atomicWrite(path, result.text)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    return {
      ok: true,
      disabled: !enabled,
      takesEffect: source.scope === 'preset' ? 'new-session' : 'live',
    }
  }

  const save = async (payload: unknown): Promise<{ ok: true }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const path = requireString(payload, 'path')
    const serverName = requireString(payload, 'serverName')
    const rowId = optionalString(payload, 'rowId') ?? null
    const record = payload as Record<string, unknown> | null
    const patch = (record?.patch ?? {}) as RowConfigPatch

    const sources = await scanMcpSources(ctx, resolved)
    const source = sources.find(s => samePath(s.path, path) && !s.readOnly)
    if (source === undefined) {
      throw new BasicsError('forbidden', '该文件不在可编辑范围内', 403)
    }
    const row = source.rows.find(r => r.serverName === serverName || (rowId !== null && r.rowId === rowId))
    if (row === undefined) {
      throw new BasicsError('not-found', `未找到 MCP 服务器 "${serverName}"`, 404)
    }

    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const result = setRowConfig(text, { rowId, serverName }, resolveMaskedPatch(patch, row.config))
    if (!result.ok) {
      throw new BasicsError('mcp-error', `配置中未找到服务器 "${serverName}" 对应的行`, 400)
    }
    try {
      await atomicWrite(path, result.text)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    return { ok: true }
  }

  return {
    'mcp.list': list,
    'mcp.setEnabled': setEnabled,
    'mcp.save': save,
  }
}
