import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddMemberDto {
  @ApiProperty({
    description: 'userId of the verified user to add as a member',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Role title — e.g. "Finance Director", "CEO"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roleTitle: string;

  @ApiPropertyOptional({
    description: 'Grant institution admin privileges to this member',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  hasAdminRole?: boolean;
}
