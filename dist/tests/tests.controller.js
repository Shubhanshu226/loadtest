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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const tests_service_1 = require("./tests.service");
let TestsController = class TestsController {
    tests;
    constructor(tests) {
        this.tests = tests;
    }
    // 🔥 CREATE TEST
    async create(file, vusQuery, durationQuery, body) {
        if (!file?.buffer?.length) {
            throw new common_1.BadRequestException('Missing file "collection"');
        }
        let json;
        try {
            json = JSON.parse(file.buffer.toString('utf8'));
        }
        catch {
            throw new common_1.BadRequestException('Invalid JSON');
        }
        // ✅ Validate VUs
        const vus = Number(vusQuery ?? 100);
        if (isNaN(vus) || vus <= 0 || vus > 5000) {
            throw new common_1.BadRequestException('vus must be between 1 and 5000');
        }
        // ✅ Validate duration
        const duration = durationQuery ?? '30s';
        if (!/^\d+(s|m)$/.test(duration)) {
            throw new common_1.BadRequestException('duration must be like 30s or 5m');
        }
        const collectionName = json?.info?.name;
        let config = undefined;
        if (body?.config) {
            try {
                config = typeof body.config === 'string' ? JSON.parse(body.config) : body.config;
            }
            catch {
                throw new common_1.BadRequestException('config must be valid JSON');
            }
        }
        const testId = await this.tests.createTest(json, {
            vus,
            duration,
            collectionName,
            config,
        });
        return { testId };
    }
    // 🔥 RUN TEST (ASYNC)
    async run(id) {
        const test = await this.safeGet(id);
        if (test.status === 'running') {
            throw new common_1.BadRequestException('Test already running');
        }
        // For MVP: run and return results in the same response
        await this.tests.runTest(id);
        return await this.safeGet(id);
    }
    // 🔥 GET TEST STATUS
    async get(id) {
        return await this.safeGet(id);
    }
    // 🔥 INTERNAL SAFE GET
    async safeGet(id) {
        try {
            return await this.tests.getTest(id);
        }
        catch {
            throw new common_1.NotFoundException('Test not found');
        }
    }
};
exports.TestsController = TestsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('collection', {
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Query)('vus')),
    __param(2, (0, common_1.Query)('duration')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/run'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "run", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "get", null);
exports.TestsController = TestsController = __decorate([
    (0, common_1.Controller)('/api/tests'),
    __metadata("design:paramtypes", [tests_service_1.TestsService])
], TestsController);
