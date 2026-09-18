import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { SUPPORTED_DIRECTIVE_TYPES } from '../interfaces/directive.types';
import {
  MaxGridWindowAdjustmentDto,
  MinimumBatteryReserveAdjustmentDto,
  NoChargeWindowAdjustmentDto,
  NoDischargeWindowAdjustmentDto,
  SolarReductionAdjustmentDto,
} from './structured-adjustment.dto';

@ApiExtraModels(
  SolarReductionAdjustmentDto,
  MinimumBatteryReserveAdjustmentDto,
  NoChargeWindowAdjustmentDto,
  NoDischargeWindowAdjustmentDto,
  MaxGridWindowAdjustmentDto,
)
export class DirectiveInterpretationDto {
  @ApiProperty({
    example: 0,
    description: 'Zero-based index of the corresponding operator_notes entry.',
  })
  note_index: number;

  @ApiProperty({
    example: true,
    description:
      'true for every applicable non-no_op directive; false only for no_op.',
  })
  applies: boolean;

  @ApiProperty({ enum: SUPPORTED_DIRECTIVE_TYPES, example: 'solar_reduction' })
  directive_type: (typeof SUPPORTED_DIRECTIVE_TYPES)[number];

  @ApiProperty({
    nullable: true,
    oneOf: [
      { $ref: getSchemaPath(SolarReductionAdjustmentDto) },
      { $ref: getSchemaPath(MinimumBatteryReserveAdjustmentDto) },
      { $ref: getSchemaPath(NoChargeWindowAdjustmentDto) },
      { $ref: getSchemaPath(NoDischargeWindowAdjustmentDto) },
      { $ref: getSchemaPath(MaxGridWindowAdjustmentDto) },
    ],
    description:
      'Shape matches directive_type. null only when directive_type is no_op.',
  })
  structured_adjustment: unknown;

  @ApiProperty({
    example: 'Solar availability is reduced during panel cleaning.',
  })
  explanation: string;
}
