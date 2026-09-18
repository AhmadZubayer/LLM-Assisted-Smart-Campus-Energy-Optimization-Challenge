import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GeminiClientService } from '../src/llm/gemini-client.service';
import {
  compareInterpretations,
  ErrorResponseBody,
  OptimizeEnergyResponseBody,
  ReferenceDirective,
  replayAgainstReference,
} from './helpers/reference-replay';

interface PublicCase {
  id: string;
  label: string;
  input: {
    scenario_id: string;
    operator_notes: string[];
    hours: {
      hour: number;
      demand_kwh: number;
      solar_kwh: number;
      tariff_bdt_per_kwh: number;
    }[];
    battery: {
      capacity_kwh: number;
      initial_energy_kwh: number;
      minimum_energy_kwh: number;
      max_charge_kwh_per_hour: number;
      max_discharge_kwh_per_hour: number;
    };
  };
  expected_output: {
    directive_interpretation: ReferenceDirective[];
    total_cost_bdt: number;
  };
}

class FakeGeminiClientService {
  private queue: string[] = [];

  enqueue(rawText: string): void {
    this.queue.push(rawText);
  }

  generateJson(): Promise<string> {
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.reject(
        new Error('FakeGeminiClientService: no response queued for this call'),
      );
    }
    return Promise.resolve(next);
  }
}

const fixturePath = join(__dirname, 'fixtures', 'gridwise-public-cases.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  cases: PublicCase[];
};

function toFlatGeminiOutput(directives: ReferenceDirective[]) {
  return directives.map((directive) => ({
    note_index: directive.note_index,
    applies: directive.applies,
    directive_type: directive.directive_type,
    explanation: directive.explanation ?? 'reference case',
    ...directive.structured_adjustment,
  }));
}

describe('GridWise API (deterministic, Gemini network call mocked)', () => {
  let app: INestApplication;
  let fakeGemini: FakeGeminiClientService;

  beforeAll(async () => {
    fakeGemini = new FakeGeminiClientService();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeminiClientService)
      .useValue(fakeGemini)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 {status: "ok"}', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('POST /optimize-energy rejects malformed JSON with 400 and no stack trace', async () => {
    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .set('Content-Type', 'application/json')
      .send('{not valid json');

    expect(response.status).toBe(400);
    expect((response.body as ErrorResponseBody).error.code).toBe(
      'INVALID_REQUEST',
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /at\s+\S+\s+\(.*:\d+:\d+\)/,
    );
  });

  it('POST /optimize-energy rejects a request missing required fields with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send({ scenario_id: 'X' });
    expect(response.status).toBe(400);
    expect((response.body as ErrorResponseBody).error.code).toBe(
      'INVALID_REQUEST',
    );
  });

  it('POST /optimize-energy rejects an unknown extra field with 400', async () => {
    const base = fixture.cases[0].input;
    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send({ ...base, unexpected_field: true });
    expect(response.status).toBe(400);
  });

  describe.each(
    fixture.cases.map((testCase) => [testCase.id, testCase] as const),
  )('%s', (_id, testCase) => {
    it('returns the exact response shape, matches the reference interpretation, and produces a valid cost-optimal replay', async () => {
      fakeGemini.enqueue(
        JSON.stringify({
          directive_interpretation: toFlatGeminiOutput(
            testCase.expected_output.directive_interpretation,
          ),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/optimize-energy')
        .send(testCase.input);

      expect(response.status).toBe(200);
      const body = response.body as OptimizeEnergyResponseBody;
      expect(body.scenario_id).toBe(testCase.input.scenario_id);
      expect(body.hourly_plan).toHaveLength(24);
      expect(body.directive_interpretation).toHaveLength(
        testCase.input.operator_notes.length,
      );

      const interpretationCheck = compareInterpretations(
        body.directive_interpretation,
        testCase.expected_output.directive_interpretation,
      );
      expect(interpretationCheck.differences).toEqual([]);

      const replay = replayAgainstReference(
        testCase.input.hours,
        testCase.input.battery,
        testCase.expected_output.directive_interpretation,
        body.hourly_plan,
      );
      expect(replay.violations).toEqual([]);

      expect(replay.recalculatedTotalCostBdt).toBeCloseTo(
        testCase.expected_output.total_cost_bdt,
        1,
      );
      expect(body.total_cost_bdt).toBeCloseTo(
        testCase.expected_output.total_cost_bdt,
        1,
      );
    });
  });
});
