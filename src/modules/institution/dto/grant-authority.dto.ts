import { IsUUID, IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrantStampAuthorityDto {
  @ApiProperty({
    description: 'userId of the institution member to receive stamp authority',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'resolutionId that backs this authority grant' })
  @IsUUID()
  resolutionId: string;
}

export class RevokeStampAuthorityDto {
  @ApiProperty({
    description: 'userId of the member whose stamp authority to revoke',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Reason for revocation — required for audit trail',
  })
  @IsString()
  @MinLength(10)
  reason: string;
}
