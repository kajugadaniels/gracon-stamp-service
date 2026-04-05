import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { StampDocumentDto } from './dto/stamp-document.dto';
import { VerifyStampDto } from './dto/verify-stamp.dto';
import {
  deriveInstitutionKey,
  decryptInstitutionPrivateKey,
} from './helpers/institution-crypto.helper';
import {
  deriveUserKey,
  decryptPersonalPrivateKey,
} from './helpers/personal-crypto.helper';

@Injectable()
export class StampingService {
  private readonly logger = new Logger(StampingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async stamp(userId: string, dto: StampDocumentDto, ipAddress?: string) {
    const { institutionId, documentHash, documentName } = dto;

    // ── Step 1: Full authority chain validation ──────────────────────────────
    // This runs entirely via shared DB reads — no HTTP call to api/institution/
    const { membership, resolution } = await this.validateAuthorityChain(
      userId,
      institutionId,
    );

    // ── Step 2: Both certificates must exist, be valid, not expired ──────────
    const institutionCert = await this.getActiveInstitutionCert(institutionId);
    const personalCert = await this.getActivePersonalCert(userId);

    // ── Step 3: Institution signature ────────────────────────────────────────
    const institutionKeyPair = await this.prisma.institutionKeyPair.findFirst({
      where: { institutionId, isActive: true },
    });
    if (!institutionKeyPair?.privateKeyEncrypted) {
      throw new BadRequestException(
        'Institution has no active key pair. Generate one in api/institution/ first.',
      );
    }

    const instSecret = this.config.get<string>('INSTITUTION_ENCRYPTION_SECRET');
    const instDerived = deriveInstitutionKey(instSecret, institutionId);

    let instPrivateKey: string | null = decryptInstitutionPrivateKey(
      institutionKeyPair.privateKeyEncrypted,
      instDerived,
    );

    let institutionSignatureBytes: string;
    try {
      institutionSignatureBytes = crypto
        .sign('SHA256', Buffer.from(documentHash, 'hex'), instPrivateKey)
        .toString('base64');
    } finally {
      instPrivateKey = null; // Always discard
    }

    // ── Step 4: User personal signature ─────────────────────────────────────
    const personalKeyPair = await this.prisma.personalKeyPair.findFirst({
      where: { userId, isActive: true },
    });
    if (!personalKeyPair?.privateKeyEncrypted) {
      throw new BadRequestException(
        'You have no active personal key pair. Generate one in api/signature/ first.',
      );
    }

    const sigSecret = this.config.get<string>('SIGNATURE_ENCRYPTION_SECRET');
    const userDerived = deriveUserKey(sigSecret, userId);

    let userPrivateKey: string | null = decryptPersonalPrivateKey(
      personalKeyPair.privateKeyEncrypted,
      userDerived,
    );

    let userSignatureBytes: string;
    try {
      userSignatureBytes = crypto
        .sign('SHA256', Buffer.from(documentHash, 'hex'), userPrivateKey)
        .toString('base64');
    } finally {
      userPrivateKey = null; // Always discard
    }

    // ── Step 5: Write immutable stamp record ─────────────────────────────────
    const stamp = await this.prisma.institutionStamp.create({
      data: {
        institutionId,
        userId,
        memberId: membership.id,
        resolutionId: resolution.id,
        institutionCertificateId: institutionCert.id,
        personalCertificateId: personalCert.id,
        documentName,
        documentHash,
        institutionSignatureBytes,
        userSignatureBytes,
        roleTitle: membership.roleTitle,
      },
    });

    return {
      stampId: stamp.id,
      institutionSignatureBytes: stamp.institutionSignatureBytes,
      userSignatureBytes: stamp.userSignatureBytes,
      institutionCertificateId: stamp.institutionCertificateId,
      personalCertificateId: stamp.personalCertificateId,
      roleTitle: stamp.roleTitle,
      authorityResolutionId: stamp.resolutionId,
      documentHash: stamp.documentHash,
      documentName: stamp.documentName,
      stampedAt: stamp.stampedAt,
    };
  }

  async verify(dto: VerifyStampDto, ipAddress?: string) {
    const {
      documentHash,
      institutionSignatureBytes,
      userSignatureBytes,
      institutionId,
      userId,
    } = dto;

    let institutionSigValid = false;
    let userSigValid = false;
    let institutionCertId: string | undefined;
    let personalCertId: string | undefined;
    let failReason: string | undefined;

    // Verify institution signature
    const institutionCert = await this.prisma.institutionCertificate.findFirst({
      where: { institutionId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!institutionCert) {
      failReason = 'No active institution certificate found.';
    } else if (institutionCert.notAfter < new Date()) {
      failReason = 'Institution certificate has expired.';
    } else {
      try {
        institutionCertId = institutionCert.id;
        institutionSigValid = crypto.verify(
          'SHA256',
          Buffer.from(documentHash, 'hex'),
          institutionCert.certificatePem,
          Buffer.from(institutionSignatureBytes, 'base64'),
        );
      } catch {
        institutionSigValid = false;
      }
    }

    // Verify user personal signature
    const personalCert = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!personalCert) {
      failReason =
        failReason ?? 'No active personal certificate found for this user.';
    } else if (personalCert.notAfter < new Date()) {
      failReason = failReason ?? 'Personal certificate has expired.';
    } else {
      try {
        personalCertId = personalCert.id;
        userSigValid = crypto.verify(
          'SHA256',
          Buffer.from(documentHash, 'hex'),
          personalCert.certificatePem,
          Buffer.from(userSignatureBytes, 'base64'),
        );
      } catch {
        userSigValid = false;
      }
    }

    const result = institutionSigValid && userSigValid;
    if (!result && !failReason) {
      failReason = !institutionSigValid
        ? 'Institution signature is invalid — document may have been tampered with.'
        : 'User signature is invalid — document may have been tampered with.';
    }

    await this.prisma.institutionStampVerification.create({
      data: {
        institutionCertificateId: institutionCertId ?? 'unknown',
        personalCertificateId: personalCertId ?? 'unknown',
        documentHash,
        institutionSigValid,
        userSigValid,
        result,
        failReason,
        ipAddress,
      },
    });

    return {
      valid: result,
      institutionSignatureValid: institutionSigValid,
      userSignatureValid: userSigValid,
      ...(result
        ? {
            institution: {
              name: institutionCert?.subjectCN,
              certificateId: institutionCertId,
              notAfter: institutionCert?.notAfter,
            },
            signer: {
              name: personalCert?.subjectCN,
              certificateId: personalCertId,
              notAfter: personalCert?.notAfter,
            },
          }
        : { reason: failReason }),
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const total = await this.prisma.institutionStamp.count({
      where: { userId },
    });
    const items = await this.prisma.institutionStamp.findMany({
      where: { userId },
      orderBy: { stampedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        documentName: true,
        documentHash: true,
        institutionId: true,
        roleTitle: true,
        stampedAt: true,
      },
    });
    return { total, page, limit, items };
  }

  async getStampById(stampId: string, requestingUserId: string) {
    const stamp = await this.prisma.institutionStamp.findUnique({
      where: { id: stampId },
    });
    if (!stamp) throw new NotFoundException('Stamp record not found.');
    if (stamp.userId !== requestingUserId) {
      throw new ForbiddenException(
        'You can only view stamp records that belong to you.',
      );
    }
    return stamp;
  }

  // ─── Private: authority chain validation (DB reads only) ─────────────────

  private async validateAuthorityChain(userId: string, institutionId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution?.isActive) {
      throw new NotFoundException('Institution not found or is inactive.');
    }

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
        'You do not have stamp authority in this institution. ' +
          'Contact your institution admin.',
      );
    }
    if (!membership.resolutionId) {
      throw new ForbiddenException(
        'No authority resolution is linked to your stamp permission.',
      );
    }

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
        'The authority resolution backing your stamp permission has expired.',
      );
    }

    return { membership, resolution };
  }

  private async getActiveInstitutionCert(institutionId: string) {
    const cert = await this.prisma.institutionCertificate.findFirst({
      where: { institutionId, isRevoked: false },
    });
    if (!cert) {
      throw new BadRequestException(
        'This institution has no active certificate. ' +
          'Issue one in api/institution/ first.',
      );
    }
    if (cert.notAfter < new Date()) {
      throw new BadRequestException(
        'Institution certificate has expired. ' +
          'Rotate the key pair and re-issue the certificate in api/institution/.',
      );
    }
    return cert;
  }

  private async getActivePersonalCert(userId: string) {
    const cert = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
    });
    if (!cert) {
      throw new BadRequestException(
        'You have no active personal certificate. ' +
          'Issue one in api/signature/ first.',
      );
    }
    if (cert.notAfter < new Date()) {
      throw new BadRequestException(
        'Your personal certificate has expired. ' +
          'Rotate your key pair and re-issue in api/signature/.',
      );
    }
    return cert;
  }
}
