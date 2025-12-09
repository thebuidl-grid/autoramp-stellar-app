import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { InitialiseRampDto } from './dto/initialise-ramp.dto';

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

  async initialiseRamp(dto: InitialiseRampDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/v1/ramp/initialise`, dto, {
          headers: {
            ...this.commonHeaders,
            'Content-Type': 'application/json',
          },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to initialise ramp', error);
    }
  }

  async getTransactions(id?: string, reference?: string): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      if (id) queryParams.append('id', id);
      if (reference) queryParams.append('reference', reference);

      const url = `${this.apiUrl}/v1/ramp/transactions?${queryParams.toString()}`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: this.commonHeaders,
        }),
      );
      return response.data;
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
