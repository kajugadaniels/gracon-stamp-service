import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InstitutionService } from '../institution/institution.service';
import { InstitutionKeysService } from '../institution-keys/institution-keys.service';
import { InstitutionCertificatesService } from '../institution-certificates/institution-certificates.service';
import { StampDocumentDto } from './dto/stamp-document.dto';
import { VerifyStampDto } from './dto/verify-stamp.dto';

@Injectable()
export class StampingService {
  private readonly logger = new Logger(StampingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly institutions: InstitutionService,
    private readonly institutionKeys: InstitutionKeysService,
    private readonly institutionCerts: InstitutionCertificatesService,
  ) {}

  async stamp(userId: string, dto: StampDocumentDto, ipAddress?: string) {
    const { institutionId, documentHash, documentName } = dto;

    // ── Step 1: Full authority chain validation ──────────────────────────────
    // This gate runs BEFORE any key is decrypted.
    // If any check fails the operation is blocked here — no crypto ever runs.
    const { membership, resolution } =
      await this.institutions.assertStampAuthority(institutionId, userId);

    // ── Step 2: Both certificates must be active and valid ───────────────────
    const institutionCert =
      await this.institutionCerts.getActiveOrThrow(institutionId);

    const personalCert = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
    });

    if (!personalCert) {
      throw new BadRequestException(
        'You need a valid personal certificate in api/signature/ before stamping. ' +
          'Issue one there first.',
      );
    }

    if (personalCert.notAfter < new Date()) {
      throw new BadRequestException(
        'Your personal certificate has expired. Renew it in api/signature/.',
      );
    }

    // ── Step 3: Institution signature ────────────────────────────────────────
    let institutionPrivateKey: string | null =
      await this.institutionKeys.decryptActivePrivateKey(institutionId);

    let institutionSignatureBytes: string;

    try {
      const hashBuf = Buffer.from(documentHash, 'hex');
      institutionSignatureBytes = crypto
        .sign('SHA256', hashBuf, institutionPrivateKey)
        .toString('base64');
    } finally {
      // Always discard — even if an error occurs
      institutionPrivateKey = null;
    }

    // ── Step 4: User personal signature ─────────────────────────────────────
    // The user's personal private key lives in the personal_key_pairs table
    // and is encrypted with SIGNATURE_ENCRYPTION_SECRET from api/signature/.
    // The stamp service reads the encrypted key and decrypts it using the
    // same derivation pattern — both services share the same database.
    // NOTE: In production, both services use their respective HSM clusters.
    const personalKeyPair = await this.prisma.personalKeyPair.findFirst({
      where: { userId, isActive: true },
    });

    if (!personalKeyPair?.privateKeyEncrypted) {
      throw new BadRequestException(
        'No active personal key pair found. Generate one in api/signature/.',
      );
    }

    // Derive the user key using STAMP_ENCRYPTION_SECRET — this only works if
    // api/signature/ and api/stamp/ share the same SIGNATURE_ENCRYPTION_SECRET.
    // Document this cross-service dependency clearly in both .env.example files.
    // This is intentional: the user's private key must be the same key
    // whose certificate third parties will verify against.
    const { deriveUserKey, decryptPrivateKey } =
      await import('../institution-keys/helpers/institution-key-crypto.helper');

    // Re-derive using the SIGNATURE_ENCRYPTION_SECRET (from api/signature/)
    // This env var must be set in api/stamp/ .env matching api/signature/
    const signatureSecret = this.getSignatureEncryptionSecret();
    const userDerivedKey = deriveUserKey(signatureSecret, userId);

    let userPrivateKey: string | null;

    try {
      userPrivateKey = decryptPrivateKey(
        personalKeyPair.privateKeyEncrypted,
        userDerivedKey,
      );
    } catch {
      throw new BadRequestException(
        'Could not decrypt personal key. Ensure SIGNATURE_ENCRYPTION_SECRET matches api/signature/.',
      );
    }

    let userSignatureBytes: string;

    try {
      const hashBuf = Buffer.from(documentHash, 'hex');
      userSignatureBytes = crypto
        .sign('SHA256', hashBuf, userPrivateKey)
        .toString('base64');
    } finally {
      userPrivateKey = null;
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

    // ── Verify institution signature ──────────────────────────────────────────
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

    // ── Verify user personal signature ────────────────────────────────────────
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
        ? 'Institution signature is invalid or document has been tampered with.'
        : 'User signature is invalid or document has been tampered with.';
    }

    // ── Log verification attempt ──────────────────────────────────────────────
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

    if (!stamp) throw new BadRequestException('Stamp record not found.');

    // Only the user who stamped or institution admins can view full details
    if (stamp.userId !== requestingUserId) {
      await this.institutions.assertInstitutionAdmin(
        stamp.institutionId,
        requestingUserId,
      );
    }

    return stamp;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private getSignatureEncryptionSecret(): string {
    const secret = process.env.SIGNATURE_ENCRYPTION_SECRET;
    if (!secret) {
      throw new BadRequestException(
        'SIGNATURE_ENCRYPTION_SECRET is not configured in api/stamp/. ' +
          'Add it to .env — it must match the value in api/signature/.',
      );
    }
    return secret;
  }
}
