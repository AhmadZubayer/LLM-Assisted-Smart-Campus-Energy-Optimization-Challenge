import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { RawSolverSchedule } from '../interfaces/solver-result.types';
import { ScheduleFormatterService } from './schedule-formatter.service';

function buildHours(tariff: number[]): HourEntryDto[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    demand_kwh: 0,
    solar_kwh: 0,
    tariff_bdt_per_kwh: tariff[hour],
  }));
}

function buildBattery(initial: number): BatteryDto {
  return {
    capacity_kwh: 500,
    initial_energy_kwh: initial,
    minimum_energy_kwh: 0,
    max_charge_kwh_per_hour: 100,
    max_discharge_kwh_per_hour: 100,
  };
}

function zeros(): number[] {
  return new Array<number>(24).fill(0);
}

describe('ScheduleFormatterService', () => {
  const formatter = new ScheduleFormatterService();

  it('nets simultaneous charge and discharge into a single exported action', () => {
    const raw: RawSolverSchedule = {
      grid: zeros(),
      solar: zeros(),
      charge: zeros(),
      discharge: zeros(),
    };
    raw.charge[0] = 8;
    raw.discharge[0] = 3;

    const formatted = formatter.format(
      buildHours(zeros()),
      buildBattery(10),
      raw,
    );
    expect(formatted.hourlyPlan[0].battery_action).toBe('charge');
    expect(formatted.hourlyPlan[0].battery_kwh).toBeCloseTo(5, 9);
    expect(formatted.hourlyPlan[0].battery_energy_after_kwh).toBeCloseTo(15, 9);
  });

  it('treats a net below the noise epsilon as idle with battery_kwh = 0', () => {
    const raw: RawSolverSchedule = {
      grid: zeros(),
      solar: zeros(),
      charge: zeros(),
      discharge: zeros(),
    };
    raw.charge[5] = 1e-10;
    raw.discharge[5] = 1e-10;

    const formatted = formatter.format(
      buildHours(zeros()),
      buildBattery(20),
      raw,
    );
    expect(formatted.hourlyPlan[5].battery_action).toBe('idle');
    expect(formatted.hourlyPlan[5].battery_kwh).toBe(0);
  });

  it('recomputes battery_energy_after_kwh forward from initial_energy_kwh, not from any solver state', () => {
    const raw: RawSolverSchedule = {
      grid: zeros(),
      solar: zeros(),
      charge: zeros(),
      discharge: zeros(),
    };
    raw.charge[0] = 10;
    raw.discharge[10] = 4;

    const formatted = formatter.format(
      buildHours(zeros()),
      buildBattery(50),
      raw,
    );
    expect(formatted.hourlyPlan[0].battery_energy_after_kwh).toBeCloseTo(60, 9);
    for (let h = 1; h < 10; h++) {
      expect(formatted.hourlyPlan[h].battery_energy_after_kwh).toBeCloseTo(
        60,
        9,
      );
    }
    expect(formatted.hourlyPlan[10].battery_energy_after_kwh).toBeCloseTo(
      56,
      9,
    );
  });

  it('sums total_grid_kwh, total_cost_bdt, and peak_grid_kwh from the exported grid values', () => {
    const raw: RawSolverSchedule = {
      grid: zeros(),
      solar: zeros(),
      charge: zeros(),
      discharge: zeros(),
    };
    raw.grid[0] = 10;
    raw.grid[5] = 25;
    const tariff = zeros();
    tariff[0] = 4;
    tariff[5] = 2;

    const formatted = formatter.format(
      buildHours(tariff),
      buildBattery(0),
      raw,
    );
    expect(formatted.totalGridKwh).toBeCloseTo(35, 9);
    expect(formatted.totalCostBdt).toBeCloseTo(10 * 4 + 25 * 2, 9);
    expect(formatted.peakGridKwh).toBeCloseTo(25, 9);
  });

  it('preserves fractional precision instead of rounding to 2 decimals', () => {
    const raw: RawSolverSchedule = {
      grid: zeros(),
      solar: zeros(),
      charge: zeros(),
      discharge: zeros(),
    };
    raw.grid[0] = 33.333333333;
    const formatted = formatter.format(
      buildHours(zeros()),
      buildBattery(0),
      raw,
    );
    expect(formatted.hourlyPlan[0].grid_kwh).toBeCloseTo(33.333333333, 8);
  });
});
