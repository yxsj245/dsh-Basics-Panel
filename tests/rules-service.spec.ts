import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverRuleFiles } from '../src/features/rules/scan.ts'
import { registerRules } from '../src/features/rules/rules-service.ts'
import { resolveBasicsConfig } from '../src/config.ts'
import type { Context } from '../src/context-types.ts'

let root = ''
let home = ''
let agents = ''
let cwd = ''
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'basics-rules-'))
  home = join(root, 'home'); agents = join(root, 'shared'); cwd = join(root, 'project')
  for (const directory of [home, agents, cwd]) await mkdir(directory)
  vi.stubEnv('DSH_HOME', home)
  vi.stubEnv('DSH_AGENTS_HOME', agents)
})
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })

function api(readOnly = false) {
  return registerRules({ ctx: {} as Context, resolved: resolveBasicsConfig({ readOnly }), sessionCwdOf: () => cwd })
}

describe('规则兼容两个全局根', () => {
  it('按宿主顺序发现 DSH 和共享全局规则，随后列出项目规则', async () => {
    for (const directory of [home, agents, cwd]) await writeFile(join(directory, 'AGENTS.md'), '# rules')
    const files = await discoverRuleFiles({ cwd, dshHome: home, agentsHome: agents, displayHome: '$DSH_HOME', displayAgentsHome: '$DSH_AGENTS_HOME' })
    expect(files.map(file => file.absolutePath)).toEqual([join(home, 'AGENTS.md'), join(agents, 'AGENTS.md'), join(cwd, 'AGENTS.md')])
    expect(files[1]?.displayPath).toBe('$DSH_AGENTS_HOME/AGENTS.md')
  })

  it('两个全局根相同不会重复显示', async () => {
    await writeFile(join(home, 'AGENTS.md'), '# rules')
    const files = await discoverRuleFiles({ cwd, dshHome: home, agentsHome: home })
    expect(files).toHaveLength(1)
  })

  it('缺失共享根不自动创建也不影响列表', async () => {
    vi.stubEnv('DSH_AGENTS_HOME', join(root, 'missing'))
    await expect(api()['rules.list']!({})).resolves.toMatchObject({ groups: [] })
  })

  it('服务按环境覆盖后的共享根列出、读取、保存；不接受任意外部路径', async () => {
    const key = join(agents, 'AGENTS.md')
    await writeFile(key, '# before')
    const handlers = api()
    await expect(handlers['rules.list']!({})).resolves.toMatchObject({ groups: [{ scope: 'global', rules: [{ key, displayPath: '$DSH_AGENTS_HOME/AGENTS.md' }] }] })
    await expect(handlers['rules.get']!({ key })).resolves.toMatchObject({ content: '# before' })
    await handlers['rules.save']!({ key, content: '# after' })
    expect(await readFile(key, 'utf8')).toBe('# after')
    const outsider = join(root, 'AGENTS.md')
    await writeFile(outsider, '# outside')
    await expect(handlers['rules.get']!({ key: outsider })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('全局新建仍只指向 DSH 根，共享根编辑遵循只读开关', async () => {
    await api()['rules.create']!({ scope: 'global', fileName: 'AGENTS.md' })
    expect(await readFile(join(home, 'AGENTS.md'), 'utf8')).toContain('# AGENTS.md')
    const key = join(agents, 'AGENTS.md')
    await writeFile(key, '# shared')
    await expect(api(true)['rules.save']!({ key, content: '# forbidden' })).rejects.toMatchObject({ code: 'read-only' })
    expect(await readFile(key, 'utf8')).toBe('# shared')
  })
})
