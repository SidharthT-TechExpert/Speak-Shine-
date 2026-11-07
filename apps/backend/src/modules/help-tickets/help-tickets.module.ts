import { Module } from '@nestjs/common';
import { HelpTicketsController } from './help-tickets.controller';
import { HelpTicketsService } from './help-tickets.service';

@Module({
  controllers: [HelpTicketsController],
  providers: [HelpTicketsService],
  exports: [HelpTicketsService],
})
export class HelpTicketsModule {}
