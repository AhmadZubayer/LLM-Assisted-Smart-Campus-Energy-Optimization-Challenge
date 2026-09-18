import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({
    example: 'INTERPRETATION_INVALID',
    description: 'Stable machine-readable error code.',
  })
  code: string;

  @ApiProperty({ example: 'Unable to interpret the operator notes.' })
  message: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  request_id: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error: ErrorDetailDto;
}
