import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/application-error';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { EffectiveConstraints } from '../interfaces/effective-constraints.types';
import { FormattedSchedule } from '../interfaces/solver-result.types';

const HOURS_IN_DAY = 24;
const TOLERANCE = 0.01;

@Injectable()
export class ScheduleValidatorService {
  validate(
    hours: HourEntryDto[],
    battery: BatteryDto,
    constraints: EffectiveConstraints,
    schedule: FormattedSchedule,
  ): void {
    const { hourlyPlan } = schedule;

    if (hourlyPlan.length !== HOURS_IN_DAY) {
      this.fail(
        `hourly_plan must contain ${HOURS_IN_DAY} entries, got ${hourlyPlan.length}`,
      );
    }

    let energyBefore = battery.initial_energy_kwh;

    for (let h = 0; h < HOURS_IN_DAY; h++) {
      const entry = hourlyPlan[h];

      if (entry.hour !== h) {
        this.fail(`hourly_plan entry at position ${h} has hour ${entry.hour}`);
      }
      if (!Number.isFinite(entry.grid_kwh) || entry.grid_kwh < -TOLERANCE) {
        this.fail(`hour ${h}: grid_kwh must be finite and non-negative`);
      }
      if (
        !Number.isFinite(entry.solar_used_kwh) ||
        entry.solar_used_kwh < -TOLERANCE
      ) {
        this.fail(`hour ${h}: solar_used_kwh must be finite and non-negative`);
      }
      if (entry.solar_used_kwh > constraints.effectiveSolarKwh[h] + TOLERANCE) {
        this.fail(
          `hour ${h}: solar_used_kwh exceeds effective solar available`,
        );
      }
      if (
        !Number.isFinite(entry.battery_kwh) ||
        entry.battery_kwh < -TOLERANCE
      ) {
        this.fail(`hour ${h}: battery_kwh must be finite and non-negative`);
      }

      let charge = 0;
      let discharge = 0;
      if (entry.battery_action === 'charge') {
        charge = entry.battery_kwh;
        if (charge > constraints.maxChargeKwh[h] + TOLERANCE) {
          this.fail(
            `hour ${h}: charge exceeds max_charge_kwh_per_hour or an active no_charge_window`,
          );
        }
      } else if (entry.battery_action === 'discharge') {
        discharge = entry.battery_kwh;
        if (discharge > constraints.maxDischargeKwh[h] + TOLERANCE) {
          this.fail(
            `hour ${h}: discharge exceeds max_discharge_kwh_per_hour or an active no_discharge_window`,
          );
        }
      } else if (entry.battery_action === 'idle') {
        if (Math.abs(entry.battery_kwh) > TOLERANCE) {
          this.fail(`hour ${h}: idle hours must have battery_kwh = 0`);
        }
      } else {
        this.fail(
          `hour ${h}: battery_action must be one of charge, discharge, idle`,
        );
      }

      const suppliedSide = entry.grid_kwh + entry.solar_used_kwh + discharge;
      const demandedSide = hours[h].demand_kwh + charge;
      if (Math.abs(suppliedSide - demandedSide) > TOLERANCE) {
        this.fail(
          `hour ${h}: energy balance does not hold (${suppliedSide} != ${demandedSide})`,
        );
      }

      const expectedEnergyAfter = energyBefore + charge - discharge;
      if (
        Math.abs(expectedEnergyAfter - entry.battery_energy_after_kwh) >
        TOLERANCE
      ) {
        this.fail(
          `hour ${h}: battery_energy_after_kwh does not match the battery transition`,
        );
      }
      if (
        entry.battery_energy_after_kwh <
        constraints.minReserveKwh[h] - TOLERANCE
      ) {
        this.fail(
          `hour ${h}: battery_energy_after_kwh is below the active minimum reserve`,
        );
      }
      if (entry.battery_energy_after_kwh > battery.capacity_kwh + TOLERANCE) {
        this.fail(`hour ${h}: battery_energy_after_kwh exceeds capacity_kwh`);
      }
      const gridCap = constraints.maxGridKwh[h];
      if (gridCap !== null && entry.grid_kwh > gridCap + TOLERANCE) {
        this.fail(`hour ${h}: grid_kwh exceeds the active max_grid_window cap`);
      }

      energyBefore = entry.battery_energy_after_kwh;
    }

    if (Math.abs(energyBefore - battery.initial_energy_kwh) > TOLERANCE) {
      this.fail(
        `final battery_energy_after_kwh (${energyBefore}) does not equal initial_energy_kwh (${battery.initial_energy_kwh})`,
      );
    }

    const recalculatedGrid = hourlyPlan.reduce(
      (sum, entry) => sum + entry.grid_kwh,
      0,
    );
    const recalculatedCost = hourlyPlan.reduce(
      (sum, entry, index) =>
        sum + entry.grid_kwh * hours[index].tariff_bdt_per_kwh,
      0,
    );
    const recalculatedPeak = Math.max(
      ...hourlyPlan.map((entry) => entry.grid_kwh),
    );

    if (Math.abs(recalculatedGrid - schedule.totalGridKwh) > TOLERANCE) {
      this.fail(
        `total_grid_kwh does not match hourly_plan (expected ${recalculatedGrid}, got ${schedule.totalGridKwh})`,
      );
    }
    if (Math.abs(recalculatedCost - schedule.totalCostBdt) > TOLERANCE) {
      this.fail(
        `total_cost_bdt does not match hourly_plan (expected ${recalculatedCost}, got ${schedule.totalCostBdt})`,
      );
    }
    if (Math.abs(recalculatedPeak - schedule.peakGridKwh) > TOLERANCE) {
      this.fail(
        `peak_grid_kwh does not match hourly_plan (expected ${recalculatedPeak}, got ${schedule.peakGridKwh})`,
      );
    }
  }

  private fail(detail: string): never {
    throw new AppError(
      'PLAN_VALIDATION_FAILED',
      500,
      'Unable to produce a valid energy plan for this scenario.',
      detail,
    );
  }
}
