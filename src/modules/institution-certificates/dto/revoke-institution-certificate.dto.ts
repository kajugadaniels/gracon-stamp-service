import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeInstitutionCertificateDto {
  @ApiProperty({ description: 'Reason for revocation' })
  @IsString()
  @MinLength(10)
  reason: string;
}
