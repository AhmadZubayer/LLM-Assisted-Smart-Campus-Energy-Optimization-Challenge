import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../common/config/env.validation';
import { AppError } from '../../common/errors/application-error';
import { RequestDeadline } from '../../common/request-deadline';
import {
  GeminiAuthError,
  GeminiClientService,
} from '../../llm/gemini-client.service';
import { directiveInterpretationResponseSchema } from '../../llm/directive-output.schema';
import {
  PromptCorrection,
  buildInterpretationPrompt,
} from '../../llm/operator-notes.prompt';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { DirectiveInterpretation } from '../interfaces/directive.types';
import { GuardrailValidatorService } from './guardrail-validator.service';

function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : 'unknown error';
}

@Injectable()
export class LlmInterpreterService {
  private readonly logger = new Logger(LlmInterpreterService.name);

  constructor(
    private readonly geminiClient: GeminiClientService,
    private readonly guardrails: GuardrailValidatorService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async interpret(
    notes: string[],
    hours: HourEntryDto[],
    battery: BatteryDto,
    deadline: RequestDeadline,
  ): Promise<DirectiveInterpretation[]> {
    const maxRetries = this.configService.get('LLM_MAX_RETRIES', {
      infer: true,
    });
    const attemptTimeoutMs = this.configService.get('LLM_TIMEOUT_MS', {
      infer: true,
    });

    let lastFailureReason = 'no attempt was made';
    let correction: PromptCorrection | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (deadline.expired) {
        throw new AppError(
          'REQUEST_TIMEOUT',
          500,
          'The request exceeded its processing deadline.',
          lastFailureReason,
        );
      }

      const prompt = buildInterpretationPrompt(
        notes,
        hours,
        battery,
        correction,
      );
      let rawText: string;
      try {
        rawText = await this.geminiClient.generateJson(
          prompt,
          directiveInterpretationResponseSchema,
          deadline.signal,
          deadline.attemptTimeoutMs(attemptTimeoutMs),
        );
      } catch (error) {
        if (error instanceof GeminiAuthError) {
          throw new AppError(
            'INTERPRETATION_UNAVAILABLE',
            500,
            'Unable to interpret the operator notes.',
            `provider credentials rejected: ${describeError(error)}`,
          );
        }
        lastFailureReason = `provider call failed: ${describeError(error)}`;
        this.logger.warn(`attempt ${attempt + 1}: ${lastFailureReason}`);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        lastFailureReason = 'model response was not valid JSON';
        this.logger.warn(`attempt ${attempt + 1}: ${lastFailureReason}`);
        correction = { previousRawText: rawText, issues: [lastFailureReason] };
        continue;
      }

      const outcome = this.guardrails.validate(
        parsed,
        notes.length,
        battery.capacity_kwh,
      );
      if (outcome.ok) {
        return outcome.interpretations!;
      }

      lastFailureReason = outcome.failures!.join('; ');
      this.logger.warn(
        `attempt ${attempt + 1} rejected by guardrails: ${lastFailureReason}`,
      );
      correction = { previousRawText: rawText, issues: outcome.failures! };
    }

    throw new AppError(
      'INTERPRETATION_INVALID',
      500,
      'Unable to obtain a valid interpretation of the operator notes.',
      lastFailureReason,
    );
  }
}
