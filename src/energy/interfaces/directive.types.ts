export const SUPPORTED_DIRECTIVE_TYPES = [
  'solar_reduction',
  'minimum_battery_reserve',
  'no_charge_window',
  'no_discharge_window',
  'max_grid_window',
  'no_op',
] as const;

export type DirectiveType = (typeof SUPPORTED_DIRECTIVE_TYPES)[number];

export interface SolarReductionAdjustment {
  hours: number[];
  factor: number;
}

export interface MinimumBatteryReserveAdjustment {
  hours: number[];
  minimum_energy_kwh: number;
}

export interface NoChargeWindowAdjustment {
  hours: number[];
}

export interface NoDischargeWindowAdjustment {
  hours: number[];
}

export interface MaxGridWindowAdjustment {
  hours: number[];
  max_grid_kwh: number;
}

export type StructuredAdjustment =
  | SolarReductionAdjustment
  | MinimumBatteryReserveAdjustment
  | NoChargeWindowAdjustment
  | NoDischargeWindowAdjustment
  | MaxGridWindowAdjustment
  | null;

interface BaseInterpretation {
  note_index: number;
  explanation: string;
}

export interface NoOpInterpretation extends BaseInterpretation {
  applies: false;
  directive_type: 'no_op';
  structured_adjustment: null;
}

export interface SolarReductionInterpretation extends BaseInterpretation {
  applies: true;
  directive_type: 'solar_reduction';
  structured_adjustment: SolarReductionAdjustment;
}

export interface MinimumBatteryReserveInterpretation extends BaseInterpretation {
  applies: true;
  directive_type: 'minimum_battery_reserve';
  structured_adjustment: MinimumBatteryReserveAdjustment;
}

export interface NoChargeWindowInterpretation extends BaseInterpretation {
  applies: true;
  directive_type: 'no_charge_window';
  structured_adjustment: NoChargeWindowAdjustment;
}

export interface NoDischargeWindowInterpretation extends BaseInterpretation {
  applies: true;
  directive_type: 'no_discharge_window';
  structured_adjustment: NoDischargeWindowAdjustment;
}

export interface MaxGridWindowInterpretation extends BaseInterpretation {
  applies: true;
  directive_type: 'max_grid_window';
  structured_adjustment: MaxGridWindowAdjustment;
}

export type DirectiveInterpretation =
  | NoOpInterpretation
  | SolarReductionInterpretation
  | MinimumBatteryReserveInterpretation
  | NoChargeWindowInterpretation
  | NoDischargeWindowInterpretation
  | MaxGridWindowInterpretation;
