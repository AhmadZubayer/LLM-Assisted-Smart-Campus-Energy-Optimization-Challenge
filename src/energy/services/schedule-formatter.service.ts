import { Injectable } from '@nestjs/common';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import {
  BatteryAction,
  FormattedSchedule,
  HourlyScheduleEntry,
  RawSolverSchedule,
} from '../interfaces/solver-result.types';

const HOURS_IN_DAY = 24;
const ACTION_EPSILON = 1e-8;
const CLEAN_SCALE = 1e9;

function clean(value: number): number {
  return Math.round(value * CLEAN_SCALE) / CLEAN_SCALE;
}

@Injectable()
export class ScheduleFormatterService {
  format(
    hours: HourEntryDto[],
    battery: BatteryDto,
    raw: RawSolverSchedule,
  ): FormattedSchedule {
    const hourlyPlan: HourlyScheduleEntry[] = [];
    let energyBefore = battery.initial_energy_kwh;

    for (let h = 0; h < HOURS_IN_DAY; h++) {
      const net = raw.charge[h] - raw.discharge[h];
      const action: BatteryAction =
        net > ACTION_EPSILON
          ? 'charge'
          : net < -ACTION_EPSILON
            ? 'discharge'
            : 'idle';
      const batteryKwh = action === 'idle' ? 0 : clean(Math.abs(net));
      const energyAfter = clean(energyBefore + net);

      hourlyPlan.push({
        hour: h,
        grid_kwh: clean(Math.max(0, raw.grid[h])),
        solar_used_kwh: clean(Math.max(0, raw.solar[h])),
        battery_action: action,
        battery_kwh: batteryKwh,
        battery_energy_after_kwh: energyAfter,
      });

      energyBefore = energyAfter;
    }

    const totalGridKwh = clean(
      hourlyPlan.reduce((sum, entry) => sum + entry.grid_kwh, 0),
    );
    const totalCostBdt = clean(
      hourlyPlan.reduce(
        (sum, entry, index) =>
          sum + entry.grid_kwh * hours[index].tariff_bdt_per_kwh,
        0,
      ),
    );
    const peakGridKwh = clean(
      Math.max(...hourlyPlan.map((entry) => entry.grid_kwh)),
    );

    return { hourlyPlan, totalGridKwh, totalCostBdt, peakGridKwh };
  }
}
