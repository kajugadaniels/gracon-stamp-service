import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstitutionService } from './institution.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { AddMemberDto } from './dto/add-member.dto';
import {
  GrantStampAuthorityDto,
  RevokeStampAuthorityDto,
} from './dto/grant-authority.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Institutions')
@ApiBearerAuth()
@Controller('stamp/institutions')
export class InstitutionController {
  constructor(private readonly service: InstitutionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Create an institution (platform admin action)' })
  @ApiResponse({ status: 201, description: 'Institution created' })
  @ApiResponse({
    status: 409,
    description: 'Registration number already exists',
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateInstitutionDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active institutions (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.service.findAll(+page, +limit);
  }

  @Get(':institutionId')
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Get institution details including members and certificates',
  })
  findById(@Param('institutionId') institutionId: string) {
    return this.service.findById(institutionId);
  }

  @Post(':institutionId/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary:
      'Add a verified user as an institution member (institution admin only)',
  })
  addMember(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.service.addMember(institutionId, dto, user.userId);
  }

  @Delete(':institutionId/members/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'institutionId', type: String })
  @ApiParam({ name: 'targetUserId', type: String })
  @ApiOperation({
    summary: 'Remove a member from the institution (institution admin only)',
  })
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.service.removeMember(institutionId, targetUserId, user.userId);
  }

  @Post(':institutionId/authority/grant')
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 5, ttl: 600_000 } })
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Grant stamp authority to a member — requires a valid resolution',
  })
  grantAuthority(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: GrantStampAuthorityDto,
  ) {
    return this.service.grantStampAuthority(institutionId, dto, user.userId);
  }

  @Post(':institutionId/authority/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({ summary: 'Revoke stamp authority from a member' })
  revokeAuthority(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @Body() dto: RevokeStampAuthorityDto,
  ) {
    return this.service.revokeStampAuthority(institutionId, dto, user.userId);
  }
}
