import { WalletService } from './wallet.service';
import { AwardPrizeDto } from './dto/award-prize.dto';
export declare class WalletController {
    private readonly walletService;
    constructor(walletService: WalletService);
    awardPrize(trainerId: string, dto: AwardPrizeDto): Promise<{
        message: string;
        transactionId: string;
        newBalance: number | undefined;
    }>;
    getMyTransactions(userId: string): Promise<(import("mongoose").FlattenMaps<import("../../database/schemas/wallet-transaction.schema").WalletTransactionDocument> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
}
