/**
 * Plugin configuration: the deployment-facing limits and safety switches.
 * The Loader validates `Config` (standard-schema) and fills defaults; direct
 * callers (tests) get them from `resolveBasicsConfig`.
 */
import z from '@deepseek-ai/schemastery'

/** Default cap on one skill file read into the editor (bytes). */
export const DEFAULT_MAX_SKILL_BYTES = 512 * 1024
/** Default cap on one JSON request body (bytes). */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

/** The public config schema. */
export const Config = z.object({
  /** Upper bound on a single skill file the editor may load (bytes). */
  maxSkillBytes: z.number().min(1).default(DEFAULT_MAX_SKILL_BYTES),
  /** Upper bound on a single JSON request body (bytes). */
  maxBodyBytes: z.number().min(1).default(DEFAULT_MAX_BODY_BYTES),
  /** Additional absolute composition-file paths the panel may edit (deployment-managed). */
  extraMcpFiles: z.array(z.string()).default([]),
  /** Force the whole panel read-only (no MCP toggle, no skill save). */
  readOnly: z.boolean().default(false),
})

/** The resolved config handed to `apply`. */
export interface ResolvedBasicsConfig {
  maxSkillBytes: number
  maxBodyBytes: number
  extraMcpFiles: string[]
  readOnly: boolean
}

/** Normalize raw config (for direct callers that bypass the Loader schema). */
export function resolveBasicsConfig(config?: Partial<ResolvedBasicsConfig>): ResolvedBasicsConfig {
  return {
    maxSkillBytes: config?.maxSkillBytes ?? DEFAULT_MAX_SKILL_BYTES,
    maxBodyBytes: config?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    extraMcpFiles: config?.extraMcpFiles ?? [],
    readOnly: config?.readOnly ?? false,
  }
}
