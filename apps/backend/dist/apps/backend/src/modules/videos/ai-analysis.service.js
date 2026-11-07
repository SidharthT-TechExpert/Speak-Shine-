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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AiAnalysisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiAnalysisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const video_report_schema_1 = require("../../database/schemas/video-report.schema");
const user_schema_1 = require("../../database/schemas/user.schema");
const task_schema_1 = require("../../database/schemas/task.schema");
const shared_types_1 = require("@speak-shine/shared-types");
let AiAnalysisService = AiAnalysisService_1 = class AiAnalysisService {
    constructor(videoReportModel, userModel, taskModel, configService) {
        this.videoReportModel = videoReportModel;
        this.userModel = userModel;
        this.taskModel = taskModel;
        this.configService = configService;
        this.logger = new common_1.Logger(AiAnalysisService_1.name);
        this.groqApiKey = null;
        this.groqApiKey = this.configService.get('GROQ_API_KEY') || null;
    }
    async processSubmission(reportId) {
        const report = await this.videoReportModel.findById(reportId);
        if (!report) {
            this.logger.error(`Report ${reportId} not found for AI processing`);
            return;
        }
        try {
            this.logger.log(`Starting AI speech and visual evaluation for report ${reportId}`);
            let targetWords = [];
            if (report.taskId) {
                const task = await this.taskModel.findById(report.taskId).lean();
                if (task && Array.isArray(task.vocabularyChallengeWords)) {
                    targetWords = task.vocabularyChallengeWords;
                }
            }
            const simulatedTranscription = 'Hello everyone, today I want to share my thoughts on consistent practice and resilience. It is crucial to endeavor towards our goals with articulate expression and serenity.';
            const words = simulatedTranscription.split(/\s+/);
            const wordCount = words.length;
            const duration = report.videoDurationSeconds || 45;
            const wpm = Math.round((wordCount / (duration / 60)) || 125);
            const fillers = {
                um: (simulatedTranscription.match(/\bum\b/gi) || []).length,
                uh: (simulatedTranscription.match(/\buh\b/gi) || []).length,
                like: (simulatedTranscription.match(/\blike\b/gi) || []).length,
                'you know': (simulatedTranscription.match(/\byou know\b/gi) || []).length,
            };
            const fillerTotal = Object.values(fillers).reduce((a, b) => a + b, 0);
            const matchedWords = targetWords.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(simulatedTranscription));
            const vocabScore = targetWords.length > 0 ? (matchedWords.length / targetWords.length) * 10 : 8.5;
            const scores = {
                fluency: 8.5,
                grammar: 8.8,
                confidence: 8.2,
                vocabulary: 8.4,
                coherence: 8.0,
                topicRelevance: 8.9,
                eyeContact: 8.1,
                bodyLanguage: 8.3,
                facialExpression: 8.0,
                overallPresence: 8.4,
            };
            const compositeScore = Math.round((scores.fluency +
                scores.grammar +
                scores.confidence +
                scores.vocabulary +
                scores.eyeContact) *
                2);
            const analysis = {
                scores,
                transcription: simulatedTranscription,
                overallComment: 'Excellent pace and vocabulary selection. Body language and eye contact were steady throughout.',
                strongPoints: [
                    'Articulate pronunciation and well-paced delivery',
                    'Natural eye contact with screen center',
                    'Good syntactic sentence variety',
                ],
                suggestions: [
                    'Reduce occasional filler pauses when transitioning paragraphs',
                    'Maintain vocal projection towards conclusion',
                ],
                grammarErrors: [
                    {
                        original: 'It is crucial to endeavor towards our goals',
                        correction: 'It is crucial to endeavor toward our goals',
                        rule: 'American English favors toward without trailing s in formal contexts.',
                    },
                ],
                vocabularyHighlights: {
                    strong: ['resilience', 'endeavor', 'serenity', 'articulate'],
                    weak: ['very good', 'things'],
                },
                vocabularyChallenge: {
                    score: vocabScore,
                    wordsUsed: matchedWords,
                },
                stats: {
                    durationSeconds: duration,
                    wpm,
                    fillerWords: fillers,
                    fillerTotal,
                    pauses: 3,
                    wordCount,
                    cefrLevel: {
                        level: 'B2',
                        description: 'Independent user capable of fluent and spontaneous communication',
                    },
                    rhythm: {
                        speechRatio: 0.82,
                        rushesAtStart: false,
                        rushesAtEnd: false,
                        paceConsistency: 0.88,
                    },
                },
                compositeScore,
            };
            report.analysis = analysis;
            report.status = shared_types_1.TaskSubmissionStatus.COMPLETED;
            await report.save();
            await this.userModel.updateOne({ _id: report.userId }, { $inc: { monthlyScore: compositeScore } });
            this.logger.log(`AI analysis successfully completed for report ${reportId}`);
            return analysis;
        }
        catch (err) {
            this.logger.error(`AI analysis failed for ${reportId}: ${err.message}`);
            report.status = shared_types_1.TaskSubmissionStatus.FAILED;
            report.failureReason = err.message;
            await report.save();
        }
    }
};
exports.AiAnalysisService = AiAnalysisService;
exports.AiAnalysisService = AiAnalysisService = AiAnalysisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(video_report_schema_1.VideoReport.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(2, (0, mongoose_1.InjectModel)(task_schema_1.Task.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService])
], AiAnalysisService);
//# sourceMappingURL=ai-analysis.service.js.map