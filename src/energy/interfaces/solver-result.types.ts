export type BatteryAction = 'charge' | 'discharge' | 'idle';

export interface RawSolverSchedule {
  grid: number[];
  solar: number[];
  charge: number[];
  discharge: number[];
}

export interface HourlyScheduleEntry {
  hour: number;
  grid_kwh: number;
  solar_used_kwh: number;
  battery_action: BatteryAction;
  battery_kwh: number;
  battery_energy_after_kwh: number;
}

export interface FormattedSchedule {
  hourlyPlan: HourlyScheduleEntry[];
  totalGridKwh: number;
  totalCostBdt: number;
  peakGridKwh: number;
}
