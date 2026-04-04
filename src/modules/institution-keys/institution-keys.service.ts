import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InstitutionService } from '../institution/institution.service';
import { GenerateInstitutionKeyDto } from './dto/generate-institution-key.dto';
import {
  deriveInstitutionKey,
  encryptInstitutionPrivateKey,
  decryptInstitutionPrivateKey,
  fingerprintPublicKey,
} from './helpers/institution-key-crypto.helper';

@Injectable()
export class InstitutionKeysService {
  private readonly logger = new Logger(InstitutionKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly institutions: InstitutionService,
  ) {}

  async generate(
    institutionId: string,
    requestingUserId: string,
    dto: GenerateInstitutionKeyDto,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    const existing = await this.prisma.institutionKeyPair.findFirst({
      where: { institutionId, isActive: true },
    });

    if (existing) {
      throw new ConflictException(
        'This institution already has an active key pair. Use /keys/rotate to replace it.',
      );
    }

    const { publicKeyPem, privateKeyPem } = await this.generateKeyPair(
      dto.algorithm,
    );

    const masterSecret = this.config.get<string>('STAMP_ENCRYPTION_SECRET');
    const derivedKey = deriveInstitutionKey(masterSecret, institutionId);
    const privateKeyEncrypted = encryptInstitutionPrivateKey(
      privateKeyPem,
      derivedKey,
    );
    const fingerprint = fingerprintPublicKey(publicKeyPem);

    const keyPair = await this.prisma.institutionKeyPair.create({
      data: {
        institutionId,
        algorithm: dto.algorithm,
        publicKey: publicKeyPem,
        privateKeyEncrypted,
        fingerprint,
        isActive: true,
        generatedByUserId: requestingUserId,
      },
    });

    return {
      id: keyPair.id,
      algorithm: keyPair.algorithm,
      publicKey: keyPair.publicKey,
      fingerprint: keyPair.fingerprint,
      createdAt: keyPair.createdAt,
    };
  }

  async getPublicKey(institutionId: string) {
    const keyPair = await this.prisma.institutionKeyPair.findFirst({
      where: { institutionId, isActive: true },
    });

    if (!keyPair)
      throw new NotFoundException('No active key pair for this institution.');

    return {
      id: keyPair.id,
      algorithm: keyPair.algorithm,
      publicKey: keyPair.publicKey,
      fingerprint: keyPair.fingerprint,
    };
  }

  async rotate(
    institutionId: string,
    requestingUserId: string,
    dto: GenerateInstitutionKeyDto,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    await this.prisma.institutionKeyPair.updateMany({
      where: { institutionId, isActive: true },
      data: { isActive: false },
    });

    await this.prisma.institutionCertificate.updateMany({
      where: { institutionId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'Key rotation',
      },
    });

    return this.generate(institutionId, requestingUserId, dto);
  }

  // ─── Internal — used by StampingService ──────────────────────────────────

  async decryptActivePrivateKey(institutionId: string): Promise<string> {
    const keyPair = await this.prisma.institutionKeyPair.findFirst({
      where: { institutionId, isActive: true },
    });

    if (!keyPair?.privateKeyEncrypted) {
      throw new NotFoundException('No active institution key pair found.');
    }

    const masterSecret = this.config.get<string>('STAMP_ENCRYPTION_SECRET');
    const derivedKey = deriveInstitutionKey(masterSecret, institutionId);
    return decryptInstitutionPrivateKey(
      keyPair.privateKeyEncrypted,
      derivedKey,
    );
  }

  private generateKeyPair(algorithm: 'RSA_2048' | 'ED25519') {
    return new Promise<{ publicKeyPem: string; privateKeyPem: string }>(
      (resolve, reject) => {
        const type = algorithm === 'RSA_2048' ? 'rsa' : 'ed25519';
        const opts =
          algorithm === 'RSA_2048'
            ? {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
              }
            : {
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
              };

        crypto.generateKeyPair(
          type as 'rsa',
          opts as crypto.RSAKeyPairOptions<'pem', 'pem'>,
          (err, pub, priv) => {
            if (err) return reject(err);
            resolve({
              publicKeyPem: pub as unknown as string,
              privateKeyPem: priv as unknown as string,
            });
          },
        );
      },
    );
  }
}
