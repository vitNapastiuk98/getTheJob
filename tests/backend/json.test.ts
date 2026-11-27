import { describe, expect, it } from 'vitest';
import { extractJson } from '../../backend/src/json.js';
describe('JSON extraction', () => {
  it('accepts plain, fenced, prefixed and nested JSON without evaluating code', () => {
    expect(extractJson('{"ok":true}')).toEqual({ ok: true });
    expect(extractJson('```json\n[1,2]\n```')).toEqual([1, 2]);
    const expected = { s: 'braces } { and " quote', x: [{}] };
    expect(extractJson(`Here is JSON: ${JSON.stringify(expected)}`)).toEqual(expected);
  });
  it('rejects empty, malformed, truncated and oversized output', () => {
    for (const input of ['', '{"x":', '{bad}', 'console.log(1)']) expect(() => extractJson(input)).toThrow();
    expect(() => extractJson('x'.repeat(2_097_153))).toThrow(/large/i);
    expect(() => extractJson('{'.repeat(100_000))).toThrow(/complete/i);
  });
});
