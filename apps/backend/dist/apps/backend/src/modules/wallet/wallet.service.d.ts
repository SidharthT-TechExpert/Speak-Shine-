import { Model, Types } from 'mongoose';
import { UserDocument } from '../../database/schemas/user.schema';
import { ClassDocument } from '../../database/schemas/class.schema';
import { WalletTransactionDocument } from '../../database/schemas/wallet-transaction.schema';
import { AwardPrizeDto } from './dto/award-prize.dto';
export declare class WalletService {
    private userModel;
    private classModel;
    private transactionModel;
    constructor(userModel: Model<UserDocument>, classModel: Model<ClassDocument>, transactionModel: Model<WalletTransactionDocument>);
    awardPrize(trainerId: string, dto: AwardPrizeDto): Promise<{
        message: string;
        transactionId: string;
        newBalance: number | undefined;
    }>;
    getMyTransactions(userId: string): Promise<(import("mongoose").FlattenMaps<WalletTransactionDocument> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
}
