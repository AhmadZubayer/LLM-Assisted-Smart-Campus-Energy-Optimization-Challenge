const TOLERANCE = 0.01;
const HOURS_IN_DAY = 24;

export interface ReferenceHour {
  hour: number;
  demand_kwh: number;
  solar_kwh: number;
  tariff_bdt_per_kwh: number;
}

export interface ReferenceBattery {
  capacity_kwh: number;
  initial_energy_kwh: number;
  minimum_energy_kwh: number;
  max_charge_kwh_per_hour: number;
  max_discharge_kwh_per_hour: number;
}

export interface ReferenceAdjustment {
  hours?: number[];
  factor?: number;
  minimum_energy_kwh?: number;
  max_grid_kwh?: number;
}

export interface ReferenceDirective {
  note_index: number;
  applies: boolean;
  directive_type: string;
  structured_adjustment: ReferenceAdjustment | null;
  explanation?: string;
}

export interface ReferencePlanEntry {
  hour: number;
  grid_kwh: number;
  solar_used_kwh: number;
  battery_action: string;
  battery_kwh: number;
  battery_energy_after_kwh: number;
}

export interface ReplayResult {
  valid: boolean;
  violations: string[];
  recalculatedTotalGridKwh: number;
  recalculatedTotalCostBdt: number;
  recalculatedPeakGridKwh: number;
}

export interface OptimizeEnergyResponseBody {
  scenario_id: string;
  directive_interpretation: ReferenceDirective[];
  hourly_plan: ReferencePlanEntry[];
  total_grid_kwh: number;
  total_cost_bdt: number;
  peak_grid_kwh: number;
  plan_summary: string;
}

export interface ErrorResponseBody {
  error: { code: string; message: string; request_id: string };
}

export function replayAgainstReference(
  hours: ReferenceHour[],
  battery: ReferenceBattery,
  referenceDirectives: ReferenceDirective[],
  plan: ReferencePlanEntry[],
): ReplayResult {
  const violations: string[] = [];
  const sortedHours = [...hours].sort((a, b) => a.hour - b.hour);

  const effectiveSolar = sortedHours.map((h) => h.solar_kwh);
  const minReserve = sortedHours.map(() => battery.minimum_energy_kwh);
  const maxCharge = sortedHours.map(() => battery.max_charge_kwh_per_hour);
  const maxDischarge = sortedHours.map(
    () => battery.max_discharge_kwh_per_hour,
  );
  const maxGrid: (number | null)[] = sortedHours.map(() => null);

  for (const directive of referenceDirectives) {
    if (!directive.applies || !directive.structured_adjustment) {
      continue;
    }
    const adjustment = directive.structured_adjustment;
    const affectedHours = adjustment.hours ?? [];

    switch (directive.directive_type) {
      case 'solar_reduction':
        for (const h of affectedHours) {
          effectiveSolar[h] = Math.min(
            effectiveSolar[h],
            sortedHours[h].solar_kwh * (adjustment.factor ?? 1),
          );
        }
        break;
      case 'minimum_battery_reserve':
        for (const h of affectedHours) {
          minReserve[h] = Math.max(
            minReserve[h],
            adjustment.minimum_energy_kwh ?? 0,
          );
        }
        break;
      case 'no_charge_window':
        for (const h of affectedHours) {
          maxCharge[h] = 0;
        }
        break;
      case 'no_discharge_window':
        for (const h of affectedHours) {
          maxDischarge[h] = 0;
        }
        break;
      case 'max_grid_window':
        for (const h of affectedHours) {
          const cap = adjustment.max_grid_kwh ?? Infinity;
          maxGrid[h] = maxGrid[h] === null ? cap : Math.min(maxGrid[h], cap);
        }
        break;
      default:
        break;
    }
  }

  if (plan.length !== HOURS_IN_DAY) {
    violations.push(
      `plan must contain ${HOURS_IN_DAY} entries, got ${plan.length}`,
    );
  }

  let energyBefore = battery.initial_energy_kwh;
  for (let h = 0; h < HOURS_IN_DAY; h++) {
    const entry = plan.find((e) => e.hour === h);
    if (!entry) {
      violations.push(`missing plan entry for hour ${h}`);
      continue;
    }

    if (entry.solar_used_kwh > effectiveSolar[h] + TOLERANCE) {
      violations.push(
        `hour ${h}: solar_used_kwh (${entry.solar_used_kwh}) exceeds effective solar (${effectiveSolar[h]})`,
      );
    }

    let charge = 0;
    let discharge = 0;
    if (entry.battery_action === 'charge') {
      charge = entry.battery_kwh;
      if (charge > maxCharge[h] + TOLERANCE) {
        violations.push(
          `hour ${h}: charge (${charge}) exceeds allowed rate/window (${maxCharge[h]})`,
        );
      }
    } else if (entry.battery_action === 'discharge') {
      discharge = entry.battery_kwh;
      if (discharge > maxDischarge[h] + TOLERANCE) {
        violations.push(
          `hour ${h}: discharge (${discharge}) exceeds allowed rate/window (${maxDischarge[h]})`,
        );
      }
    } else if (entry.battery_action !== 'idle') {
      violations.push(
        `hour ${h}: unknown battery_action ${entry.battery_action}`,
      );
    }

    const supplied = entry.grid_kwh + entry.solar_used_kwh + discharge;
    const demanded = sortedHours[h].demand_kwh + charge;
    if (Math.abs(supplied - demanded) > TOLERANCE) {
      violations.push(
        `hour ${h}: energy balance violated (${supplied} != ${demanded})`,
      );
    }

    const expectedEnergyAfter = energyBefore + charge - discharge;
    if (
      Math.abs(expectedEnergyAfter - entry.battery_energy_after_kwh) > TOLERANCE
    ) {
      violations.push(
        `hour ${h}: battery_energy_after_kwh inconsistent with the declared action`,
      );
    }
    if (entry.battery_energy_after_kwh < minReserve[h] - TOLERANCE) {
      violations.push(
        `hour ${h}: battery_energy_after_kwh (${entry.battery_energy_after_kwh}) below reserve (${minReserve[h]})`,
      );
    }
    if (entry.battery_energy_after_kwh > battery.capacity_kwh + TOLERANCE) {
      violations.push(`hour ${h}: battery_energy_after_kwh exceeds capacity`);
    }

    const gridCap = maxGrid[h];
    if (gridCap !== null && entry.grid_kwh > gridCap + TOLERANCE) {
      violations.push(
        `hour ${h}: grid_kwh (${entry.grid_kwh}) exceeds active max_grid_window (${gridCap})`,
      );
    }

    energyBefore = entry.battery_energy_after_kwh;
  }

  if (Math.abs(energyBefore - battery.initial_energy_kwh) > TOLERANCE) {
    violations.push(
      `final battery energy (${energyBefore}) does not equal initial energy (${battery.initial_energy_kwh})`,
    );
  }

  const recalculatedTotalGridKwh = plan.reduce((sum, e) => sum + e.grid_kwh, 0);
  const recalculatedTotalCostBdt = plan.reduce((sum, e) => {
    const hourInfo = sortedHours.find((h) => h.hour === e.hour);
    return sum + e.grid_kwh * (hourInfo?.tariff_bdt_per_kwh ?? 0);
  }, 0);
  const recalculatedPeakGridKwh =
    plan.length > 0 ? Math.max(...plan.map((e) => e.grid_kwh)) : 0;

  return {
    valid: violations.length === 0,
    violations,
    recalculatedTotalGridKwh,
    recalculatedTotalCostBdt,
    recalculatedPeakGridKwh,
  };
}

export function compareInterpretations(
  actual: ReferenceDirective[],
  expected: ReferenceDirective[],
): { matches: boolean; differences: string[] } {
  const differences: string[] = [];
  if (actual.length !== expected.length) {
    differences.push(
      `expected ${expected.length} entries, got ${actual.length}`,
    );
  }

  const byIndex = new Map(actual.map((entry) => [entry.note_index, entry]));

  for (const ref of expected) {
    const found = byIndex.get(ref.note_index);
    if (!found) {
      differences.push(
        `note_index ${ref.note_index}: missing from actual output`,
      );
      continue;
    }
    if (found.applies !== ref.applies) {
      differences.push(
        `note_index ${ref.note_index}: applies mismatch (expected ${ref.applies}, got ${found.applies})`,
      );
    }
    if (found.directive_type !== ref.directive_type) {
      differences.push(
        `note_index ${ref.note_index}: directive_type mismatch (expected ${ref.directive_type}, got ${found.directive_type})`,
      );
    }

    const expectedAdjustment = ref.structured_adjustment;
    const actualAdjustment = found.structured_adjustment;
    if (expectedAdjustment === null || actualAdjustment === null) {
      if (expectedAdjustment !== actualAdjustment) {
        differences.push(
          `note_index ${ref.note_index}: structured_adjustment null-ness mismatch`,
        );
      }
      continue;
    }

    if (
      JSON.stringify(expectedAdjustment.hours) !==
      JSON.stringify(actualAdjustment.hours)
    ) {
      differences.push(
        `note_index ${ref.note_index}: hours mismatch (expected ${JSON.stringify(expectedAdjustment.hours)}, got ${JSON.stringify(actualAdjustment.hours)})`,
      );
    }
    for (const key of [
      'factor',
      'minimum_energy_kwh',
      'max_grid_kwh',
    ] as const) {
      const expectedValue = expectedAdjustment[key];
      if (expectedValue === undefined) {
        continue;
      }
      const actualValue = actualAdjustment[key];
      if (
        typeof actualValue !== 'number' ||
        Math.abs(actualValue - expectedValue) > TOLERANCE
      ) {
        differences.push(
          `note_index ${ref.note_index}: ${key} mismatch (expected ${expectedValue}, got ${actualValue})`,
        );
      }
    }
  }

  return { matches: differences.length === 0, differences };
}
