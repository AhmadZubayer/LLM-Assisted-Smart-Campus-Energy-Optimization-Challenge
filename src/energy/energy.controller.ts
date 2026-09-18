import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { OptimizeEnergyRequestDto } from './dto/optimize-energy-request.dto';
import { OptimizeEnergyResponseDto } from './dto/optimize-energy-response.dto';
import { EnergyOrchestratorService } from './services/energy-orchestrator.service';

interface RequestWithId extends Request {
  requestId?: string;
}

@ApiTags('energy')
@Controller()
export class EnergyController {
  constructor(private readonly orchestrator: EnergyOrchestratorService) {}

  @Post('optimize-energy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Interpret operator notes and return a cost-minimizing 24-hour energy schedule.',
    description:
      'Runs LLM interpretation of the operator notes, deterministic guardrails, directive application, and a linear-programming optimizer, then independently replays the result before responding. See the Problem Statement for the full contract.',
  })
  @ApiBody({ type: OptimizeEnergyRequestDto })
  @ApiOkResponse({
    type: OptimizeEnergyResponseDto,
    description: 'A valid, already-replayed 24-hour schedule.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Malformed JSON or a request that fails schema validation.',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponseDto,
    description:
      'A controlled failure interpreting the notes or producing a valid plan.',
  })
  async optimizeEnergy(
    @Body() request: OptimizeEnergyRequestDto,
    @Req() req: RequestWithId,
  ): Promise<OptimizeEnergyResponseDto> {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());
    return this.orchestrator.optimize(
      request,
      req.requestId ?? 'unknown',
      abortController.signal,
    );
  }
}
