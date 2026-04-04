import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InstitutionService } from '../institution/institution.service';
import {
  CreateResolutionDto,
  RevokeResolutionDto,
} from './dto/create-resolution.dto';

@Injectable()
export class AuthorityService {
  private readonly logger = new Logger(AuthorityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly institutions: InstitutionService,
  ) {}

  async create(
    institutionId: string,
    dto: CreateResolutionDto,
    requestingUserId: string,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    const validFrom = new Date(dto.validFrom);
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    if (validUntil && validUntil <= validFrom) {
      throw new BadRequestException('validUntil must be after validFrom.');
    }

    return this.prisma.authorityResolution.create({
      data: {
        institutionId,
        title: dto.title,
        scope: dto.scope,
        grantedBy: dto.grantedBy,
        isActive: true,
        validFrom,
        validUntil,
      },
    });
  }

  async findByInstitution(institutionId: string, activeOnly = true) {
    return this.prisma.authorityResolution.findMany({
      where: { institutionId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(
    institutionId: string,
    resolutionId: string,
    dto: RevokeResolutionDto,
    requestingUserId: string,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    const resolution = await this.prisma.authorityResolution.findFirst({
      where: { id: resolutionId, institutionId, isActive: true },
    });

    if (!resolution)
      throw new NotFoundException('Active resolution not found.');

    // Revoking a resolution removes stamp authority from all members using it
    await this.prisma.institutionMember.updateMany({
      where: { institutionId, resolutionId, isActive: true },
      data: { stampAuthority: false, resolutionId: null },
    });

    return this.prisma.authorityResolution.update({
      where: { id: resolutionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: dto.reason,
      },
    });
  }
}
