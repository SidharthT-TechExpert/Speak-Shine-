import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Class, ClassDocument } from '../../database/schemas/class.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from '../../database/schemas/wallet-transaction.schema';
import {
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '@speak-shine/shared-types';
import { AwardPrizeDto } from './dto/award-prize.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(WalletTransaction.name)
    private transactionModel: Model<WalletTransactionDocument>,
  ) {}

  async awardPrize(trainerId: string, dto: AwardPrizeDto) {
    const cls = await this.classModel.findById(dto.classId);
    if (!cls) throw new NotFoundException('Class not found');
    if (cls.trainerId.toString() !== trainerId) {
      throw new ForbiddenException('You can only award prizes to your classes');
    }

    const student = await this.userModel.findById(dto.studentId);
    if (!student) throw new NotFoundException('Student not found');
    if (student.classId?.toString() !== dto.classId) {
      throw new BadRequestException('Student does not belong to this class');
    }

    // Atomic increment of student balance
    const updatedStudent = await this.userModel.findByIdAndUpdate(
      dto.studentId,
      { $inc: { walletBalance: dto.amount } },
      { new: true },
    );

    const transaction = await this.transactionModel.create({
      userId: student._id,
      type: TransactionType.CREDIT,
      category: TransactionCategory.CASH_PRIZE,
      amount: dto.amount,
      reason: dto.reason,
      balanceAfter: updatedStudent?.walletBalance || dto.amount,
      status: TransactionStatus.COMPLETED,
      metadata: {
        classId: dto.classId,
        taskId: dto.taskId || null,
        awardedByTrainerId: trainerId,
      },
    });

    return {
      message: `Successfully awarded ₹${dto.amount} cash prize to ${student.name}`,
      transactionId: transaction._id.toString(),
      newBalance: updatedStudent?.walletBalance,
    };
  }

  async getMyTransactions(userId: string) {
    return this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
