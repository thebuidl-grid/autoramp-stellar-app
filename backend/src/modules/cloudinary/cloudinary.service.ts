import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cloudinary from 'cloudinary';
import * as streamifier from 'streamifier';
import axios from 'axios';

@Injectable()
export class CloudinaryService {
  private readonly cloudinaryV2: typeof cloudinary.v2;

  constructor(private readonly configService: ConfigService) {
    this.cloudinaryV2 = cloudinary.v2;

    const cloudName = this.configService.get<string>('CL_NAME');
    const apiKey = this.configService.get<string>('CL_API_KEY');
    const apiSecret = this.configService.get<string>('CL_API_SECRET');

    this.cloudinaryV2.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn(
        'Cloudinary env vars missing or incomplete. CL_NAME present:',
        !!cloudName,
      );
    }
  }

  generateSignedUrl(
    publicId: string,
    options: {
      resource_type?: string;
      type?: string;
      version?: string;
      expires_in?: number;
    } = {},
  ): string {
    const {
      resource_type = 'image',
      type = 'upload',
      version,
      expires_in = 3600,
    } = options;

    const opts: Record<string, any> = {
      resource_type,
      type,
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + expires_in,
    };

    if (version) {
      opts.version = version.replace(/^v/, '');
    }

    return this.cloudinaryV2.url(publicId, opts);
  }

  generateAuthenticatedUrl(
    publicId: string,
    options: {
      resource_type?: string;
      type?: string;
      version?: string;
    } = {},
  ): string {
    const { resource_type = 'image', type = 'upload', version } = options;

    const opts: Record<string, any> = {
      resource_type,
      type,
      secure: true,
    };

    if (version) {
      opts.version = version.replace(/^v/, '');
    }

    return this.cloudinaryV2.url(publicId, opts);
  }

  async downloadResource(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      return {
        buffer: Buffer.from(response.data),
        contentType:
          response.headers['content-type'] || 'application/octet-stream',
      };
    } catch (err: any) {
      const status = err.response?.status;

      if (
        status === 401 &&
        url.includes('/image/upload/') &&
        url.includes('.pdf')
      ) {
        console.log(
          '[Cloudinary] PDF blocked on image pipeline, falling back to PNG render',
        );

        const pngUrl = url.replace('.pdf', '.png');
        const response = await axios.get(pngUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        return {
          buffer: Buffer.from(response.data),
          contentType: response.headers['content-type'] || 'image/png',
        };
      }

      throw err;
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    folder?: string,
    originalFilename?: string,
  ): Promise<string> {
    const isPdf = originalFilename?.toLowerCase().endsWith('.pdf') ?? false;

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = this.cloudinaryV2.uploader.upload_stream(
          {
            folder,
            resource_type: isPdf ? 'raw' : 'auto',
          },
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          },
        );

        streamifier
          .createReadStream(buffer)
          .pipe(uploadStream)
          .on('error', (err) => reject(err));
      });

      return result.secure_url;
    } catch (err: any) {
      console.error('Cloudinary upload error:', err);
      throw new InternalServerErrorException(
        `Cloudinary upload failed${err && err.message ? `: ${err.message}` : ''}`,
      );
    }
  }
}
