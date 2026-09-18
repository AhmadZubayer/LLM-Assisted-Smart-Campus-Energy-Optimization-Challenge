import { ApiProperty } from '@nestjs/swagger';
import { DirectiveInterpretationDto } from './directive-interpretation.dto';
import { HourlyPlanEntryDto } from './hourly-plan-entry.dto';

export class OptimizeEnergyResponseDto {
  @ApiProperty({
    example: 'GRID-101',
    description: 'Echoes the request scenario_id unchanged.',
  })
  scenario_id: string;

  @ApiProperty({
    type: [DirectiveInterpretationDto],
    description: 'One entry per operator note, in note_index order.',
  })
  directive_interpretation: DirectiveInterpretationDto[];

  @ApiProperty({
    type: [HourlyPlanEntryDto],
    description: 'Exactly 24 entries, one per hour 0 through 23.',
  })
  hourly_plan: HourlyPlanEntryDto[];

  @ApiProperty({
    example: 3120.5,
    description: 'Sum of grid_kwh across all 24 hours.',
  })
  total_grid_kwh: number;

  @ApiProperty({
    example: 38365,
    description: 'Calculated total grid electricity cost.',
  })
  total_cost_bdt: number;

  @ApiProperty({
    example: 210,
    description: 'Maximum hourly grid_kwh in the returned plan.',
  })
  peak_grid_kwh: number;

  @ApiProperty({
    example:
      'Battery charged during low-tariff early hours and discharged during the evening peak while honoring the solar-cleaning reduction.',
  })
  plan_summary: string;
}
