export interface EffectiveConstraints {
  effectiveSolarKwh: number[];
  minReserveKwh: number[];
  maxChargeKwh: number[];
  maxDischargeKwh: number[];
  maxGridKwh: (number | null)[];
}
