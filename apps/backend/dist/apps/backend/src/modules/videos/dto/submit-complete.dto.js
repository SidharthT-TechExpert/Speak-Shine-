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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmitCompleteDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class SubmitCompleteDto {
}
exports.SubmitCompleteDto = SubmitCompleteDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '662b...' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SubmitCompleteDto.prototype, "reportId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 45, description: 'Duration of recorded video in seconds' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(5),
    __metadata("design:type", Number)
], SubmitCompleteDto.prototype, "durationSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: ['d41d8cd98f00b204e9800998ecf8427e'],
        description: '16 sampled frame perceptual hashes for deduplication',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], SubmitCompleteDto.prototype, "frameHashes", void 0);
//# sourceMappingURL=submit-complete.dto.js.map