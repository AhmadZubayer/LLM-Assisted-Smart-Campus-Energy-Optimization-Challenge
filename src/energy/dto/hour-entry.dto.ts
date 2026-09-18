import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class HourEntryDto {
  @ApiProperty({
    minimum: 0,
    maximum: 23,
    example: 13,
    description: 'Unique hour of day, 0 through 23.',
  })
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;

  @ApiProperty({
    example: 180,
    description: 'Campus demand that must be supplied in this hour.',
  })
  @IsNumber()
  @Min(0)
  demand_kwh: number;

  @ApiProperty({
    example: 0,
    description:
      'Base solar energy available before operator-note adjustments.',
  })
  @IsNumber()
  @Min(0)
  solar_kwh: number;

  @ApiProperty({
    example: 7,
    description: 'Grid electricity price for this hour.',
  })
  @IsNumber()
  tariff_bdt_per_kwh: number;
}
