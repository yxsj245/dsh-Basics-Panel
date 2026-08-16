/**
 * Round-trip editing of a composition document: flip one row's `disabled`
 * flag while preserving comments and every other key. Editing works on the
 * yaml Document node tree (never on the plain JS value) so the file text
 * other than the one flag is byte-stable.
 */
import { parseDocument, isMap, isSeq, isScalar, type YAMLMap } from 'yaml'

/** Read a scalar node as a string (empty for non-scalars). */
function scalarString(node: unknown): string {
  if (!isScalar(node)) return ''
  const value = node.value
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** Whether a plugin module specifier names the MCP client bridge. */
function isMcpClientName(name: string): boolean {
  return /mcp-client/.test(name)
}

/**
 * Locate the YAML mapping of the row matching `target` (by serverName, then
 * by rowId), walking insert lists and direct rows alike.
 */
function findRowNode(node: unknown, target: { rowId?: string | null; serverName: string }): YAMLMap | undefined {
  if (isSeq(node)) {
    for (const item of node.items) {
      const found = findRowNode(item, target)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (isMap(node)) {
    const insert = node.get('insert', true)
    if (isSeq(insert)) {
      for (const item of insert.items) {
        if (!isMap(item)) continue
        const found = considerRow(item, target)
        if (found !== undefined) return found
      }
    }
    return considerRow(node, target)
  }
  return undefined
}

function considerRow(map: YAMLMap, target: { rowId?: string | null; serverName: string }): YAMLMap | undefined {
  if (!isMcpClientName(scalarString(map.get('name', true)))) return undefined
  const config = map.get('config', true)
  const serverName = isMap(config) ? scalarString(config.get('serverName', true)) : ''
  if (serverName !== '' && serverName === target.serverName) return map
  if (target.rowId != null && scalarString(map.get('id', true)) === target.rowId) return map
  return undefined
}

/**
 * Flip one row's `disabled` flag in a composition document. `disabled === true`
 * adds the flag; `false` removes it (the Loader default). Returns the edited
 * text, or the original text with `ok: false` when the row or document is
 * unparsable/unfound.
 */
export function setRowDisabled(
  text: string,
  target: { rowId?: string | null; serverName: string },
  disabled: boolean,
): { ok: boolean; text: string } {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return { ok: false, text }
  const row = findRowNode(doc.contents, target)
  if (row === undefined) return { ok: false, text }
  if (disabled) row.set('disabled', true)
  else row.delete('disabled')
  return { ok: true, text: doc.toString() }
}

/** Editable fields on one MCP row's `config` mapping (null deletes the field). */
export interface RowConfigPatch {
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

/**
 * Update one row's `config` mapping in place. A null/absent patch value is
 * skipped; an explicit null deletes the key. Values are converted through the
 * document's node factory so nested objects/arrays serialize correctly.
 */
export function setRowConfig(
  text: string,
  target: { rowId?: string | null; serverName: string },
  patch: RowConfigPatch,
): { ok: boolean; text: string } {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return { ok: false, text }
  const row = findRowNode(doc.contents, target)
  if (row === undefined) return { ok: false, text }
  const rawConfig: unknown = row.get('config', true)
  const config: YAMLMap = isMap(rawConfig) ? rawConfig : (doc.createNode({}) as YAMLMap)
  if (!isMap(rawConfig)) {
    row.set('config', config)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) config.delete(key)
    else config.set(key, doc.createNode(value))
  }
  return { ok: true, text: doc.toString() }
}
