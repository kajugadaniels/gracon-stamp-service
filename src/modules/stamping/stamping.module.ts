import { Module } from '@nestjs/common';
import { StampingController } from './stamping.controller';
import { StampingService } from './stamping.service';
import { InstitutionModule } from '../institution/institution.module';
import { InstitutionKeysModule } from '../institution-keys/institution-keys.module';
import { InstitutionCertificatesModule } from '../institution-certificates/institution-certificates.module';

@Module({
  imports: [
    InstitutionModule,
    InstitutionKeysModule,
    InstitutionCertificatesModule,
  ],
  controllers: [StampingController],
  providers: [StampingService],
})
export class StampingModule {}
