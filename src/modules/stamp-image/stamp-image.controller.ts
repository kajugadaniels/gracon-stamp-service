import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { StampImageService } from './stamp-image.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Stamp Image')
@ApiBearerAuth()
@Controller('stamp/image')
export class StampImageController {
  constructor(private readonly service: StampImageService) {}

  @Post(':institutionId/upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: undefined }))
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Upload institutional stamp image — institution admin only',
  })
  upload(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.upload(institutionId, user.userId, file);
  }

  @Get(':institutionId')
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({
    summary: 'Get current stamp image as presigned S3 URL (1hr)',
  })
  get(@Param('institutionId') institutionId: string) {
    return this.service.get(institutionId);
  }

  @Delete(':institutionId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'institutionId', type: String })
  @ApiOperation({ summary: 'Soft-delete stamp image — institution admin only' })
  delete(
    @CurrentUser() user: RequestUser,
    @Param('institutionId') institutionId: string,
  ) {
    return this.service.delete(institutionId, user.userId);
  }
}
