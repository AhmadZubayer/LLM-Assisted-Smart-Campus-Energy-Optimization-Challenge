export interface EnvConfig {
  PORT: number;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  LLM_TIMEOUT_MS: number;
  REQUEST_TIMEOUT_MS: number;
  LLM_MAX_RETRIES: number;
}

function toPositiveInt(raw: unknown, name: string, fallback: number): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Environment variable ${name} must be a positive integer, got "${JSON.stringify(raw)}"`,
    );
  }
  return parsed;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const apiKey = config.GEMINI_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Missing required environment variable GEMINI_API_KEY');
  }

  const model =
    typeof config.GEMINI_MODEL === 'string' &&
    config.GEMINI_MODEL.trim().length > 0
      ? config.GEMINI_MODEL.trim()
      : 'gemini-flash-lite-latest';

  return {
    PORT: toPositiveInt(config.PORT, 'PORT', 3000),
    GEMINI_API_KEY: apiKey,
    GEMINI_MODEL: model,
    LLM_TIMEOUT_MS: toPositiveInt(
      config.LLM_TIMEOUT_MS,
      'LLM_TIMEOUT_MS',
      6000,
    ),
    REQUEST_TIMEOUT_MS: toPositiveInt(
      config.REQUEST_TIMEOUT_MS,
      'REQUEST_TIMEOUT_MS',
      25000,
    ),
    LLM_MAX_RETRIES: toPositiveInt(
      config.LLM_MAX_RETRIES,
      'LLM_MAX_RETRIES',
      1,
    ),
  };
}
