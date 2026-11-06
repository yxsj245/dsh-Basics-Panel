/**
 * Session-artifact lookup and deletion (host, filesystem level).
 *
 * DSH's persistence seam has no delete operation, so the archived-sessions
 * feature removes a session's durable artifacts itself: the per-session
 * directory the JSONL backend owns (`<root>/<project-dir>/<session-id>/`,
 * holding one generation log `session[.vN].jsonl[.zstd]` plus any
 * session-local auxiliary files).
 *
 * Two rules keep this safe:
 * - the directory is FOUND by scanning the configured root for a direct child
 *   named exactly like the session id, never re-derived from a cwd (the
 *   project-directory encoding is the backend's private business) and never
 *   taken from the client;
 * - a directory is only removed after it proved to be that session's artifact
 *   (expected basename, inside the root, holds a generation log), so a miss or
 *   a shape change refuses instead of guessing.
 */
import { lstat, readdir, realpath, rm, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

/**
 * Canonical generation log names: `session.jsonl`, `session.jsonl.zstd`,
 * `session.v3.jsonl`, … Version zero keeps the suffix-only name, so `.v0` and
 * leading-zero versions are deliberately not canonical (mirrors the backend's
 * own filename parser).
 */
const SESSION_LOG_NAME = /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/

/** The id must be one plain path segment (DSH session ids are `[session-]<uuid>`). */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/

/** One located session artifact directory. */
export interface SessionArtifact {
  /** Absolute session directory. */
  readonly directory: string
  /** Absolute generation-log paths inside the directory. */
  readonly logs: string[]
  /** Total size of the directory's files (bytes). */
  readonly bytes: number
}

/**
 * Whether a raw session id may be used as one path segment (no separators, no
 * traversal, no NUL). Mirrors the backend's "encode before use" intent: an id
 * that needs escaping is refused rather than re-encoded here.
 * @param id - candidate session id.
 * @returns true when the id is a safe single path segment.
 */
export function isSafeSessionId(id: string): boolean {
  return SAFE_SEGMENT.test(id) && id !== '.' && id !== '..'
}

/** Whether a file name is a canonical session generation log. */
export function isSessionLogName(name: string): boolean {
  return SESSION_LOG_NAME.test(name)
}

/**
 * Whether `target` is strictly inside `root` (no traversal escape).
 * @param root - container directory.
 * @param target - candidate path.
 * @returns true when the resolved target lives under the resolved root.
 */
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Describe one candidate session directory, refusing anything that is not the
 * named session's artifact (wrong basename, outside the root, no generation log).
 * @param root - the configured sessions root.
 * @param sessionId - the session the directory must belong to.
 * @param directory - candidate directory (absolute).
 * @returns the artifact facts, or undefined when the candidate is refused.
 */
export async function describeSessionArtifact(
  root: string,
  sessionId: string,
  directory: string,
): Promise<SessionArtifact | undefined> {
  if (!isSafeSessionId(sessionId)) return undefined
  if (basename(resolve(directory)) !== sessionId) return undefined
  if (!isInside(root, directory)) return undefined
  // 只接受根目录下两级的真实目录；拒绝通过 junction/符号链接指向别处。
  const parent = dirname(resolve(directory))
  if (dirname(parent) !== resolve(root)) return undefined
  let info
  try {
    info = await lstat(directory)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined
    throw new Error('无法读取会话目录，已保留会话及归档记录', { cause: error })
  }
  if (!info.isDirectory() || info.isSymbolicLink() || (await lstat(parent)).isSymbolicLink()) {
    throw new Error('会话产物不是受支持的真实目录，已拒绝删除')
  }
  if (!isInside(await realpath(root), await realpath(directory))) {
    throw new Error('会话目录的实际位置不在配置根内，已拒绝删除')
  }
  const entries = await readdir(resolve(directory), { withFileTypes: true })
  const logs: string[] = []
  let bytes = 0
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = join(resolve(directory), entry.name)
    bytes += (await stat(path)).size
    if (isSessionLogName(entry.name)) logs.push(path)
  }
  if (logs.length === 0) return undefined
  return { directory: resolve(directory), logs, bytes }
}

/**
 * Locate one session's artifact directory under the configured sessions root.
 * The scan mirrors the backend's own session-directory lookup: one level of
 * project directories, then a child named exactly like the session id.
 * @param root - the JSONL backend's sessions root (`$DSH_HOME/sessions` by default).
 * @param sessionId - the stored session id.
 * @returns the located artifact, or undefined when no project directory owns it.
 */
export async function findSessionArtifact(root: string, sessionId: string): Promise<SessionArtifact | undefined> {
  if (!isSafeSessionId(sessionId)) return undefined
  const rootResolved = resolve(root)
  // 根不可访问（包括不存在）无法证明会话不存在，错误必须向上传递。
  const entries = await readdir(rootResolved, { withFileTypes: true })
  let found: SessionArtifact | undefined
  for (const project of entries) {
    if (project.isSymbolicLink()) throw new Error('会话根内包含链接目录，无法完整核实产物，已拒绝删除')
    if (!project.isDirectory()) continue
    const directory = join(rootResolved, project.name, sessionId)
    let candidate
    try {
      candidate = await lstat(directory)
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') continue
      throw new Error('无法核实会话产物，已保留归档记录', { cause: error })
    }
    if (!candidate.isDirectory() || candidate.isSymbolicLink()) {
      throw new Error('会话路径不是受支持的真实目录，已拒绝删除')
    }
    const artifact = await describeSessionArtifact(rootResolved, sessionId, directory)
    if (artifact === undefined) throw new Error('会话目录布局无法验证，已保留产物及归档记录')
    if (found !== undefined) throw new Error('发现多个同名会话目录，无法唯一定位，已拒绝删除')
    found = artifact
  }
  return found
}

/**
 * Delete one located session-artifact directory recursively.
 * @param root - the sessions root the artifact was found under.
 * @param sessionId - the session the directory must belong to.
 * @param directory - the located session directory.
 * @returns the number of bytes removed.
 * @throws when the directory no longer passes the shape checks (never deletes blind).
 */
export async function removeSessionArtifact(root: string, sessionId: string, directory: string): Promise<number> {
  const fresh = await findSessionArtifact(root, sessionId)
  if (fresh === undefined || resolve(fresh.directory) !== resolve(directory)) {
    throw new Error('会话目录已失效或不是有效的会话产物，已跳过删除')
  }
  await rm(fresh.directory, { recursive: true, force: true })
  return fresh.bytes
}
