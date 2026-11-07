import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isAvailable = false;
  private memoryCache = new Map<string, { value: any; expiresAt: number }>();

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('REDIS_URL');
    if (url) {
      try {
        this.client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          enableOfflineQueue: false,
        });

        this.client.on('ready', () => {
          this.isAvailable = true;
          this.logger.log('Redis connected successfully');
        });

        this.client.on('error', (err) => {
          if (this.isAvailable) {
            this.logger.warn(`Redis disconnected: ${err.message}. Falling back to memory.`);
          }
          this.isAvailable = false;
        });

        this.client.connect().catch(() => {});
      } catch (err: any) {
        this.logger.warn(`Failed to initialize Redis client: ${err.message}`);
      }
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (this.isAvailable && this.client) {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    }

    // Memory fallback
    const now = Date.now();
    const entry = this.memoryCache.get(key);
    if (!entry || entry.expiresAt < now) {
      this.memoryCache.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }

    entry.value += 1;
    return entry.value;
  }

  async getTtl(key: string): Promise<number> {
    if (this.isAvailable && this.client) {
      return this.client.ttl(key);
    }
    const entry = this.memoryCache.get(key);
    if (!entry) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }
}
