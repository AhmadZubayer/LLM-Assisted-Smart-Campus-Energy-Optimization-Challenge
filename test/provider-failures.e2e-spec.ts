import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  GeminiAuthError,
  GeminiClientService,
} from '../src/llm/gemini-client.service';
import { ErrorResponseBody } from './helpers/reference-replay';

type ScriptedAction =
  { kind: 'error'; error: Error } | { kind: 'text'; text: string };

class ScriptedGeminiClientService {
  calls = 0;
  private readonly script: ScriptedAction[] = [];

  queueError(error: Error): this {
    this.script.push({ kind: 'error', error });
    return this;
  }

  queueText(text: string): this {
    this.script.push({ kind: 'text', text });
    return this;
  }

  generateJson(): Promise<string> {
    this.calls += 1;
    const next = this.script.shift();
    if (!next) {
      return Promise.reject(
        new Error('ScriptedGeminiClientService: script exhausted'),
      );
    }
    if (next.kind === 'error') {
      return Promise.reject(next.error);
    }
    return Promise.resolve(next.text);
  }
}

function minimalRequestBody() {
  return {
    scenario_id: 'PROVIDER-TEST-1',
    operator_notes: ['The cafeteria menu changes tomorrow.'],
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      demand_kwh: 10,
      solar_kwh: 0,
      tariff_bdt_per_kwh: 5,
    })),
    battery: {
      capacity_kwh: 100,
      initial_energy_kwh: 20,
      minimum_energy_kwh: 0,
      max_charge_kwh_per_hour: 10,
      max_discharge_kwh_per_hour: 10,
    },
  };
}

function validNoOpResponseText(): string {
  return JSON.stringify({
    directive_interpretation: [
      {
        note_index: 0,
        applies: false,
        directive_type: 'no_op',
        explanation: 'cafeteria menu change is unrelated to energy scheduling',
      },
    ],
  });
}

describe('POST /optimize-energy (provider failure handling)', () => {
  let app: INestApplication;
  let scripted: ScriptedGeminiClientService;

  beforeEach(async () => {
    scripted = new ScriptedGeminiClientService();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeminiClientService)
      .useValue(scripted)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('recovers from one transient transport failure and succeeds on the retry', async () => {
    scripted
      .queueError(new Error('socket hang up'))
      .queueText(validNoOpResponseText());

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(minimalRequestBody());

    expect(response.status).toBe(200);
    expect(scripted.calls).toBe(2);
  });

  it('returns a controlled 500 when every attempt fails transiently', async () => {
    scripted
      .queueError(new Error('socket hang up'))
      .queueError(new Error('socket hang up again'));

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(minimalRequestBody());

    expect(response.status).toBe(500);
    expect((response.body as ErrorResponseBody).error.code).toBe(
      'INTERPRETATION_INVALID',
    );
    expect(JSON.stringify(response.body)).not.toMatch(/socket hang up/);
    expect(scripted.calls).toBe(2);
  });

  it('recovers when the first response is not valid JSON', async () => {
    scripted
      .queueText('this is not json at all')
      .queueText(validNoOpResponseText());

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(minimalRequestBody());

    expect(response.status).toBe(200);
    expect(scripted.calls).toBe(2);
  });

  it('recovers when the first response fails guardrails but the retry is valid', async () => {
    scripted
      .queueText(
        JSON.stringify({
          directive_interpretation: [
            {
              note_index: 0,
              applies: true,
              directive_type: 'shutdown_grid',
              explanation: 'x',
            },
          ],
        }),
      )
      .queueText(validNoOpResponseText());

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(minimalRequestBody());

    expect(response.status).toBe(200);
    expect(scripted.calls).toBe(2);
  });

  it('returns a controlled 500 when guardrails reject every attempt, without ever inventing a no_op', async () => {
    const badText = JSON.stringify({
      directive_interpretation: [
        {
          note_index: 0,
          applies: true,
          directive_type: 'shutdown_grid',
          explanation: 'x',
        },
      ],
    });
    scripted.queueText(badText).queueText(badText);

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(minimalRequestBody());

    expect(response.status).toBe(500);
    expect((response.body as ErrorResponseBody).error.code).toBe(
      'INTERPRETATION_INVALID',
    );
    expect(scripted.calls).toBe(2);
  });

  it('does not retry after an authentication/credentials failure', async () => {
    scripted.queueError(
      new GeminiAuthError('invalid Gemini credentials or access denied'),
    );

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(minimalRequestBody());

    expect(response.status).toBe(500);
    expect((response.body as ErrorResponseBody).error.code).toBe(
      'INTERPRETATION_UNAVAILABLE',
    );
    expect(scripted.calls).toBe(1);
  });
});
