import { Module } from '@nestjs/common';
import { StampingController } from './stamping.controller';
import { StampingService } from './stamping.service';

// StampingService reads institution data directly from the shared DB via
// PrismaService — no cross-service module injection required.
@Module({
  controllers: [StampingController],
  providers: [StampingService],
})
export class StampingModule {}
