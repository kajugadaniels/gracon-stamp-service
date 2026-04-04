import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3Service } from '../../common/s3/s3.service';
import { InstitutionService } from '../institution/institution.service';

const ALLOWED_MIME_TYPES = ['image/png', 'image/svg+xml'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class StampImageService {
  private readonly logger = new Logger(StampImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly institutions: InstitutionService,
  ) {}

  async upload(
    institutionId: string,
    requestingUserId: string,
    file: Express.Multer.File,
  ) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PNG and SVG files are accepted.');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File must be smaller than 2MB.');
    }

    const ext = file.mimetype === 'image/svg+xml' ? 'svg' : 'png';
    const s3Key = `stamp-images/${institutionId}/${uuidv4()}.${ext}`;

    await this.s3.upload(s3Key, file.buffer, file.mimetype);

    await this.prisma.institutionStampImage.updateMany({
      where: { institutionId, isActive: true },
      data: { isActive: false },
    });

    const image = await this.prisma.institutionStampImage.create({
      data: {
        institutionId,
        s3Key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        isActive: true,
        uploadedByUserId: requestingUserId,
      },
    });

    return {
      id: image.id,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      createdAt: image.createdAt,
    };
  }

  async get(institutionId: string) {
    const image = await this.prisma.institutionStampImage.findFirst({
      where: { institutionId, isActive: true },
    });

    if (!image)
      throw new NotFoundException(
        'No active stamp image found for this institution.',
      );

    const url = await this.s3.getPresignedUrl(image.s3Key, 3600);
    return {
      id: image.id,
      url,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      expiresIn: 3600,
    };
  }

  async delete(institutionId: string, requestingUserId: string) {
    await this.institutions.assertInstitutionAdmin(
      institutionId,
      requestingUserId,
    );

    const image = await this.prisma.institutionStampImage.findFirst({
      where: { institutionId, isActive: true },
    });

    if (!image) throw new NotFoundException('No active stamp image found.');

    await this.prisma.institutionStampImage.update({
      where: { id: image.id },
      data: { isActive: false },
    });

    return { message: 'Stamp image removed successfully.' };
  }
}
