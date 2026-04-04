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
import { InstitutionCertificatesService } from './institution-certificates.service';
import { IssueInstitutionCertificateDto } from './dto/issue-institution-certificate.dto';
import { RevokeInstitutionCertificateDto } from './dto/revoke-institution-certificate.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Institution Certificates')
@ApiBearerAuth()
@Controller('stamp/certificates')
export class InstitutionCertificatesController {
  constructor(private readonly service: InstitutionCertificatesService) {}

  @Post(':institutionId/issue')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({ summary: 'Issue X.509 institution certificate — admin only' })
  issue(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: IssueInstitutionCertificateDto,
  ) {
    return this.service.issue(institutionId, user.userId, dto);
  }

  @Get(':institutionId/current')
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Get current active institution certificate in PEM format',
  })
  getCurrent(@Param('institutionId') institutionId: string) {
    return this.service.getCurrent(institutionId);
  }

  @Post(':institutionId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Revoke institution certificate — permanent, admin only',
  })
  revoke(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: RevokeInstitutionCertificateDto,
  ) {
    return this.service.revoke(institutionId, user.userId, dto);
  }
}
