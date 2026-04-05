import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsIn,
  Min,
  Max,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  APP_ENV: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1024)
  @Max(65535)
  APP_PORT: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must match api/auth/' })
  JWT_SECRET: string;

  @IsString()
  @MinLength(32, {
    message: 'INSTITUTION_ENCRYPTION_SECRET must match api/institution/',
  })
  INSTITUTION_ENCRYPTION_SECRET: string;

  @IsString()
  @MinLength(32, {
    message: 'SIGNATURE_ENCRYPTION_SECRET must match api/signature/',
  })
  SIGNATURE_ENCRYPTION_SECRET: string;

  @IsString()
  @IsNotEmpty()
  FRONTEND_URL: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(
      `[Stamp Service] Environment validation failed:\n${messages}`,
    );
  }
  return validated;
}
