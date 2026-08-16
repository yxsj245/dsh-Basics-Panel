/**
 * zh/en copy for the panel. The copy follows the DSH i18n system: the client
 * apply attaches the locale service (`ctx.locale`) through {@link attachLocale},
 * and `t()` resolves the active locale from it (Host-backed preference wins,
 * switching live). Without an attached service the browser language is used.
 */

export const zh = {
  nav: '基础能力',
  intro: '可视化并管理 DSH 的 MCP 服务器与技能',
  tabMcp: 'MCP 服务器',
  tabSkills: '技能',
  refresh: '刷新',
  loading: '加载中…',
  error: '加载失败',
  retry: '重试',
  empty: '暂无数据',
  // MCP
  mcpIntro: 'DSH 的 MCP 服务器来自配置组合：用户级（profile）与预设级（preset）。切换开关会写入对应配置文件并热重载。',
  mcpNoProject: 'DSH 暂无项目级 MCP 组合文件，项目级配置请关注后续版本。',
  mcpScopeProfile: '用户配置',
  mcpScopePreset: '预设',
  mcpReadOnly: '只读',
  mcpConnected: '已连接',
  mcpEnabled: '已启用',
  mcpDisabled: '已禁用',
  mcpNotMounted: '未生效',
  mcpTools: '{count} 个工具',
  mcpToggle: '启用该 MCP 服务器',
  mcpTakesEffectNewSession: '已保存，将在新会话中生效',
  mcpTakesEffectLive: '已保存，热重载生效',
  mcpFieldCommand: '命令',
  mcpFieldArgs: '参数',
  mcpFieldEnv: '环境变量',
  mcpFieldUrl: '地址',
  mcpFieldHeaders: '请求头',
  mcpFieldCwd: '工作目录',
  mcpFieldTransport: '传输',
  mcpFieldTimeout: '调用超时',
  mcpSeconds: '{count} 秒',
  mcpMasked: '已脱敏',
  mcpLoadFailed: 'MCP 列表加载失败',
  mcpToggleFailed: '切换失败',
  // Skills
  skillsIntro: '按作用域展示全部技能。项目级技能（项目 .dsh/skills）优先级高于用户级，同名技能显示生效版本。',
  skillsSearch: '搜索技能…',
  skillsFilterAll: '全部',
  skillsScopeProject: '项目级',
  skillsScopeCustom: '自定义',
  skillsScopeUser: '用户级',
  skillsScopeBundled: '内置',
  skillsScopeRuntime: '运行时',
  skillsScopeOther: '其他',
  skillsEditable: '可编辑',
  skillsReadonly: '只读',
  skillsModelInvocable: '模型可调用',
  skillsUserInvocable: '用户可调用',
  skillsDisableModel: '禁用模型调用',
  skillsNoSkills: '没有找到技能',
  skillsIncomplete: '部分技能未能完整读取',
  skillsBack: '返回列表',
  skillsName: '名称',
  skillsDescription: '描述',
  skillsWhenToUse: '使用时机',
  skillsMetadata: '元数据 (JSON)',
  skillsBody: '正文',
  skillsSave: '保存',
  skillsCancel: '取消',
  skillsSaved: '已保存，热刷新已生效',
  skillsSaveFailed: '保存失败',
  skillsConflict: '文件已被修改，请刷新后重试',
  skillsLocation: '位置',
  skillsOpen: '编辑',
  close: '关闭',
}

export const en: Record<keyof typeof zh, string> = {
  nav: 'Basics Panel',
  intro: 'Visualize and manage MCP servers and skills',
  tabMcp: 'MCP servers',
  tabSkills: 'Skills',
  refresh: 'Refresh',
  loading: 'Loading…',
  error: 'Failed to load',
  retry: 'Retry',
  empty: 'Nothing here yet',
  mcpIntro: 'DSH MCP servers come from the composition: user (profile) and preset scopes. Toggling writes the config file and hot-reloads it.',
  mcpNoProject: 'DSH has no project-level MCP composition file yet; project-level config is planned.',
  mcpScopeProfile: 'User config',
  mcpScopePreset: 'Preset',
  mcpReadOnly: 'Read-only',
  mcpConnected: 'Connected',
  mcpEnabled: 'Enabled',
  mcpDisabled: 'Disabled',
  mcpNotMounted: 'Not active',
  mcpTools: '{count} tools',
  mcpToggle: 'Enable this MCP server',
  mcpTakesEffectNewSession: 'Saved — takes effect for new sessions',
  mcpTakesEffectLive: 'Saved — hot-reloaded',
  mcpFieldCommand: 'Command',
  mcpFieldArgs: 'Args',
  mcpFieldEnv: 'Env',
  mcpFieldUrl: 'URL',
  mcpFieldHeaders: 'Headers',
  mcpFieldCwd: 'Working dir',
  mcpFieldTransport: 'Transport',
  mcpFieldTimeout: 'Call timeout',
  mcpSeconds: '{count}s',
  mcpMasked: 'masked',
  mcpLoadFailed: 'Failed to load MCP servers',
  mcpToggleFailed: 'Toggle failed',
  skillsIntro: 'All skills grouped by scope. Project skills outrank user skills; same-name skills show the effective version.',
  skillsSearch: 'Search skills…',
  skillsFilterAll: 'All',
  skillsScopeProject: 'Project',
  skillsScopeCustom: 'Custom',
  skillsScopeUser: 'User',
  skillsScopeBundled: 'Bundled',
  skillsScopeRuntime: 'Runtime',
  skillsScopeOther: 'Other',
  skillsEditable: 'Editable',
  skillsReadonly: 'Read-only',
  skillsModelInvocable: 'Model-invocable',
  skillsUserInvocable: 'User-invocable',
  skillsDisableModel: 'Disable model invocation',
  skillsNoSkills: 'No skills found',
  skillsIncomplete: 'Some skills could not be fully read',
  skillsBack: 'Back to list',
  skillsName: 'Name',
  skillsDescription: 'Description',
  skillsWhenToUse: 'When to use',
  skillsMetadata: 'Metadata (JSON)',
  skillsBody: 'Body',
  skillsSave: 'Save',
  skillsCancel: 'Cancel',
  skillsSaved: 'Saved — hot-reloaded',
  skillsSaveFailed: 'Save failed',
  skillsConflict: 'The file changed — refresh and retry',
  skillsLocation: 'Location',
  skillsOpen: 'Edit',
  close: 'Close',
}

/** The dictionary namespace this plugin owns in the DSH locale registry. */
export const LOCALE_NS = 'basicsPanel'

/** The DSH locale service attached by the client apply (absent → browser detection). */
let localeService: { getSnapshot(): { active: string } } | undefined

/** Attach (or detach, with undefined) the DSH locale service. */
export function attachLocale(service: { getSnapshot(): { active: string } } | undefined): void {
  localeService = service
}

/** The active locale id ('zh' | 'en'). */
function activeLocale(): string {
  return localeService?.getSnapshot().active
    ?? (typeof navigator !== 'undefined' ? navigator.language : '')
    ?? 'en'
}

export type CopyKey = keyof typeof zh

/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
export function t(key: CopyKey, params?: Record<string, string | number>): string {
  const dict = activeLocale().toLowerCase().startsWith('zh') ? zh : en
  let text: string = dict[key]
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
