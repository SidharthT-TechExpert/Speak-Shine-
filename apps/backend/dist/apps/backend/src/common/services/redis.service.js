"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        this.client = null;
        this.isAvailable = false;
        this.memoryCache = new Map();
        const url = this.configService.get('REDIS_URL');
        if (url) {
            try {
                this.client = new ioredis_1.default(url, {
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
                this.client.connect().catch(() => { });
            }
            catch (err) {
                this.logger.warn(`Failed to initialize Redis client: ${err.message}`);
            }
        }
    }
    async incrWithTtl(key, ttlSeconds) {
        if (this.isAvailable && this.client) {
            const count = await this.client.incr(key);
            if (count === 1) {
                await this.client.expire(key, ttlSeconds);
            }
            return count;
        }
        const now = Date.now();
        const entry = this.memoryCache.get(key);
        if (!entry || entry.expiresAt < now) {
            this.memoryCache.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
            return 1;
        }
        entry.value += 1;
        return entry.value;
    }
    async getTtl(key) {
        if (this.isAvailable && this.client) {
            return this.client.ttl(key);
        }
        const entry = this.memoryCache.get(key);
        if (!entry)
            return -1;
        return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    }
    onModuleDestroy() {
        if (this.client) {
            this.client.disconnect();
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map