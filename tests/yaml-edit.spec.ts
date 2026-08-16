import { describe, it, expect } from 'vitest'
import { setRowDisabled } from '../src/features/mcp/yaml-edit.ts'
import { collectMcpRows } from '../src/features/mcp/composition-scan.ts'

const PATCH = `# MCP 服务器
- insert:
    # 远程 SSH
    - id: mcp-ssh
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: ssh
        transport: stdio
        command: npx
`

const PRESET = `# 预设组合
- id: mcp-tavily
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: tavily
    transport: stdio
`

describe('setRowDisabled', () => {
  it('adds the disabled flag to a row inside an insert list and keeps comments', () => {
    const result = setRowDisabled(PATCH, { rowId: 'mcp-ssh', serverName: 'ssh' }, true)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('disabled: true')
    expect(result.text).toContain('# MCP 服务器')
    expect(result.text).toContain('# 远程 SSH')
  })

  it('removes the disabled flag when re-enabled', () => {
    const once = setRowDisabled(PATCH, { serverName: 'ssh' }, true)
    const twice = setRowDisabled(once.text, { serverName: 'ssh' }, false)
    expect(twice.ok).toBe(true)
    expect(twice.text).not.toContain('disabled: true')
  })

  it('matches a direct preset row', () => {
    const result = setRowDisabled(PRESET, { serverName: 'tavily' }, true)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('disabled: true')
  })

  it('returns ok=false for an unknown server', () => {
    const result = setRowDisabled(PATCH, { serverName: 'missing' }, true)
    expect(result.ok).toBe(false)
  })
})

describe('collectMcpRows', () => {
  it('extracts rows from a patch file', () => {
    const rows = collectMcpRows(PATCH)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.serverName).toBe('ssh')
    expect(rows[0]?.rowId).toBe('mcp-ssh')
    expect(rows[0]?.disabled).toBe(false)
  })

  it('extracts rows from a preset file', () => {
    const rows = collectMcpRows(PRESET)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.serverName).toBe('tavily')
  })

  it('ignores non-mcp rows', () => {
    const rows = collectMcpRows('- id: other\n  name: \'@deepseek-ai/dsh-tool-web\'\n')
    expect(rows).toHaveLength(0)
  })
})
