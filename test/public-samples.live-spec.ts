import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  compareInterpretations,
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

const fixturePath = join(__dirname, 'fixtures', 'gridwise-public-cases.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  cases: PublicCase[];
};

describe('Live Gemini integration (opt-in, uses real API quota)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(
    fixture.cases.map((testCase) => [testCase.id, testCase] as const),
  )('%s', (_id, testCase) => {
    it('produces a structurally valid schedule and matches the reference interpretation', async () => {
      const response = await request(app.getHttpServer())
        .post('/optimize-energy')
        .send(testCase.input);

      expect(response.status).toBe(200);
      const body = response.body as OptimizeEnergyResponseBody;

      const interpretationCheck = compareInterpretations(
        body.directive_interpretation,
        testCase.expected_output.directive_interpretation,
      );
      if (!interpretationCheck.matches) {
        console.warn(
          `${testCase.id}: live interpretation differs from reference:\n${interpretationCheck.differences.join('\n')}`,
        );
      }
      expect(interpretationCheck.differences).toEqual([]);

      const replay = replayAgainstReference(
        testCase.input.hours,
        testCase.input.battery,
        body.directive_interpretation,
        body.hourly_plan,
      );
      expect(replay.violations).toEqual([]);
    });
  });

  it('resolves an organizer-documented paraphrase of the same solar_reduction rule identically', async () => {
    const base = fixture.cases.find((testCase) => testCase.id === 'SAMPLE-01')!;
    const paraphrased = {
      ...base.input,
      scenario_id: 'LIVE-PARAPHRASE-1',
      operator_notes: [
        'Expect an 80% reduction in rooftop solar during the 1-3 PM maintenance window.',
        ...base.input.operator_notes.slice(1),
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(paraphrased);
    expect(response.status).toBe(200);

    const body = response.body as OptimizeEnergyResponseBody;
    const solarEntry = body.directive_interpretation[0];
    expect(solarEntry.directive_type).toBe('solar_reduction');
    expect(solarEntry.applies).toBe(true);
    expect(solarEntry.structured_adjustment?.hours).toEqual([13, 14]);
    expect(solarEntry.structured_adjustment?.factor).toBeCloseTo(0.2, 1);
  });

  it('resolves a relative battery-reserve phrase using the given capacity', async () => {
    const base = fixture.cases.find((testCase) => testCase.id === 'SAMPLE-01')!;
    const relativeReserve = {
      ...base.input,
      scenario_id: 'LIVE-RELATIVE-RESERVE-1',
      operator_notes: [
        'Keep the battery at or above half of its capacity from 6 PM until 9 PM.',
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/optimize-energy')
      .send(relativeReserve);
    expect(response.status).toBe(200);

    const body = response.body as OptimizeEnergyResponseBody;
    const reserveEntry = body.directive_interpretation[0];
    expect(reserveEntry.directive_type).toBe('minimum_battery_reserve');
    expect(reserveEntry.applies).toBe(true);
    expect(reserveEntry.structured_adjustment?.hours).toEqual([18, 19, 20]);
    expect(reserveEntry.structured_adjustment?.minimum_energy_kwh).toBeCloseTo(
      base.input.battery.capacity_kwh / 2,
      1,
    );
  });
});
