import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { DirectiveInterpretation } from '../interfaces/directive.types';
import { DirectiveApplicationService } from './directive-application.service';

function buildHours(): HourEntryDto[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    demand_kwh: 100,
    solar_kwh: 100,
    tariff_bdt_per_kwh: 10,
  }));
}

function buildBattery(): BatteryDto {
  return {
    capacity_kwh: 500,
    initial_energy_kwh: 200,
    minimum_energy_kwh: 50,
    max_charge_kwh_per_hour: 100,
    max_discharge_kwh_per_hour: 100,
  };
}

describe('DirectiveApplicationService', () => {
  const service = new DirectiveApplicationService();

  it('returns the base battery/solar values unchanged when no directive applies', () => {
    const noOp: DirectiveInterpretation = {
      note_index: 0,
      applies: false,
      directive_type: 'no_op',
      structured_adjustment: null,
      explanation: 'x',
    };
    const constraints = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [noOp],
    );

    expect(constraints.effectiveSolarKwh).toEqual(Array(24).fill(100));
    expect(constraints.minReserveKwh).toEqual(Array(24).fill(50));
    expect(constraints.maxChargeKwh).toEqual(Array(24).fill(100));
    expect(constraints.maxDischargeKwh).toEqual(Array(24).fill(100));
    expect(constraints.maxGridKwh).toEqual(Array(24).fill(null));
  });

  it('reduces effective solar by the factor for the listed hours only', () => {
    const directive: DirectiveInterpretation = {
      note_index: 0,
      applies: true,
      directive_type: 'solar_reduction',
      structured_adjustment: { hours: [13, 14], factor: 0.2 },
      explanation: 'x',
    };
    const constraints = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [directive],
    );

    expect(constraints.effectiveSolarKwh[13]).toBeCloseTo(20);
    expect(constraints.effectiveSolarKwh[14]).toBeCloseTo(20);
    expect(constraints.effectiveSolarKwh[12]).toBe(100);
  });

  it('takes the more restrictive (lower) solar factor when two directives overlap an hour', () => {
    const first: DirectiveInterpretation = {
      note_index: 0,
      applies: true,
      directive_type: 'solar_reduction',
      structured_adjustment: { hours: [13], factor: 0.5 },
      explanation: 'x',
    };
    const second: DirectiveInterpretation = {
      note_index: 1,
      applies: true,
      directive_type: 'solar_reduction',
      structured_adjustment: { hours: [13], factor: 0.2 },
      explanation: 'y',
    };
    const constraints = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [first, second],
    );
    expect(constraints.effectiveSolarKwh[13]).toBeCloseTo(20);

    const reversed = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [second, first],
    );
    expect(reversed.effectiveSolarKwh[13]).toBeCloseTo(20);
  });

  it('raises the reserve to the maximum of the base and every applicable directive', () => {
    const directive: DirectiveInterpretation = {
      note_index: 0,
      applies: true,
      directive_type: 'minimum_battery_reserve',
      structured_adjustment: { hours: [18, 19], minimum_energy_kwh: 120 },
      explanation: 'x',
    };
    const constraints = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [directive],
    );
    expect(constraints.minReserveKwh[18]).toBe(120);
    expect(constraints.minReserveKwh[17]).toBe(50);
  });

  it('zeroes the charge or discharge rate for the listed hours', () => {
    const noCharge: DirectiveInterpretation = {
      note_index: 0,
      applies: true,
      directive_type: 'no_charge_window',
      structured_adjustment: { hours: [14, 15] },
      explanation: 'x',
    };
    const noDischarge: DirectiveInterpretation = {
      note_index: 1,
      applies: true,
      directive_type: 'no_discharge_window',
      structured_adjustment: { hours: [20] },
      explanation: 'y',
    };
    const constraints = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [noCharge, noDischarge],
    );
    expect(constraints.maxChargeKwh[14]).toBe(0);
    expect(constraints.maxChargeKwh[15]).toBe(0);
    expect(constraints.maxChargeKwh[13]).toBe(100);
    expect(constraints.maxDischargeKwh[20]).toBe(0);
  });

  it('takes the minimum grid cap when two max_grid_window directives overlap an hour', () => {
    const first: DirectiveInterpretation = {
      note_index: 0,
      applies: true,
      directive_type: 'max_grid_window',
      structured_adjustment: { hours: [9], max_grid_kwh: 150 },
      explanation: 'x',
    };
    const second: DirectiveInterpretation = {
      note_index: 1,
      applies: true,
      directive_type: 'max_grid_window',
      structured_adjustment: { hours: [9], max_grid_kwh: 90 },
      explanation: 'y',
    };
    const constraints = service.buildEffectiveConstraints(
      buildHours(),
      buildBattery(),
      [first, second],
    );
    expect(constraints.maxGridKwh[9]).toBe(90);
    expect(constraints.maxGridKwh[8]).toBeNull();
  });

  it('never mutates the input hours array', () => {
    const hours = buildHours();
    const snapshot = JSON.stringify(hours);
    const directive: DirectiveInterpretation = {
      note_index: 0,
      applies: true,
      directive_type: 'solar_reduction',
      structured_adjustment: { hours: [0], factor: 0 },
      explanation: 'x',
    };
    service.buildEffectiveConstraints(hours, buildBattery(), [directive]);
    expect(JSON.stringify(hours)).toBe(snapshot);
  });
});
