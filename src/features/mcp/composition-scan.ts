/**
 * Composition scanning: locate every file that may declare MCP servers and
 * extract the `mcp-client` rows it holds. Sources are (a) the profile patch
 * layers (home-level and per-profile), (b) agent-preset compositions (through
 * the roster when present, else a user-root directory scan), and (c) any
 * deployment-declared extra files. Shipped (system) presets are read-only.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDocument } from 'yaml'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { Context, BasicsAgentPresets } from '../../context-types.ts'
import type { ResolvedBasicsConfig } from '../../config.ts'

/** One `mcp-client` row found in a file (raw config stays host-side). */
export interface McpRowFile {
  rowId: string | null
  serverName: string
  disabled: boolean
  config: Record<string, unknown>
}

/** One composition file and its MCP rows. */
export interface McpSourceFile {
  scope: 'profile' | 'preset'
  scopeLabel: string
  path: string
  readOnly: boolean
  rows: McpRowFile[]
}

/** Whether a plugin module specifier names the MCP client bridge. */
export function isMcpClientName(name: unknown): boolean {
  return typeof name === 'string' && /mcp-client/.test(name)
}

/**
 * Extract every `mcp-client` row from a composition document (top-level YAML
 * array). Handles both preset rows (`{id, name, config}`) and patch entries
 * (`{insert: [{id, name, config}, ...]}`).
 */
export function collectMcpRows(text: string): McpRowFile[] {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return []
  const rows: McpRowFile[] = []

  const consider = (obj: Record<string, unknown>): void => {
    if (!isMcpClientName(obj.name)) return
    const config = (obj.config ?? {}) as Record<string, unknown>
    const serverName = typeof config.serverName === 'string' ? config.serverName : ''
    const rowId = typeof obj.id === 'string' ? obj.id : null
    rows.push({
      rowId,
      serverName,
      disabled: obj.disabled === true,
      config,
    })
  }

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node !== null && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      if (Array.isArray(obj.insert)) {
        for (const item of obj.insert) {
          if (item !== null && typeof item === 'object') consider(item as Record<string, unknown>)
        }
      }
      consider(obj)
    }
  }

  walk(doc.toJS())
  return rows
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

async function rowsOf(path: string): Promise<McpRowFile[]> {
  try {
    return collectMcpRows(await readFile(path, 'utf8'))
  } catch {
    return []
  }
}

interface PresetRef {
  id: string
  path: string
  trust: string
}

/** Resolve the agent-preset roster: the service when mounted, else the user root scan. */
async function listPresets(ctx: Context): Promise<PresetRef[]> {
  const agentPresets = ctx.get('agentPresets') as BasicsAgentPresets | undefined
  if (agentPresets !== undefined) {
    try {
      const rows = await agentPresets.list()
      return rows.map(row => ({ id: row.id, path: row.path, trust: row.trust }))
    } catch {
      // fall through to the directory scan
    }
  }
  const root = join(resolveDshHome(), '.agent-presets')
  const ids = await listDirs(root)
  return ids.map(id => ({ id, path: join(root, id, 'agent.cordis.yml'), trust: 'user' }))
}

/** Discover every composition source and its MCP rows. */
export async function scanMcpSources(ctx: Context, resolved: ResolvedBasicsConfig): Promise<McpSourceFile[]> {
  const home = resolveDshHome()
  const sources: McpSourceFile[] = []

  const homePatch = join(home, 'cordis.patch.yml')
  if (await isFile(homePatch)) {
    sources.push({ scope: 'profile', scopeLabel: 'home', path: homePatch, readOnly: false, rows: await rowsOf(homePatch) })
  }

  for (const profileName of await listDirs(join(home, 'profiles'))) {
    const path = join(home, 'profiles', profileName, 'cordis.patch.yml')
    if (await isFile(path)) {
      sources.push({ scope: 'profile', scopeLabel: profileName, path, readOnly: false, rows: await rowsOf(path) })
    }
  }

  for (const preset of await listPresets(ctx)) {
    sources.push({ scope: 'preset', scopeLabel: preset.id, path: preset.path, readOnly: preset.trust === 'system', rows: await rowsOf(preset.path) })
  }

  for (const extra of resolved.extraMcpFiles) {
    if (await isFile(extra)) {
      sources.push({ scope: 'profile', scopeLabel: 'extra', path: extra, readOnly: false, rows: await rowsOf(extra) })
    }
  }

  return sources
}
