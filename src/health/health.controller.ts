import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

class HealthResponseDto {
  status: 'ok';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe used by the judging harness.' })
  @ApiOkResponse({
    description: 'Service is ready.',
    schema: { example: { status: 'ok' } },
  })
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
