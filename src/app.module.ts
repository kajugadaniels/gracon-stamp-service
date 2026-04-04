import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { validateEnv } from './common/config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { S3Module } from './common/s3/s3.module';
import { AuthModule } from './modules/auth/auth.module';
import { InstitutionModule } from './modules/institution/institution.module';
import { AuthorityModule } from './modules/authority/authority.module';
import { StampImageModule } from './modules/stamp-image/stamp-image.module';
import { InstitutionKeysModule } from './modules/institution-keys/institution-keys.module';
import { InstitutionCertificatesModule } from './modules/institution-certificates/institution-certificates.module';
import { StampingModule } from './modules/stamping/stamping.module';

// Feature modules registered per step below

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([
      { name: 'general', ttl: 60_000, limit: 60 },
      { name: 'auth', ttl: 60_000, limit: 5 },
      { name: 'strict', ttl: 600_000, limit: 10 },
    ]),
    PrismaModule,
    S3Module,
    AuthModule,
    InstitutionModule,
    AuthorityModule,
    StampImageModule,
    InstitutionKeysModule,
    InstitutionCertificatesModule,
    StampingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
