import { Module } from '@nestjs/common';
import { InstitutionCertificatesController } from './institution-certificates.controller';
import { InstitutionCertificatesService } from './institution-certificates.service';
import { InstitutionModule } from '../institution/institution.module';
import { InstitutionKeysModule } from '../institution-keys/institution-keys.module';

@Module({
  imports: [InstitutionModule, InstitutionKeysModule],
  controllers: [InstitutionCertificatesController],
  providers: [InstitutionCertificatesService],
  exports: [InstitutionCertificatesService],
})
export class InstitutionCertificatesModule {}
