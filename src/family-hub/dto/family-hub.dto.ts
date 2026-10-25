import { IsString, IsOptional, IsEmail, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFamilyBoardDto {
  @ApiProperty({ example: 'Catering & Tastings' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '2026-11-20T18:00:00.000Z' })
  @IsOptional()
  @IsString()
  eventDate?: string;

  @ApiPropertyOptional({ example: 'Shortlist of potential vendors for family voting' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddBoardItemDto {
  @ApiPropertyOptional({ example: 'clx...vendorId' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({ example: 'clx...gigId' })
  @IsOptional()
  @IsString()
  gigId?: string;

  @ApiProperty({ example: 'Artisan Grazing Table' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Offers vegan and GF options' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'SHORTLISTED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class VoteBoardItemDto {
  @ApiProperty({ example: 'YES' })
  @IsString()
  vote: 'YES' | 'NO' | 'MAYBE';
}

export class InviteMemberDto {
  @ApiProperty({ example: 'partner@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'COLLABORATOR' })
  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateBoardItemDto {
  @ApiPropertyOptional({ example: 'SHORTLISTED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Updated notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BookBoardItemDto {
  @ApiPropertyOptional({ example: 'Emily Carter' })
  @IsOptional()
  @IsString()
  payerName?: string;

  @ApiPropertyOptional({ example: 'Booking confirmed for celebration!' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'stripe_escrow' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
