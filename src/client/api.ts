/**
 * Typed fetch wrapper over the /basics JSON API. Every call posts to
 * `/basics/api/<method>`. Skill methods carry the current session id and cwd
 * (the host prefers its attached session header and uses the summary cwd only
 * while the session is still hydrating). Failures surface as
 * {@link BasicsApiError} with the wire code.
 */
import type { Context } from '../context-types.ts'

export class BasicsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** The current session id and cwd read from the client sessions feed. */
export interface SessionRef {
  sessionId: string
  cwd?: string
}

/** Read the current session ref for skill scoping. */
export function currentSession(ctx: Context): SessionRef {
  const snap = ctx.sessions.list.getSnapshot()
  const sessionId = snap.current ?? ''
  const cwd = sessionId !== '' ? snap.byId[sessionId]?.cwd : undefined
  return { sessionId, cwd }
}

interface WireEnvelope<T> {
  ok?: boolean
  value?: T
  error?: { code?: string; message?: string }
}

async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/basics/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new BasicsApiError('internal', `网络请求失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  let body: WireEnvelope<T> | undefined
  try {
    body = (await response.json()) as WireEnvelope<T>
  } catch {
    body = undefined
  }
  if (body === undefined || body.ok !== true || body.error !== undefined) {
    throw new BasicsApiError(
      body?.error?.code ?? 'internal',
      body?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return body.value as T
}

// ── Wire shapes (mirror of the host feature types) ────────────────────────

export interface SkillRow {
  name: string
  description: string
  whenToUse?: string
  modelInvocable: boolean
  userInvocable: boolean
  source: string
  provider: string
  location?: string
  editable: boolean
}

export interface SkillGroup {
  scope: 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'other'
  skills: SkillRow[]
}

export interface SkillsList {
  groups: SkillGroup[]
  complete: boolean
}

export interface SkillDetail {
  name: string
  description: string
  whenToUse?: string
  metadata?: Record<string, unknown>
  modelInvocable: boolean
  userInvocable: boolean
  body: string
  path?: string
  source: string
  provider: string
  editable: boolean
  mtime?: number
}

export interface SkillEdit {
  description: string
  whenToUse?: string | null
  metadata?: Record<string, unknown> | null
  modelInvocable: boolean
  userInvocable: boolean
  body: string
}

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

export interface McpGroup {
  scope: 'profile' | 'preset'
  scopeLabel: string
  path: string
  readOnly: boolean
  servers: McpServerRow[]
}

export interface McpConfigPatch {
  serverName?: string
  transport?: string
  command?: string | null
  args?: string[] | null
  env?: Record<string, string> | null
  url?: string | null
  headers?: Record<string, string> | null
  cwd?: string | null
  toolCallTimeoutMs?: number | null
}

export interface McpList {
  groups: McpGroup[]
}

export interface RuleRow {
  key: string
  scope: 'global' | 'project'
  fileName: string
  displayPath: string
  directory: string
  size?: number
  mtime?: number
  editable: boolean
}

export interface RuleGroup {
  scope: 'global' | 'project'
  rules: RuleRow[]
}

export interface RulesList {
  groups: RuleGroup[]
  cwd: string
  projectRoot: string
}

export interface RuleDetail {
  key: string
  scope: 'global' | 'project'
  fileName: string
  displayPath: string
  content: string
  mtime?: number
  editable: boolean
}

export type RuleCreateScope = 'global' | 'project' | 'cwd'

/** One archived-session row. */
export interface ArchivedRow {
  id: string
  cwd?: string
  createdAt?: number
  sizeBytes?: number
  eventCount?: number
  /** The session is attached to an Agent in this process. */
  live: boolean
  /** A durable artifact exists for the id. */
  stored: boolean
  restorable: boolean
  deletable: boolean
}

/** The archived-sessions list payload. */
export interface ArchivedList {
  rows: ArchivedRow[]
  archivedIds: string[]
  totalBytes: number
  writable: boolean
  mounted: boolean
  readOnly: boolean
  deleteEnabled: boolean
  maxBatchIds: number
  listingFailed: boolean
  sessionsRoot: string
}

/** One skipped id with its reason. */
export interface ArchivedSkip {
  id: string
  reason: string
}

/** The restore/delete result. */
export interface ArchivedMutation {
  ok: true
  changed: string[]
  skipped: ArchivedSkip[]
  archivedIds: string[]
  freedBytes: number
  staleSnapshot: boolean
  warning?: string
}

// ── Typed methods ──────────────────────────────────────────────────────────

function skillPayload(ref: SessionRef, extra: Record<string, unknown>): Record<string, unknown> {
  return { sessionId: ref.sessionId, ...(ref.cwd !== undefined ? { cwd: ref.cwd } : {}), ...extra }
}

export const api = {
  skillsList(ref: SessionRef): Promise<SkillsList> {
    return call('skills.list', { sessionId: ref.sessionId, ...(ref.cwd !== undefined ? { cwd: ref.cwd } : {}) })
  },
  skillsGet(ref: SessionRef, name: string): Promise<SkillDetail> {
    return call('skills.get', skillPayload(ref, { name }))
  },
  skillsSave(ref: SessionRef, name: string, expectedMtime: number | undefined, edit: SkillEdit): Promise<{ ok: true; mtime?: number }> {
    return call('skills.save', skillPayload(ref, { name, ...(expectedMtime !== undefined ? { expectedMtime } : {}), edit }))
  },
  mcpList(): Promise<McpList> {
    return call('mcp.list', {})
  },
  mcpSetEnabled(path: string, rowId: string | null, serverName: string, enabled: boolean): Promise<{ ok: true; disabled: boolean; takesEffect: 'live' | 'new-session' }> {
    return call('mcp.setEnabled', { path, ...(rowId !== null ? { rowId } : {}), serverName, enabled })
  },
  mcpSave(path: string, rowId: string | null, serverName: string, patch: McpConfigPatch): Promise<{ ok: true }> {
    return call('mcp.save', { path, ...(rowId !== null ? { rowId } : {}), serverName, patch })
  },
  rulesList(ref: SessionRef): Promise<RulesList> {
    return call('rules.list', { sessionId: ref.sessionId, ...(ref.cwd !== undefined ? { cwd: ref.cwd } : {}) })
  },
  rulesGet(ref: SessionRef, key: string): Promise<RuleDetail> {
    return call('rules.get', skillPayload(ref, { key }))
  },
  rulesSave(ref: SessionRef, key: string, expectedMtime: number | undefined, content: string): Promise<{ ok: true; mtime?: number }> {
    return call('rules.save', skillPayload(ref, { key, ...(expectedMtime !== undefined ? { expectedMtime } : {}), content }))
  },
  rulesCreate(ref: SessionRef, scope: RuleCreateScope, fileName: string): Promise<{ ok: true; key: string; scope: 'global' | 'project'; fileName: string; displayPath: string; mtime?: number }> {
    return call('rules.create', skillPayload(ref, { scope, fileName }))
  },
  archivedList(): Promise<ArchivedList> {
    return call('archived.list', {})
  },
  archivedRestore(ids: string[]): Promise<ArchivedMutation> {
    return call('archived.restore', { ids })
  },
  archivedDelete(ids: string[]): Promise<ArchivedMutation> {
    return call('archived.delete', { ids })
  },
}
