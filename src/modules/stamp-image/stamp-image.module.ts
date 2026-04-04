import { Module } from '@nestjs/common';
import { StampImageController } from './stamp-image.controller';
import { StampImageService } from './stamp-image.service';
import { InstitutionModule } from '../institution/institution.module';

@Module({
  imports: [InstitutionModule],
  controllers: [StampImageController],
  providers: [StampImageService],
})
export class StampImageModule {}
