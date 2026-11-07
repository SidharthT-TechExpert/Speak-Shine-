import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@speak-shine/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WalletService } from './wallet.service';
import { AwardPrizeDto } from './dto/award-prize.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Roles(Role.TRAINER)
  @Post('award-prize')
  @ApiOperation({ summary: 'Trainer awards cash prize to student from class pool' })
  async awardPrize(
    @CurrentUser('userId') trainerId: string,
    @Body() dto: AwardPrizeDto,
  ) {
    return this.walletService.awardPrize(trainerId, dto);
  }

  @Get('transactions/my')
  @ApiOperation({ summary: 'Get transaction history for authenticated user' })
  async getMyTransactions(@CurrentUser('userId') userId: string) {
    return this.walletService.getMyTransactions(userId);
  }
}
