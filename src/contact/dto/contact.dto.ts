import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInquiryDto {
  @ApiProperty({ example: 'Maya Patel', description: 'Sender full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'maya@example.com', description: 'Sender contact email' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+1 (312) 555-0194' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'concierge', description: 'Category or topic of assistance' })
  @IsString()
  @IsNotEmpty()
  topic: string;

  @ApiProperty({ example: 'Inquiry details regarding vendor matching and escrow protocols' })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class VendorApplicationDto {
  @ApiProperty({ example: 'Golden Hour Productions', description: 'Studio or business name' })
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty({ example: 'cinematography', description: 'Primary service category' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Austin, TX', description: 'Primary operating city' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ example: 'https://vimeo.com/goldenhour' })
  @IsOptional()
  @IsString()
  portfolioUrl?: string;

  @ApiPropertyOptional({ example: 'artisan@goldenhour.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+1 (512) 555-0144' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class NewsletterSubscribeDto {
  @ApiProperty({ example: 'host@example.com', description: 'Subscriber email' })
  @IsEmail()
  email: string;
}
