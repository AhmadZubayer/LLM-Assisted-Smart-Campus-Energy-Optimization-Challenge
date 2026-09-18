import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { BatteryBounds } from '../../common/validation/battery-bounds.validator';

export class BatteryDto {
  @ApiProperty({
    example: 500,
    description: 'Maximum energy the battery can store.',
  })
  @IsNumber()
  @Min(0)
  @BatteryBounds()
  capacity_kwh: number;

  @ApiProperty({
    example: 200,
    description: 'Battery energy at the start of hour 0.',
  })
  @IsNumber()
  @Min(0)
  initial_energy_kwh: number;

  @ApiProperty({
    example: 50,
    description: 'Base reserve level the battery must never go below.',
  })
  @IsNumber()
  @Min(0)
  minimum_energy_kwh: number;

  @ApiProperty({
    example: 100,
    description: 'Maximum energy that may be added in one hour.',
  })
  @IsNumber()
  @Min(0)
  max_charge_kwh_per_hour: number;

  @ApiProperty({
    example: 100,
    description: 'Maximum energy that may be removed in one hour.',
  })
  @IsNumber()
  @Min(0)
  max_discharge_kwh_per_hour: number;
}
