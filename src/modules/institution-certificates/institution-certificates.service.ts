import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InstitutionService } from '../institution/institution.service';
import { InstitutionKeysService } from '../institution-keys/institution-keys.service';
import { IssueInstitutionCertificateDto } from './dto/issue-institution-certificate.dto';
import { RevokeInstitutionCertificateDto } from './dto/revoke-institution-certificate.dto';
import { buildInstitutionX509 } from './helpers/x509-institution.helper';

@Injectable()
export class InstitutionCertificatesService {
  private readonly logger = new Logger(InstitutionCertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly institutions: InstitutionService,
    private readonly keys: InstitutionKeysService,
  ) {}

  async issue(
    institutionId: string,
    requestingUserId: string,
    dto: IssueInstitutionCertificateDto,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    const keyPair = await this.prisma.institutionKeyPair.findFirst({
      where: { institutionId, isActive: true },
    });

    if (!keyPair) {
      throw new BadRequestException(
        'Generate an institution key pair first at POST /stamp/keys/:institutionId/generate.',
      );
    }

    const existing = await this.prisma.institutionCertificate.findFirst({
      where: { institutionId, isRevoked: false },
    });

    if (existing && existing.notAfter > new Date()) {
      throw new ConflictException(
        'An active institution certificate already exists. Revoke it or rotate keys to replace it.',
      );
    }

    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found.');
    }

    // Decrypt private key momentarily — discard immediately after signing
    let privateKeyPem: string | null =
      await this.keys.decryptActivePrivateKey(institutionId);

    const result = buildInstitutionX509(
      { institutionName: institution.name, institutionId },
      keyPair.publicKey,
      privateKeyPem,
      dto.validityYears ?? 2,
    );

    // CRITICAL: discard immediately
    privateKeyPem = null;

    const certificate = await this.prisma.institutionCertificate.create({
      data: {
        institutionId,
        keyPairId: keyPair.id,
        serialNumber: result.serialNumber,
        subjectCN: result.subjectCN,
        subjectO: 'ID Verification Platform',
        subjectOU: 'Institutional Certificate',
        subjectC: 'RW',
        subjectInstId: institutionId,
        notBefore: result.notBefore,
        notAfter: result.notAfter,
        certificatePem: result.certificatePem,
        isRevoked: false,
        issuedByAdminId: requestingUserId,
      },
    });

    return {
      id: certificate.id,
      serialNumber: certificate.serialNumber,
      subjectCN: certificate.subjectCN,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      certificatePem: certificate.certificatePem,
    };
  }

  async getCurrent(institutionId: string) {
    const cert = await this.prisma.institutionCertificate.findFirst({
      where: { institutionId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!cert)
      throw new NotFoundException('No active institution certificate found.');

    const now = new Date();
    const expired = cert.notAfter < now;

    return {
      id: cert.id,
      serialNumber: cert.serialNumber,
      subjectCN: cert.subjectCN,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      certificatePem: cert.certificatePem,
      isExpired: expired,
      daysRemaining: expired
        ? 0
        : Math.floor((cert.notAfter.getTime() - now.getTime()) / 86_400_000),
    };
  }

  async revoke(
    institutionId: string,
    requestingUserId: string,
    dto: RevokeInstitutionCertificateDto,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    const cert = await this.prisma.institutionCertificate.findFirst({
      where: { institutionId, isRevoked: false },
    });

    if (!cert)
      throw new NotFoundException(
        'No active institution certificate to revoke.',
      );

    await this.prisma.institutionCertificate.update({
      where: { id: cert.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: dto.reason,
      },
    });

    return {
      message: 'Institution certificate revoked.',
      serialNumber: cert.serialNumber,
    };
  }

  // ─── Internal — used by StampingService ──────────────────────────────────

  async getActiveOrThrow(institutionId: string) {
    const cert = await this.prisma.institutionCertificate.findFirst({
      where: { institutionId, isRevoked: false },
    });

    if (!cert)
      throw new BadRequestException(
        'No active institution certificate. Issue one first.',
      );
    if (cert.notAfter < new Date())
      throw new BadRequestException(
        'Institution certificate has expired. Rotate keys and re-issue.',
      );

    return cert;
  }
}
