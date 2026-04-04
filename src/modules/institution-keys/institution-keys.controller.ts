import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstitutionKeysService } from './institution-keys.service';
import { GenerateInstitutionKeyDto } from './dto/generate-institution-key.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Institution Keys')
@ApiBearerAuth()
@Controller('stamp/keys')
export class InstitutionKeysController {
  constructor(private readonly service: InstitutionKeysService) {}

  @Post(':institutionId/generate')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { limit: 3, ttl: 600_000 } })
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary:
      'Generate institution key pair — admin only, returns public key only',
  })
  generate(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: GenerateInstitutionKeyDto,
  ) {
    return this.service.generate(institutionId, user.userId, dto);
  }

  @Get(':institutionId/public')
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({ summary: 'Get institution public key in PEM format' })
  getPublicKey(@Param('institutionId') institutionId: string) {
    return this.service.getPublicKey(institutionId);
  }

  @Post(':institutionId/rotate')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { limit: 2, ttl: 600_000 } })
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Rotate institution key pair — revokes current certificate',
  })
  rotate(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: GenerateInstitutionKeyDto,
  ) {
    return this.service.rotate(institutionId, user.userId, dto);
  }
}
