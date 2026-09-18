import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EnergyController } from './energy.controller';
import { DirectiveApplicationService } from './services/directive-application.service';
import { EnergyOptimizerService } from './services/energy-optimizer.service';
import { EnergyOrchestratorService } from './services/energy-orchestrator.service';
import { GuardrailValidatorService } from './services/guardrail-validator.service';
import { LlmInterpreterService } from './services/llm-interpreter.service';
import { ScheduleFormatterService } from './services/schedule-formatter.service';
import { ScheduleValidatorService } from './services/schedule-validator.service';

@Module({
  imports: [LlmModule],
  controllers: [EnergyController],
  providers: [
    EnergyOrchestratorService,
    LlmInterpreterService,
    GuardrailValidatorService,
    DirectiveApplicationService,
    EnergyOptimizerService,
    ScheduleFormatterService,
    ScheduleValidatorService,
  ],
})
export class EnergyModule {}
