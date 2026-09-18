import { Injectable } from '@nestjs/common';
import solver, { Model, SolveResult } from 'javascript-lp-solver';
import { AppError } from '../../common/errors/application-error';
import { BatteryDto } from '../dto/battery.dto';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { EffectiveConstraints } from '../interfaces/effective-constraints.types';
import { RawSolverSchedule } from '../interfaces/solver-result.types';

const HOURS_IN_DAY = 24;

@Injectable()
export class EnergyOptimizerService {
  solve(
    hours: HourEntryDto[],
    battery: BatteryDto,
    constraints: EffectiveConstraints,
  ): RawSolverSchedule {
    const model = this.buildModel(hours, battery, constraints);
    const solved = solver.Solve(model) as SolveResult;

    if (!solved.feasible || solved.bounded === false) {
      throw new AppError(
        'OPTIMIZATION_FAILED',
        500,
        'No feasible schedule could be found for this scenario.',
        `LP solve returned feasible=${solved.feasible} bounded=${solved.bounded}`,
      );
    }

    return this.extractSchedule(solved);
  }

  private buildModel(
    hours: HourEntryDto[],
    battery: BatteryDto,
    constraints: EffectiveConstraints,
  ): Model {
    const variables: Model['variables'] = {};
    const modelConstraints: Model['constraints'] = {};

    for (let h = 0; h < HOURS_IN_DAY; h++) {
      const gridVar = `g${h}`;
      const solarVar = `s${h}`;
      const chargeVar = `c${h}`;
      const dischargeVar = `d${h}`;
      const energyVar = `e${h}`;
      const balanceRow = `balance${h}`;
      const batteryRow = `batt${h}`;

      variables[gridVar] = {
        cost: hours[h].tariff_bdt_per_kwh,
        [balanceRow]: 1,
      };
      variables[solarVar] = { [balanceRow]: 1, [`solarcap${h}`]: 1 };
      variables[chargeVar] = {
        [balanceRow]: -1,
        [`chargecap${h}`]: 1,
        [batteryRow]: -1,
      };
      variables[dischargeVar] = {
        [balanceRow]: 1,
        [`dischargecap${h}`]: 1,
        [batteryRow]: 1,
      };
      variables[energyVar] = { [`ebound${h}`]: 1, [batteryRow]: 1 };

      if (h > 0) {
        variables[`e${h - 1}`][batteryRow] = -1;
      }

      modelConstraints[balanceRow] = { equal: hours[h].demand_kwh };
      modelConstraints[`solarcap${h}`] = {
        max: constraints.effectiveSolarKwh[h],
      };
      modelConstraints[`chargecap${h}`] = { max: constraints.maxChargeKwh[h] };
      modelConstraints[`dischargecap${h}`] = {
        max: constraints.maxDischargeKwh[h],
      };
      modelConstraints[`ebound${h}`] = {
        min: constraints.minReserveKwh[h],
        max: battery.capacity_kwh,
      };
      modelConstraints[batteryRow] = {
        equal: h === 0 ? battery.initial_energy_kwh : 0,
      };

      const gridCap = constraints.maxGridKwh[h];
      if (gridCap !== null) {
        variables[gridVar][`gridcap${h}`] = 1;
        modelConstraints[`gridcap${h}`] = { max: gridCap };
      }
    }

    modelConstraints.finalNeutrality = { equal: battery.initial_energy_kwh };
    variables[`e${HOURS_IN_DAY - 1}`].finalNeutrality = 1;

    return {
      optimize: 'cost',
      opType: 'min',
      constraints: modelConstraints,
      variables,
    };
  }

  private extractSchedule(solved: SolveResult): RawSolverSchedule {
    const grid: number[] = [];
    const solarUsed: number[] = [];
    const charge: number[] = [];
    const discharge: number[] = [];

    for (let h = 0; h < HOURS_IN_DAY; h++) {
      grid.push(this.readVariable(solved, `g${h}`));
      solarUsed.push(this.readVariable(solved, `s${h}`));
      charge.push(this.readVariable(solved, `c${h}`));
      discharge.push(this.readVariable(solved, `d${h}`));
    }

    return { grid, solar: solarUsed, charge, discharge };
  }

  private readVariable(solved: SolveResult, name: string): number {
    const value = solved[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
