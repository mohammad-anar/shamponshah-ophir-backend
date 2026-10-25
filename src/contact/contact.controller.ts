import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateInquiryDto, VendorApplicationDto, NewsletterSubscribeDto } from './dto/contact.dto';

@ApiTags('Public Inquiries & Concierge Support')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('inquiry')
  @ApiOperation({ summary: 'Submit general or concierge inquiry request (Public)' })
  @ApiResponse({ status: 201, description: 'Inquiry ticket created' })
  submitInquiry(@Body() dto: CreateInquiryDto) {
    return this.contactService.createInquiry(dto);
  }

  @Post('apply-artisan')
  @ApiOperation({ summary: 'Submit public artisan guild fast-track application (Public)' })
  @ApiResponse({ status: 201, description: 'Application registered for review' })
  applyArtisan(@Body() dto: VendorApplicationDto) {
    return this.contactService.applyVendor(dto);
  }

  @Post('newsletter')
  @ApiOperation({ summary: 'Subscribe to Ophir Reserve updates (Public)' })
  @ApiResponse({ status: 201, description: 'Subscribed to newsletter' })
  subscribeNewsletter(@Body() dto: NewsletterSubscribeDto) {
    return this.contactService.subscribeNewsletter(dto);
  }

  @Get('faqs')
  @ApiOperation({ summary: 'Get official knowledge base and FAQs (Public)' })
  getFaqs() {
    return this.contactService.getFaqs();
  }
}
