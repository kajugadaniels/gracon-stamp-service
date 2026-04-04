import { Module } from '@nestjs/common';
import { AuthorityController } from './authority.controller';
import { AuthorityService } from './authority.service';
import { InstitutionModule } from '../institution/institution.module';

@Module({
  imports: [InstitutionModule],
  controllers: [AuthorityController],
  providers: [AuthorityService],
  exports: [AuthorityService],
})
export class AuthorityModule {}
