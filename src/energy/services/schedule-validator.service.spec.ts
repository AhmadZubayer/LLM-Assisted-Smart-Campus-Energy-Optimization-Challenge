import { AppError } from '../../common/errors/application-error';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { EffectiveConstraints } from '../interfaces/effective-constraints.types';
import {
  FormattedSchedule,
  HourlyScheduleEntry,
} from '../interfaces/solver-result.types';
import { ScheduleValidatorService } from './schedule-validator.service';

function buildHours(): HourEntryDto[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    demand_kwh: hour === 0 ? 10 : 0,
    solar_kwh: 0,
    tariff_bdt_per_kwh: 5,
  }));
}

function buildBattery(): BatteryDto {
  return {
    capacity_kwh: 100,
    initial_energy_kwh: 20,
    minimum_energy_kwh: 0,
    max_charge_kwh_per_hour: 10,
    max_discharge_kwh_per_hour: 10,
  };
}

function buildConstraints(
  hours: HourEntryDto[],
  battery: BatteryDto,
): EffectiveConstraints {
  return {
    effectiveSolarKwh: hours.map((h) => h.solar_kwh),
    minReserveKwh: hours.map(() => battery.minimum_energy_kwh),
    maxChargeKwh: hours.map(() => battery.max_charge_kwh_per_hour),
    maxDischargeKwh: hours.map(() => battery.max_discharge_kwh_per_hour),
    maxGridKwh: hours.map(() => null),
  };
}

function buildValidPlan(
  hours: HourEntryDto[],
  battery: BatteryDto,
): FormattedSchedule {
  const hourlyPlan: HourlyScheduleEntry[] = hours.map((h) => ({
    hour: h.hour,
    grid_kwh: h.demand_kwh,
    solar_used_kwh: 0,
    battery_action: 'idle',
    battery_kwh: 0,
    battery_energy_after_kwh: battery.initial_energy_kwh,
  }));
  const totalGridKwh = hourlyPlan.reduce((sum, e) => sum + e.grid_kwh, 0);
  const totalCostBdt = hourlyPlan.reduce(
    (sum, e, i) => sum + e.grid_kwh * hours[i].tariff_bdt_per_kwh,
    0,
  );
  const peakGridKwh = Math.max(...hourlyPlan.map((e) => e.grid_kwh));
  return { hourlyPlan, totalGridKwh, totalCostBdt, peakGridKwh };
}

describe('ScheduleValidatorService', () => {
  const validator = new ScheduleValidatorService();

  it('accepts a plan that satisfies every rule', () => {
    const hours = buildHours();
    const battery = buildBattery();
    expect(() =>
      validator.validate(
        hours,
        battery,
        buildConstraints(hours, battery),
        buildValidPlan(hours, battery),
      ),
    ).not.toThrow();
  });

  it('rejects a plan that breaks the hourly energy balance', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const plan = buildValidPlan(hours, battery);
    plan.hourlyPlan[0].grid_kwh = 3;
    expect(() =>
      validator.validate(
        hours,
        battery,
        buildConstraints(hours, battery),
        plan,
      ),
    ).toThrow(AppError);
  });

  it('rejects a plan whose final battery energy does not return to the initial level', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const plan = buildValidPlan(hours, battery);
    plan.hourlyPlan[23].battery_energy_after_kwh =
      battery.initial_energy_kwh + 5;
    expect(() =>
      validator.validate(
        hours,
        battery,
        buildConstraints(hours, battery),
        plan,
      ),
    ).toThrow(AppError);
  });

  it('rejects charging above the hourly rate limit', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const plan = buildValidPlan(hours, battery);
    plan.hourlyPlan[5].battery_action = 'charge';
    plan.hourlyPlan[5].battery_kwh = battery.max_charge_kwh_per_hour + 5;
    plan.hourlyPlan[5].battery_energy_after_kwh =
      battery.initial_energy_kwh + battery.max_charge_kwh_per_hour + 5;
    expect(() =>
      validator.validate(
        hours,
        battery,
        buildConstraints(hours, battery),
        plan,
      ),
    ).toThrow(AppError);
  });

  it('rejects solar_used_kwh above the effective solar available', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const constraints = buildConstraints(hours, battery);
    const plan = buildValidPlan(hours, battery);
    plan.hourlyPlan[3].solar_used_kwh = 999;
    expect(() => validator.validate(hours, battery, constraints, plan)).toThrow(
      AppError,
    );
  });

  it('rejects battery energy below an active minimum reserve', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const constraints = buildConstraints(hours, battery);
    constraints.minReserveKwh[2] = 50;
    const plan = buildValidPlan(hours, battery);
    expect(() => validator.validate(hours, battery, constraints, plan)).toThrow(
      AppError,
    );
  });

  it('rejects grid_kwh above an active max_grid_window cap', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const constraints = buildConstraints(hours, battery);
    constraints.maxGridKwh[0] = 1;
    const plan = buildValidPlan(hours, battery);
    expect(() => validator.validate(hours, battery, constraints, plan)).toThrow(
      AppError,
    );
  });

  it('rejects reported totals that do not match the hourly_plan', () => {
    const hours = buildHours();
    const battery = buildBattery();
    const plan = buildValidPlan(hours, battery);
    plan.totalCostBdt += 1000;
    expect(() =>
      validator.validate(
        hours,
        battery,
        buildConstraints(hours, battery),
        plan,
      ),
    ).toThrow(AppError);
  });
});
