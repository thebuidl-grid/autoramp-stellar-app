import { BadGatewayException, BadRequestException } from '@nestjs/common';
import {
  CloudinaryController,
  sniffAllowedFileType,
} from './cloudinary.controller';

const PDF = Buffer.from('%PDF-1.7\n...');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(4),
]);

describe('sniffAllowedFileType', () => {
  it('recognises the four allowed types by content', () => {
    expect(sniffAllowedFileType(PDF)).toBe('pdf');
    expect(sniffAllowedFileType(PNG)).toBe('png');
    expect(sniffAllowedFileType(JPEG)).toBe('jpeg');
    expect(sniffAllowedFileType(WEBP)).toBe('webp');
  });

  it.each([
    ['an HTML page', Buffer.from('<html><script>alert(1)</script></html>')],
    ['a Windows executable', Buffer.from('MZ\x90\x00')],
    ['a shell script', Buffer.from('#!/bin/sh\nrm -rf /')],
    [
      'an SVG (can carry script)',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
    ],
    ['a zip', Buffer.from('PK\x03\x04')],
    ['empty', Buffer.alloc(0)],
    [
      'a RIFF that is not WebP',
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVE'),
      ]),
    ],
  ])('rejects %s', (_l, buf) => {
    expect(sniffAllowedFileType(buf)).toBeNull();
  });
});

describe('CloudinaryController', () => {
  let service: {
    uploadBuffer: jest.Mock;
    downloadResource: jest.Mock;
    generateSignedUrl: jest.Mock;
  };
  let ctl: CloudinaryController;
  const res = () => {
    const r: any = { set: jest.fn(), end: jest.fn() };
    return r;
  };

  beforeEach(() => {
    service = {
      uploadBuffer: jest
        .fn()
        .mockResolvedValue('https://res.cloudinary.com/x/raw/upload/a.pdf'),
      downloadResource: jest
        .fn()
        .mockResolvedValue({
          buffer: Buffer.from('doc'),
          contentType: 'application/pdf',
        }),
      generateSignedUrl: jest
        .fn()
        .mockReturnValue('https://res.cloudinary.com/signed'),
    };
    ctl = new CloudinaryController(service as any);
  });

  describe('upload', () => {
    const file = (buffer: Buffer, originalname = 'x') =>
      ({ buffer, originalname }) as any;

    it('stores a valid PDF and returns its URL', async () => {
      await expect(ctl.upload(file(PDF))).resolves.toEqual({
        secure_url: expect.stringContaining('cloudinary.com'),
      });
      expect(service.uploadBuffer).toHaveBeenCalledWith(
        PDF,
        'uploads',
        'document.pdf',
      );
    });

    it('decides the type from the content, not the client filename', async () => {
      await ctl.upload(file(PNG, 'invoice.pdf')); // a PNG named .pdf is stored as an image
      expect(service.uploadBuffer).toHaveBeenCalledWith(
        PNG,
        'uploads',
        'image.png',
      );
    });

    it.each([
      [
        'a script renamed to .pdf',
        Buffer.from('<script>alert(1)</script>'),
        'evil.pdf',
      ],
      ['an executable', Buffer.from('MZ\x90\x00'), 'a.exe'],
    ])('rejects %s', async (_l, buf, name) => {
      await expect(ctl.upload(file(buf, name))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.uploadBuffer).not.toHaveBeenCalled();
    });

    it('rejects a missing file', async () => {
      await expect(ctl.upload(undefined as any)).rejects.toThrow(
        'No file provided',
      );
    });
  });

  describe('proxy (was an open SSRF: only checked that the URL contained "cloudinary.com")', () => {
    it.each([
      'https://evil.com/?x=cloudinary.com',
      'https://evil.com/cloudinary.com/a.pdf',
      'https://cloudinary.com.evil.com/a.pdf',
      'https://evilcloudinary.com/a.pdf',
      'http://169.254.169.254/latest/meta-data/?x=cloudinary.com',
      'http://127.0.0.1:3000/admin?cloudinary.com',
      'https://res.cloudinary.com@evil.com/a.pdf',
      'file:///etc/passwd#cloudinary.com',
      'ftp://res.cloudinary.com/a.pdf',
      'not a url',
    ])('refuses %s without fetching anything', async (url) => {
      await expect(ctl.proxyDocument(url, res())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.downloadResource).not.toHaveBeenCalled();
    });

    it('streams a real Cloudinary document with private, no-store caching', async () => {
      const r = res();
      await ctl.proxyDocument(
        'https://res.cloudinary.com/demo/raw/upload/v1/kyc.pdf',
        r,
      );
      expect(service.downloadResource).toHaveBeenCalledWith(
        'https://res.cloudinary.com/demo/raw/upload/v1/kyc.pdf',
      );
      expect(r.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Cache-Control': 'private, no-store' }),
      );
      expect(r.end).toHaveBeenCalled();
    });

    it('does not leak upstream error details', async () => {
      service.downloadResource.mockRejectedValue(
        new Error('connect ECONNREFUSED 10.0.0.9:443 secret-internal-detail'),
      );
      const err = await ctl
        .proxyDocument(
          'https://res.cloudinary.com/demo/raw/upload/v1/kyc.pdf',
          res(),
        )
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify(err.getResponse())).not.toContain(
        'secret-internal-detail',
      );
    });

    it('requires a url', async () => {
      await expect(ctl.proxyDocument('', res())).rejects.toThrow('Missing url');
    });
  });

  describe('signed-url', () => {
    it('refuses non-Cloudinary hosts', async () => {
      await expect(
        ctl.getSignedUrl('https://evil.com/upload/v1/x.pdf?cloudinary.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.generateSignedUrl).not.toHaveBeenCalled();
    });

    it('signs for a real URL and clamps the lifetime to 1 hour max, 1 minute min', async () => {
      const url = 'https://res.cloudinary.com/demo/image/private/v1/kyc/a.pdf';
      await ctl.getSignedUrl(url, '999999');
      expect(service.generateSignedUrl.mock.calls[0][1].expires_in).toBe(3600);
      await ctl.getSignedUrl(url, '1');
      expect(service.generateSignedUrl.mock.calls[1][1].expires_in).toBe(60);
      await ctl.getSignedUrl(url, 'abc');
      expect(service.generateSignedUrl.mock.calls[2][1].expires_in).toBe(3600);
    });
  });
});
