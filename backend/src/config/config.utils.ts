import { DEFAULT_SETTINGS } from "../shared/contracts.js";

export function localOllamaUrl(baseUrl?: string): string {
  const url = baseUrl ?? DEFAULT_SETTINGS.baseUrl;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost') parsed.hostname = '127.0.0.1';
    return parsed.toString();
  } catch {
    return DEFAULT_SETTINGS.baseUrl;
  }
}

export function localModelReference(model: string): string {
  return model.endsWith(':local') ? model.slice(0, -6) : model;
}
