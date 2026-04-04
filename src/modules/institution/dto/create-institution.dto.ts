import {
  IsString,
  IsNotEmpty,
  IsIn,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstitutionDto {
  @ApiProperty({ description: 'Official full legal name of the institution' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ['COMPANY', 'NGO', 'GOVERNMENT', 'OTHER'] })
  @IsIn(['COMPANY', 'NGO', 'GOVERNMENT', 'OTHER'])
  type: 'COMPANY' | 'NGO' | 'GOVERNMENT' | 'OTHER';

  @ApiProperty({
    description:
      'Official RDB or equivalent registration number — must be unique',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  registrationNumber: string;

  @ApiPropertyOptional({ default: 'RW' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}
