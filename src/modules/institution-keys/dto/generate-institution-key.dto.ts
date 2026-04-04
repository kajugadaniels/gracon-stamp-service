import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateInstitutionKeyDto {
  @ApiProperty({ enum: ['RSA_2048', 'ED25519'] })
  @IsIn(['RSA_2048', 'ED25519'])
  algorithm: 'RSA_2048' | 'ED25519';
}
