import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class RedisService implements OnModuleDestroy {
    private configService;
    private readonly logger;
    private client;
    private isAvailable;
    private memoryCache;
    constructor(configService: ConfigService);
    incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
    getTtl(key: string): Promise<number>;
    onModuleDestroy(): void;
}
