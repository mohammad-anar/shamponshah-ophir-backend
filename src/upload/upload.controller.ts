import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve, basename } from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';

const uploadDir = resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const ALLOWED_CHAT_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
};

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const cleanName = basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(cleanName) || '.jpg';
    cb(null, `media-${uniqueSuffix}${ext}`);
  },
});

export const chatStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const targetDir = resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    // 1. Sanitize original filename and strip path characters
    const cleanBase = basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const mime = file.mimetype?.toLowerCase() || '';
    const safeExt = ALLOWED_CHAT_MIME_TYPES[mime] || extname(cleanBase).toLowerCase() || '.jpg';

    // 2. Randomize filename with crypto
    const randomHex = crypto.randomBytes(16).toString('hex');
    const safeFilename = `chat-${Date.now()}-${randomHex}${safeExt}`;

    // 3. Strict path traversal verification
    const expectedDir = resolve(process.cwd(), 'uploads');
    const resolvedPath = resolve(expectedDir, safeFilename);
    if (!resolvedPath.startsWith(expectedDir)) {
      return cb(new BadRequestException('Security violation: Path traversal detected'), '');
    }

    cb(null, safeFilename);
  },
});

export const chatFileFilter = (_req: any, file: any, cb: any) => {
  const mime = file.mimetype?.toLowerCase();
  if (!mime || !ALLOWED_CHAT_MIME_TYPES[mime]) {
    return cb(
      new BadRequestException(
        'Invalid file type. Allowed formats: images (JPG, PNG, WebP, GIF) and videos (MP4, WebM, MOV, MKV).'
      ),
      false,
    );
  }
  cb(null, true);
};

function getFileUrl(req: Request, filename: string): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || req.protocol || 'http';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.get('host') || 'localhost:4005';
  return `${proto}://${host}/uploads/${filename}`;
}

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  @Post()
  @ApiOperation({ summary: 'Upload a single file or image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage }))
  uploadSingle(
    @UploadedFile() file: any,
    @Req() req: Request,
    @Body() body: any,
  ) {
    if (file) {
      const url = getFileUrl(req, file.filename);
      return {
        success: true,
        url,
        relativeUrl: `/uploads/${file.filename}`,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
      };
    }

    // Direct URL or base64 fallback
    if (body?.url) {
      return {
        success: true,
        url: body.url,
        relativeUrl: body.url,
      };
    }

    if (body?.base64) {
      const matches = body.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], 'base64');
        const ext = body.filename ? extname(body.filename) : '.jpg';
        const filename = `media-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const filePath = join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);
        const url = getFileUrl(req, filename);
        return {
          success: true,
          url,
          relativeUrl: `/uploads/${filename}`,
          filename,
        };
      }
    }

    throw new BadRequestException('No file provided for upload');
  }

  @Post('multiple')
  @ApiOperation({ summary: 'Upload multiple files or images' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 15, { storage }))
  uploadMultiple(@UploadedFiles() files: any[], @Req() req: Request) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided for upload');
    }

    const items = files.map((file) => ({
      url: getFileUrl(req, file.filename),
      relativeUrl: `/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    }));

    return {
      success: true,
      files: items,
      urls: items.map((i) => i.url),
    };
  }

  @Post('chat')
  @ApiOperation({ summary: 'Upload chat attachment (image or video) with validation and sanitization' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: chatStorage,
      fileFilter: chatFileFilter,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  uploadChatMedia(
    @UploadedFile() file: any,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded or file rejected by validator');
    }

    const isVideo = file.mimetype?.startsWith('video/');
    const url = getFileUrl(req, file.filename);

    return {
      success: true,
      url,
      relativeUrl: `/uploads/${file.filename}`,
      filename: file.filename,
      originalName: basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_'),
      mimetype: file.mimetype,
      fileType: isVideo ? 'VIDEO' : 'IMAGE',
      size: file.size,
    };
  }
}
