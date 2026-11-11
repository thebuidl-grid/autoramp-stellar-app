import {
  Controller,
  Post,
  Get,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as multer from 'multer';
import axios from 'axios';
import { CloudinaryService } from './cloudinary.service';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Uploads')
@Controller('uploads')
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('/')
  @ApiOperation({ summary: 'Upload file to Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Returns secure_url' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024, fieldSize: 50 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }

    const secureUrl = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      'uploads',
      file.originalname,
    );
    return { secure_url: secureUrl };
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Generate a signed Cloudinary URL for a document' })
  @ApiQuery({ name: 'url', description: 'Cloudinary document URL' })
  @ApiQuery({
    name: 'expires_in',
    required: false,
    description: 'Seconds until expiry (default 3600)',
  })
  @ApiResponse({ status: 200, description: 'Returns signed_url' })
  async getSignedUrl(
    @Query('url') url: string,
    @Query('expires_in') expiresIn?: string,
  ) {
    if (!url) {
      throw new BadRequestException('Missing url query parameter');
    }

    const parts = url.split('/');
    const uploadIndex = parts.findIndex(
      (p) => p === 'upload' || p === 'private' || p === 'authenticated',
    );

    if (uploadIndex === -1) {
      throw new BadRequestException('Invalid Cloudinary URL');
    }

    let startIndex = uploadIndex + 1;

    let version: string | undefined;
    if (
      parts[startIndex]?.startsWith('v') &&
      !isNaN(parseInt(parts[startIndex].substring(1)))
    ) {
      version = parts[startIndex];
      startIndex++;
    }

    const publicIdWithExt = parts.slice(startIndex).join('/');
    const publicId = publicIdWithExt.split('.')[0];
    const resourceType = url.includes('/raw/')
      ? 'raw'
      : url.includes('/video/')
        ? 'video'
        : 'image';
    const type = url.includes('/authenticated/')
      ? 'authenticated'
      : url.includes('/private/')
        ? 'private'
        : 'upload';

    const signedUrl = this.cloudinaryService.generateSignedUrl(publicId, {
      resource_type: resourceType,
      type,
      version,
      expires_in: expiresIn ? parseInt(expiresIn, 10) : 3600,
    });

    return { signed_url: signedUrl };
  }

  @Get('proxy')
  @ApiOperation({
    summary: 'Proxy-fetch a Cloudinary document through the backend',
  })
  @ApiQuery({ name: 'url', description: 'Cloudinary document URL' })
  @ApiResponse({ status: 200, description: 'Streams the document content' })
  async proxyDocument(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new BadRequestException('Missing url query parameter');
    }

    if (!url.includes('cloudinary.com')) {
      throw new BadRequestException('Only Cloudinary URLs are supported');
    }

    try {
      const { buffer, contentType } =
        await this.cloudinaryService.downloadResource(url);

      res.set({
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=3600',
      });

      res.end(buffer);
    } catch (err: any) {
      console.error('[Cloudinary Proxy] Error:', err.message);
      res.status(500).json({
        error: 'Failed to fetch document',
        details: err.message,
      });
    }
  }
}
