import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { AddMemberDto } from './dto/add-member.dto';
import {
  GrantStampAuthorityDto,
  RevokeStampAuthorityDto,
} from './dto/grant-authority.dto';

@Injectable()
export class InstitutionService {
  private readonly logger = new Logger(InstitutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Institution CRUD ─────────────────────────────────────────────────────

  async create(dto: CreateInstitutionDto, adminId?: string) {
    const existing = await this.prisma.institution.findUnique({
      where: { registrationNumber: dto.registrationNumber },
    });

    if (existing) {
      throw new ConflictException(
        `An institution with registration number "${dto.registrationNumber}" already exists.`,
      );
    }

    return this.prisma.institution.create({
      data: {
        name: dto.name,
        type: dto.type,
        registrationNumber: dto.registrationNumber,
        country: dto.country ?? 'RW',
        isActive: true,
        createdByAdminId: adminId,
      },
    });
  }

  async findById(institutionId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      include: {
        members: {
          where: { isActive: true },
          select: {
            userId: true,
            roleTitle: true,
            stampAuthority: true,
            hasAdminRole: true,
          },
        },
        certificates: {
          where: { isRevoked: false },
          select: {
            id: true,
            subjectCN: true,
            notAfter: true,
            isRevoked: true,
          },
        },
      },
    });

    if (!institution) throw new NotFoundException('Institution not found.');
    return institution;
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const total = await this.prisma.institution.count({
      where: { isActive: true },
    });
    const items = await this.prisma.institution.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        type: true,
        registrationNumber: true,
        country: true,
        createdAt: true,
      },
    });
    return { total, page, limit, items };
  }

  // ─── Membership management ────────────────────────────────────────────────

  async addMember(
    institutionId: string,
    dto: AddMemberDto,
    requestingUserId: string,
  ) {
    await this.assertInstitutionAdmin(institutionId, requestingUserId);

    // Confirm target user exists and is ID-verified
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, isIdVerified: true, isActive: true },
    });

    if (!targetUser) throw new NotFoundException('User not found.');
    if (!targetUser.isIdVerified) {
      throw new BadRequestException(
        'Only ID-verified users can be added as institution members.',
      );
    }

    const existingMembership = await this.prisma.institutionMember.findUnique({
      where: { userId_institutionId: { userId: dto.userId, institutionId } },
    });

    if (existingMembership?.isActive) {
      throw new ConflictException(
        'This user is already an active member of this institution.',
      );
    }

    if (existingMembership && !existingMembership.isActive) {
      // Reactivate existing membership
      return this.prisma.institutionMember.update({
        where: { id: existingMembership.id },
        data: {
          isActive: true,
          roleTitle: dto.roleTitle,
          hasAdminRole: dto.hasAdminRole ?? false,
        },
      });
    }

    return this.prisma.institutionMember.create({
      data: {
        userId: dto.userId,
        institutionId,
        roleTitle: dto.roleTitle,
        hasAdminRole: dto.hasAdminRole ?? false,
        stampAuthority: false, // never granted at add-time — requires explicit authority grant
        isActive: true,
        addedByUserId: requestingUserId,
      },
    });
  }

  async removeMember(
    institutionId: string,
    targetUserId: string,
    requestingUserId: string,
  ) {
    await this.assertInstitutionAdmin(institutionId, requestingUserId);

    const membership = await this.prisma.institutionMember.findUnique({
      where: { userId_institutionId: { userId: targetUserId, institutionId } },
    });

    if (!membership?.isActive)
      throw new NotFoundException('Active membership not found.');

    return this.prisma.institutionMember.update({
      where: { id: membership.id },
      data: { isActive: false, stampAuthority: false, resolutionId: null },
    });
  }

  // ─── Stamp authority management ───────────────────────────────────────────

  async grantStampAuthority(
    institutionId: string,
    dto: GrantStampAuthorityDto,
    requestingUserId: string,
  ) {
    await this.assertInstitutionAdmin(institutionId, requestingUserId);

    // Confirm resolution exists and is active
    const resolution = await this.prisma.authorityResolution.findFirst({
      where: { id: dto.resolutionId, institutionId, isActive: true },
    });

    if (!resolution) {
      throw new NotFoundException(
        'Resolution not found or is no longer active. Create or reactivate a resolution first.',
      );
    }

    if (resolution.validUntil && resolution.validUntil < new Date()) {
      throw new BadRequestException(
        'This resolution has expired. Create a new one.',
      );
    }

    const membership = await this.prisma.institutionMember.findUnique({
      where: { userId_institutionId: { userId: dto.userId, institutionId } },
    });

    if (!membership?.isActive) {
      throw new NotFoundException('Active membership not found for this user.');
    }

    return this.prisma.institutionMember.update({
      where: { id: membership.id },
      data: { stampAuthority: true, resolutionId: dto.resolutionId },
    });
  }

  async revokeStampAuthority(
    institutionId: string,
    dto: RevokeStampAuthorityDto,
    requestingUserId: string,
  ) {
    await this.assertInstitutionAdmin(institutionId, requestingUserId);

    const membership = await this.prisma.institutionMember.findUnique({
      where: { userId_institutionId: { userId: dto.userId, institutionId } },
    });

    if (!membership?.isActive || !membership.stampAuthority) {
      throw new NotFoundException(
        'No active stamp authority found for this user.',
      );
    }

    return this.prisma.institutionMember.update({
      where: { id: membership.id },
      data: { stampAuthority: false, resolutionId: null },
    });
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async assertInstitutionAdmin(institutionId: string, userId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution?.isActive)
      throw new NotFoundException('Institution not found.');

    const membership = await this.prisma.institutionMember.findUnique({
      where: { userId_institutionId: { userId, institutionId } },
    });

    if (!membership?.isActive || !membership.hasAdminRole) {
      throw new ForbiddenException(
        'You must be an institution admin to perform this action.',
      );
    }
  }

  async assertStampAuthority(institutionId: string, userId: string) {
    const membership = await this.prisma.institutionMember.findUnique({
      where: { userId_institutionId: { userId, institutionId } },
    });

    if (!membership?.isActive) {
      throw new ForbiddenException(
        'You are not an active member of this institution.',
      );
    }

    if (!membership.stampAuthority) {
      throw new ForbiddenException(
        'You do not have stamp authority in this institution.',
      );
    }

    if (!membership.resolutionId) {
      throw new ForbiddenException(
        'No authority resolution is linked to your stamp permission.',
      );
    }

    // Confirm the resolution backing this authority is still active
    const resolution = await this.prisma.authorityResolution.findUnique({
      where: { id: membership.resolutionId },
    });

    if (!resolution?.isActive) {
      throw new ForbiddenException(
        'The authority resolution backing your stamp permission has been revoked.',
      );
    }

    if (resolution.validUntil && resolution.validUntil < new Date()) {
      throw new ForbiddenException(
        'The authority resolution backing your permission has expired.',
      );
    }

    return { membership, resolution };
  }
}
