import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FullDayHours } from '../../common/validation/full-day-hours.validator';
import { BatteryDto } from './battery.dto';
import { HourEntryDto } from './hour-entry.dto';

export class OptimizeEnergyRequestDto {
  @ApiProperty({
    example: 'GRID-101',
    description: 'Unique synthetic scenario identifier.',
  })
  @IsString()
  @IsNotEmpty()
  scenario_id: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 3,
    example: [
      'Solar output will drop to about 20% from 1 PM to 3 PM.',
      'Do not charge the battery between 2 PM and 4 PM.',
      'The cafeteria menu changes tomorrow.',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/\S/, {
    each: true,
    message: 'each operator note must be non-empty and not whitespace only',
  })
  operator_notes: string[];

  @ApiProperty({
    type: [HourEntryDto],
    description: 'Exactly 24 hourly entries, hours 0 through 23.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HourEntryDto)
  @FullDayHours()
  hours: HourEntryDto[];

  @ApiProperty({ type: BatteryDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => BatteryDto)
  battery: BatteryDto;
}
