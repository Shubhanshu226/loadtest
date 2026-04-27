"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const nest_winston_1 = require("nest-winston");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        cors: {
            origin: true,
            credentials: false,
        },
    });
    app.useLogger(app.get(nest_winston_1.WINSTON_MODULE_NEST_PROVIDER));
    // Basic HTTP access logs (method/path/status/latency)
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const logger = app.get(nest_winston_1.WINSTON_MODULE_NEST_PROVIDER);
            logger.log('http_request', {
                method: req.method,
                path: req.originalUrl ?? req.url,
                statusCode: res.statusCode,
                durationMs: Date.now() - start,
                contentLength: res.getHeader('content-length'),
                userAgent: req.headers['user-agent'],
            });
        });
        next();
    });
    await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}
bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
});
