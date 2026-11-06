/**
 * MCP 配置展示脱敏：环境变量、请求头、常见敏感参数及 URL 凭据替换为占位符。
 * 任意位置参数或嵌套 shell 文本无法可靠识别，不能将其作为秘密存储方式。
 */

/** The display marker for a masked secret. */
export const MASK = '••••'

/** Command-line flags whose following argument is a secret. */
const SENSITIVE_KEY = /^(password|passwd|pass|token|secret|api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|client[-_]?secret|key)$/i
const SENSITIVE_FLAG = /^--?(.+)$/

/** 展示占位符也可能被 URL 序列化为百分号编码。 */
export function containsMask(value: string): boolean {
  return value.includes(MASK) || value.includes(encodeURIComponent(MASK))
}

/** Mask every value in an env/header-style map, keeping the keys. */
export function maskValues(map: Record<string, string> | undefined): Record<string, string> | undefined {
  if (map === undefined) return undefined
  const out: Record<string, string> = {}
  for (const key of Object.keys(map)) out[key] = MASK
  return out
}

/** Mask the argument that follows a sensitive flag; everything else verbatim. */
export function maskArgs(args: string[] | undefined): string[] | undefined {
  if (args === undefined) return undefined
  const out = [...args]
  for (let i = 0; i < out.length; i += 1) {
    const token = out[i]!
    const equals = token.indexOf('=')
    const flag = equals < 0 ? token : token.slice(0, equals)
    const key = SENSITIVE_FLAG.exec(flag)?.[1]
    if (key !== undefined && SENSITIVE_KEY.test(key)) {
      if (equals >= 0) out[i] = `${flag}=${MASK}`
      else if (i + 1 < out.length) { out[i + 1] = MASK; i += 1 }
    } else if (equals >= 0 && key !== undefined) {
      out[i] = `${flag}=${maskUrl(token.slice(equals + 1))}`
    } else {
      out[i] = maskUrl(token)!
    }
  }
  return out
}

/** Mask the password in a URL's userinfo (e.g. http://user:pass@host). */
export function maskUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    const parsed = new URL(url)
    let changed = false
    if (parsed.password !== '') {
      parsed.password = MASK
      changed = true
    }
    for (const key of new Set(parsed.searchParams.keys())) {
      if (!SENSITIVE_KEY.test(key)) continue
      parsed.searchParams.set(key, MASK)
      changed = true
    }
    return changed ? parsed.toString() : url
  } catch {
    return url
  }
}
