import { IsString, IsHexadecimal, Length, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyStampDto {
  @ApiProperty({
    description: 'SHA-256 hex hash of the document being verified',
  })
  @IsHexadecimal()
  @Length(64, 64)
  documentHash: string;

  @ApiProperty({
    description: 'Base64 institution signature bytes from stamp response',
  })
  @IsString()
  institutionSignatureBytes: string;

  @ApiProperty({
    description: 'Base64 user signature bytes from stamp response',
  })
  @IsString()
  userSignatureBytes: string;

  @ApiProperty({ description: 'institutionId of the institution that stamped' })
  @IsUUID()
  institutionId: string;

  @ApiProperty({
    description: 'userId of the individual who performed the stamp',
  })
  @IsUUID()
  userId: string;
}
