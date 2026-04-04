import { Module } from '@nestjs/common';
import { InstitutionKeysController } from './institution-keys.controller';
import { InstitutionKeysService } from './institution-keys.service';
import { InstitutionModule } from '../institution/institution.module';

@Module({
  imports: [InstitutionModule],
  controllers: [InstitutionKeysController],
  providers: [InstitutionKeysService],
  exports: [InstitutionKeysService],
})
export class InstitutionKeysModule {}
