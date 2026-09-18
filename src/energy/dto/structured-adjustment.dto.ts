import { ApiProperty } from '@nestjs/swagger';

class HoursFieldDto {
  @ApiProperty({
    type: [Number],
    example: [13, 14],
    description:
      'Unique hours 0-23 in ascending order. Start-inclusive, end-exclusive.',
  })
  hours: number[];
}

export class SolarReductionAdjustmentDto extends HoursFieldDto {
  @ApiProperty({
    example: 0.2,
    minimum: 0,
    maximum: 1,
    description: 'Usable solar fraction remaining (an 80% reduction is 0.2).',
  })
  factor: number;
}

export class MinimumBatteryReserveAdjustmentDto extends HoursFieldDto {
  @ApiProperty({
    example: 120,
    description:
      'Battery energy must stay at or above this level for the listed hours.',
  })
  minimum_energy_kwh: number;
}

export class NoChargeWindowAdjustmentDto extends HoursFieldDto {}

export class NoDischargeWindowAdjustmentDto extends HoursFieldDto {}

export class MaxGridWindowAdjustmentDto extends HoursFieldDto {
  @ApiProperty({
    example: 150,
    description: 'Grid import may not exceed this amount in the listed hours.',
  })
  max_grid_kwh: number;
}
