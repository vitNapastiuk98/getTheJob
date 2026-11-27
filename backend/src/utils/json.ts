export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  
  try {
    return JSON.parse(trimmed);
  } catch {}
  
  const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const lineTrimmed = line.trim();
    if (lineTrimmed.startsWith('{') || lineTrimmed.startsWith('[')) {
      try {
        return JSON.parse(lineTrimmed);
      } catch {
        continue;
      }
    }
  }
  
  throw new Error('Could not extract JSON from response');
}
