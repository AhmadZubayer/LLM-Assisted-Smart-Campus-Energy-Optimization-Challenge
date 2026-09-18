import { Injectable } from '@nestjs/common';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { EffectiveConstraints } from '../interfaces/effective-constraints.types';
import { DirectiveInterpretation } from '../interfaces/directive.types';

@Injectable()
export class DirectiveApplicationService {
  buildEffectiveConstraints(
    hours: HourEntryDto[],
    battery: BatteryDto,
    interpretations: DirectiveInterpretation[],
  ): EffectiveConstraints {
    const effectiveSolarKwh = hours.map((h) => h.solar_kwh);
    const minReserveKwh = hours.map(() => battery.minimum_energy_kwh);
    const maxChargeKwh = hours.map(() => battery.max_charge_kwh_per_hour);
    const maxDischargeKwh = hours.map(() => battery.max_discharge_kwh_per_hour);
    const maxGridKwh: (number | null)[] = hours.map(() => null);

    for (const interpretation of interpretations) {
      if (!interpretation.applies) {
        continue;
      }

      switch (interpretation.directive_type) {
        case 'solar_reduction': {
          const { hours: affectedHours, factor } =
            interpretation.structured_adjustment;
          for (const hour of affectedHours) {
            const reduced = hours[hour].solar_kwh * factor;
            effectiveSolarKwh[hour] = Math.min(
              effectiveSolarKwh[hour],
              reduced,
            );
          }
          break;
        }
        case 'minimum_battery_reserve': {
          const { hours: affectedHours, minimum_energy_kwh: minimumEnergyKwh } =
            interpretation.structured_adjustment;
          for (const hour of affectedHours) {
            minReserveKwh[hour] = Math.max(
              minReserveKwh[hour],
              minimumEnergyKwh,
            );
          }
          break;
        }
        case 'no_charge_window': {
          for (const hour of interpretation.structured_adjustment.hours) {
            maxChargeKwh[hour] = 0;
          }
          break;
        }
        case 'no_discharge_window': {
          for (const hour of interpretation.structured_adjustment.hours) {
            maxDischargeKwh[hour] = 0;
          }
          break;
        }
        case 'max_grid_window': {
          const { hours: affectedHours, max_grid_kwh: cap } =
            interpretation.structured_adjustment;
          for (const hour of affectedHours) {
            maxGridKwh[hour] =
              maxGridKwh[hour] === null ? cap : Math.min(maxGridKwh[hour], cap);
          }
          break;
        }
      }
    }

    return {
      effectiveSolarKwh,
      minReserveKwh,
      maxChargeKwh,
      maxDischargeKwh,
      maxGridKwh,
    };
  }
}
