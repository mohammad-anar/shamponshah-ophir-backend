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
import { extname, join } from 'path';
import * as fs from 'fs';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';

const uploadDir = join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(cleanName) || '.jpg';
    cb(null, `media-${uniqueSuffix}${ext}`);
  },
});

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
}
