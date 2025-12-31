import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../database/prisma.service';
import { offRampDto, onRampDto } from './dto/index.dto';
import { generateTrxReference } from '../../utils/reference.util';

@Injectable()
export class StablestackService {
  private readonly apiUrl?: string;
  private readonly apiKey?: string;
  private readonly commonHeaders = {
    Accept: 'application/json',
    'x-api-key': '',
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiUrl = this.configService.get<string>('STABLESTACK_API_URL');
    this.apiKey = this.configService.get<string>('STABLESTACK_API_KEY');

    if (!this.apiUrl || !this.apiKey) {
      throw new HttpException(
        'STABLESTACK_API_URL or STABLESTACK_API_KEY missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.commonHeaders['x-api-key'] = this.apiKey;
  }

  async getBanks(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/v1/ramp/banks`, {
          headers: this.commonHeaders,
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to fetch banks', error);
    }
  }


  /**
   * Initialize onramp transaction
   * 
   * Creates an onramp transaction with Flint API and saves it to the database.
   * 
   * @param userId - User ID from authenticated request
   * @param dto - Onramp transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Transaction data with database record
   */
  async onRamp(
    userId: string,
    dto: onRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {

      const reference = generateTrxReference();

      const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
      //const webhookUrl = 'https://7f8f532c7de0.ngrok-free.app/stablestack/webhook';

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/ramp/initialise`,
          { 
            ...dto, 
            type: dto.type ?? 'on', 
            reference,
            notifyUrl: webhookUrl || undefined,
          },
          {
            headers: {
              ...this.commonHeaders,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const flintData = response.data;

      const transaction = await this.prisma.onrampTransaction.create({
        data: {
          userId,
          reference,
          amount: dto.amount,
          currency: 'NGN',
          tokenType: 'CNGN',
          status: 'PENDING',
          flintTransactionId: flintData?.data?.transactionId || null,
          destinationAddress: dto.destination.address,
          network: dto.network,
          notifyUrl: webhookUrl || null,
          depositAccount: flintData?.data?.depositAccount || null,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'onramp',
          transactionId: transaction.id,
          userId,
          action: 'created',
          newStatus: 'PENDING',
          description: 'Onramp transaction initialized',
        },
      });

      return {
        ...flintData,
        databaseRecord: {
          id: transaction.id,
          reference: transaction.reference,
          status: transaction.status,
          createdAt: transaction.createdAt,
        },
      };
    } catch (error) {
      this.handleError('Failed to initialise onramp', error);
    }
  }

  /**
   * Initialize offramp transaction
   * 
   * Creates an offramp transaction with Flint API and saves it to the database.
   * 
   * @param userId - User ID from authenticated request
   * @param dto - Offramp transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Transaction data with database record
   */
  async offRamp(
    userId: string,
    dto: offRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      const reference = generateTrxReference();

      //const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
      const webhookUrl = 'https://7f8f532c7de0.ngrok-free.app/stablestack/webhook';

      console.log(          { 
        ...dto, 
        type: dto.type ?? 'off', 
        reference,
        notifyUrl: webhookUrl || undefined,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/ramp/initialise`,
          { 
            ...dto, 
            type: dto.type ?? 'off', 
            reference,
            notifyUrl: webhookUrl || undefined,
          },
          {
            headers: {
              ...this.commonHeaders,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      console.log('response offramp', response.data);

      const flintData = response.data;

      const depositAccount = flintData?.data?.depositAccount || {};

      const transaction = await this.prisma.offrampTransaction.create({
        data: {
          userId,
          reference,
          amount: dto.amount,
          currency: 'NGN',
          tokenType: 'CNGN',
          status: 'PENDING',
          flintTransactionId: flintData?.data?.transactionId || null,
          bankCode: dto.destination.bankCode,
          accountNumber: dto.destination.accountNumber,
          accountName: depositAccount?.accountName || null,
          bankName: depositAccount?.bankName || null,
          network: dto.network,
          notifyUrl: webhookUrl || null,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'offramp',
          transactionId: transaction.id,
          userId,
          action: 'created',
          newStatus: 'PENDING',
          description: 'Offramp transaction initialized',
        },
      });

      return {
        ...flintData,
        databaseRecord: {
          id: transaction.id,
          reference: transaction.reference,
          status: transaction.status,
          createdAt: transaction.createdAt,
        },
      };
    } catch (error) {
      this.handleError('Failed to initialise offramp', error);
    }
  }

  /**
   * Get transactions for a user
   * 
   * Fetches transactions from the database for the authenticated user.
   * Can filter by transaction ID or reference.
   * 
   * @param userId - User ID (required)
   * @param id - Transaction ID (optional)
   * @param reference - Transaction reference (optional)
   * @returns Transaction data from database
   */
  async getTransactions(
    userId: string,
    id?: string,
    reference?: string,
  ): Promise<any> {
    try {
      const where: any = { userId };

      if (id) {
        where.id = id;
      }

      if (reference) {
        where.reference = reference;
      }

      const onrampTransactions = await this.prisma.onrampTransaction.findMany({
        where,
        select: {
          id: true,
          reference: true,
          amount: true,
          currency: true,
          tokenAmount: true,
          tokenType: true,
          status: true,
          flintTransactionId: true,
          destinationAddress: true,
          network: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });


      const offrampTransactions = await this.prisma.offrampTransaction.findMany({
        where,
        select: {
          id: true,
          reference: true,
          amount: true,
          fiatAmount: true,
          currency: true,
          tokenType: true,
          status: true,
          flintTransactionId: true,
          bankCode: true,
          accountNumber: true,
          accountName: true,
          bankName: true,
          network: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        onramp: onrampTransactions,
        offramp: offrampTransactions,
        total: onrampTransactions.length + offrampTransactions.length,
      };
    } catch (error) {
      this.handleError('Failed to fetch transactions', error);
    }
  }

  private handleError(message: string, error: AxiosError | unknown): never {
    let status = HttpStatus.BAD_GATEWAY;
    let errorMessage = 'Unknown error';
    if (error instanceof AxiosError) {

      status = error.response?.status || status;
      const dataMessage = (error.response?.data as any)?.message;
      errorMessage = dataMessage || error.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    throw new HttpException(`${message}: ${errorMessage}`, status);
  }
}
