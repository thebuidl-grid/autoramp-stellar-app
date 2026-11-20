import {
  Controller,
  Post,
  Get,
  Query,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  BadGatewayException,
  Logger,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as multer from 'multer';
import { CloudinaryService, CLOUDINARY_HOSTS } from './cloudinary.service';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  assertPublicHttpUrl,
  UnsafeUrlError,
} from '../../common/security/ssrf.util';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Identifies the real file type from its first bytes. A client-supplied filename or MIME type is
 * not trusted: only PDF, PNG, JPEG and WebP documents are accepted.
 */
export function sniffAllowedFileType(
  buf: Buffer,
): 'pdf' | 'png' | 'jpeg' | 'webp' | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class CloudinaryController {
  private readonly logger = new Logger(CloudinaryController.name);

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('/')
  @ApiOperation({
    summary: 'Upload a PDF or image (max 10 MB, login required)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Returns secure_url' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, fieldSize: 1024 * 1024, files: 1 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }

    const kind = sniffAllowedFileType(file.buffer);
    if (!kind) {
      throw new BadRequestException(
        'Unsupported file type. Upload a PDF, PNG, JPEG or WebP file.',
      );
    }

    // The detected type decides how it is stored, never the client's filename.
    const secureUrl = await this.cloudinaryService.uploadBuffer(
      file.buffer,
      'uploads',
      kind === 'pdf' ? 'document.pdf' : `image.${kind}`,
    );
    return { secure_url: secureUrl };
  }

  @Get('signed-url')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Generate a signed Cloudinary URL for a document (admin only)',
  })
  @ApiQuery({ name: 'url', description: 'Cloudinary document URL' })
  @ApiQuery({
    name: 'expires_in',
    required: false,
    description: 'Seconds until expiry (default 3600, max 3600)',
  })
  @ApiResponse({ status: 200, description: 'Returns signed_url' })
  async getSignedUrl(
    @Query('url') url: string,
    @Query('expires_in') expiresIn?: string,
  ) {
    if (!url) {
      throw new BadRequestException('Missing url query parameter');
    }
    await this.assertCloudinaryUrl(url);

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

    const requested = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const ttl = Number.isFinite(requested)
      ? Math.min(3600, Math.max(60, requested))
      : 3600;

    const signedUrl = this.cloudinaryService.generateSignedUrl(publicId, {
      resource_type: resourceType,
      type,
      version,
      expires_in: ttl,
    });

    return { signed_url: signedUrl };
  }

  @Get('proxy')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Proxy-fetch a Cloudinary document through the backend (admin only)',
  })
  @ApiQuery({ name: 'url', description: 'Cloudinary document URL' })
  @ApiResponse({ status: 200, description: 'Streams the document content' })
  async proxyDocument(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new BadRequestException('Missing url query parameter');
    }
    await this.assertCloudinaryUrl(url);

    try {
      const { buffer, contentType } =
        await this.cloudinaryService.downloadResource(url);

      res.set({
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        // KYC documents: never cache them in shared caches or CDNs.
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment',
      });

      res.end(buffer);
    } catch (err: any) {
      if (err instanceof UnsafeUrlError) {
        throw new BadRequestException('Only Cloudinary URLs are supported');
      }
      this.logger.error(`Document proxy failed: ${err?.message ?? err}`);
      throw new BadGatewayException('Failed to fetch document');
    }
  }

  /** Only https URLs on Cloudinary's own hosts (not merely containing the text "cloudinary.com"). */
  private async assertCloudinaryUrl(url: string): Promise<void> {
    try {
      await assertPublicHttpUrl(url, { allowedHostSuffixes: CLOUDINARY_HOSTS });
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        throw new BadRequestException('Only Cloudinary URLs are supported');
      }
      throw err;
    }
  }
}
