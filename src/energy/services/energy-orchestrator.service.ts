import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../common/config/env.validation';
import { RequestDeadline } from '../../common/request-deadline';
import { HourEntryDto } from '../dto/hour-entry.dto';
import { OptimizeEnergyRequestDto } from '../dto/optimize-energy-request.dto';
import { OptimizeEnergyResponseDto } from '../dto/optimize-energy-response.dto';
import { DirectiveInterpretation } from '../interfaces/directive.types';
import { FormattedSchedule } from '../interfaces/solver-result.types';
import { DirectiveApplicationService } from './directive-application.service';
import { EnergyOptimizerService } from './energy-optimizer.service';
import { LlmInterpreterService } from './llm-interpreter.service';
import { ScheduleFormatterService } from './schedule-formatter.service';
import { ScheduleValidatorService } from './schedule-validator.service';

const HOURS_IN_DAY = 24;

@Injectable()
export class EnergyOrchestratorService {
  private readonly logger = new Logger(EnergyOrchestratorService.name);

  constructor(
    private readonly llmInterpreter: LlmInterpreterService,
    private readonly directiveApplication: DirectiveApplicationService,
    private readonly optimizer: EnergyOptimizerService,
    private readonly formatter: ScheduleFormatterService,
    private readonly scheduleValidator: ScheduleValidatorService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async optimize(
    request: OptimizeEnergyRequestDto,
    requestId: string,
    parentSignal: AbortSignal,
  ): Promise<OptimizeEnergyResponseDto> {
    const deadline = new RequestDeadline(
      this.configService.get('REQUEST_TIMEOUT_MS', { infer: true }),
    );
    parentSignal.addEventListener('abort', () => deadline.cancel(), {
      once: true,
    });

    try {
      const hours = this.normalizeHours(request.hours);

      const interpretations = await this.llmInterpreter.interpret(
        request.operator_notes,
        hours,
        request.battery,
        deadline,
      );
      this.logger.debug(
        `[${requestId}] interpreted ${interpretations.length} note(s)`,
      );

      const constraints = this.directiveApplication.buildEffectiveConstraints(
        hours,
        request.battery,
        interpretations,
      );
      const rawSchedule = this.optimizer.solve(
        hours,
        request.battery,
        constraints,
      );
      const formatted = this.formatter.format(
        hours,
        request.battery,
        rawSchedule,
      );

      this.scheduleValidator.validate(
        hours,
        request.battery,
        constraints,
        formatted,
      );
      this.logger.debug(
        `[${requestId}] optimized: cost=${formatted.totalCostBdt} grid=${formatted.totalGridKwh}`,
      );

      return {
        scenario_id: request.scenario_id,
        directive_interpretation: interpretations,
        hourly_plan: formatted.hourlyPlan,
        total_grid_kwh: formatted.totalGridKwh,
        total_cost_bdt: formatted.totalCostBdt,
        peak_grid_kwh: formatted.peakGridKwh,
        plan_summary: this.buildPlanSummary(interpretations, formatted),
      };
    } finally {
      deadline.cancel();
    }
  }

  private normalizeHours(hours: HourEntryDto[]): HourEntryDto[] {
    return [...hours].sort((a, b) => a.hour - b.hour);
  }

  private buildPlanSummary(
    interpretations: DirectiveInterpretation[],
    schedule: FormattedSchedule,
  ): string {
    const appliedCount = interpretations.filter(
      (interpretation) => interpretation.applies,
    ).length;
    const chargeHours = schedule.hourlyPlan.filter(
      (entry) => entry.battery_action === 'charge',
    ).length;
    const dischargeHours = schedule.hourlyPlan.filter(
      (entry) => entry.battery_action === 'discharge',
    ).length;

    const directiveText =
      appliedCount === 0
        ? 'No operator directives affected this schedule'
        : `${appliedCount} of ${interpretations.length} operator note(s) applied to this schedule`;

    return (
      `${directiveText}. Battery charged in ${chargeHours} hour(s) and discharged in ${dischargeHours} hour(s). ` +
      `Total grid cost ${schedule.totalCostBdt.toFixed(2)} BDT across ${HOURS_IN_DAY} hours, ` +
      `peak grid draw ${schedule.peakGridKwh.toFixed(2)} kWh.`
    );
  }
}
