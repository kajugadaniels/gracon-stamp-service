import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StampingService } from './stamping.service';
import { StampDocumentDto } from './dto/stamp-document.dto';
import { VerifyStampDto } from './dto/verify-stamp.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Stamping')
@Controller('stamp/stamping')
export class StampingController {
  constructor(private readonly service: StampingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @Throttle({ strict: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Apply a dual-signature institutional stamp — requires full authority chain validation',
  })
  @ApiResponse({
    status: 201,
    description: 'Stamp applied — both signature bytes returned',
  })
  @ApiResponse({
    status: 403,
    description: 'Authority chain validation failed',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing certificate or expired certificate',
  })
  stamp(
    @CurrentUser() user: RequestUser,
    @Body() dto: StampDocumentDto,
    @Req() req: Request,
  ) {
    return this.service.stamp(user.userId, dto, req.ip);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Public() // No auth — third parties must be able to verify without an account
  @ApiOperation({
    summary:
      'Verify a stamp — public endpoint. Checks both institution and user signatures independently.',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification result — both signatures checked independently',
  })
  verify(@Body() dto: VerifyStampDto, @Req() req: Request) {
    return this.service.verify(dto, req.ip);
  }

  @Get('history')
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Get paginated stamp history for the current user' })
  getHistory(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getHistory(user.userId, +page, +limit);
  }

  @Get('history/:stampId')
  @ApiBearerAuth()
  @ApiParam({ name: 'stampId', type: String })
  @ApiOperation({
    summary:
      'Get full stamp record — includes both signature bytes and authority chain',
  })
  getById(@CurrentUser() user: RequestUser, @Param('stampId') stampId: string) {
    return this.service.getStampById(stampId, user.userId);
  }
}
