import { describe, it, expect } from 'vitest'
import { maskArgs, maskValues, maskUrl, MASK } from '../src/features/mcp/secret-mask.ts'

describe('maskArgs', () => {
  it('masks the value after a sensitive flag', () => {
    const out = maskArgs(['cmd', '/c', 'npx', '--password', 'secret123', '--host', 'h'])
    expect(out).toEqual(['cmd', '/c', 'npx', '--password', MASK, '--host', 'h'])
  })

  it('masks --pass and --token forms', () => {
    expect(maskArgs(['--pass', 'pw'])).toEqual(['--pass', MASK])
    expect(maskArgs(['--api-key', 'k'])).toEqual(['--api-key', MASK])
  })

  it('掩码等号参数和参数中的 URL 凭据且不改变输入', () => {
    const args = ['--token=secret', '--api-key=key-value', '--endpoint=https://example.com/mcp?access_token=private', 'https://example.com/?api_key=hidden']
    const out = maskArgs(args)!
    expect(out[0]).toBe(`--token=${MASK}`)
    expect(out[1]).toBe(`--api-key=${MASK}`)
    expect(out.join(' ')).not.toMatch(/secret|key-value|private|hidden/)
    expect(args[0]).toBe('--token=secret')
  })

  it('leaves a bare -p (port shorthand) untouched', () => {
    expect(maskArgs(['-p', '22'])).toEqual(['-p', '22'])
  })

  it('leaves ordinary args untouched', () => {
    expect(maskArgs(['--host', 'h', '--port', '22'])).toEqual(['--host', 'h', '--port', '22'])
  })
})

describe('maskValues', () => {
  it('masks every value, keeping keys', () => {
    expect(maskValues({ TAVILY_API_KEY: 'k', PATH: 'p' })).toEqual({ TAVILY_API_KEY: MASK, PATH: MASK })
  })
  it('returns undefined for undefined', () => {
    expect(maskValues(undefined)).toBeUndefined()
  })
})

describe('maskUrl', () => {
  it('masks userinfo password', () => {
    const masked = maskUrl('http://user:pass@example.com/x') ?? ''
    expect(masked).not.toContain(':pass@')
    expect(masked).toContain('@example.com')
  })
  it('掩码大小写混合及重复的敏感查询参数，同时保留普通参数', () => {
    const out = new URL(maskUrl('https://example.com/?token=one&token=two&API_KEY=three&mode=sse')!)
    expect(out.searchParams.getAll('token')).toEqual([MASK])
    expect(out.searchParams.get('API_KEY')).toBe(MASK)
    expect(out.searchParams.get('mode')).toBe('sse')
    expect(out.toString()).not.toMatch(/one|two|three/)
  })
  it('keeps a passwordless URL verbatim', () => {
    expect(maskUrl('https://example.com/x')).toBe('https://example.com/x')
  })
})
