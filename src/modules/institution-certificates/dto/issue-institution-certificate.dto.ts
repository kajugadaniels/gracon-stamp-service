import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class IssueInstitutionCertificateDto {
  @ApiPropertyOptional({
    description: 'Validity in years. Default: 2.',
    default: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  validityYears?: number = 2;
}
