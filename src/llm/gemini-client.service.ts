import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI, Schema } from '@google/genai';
import { EnvConfig } from '../common/config/env.validation';
import { redactSecret } from '../common/logging/redact';

export class GeminiAuthError extends Error {}

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.apiKey = this.configService.get('GEMINI_API_KEY', { infer: true });
    this.model = this.configService.get('GEMINI_MODEL', { infer: true });
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }

  async generateJson(
    prompt: string,
    schema: Schema,
    parentSignal: AbortSignal,
    timeoutMs: number,
  ): Promise<string> {
    if (timeoutMs <= 0) {
      throw new Error('no time remaining for a provider call');
    }

    const attemptSignal = AbortSignal.any([
      parentSignal,
      AbortSignal.timeout(timeoutMs),
    ]);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0,
          abortSignal: attemptSignal,
        },
      });

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error('empty response from model');
      }
      return text;
    } catch (error) {
      if (error instanceof ApiError && this.isAuthFailure(error)) {
        this.logger.error(
          this.redact(
            `Gemini rejected credentials: ${error.status} ${error.message}`,
          ),
        );
        throw new GeminiAuthError(
          'invalid Gemini credentials or access denied',
        );
      }
      this.logger.warn(
        this.redact(`Gemini request failed: ${this.describe(error)}`),
      );
      throw error instanceof Error
        ? error
        : new Error('unknown provider error');
    }
  }

  private isAuthFailure(error: ApiError): boolean {
    if (error.status === 401 || error.status === 403) {
      return true;
    }
    return (
      error.status === 400 &&
      /api_key_invalid|api key not valid|permission_denied/i.test(error.message)
    );
  }

  private describe(error: unknown): string {
    if (error instanceof ApiError) {
      return `ApiError(${error.status}): ${error.message}`;
    }
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    return 'unknown error';
  }

  private redact(text: string): string {
    return redactSecret(text, this.apiKey);
  }
}
