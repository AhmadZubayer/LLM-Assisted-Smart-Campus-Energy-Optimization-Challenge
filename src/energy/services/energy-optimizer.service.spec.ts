import { AppError } from '../../common/errors/application-error';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { EffectiveConstraints } from '../interfaces/effective-constraints.types';
import { EnergyOptimizerService } from './energy-optimizer.service';

function flatConstraints(
  hours: HourEntryDto[],
  battery: BatteryDto,
  overrides: Partial<EffectiveConstraints> = {},
): EffectiveConstraints {
  return {
    effectiveSolarKwh: hours.map((h) => h.solar_kwh),
    minReserveKwh: hours.map(() => battery.minimum_energy_kwh),
    maxChargeKwh: hours.map(() => battery.max_charge_kwh_per_hour),
    maxDischargeKwh: hours.map(() => battery.max_discharge_kwh_per_hour),
    maxGridKwh: hours.map(() => null),
    ...overrides,
  };
}

describe('EnergyOptimizerService', () => {
  const service = new EnergyOptimizerService();

  it('discharges the battery in the expensive hour and recharges in the cheapest hour (hand-computable)', () => {
    const hours: HourEntryDto[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      demand_kwh: hour === 0 ? 10 : hour === 1 ? 10 : 0,
      solar_kwh: 0,
      tariff_bdt_per_kwh: hour === 0 ? 10 : hour === 1 ? 1 : 5,
    }));
    const battery: BatteryDto = {
      capacity_kwh: 20,
      initial_energy_kwh: 5,
      minimum_energy_kwh: 0,
      max_charge_kwh_per_hour: 10,
      max_discharge_kwh_per_hour: 10,
    };

    const result = service.solve(
      hours,
      battery,
      flatConstraints(hours, battery),
    );
    const totalCost = result.grid.reduce(
      (sum, g, h) => sum + g * hours[h].tariff_bdt_per_kwh,
      0,
    );

    expect(totalCost).toBeCloseTo(65, 6);
    expect(result.discharge[0]).toBeCloseTo(5, 6);
    expect(result.charge[1]).toBeCloseTo(5, 6);
  });

  it('never buys more grid than demand when solar fully covers it and tariff is uniform', () => {
    const hours: HourEntryDto[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      demand_kwh: 50,
      solar_kwh: 50,
      tariff_bdt_per_kwh: 8,
    }));
    const battery: BatteryDto = {
      capacity_kwh: 100,
      initial_energy_kwh: 20,
      minimum_energy_kwh: 0,
      max_charge_kwh_per_hour: 20,
      max_discharge_kwh_per_hour: 20,
    };

    const result = service.solve(
      hours,
      battery,
      flatConstraints(hours, battery),
    );
    const totalGrid = result.grid.reduce((sum, g) => sum + g, 0);
    expect(totalGrid).toBeCloseTo(0, 6);
  });

  it('respects a zero solar cap even when base solar_kwh is positive', () => {
    const hours: HourEntryDto[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      demand_kwh: 10,
      solar_kwh: 10,
      tariff_bdt_per_kwh: 5,
    }));
    const battery: BatteryDto = {
      capacity_kwh: 50,
      initial_energy_kwh: 10,
      minimum_energy_kwh: 0,
      max_charge_kwh_per_hour: 5,
      max_discharge_kwh_per_hour: 5,
    };
    const constraints = flatConstraints(hours, battery, {
      effectiveSolarKwh: hours.map(() => 0),
    });

    const result = service.solve(hours, battery, constraints);
    expect(result.solar.every((value) => value < 1e-6)).toBe(true);
  });

  it('throws OPTIMIZATION_FAILED when a max_grid_window cap makes the scenario infeasible', () => {
    const hours: HourEntryDto[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      demand_kwh: hour === 0 ? 1000 : 0,
      solar_kwh: 0,
      tariff_bdt_per_kwh: 5,
    }));
    const battery: BatteryDto = {
      capacity_kwh: 50,
      initial_energy_kwh: 10,
      minimum_energy_kwh: 0,
      max_charge_kwh_per_hour: 5,
      max_discharge_kwh_per_hour: 0,
    };
    const constraints = flatConstraints(hours, battery, {
      maxGridKwh: hours.map((h) => (h.hour === 0 ? 10 : null)),
    });

    expect(() => service.solve(hours, battery, constraints)).toThrow(AppError);
    try {
      service.solve(hours, battery, constraints);
      fail('expected an AppError');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('OPTIMIZATION_FAILED');
    }
  });
});
