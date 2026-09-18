import { ApiProperty } from '@nestjs/swagger';

export class HourlyPlanEntryDto {
  @ApiProperty({ minimum: 0, maximum: 23, example: 13 })
  hour: number;

  @ApiProperty({
    example: 45.5,
    description: 'Non-negative grid energy purchased in this hour.',
  })
  grid_kwh: number;

  @ApiProperty({
    example: 34,
    description:
      'Solar energy used in this hour; cannot exceed effective solar.',
  })
  solar_used_kwh: number;

  @ApiProperty({ enum: ['charge', 'discharge', 'idle'], example: 'idle' })
  battery_action: 'charge' | 'discharge' | 'idle';

  @ApiProperty({
    example: 0,
    description: 'Non-negative magnitude of the battery action. 0 when idle.',
  })
  battery_kwh: number;

  @ApiProperty({
    example: 180,
    description: 'Battery energy immediately after completing this hour.',
  })
  battery_energy_after_kwh: number;
}
