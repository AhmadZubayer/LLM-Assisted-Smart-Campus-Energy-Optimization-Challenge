import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  MaxGridWindowAdjustmentDto,
  MinimumBatteryReserveAdjustmentDto,
  NoChargeWindowAdjustmentDto,
  NoDischargeWindowAdjustmentDto,
  SolarReductionAdjustmentDto,
} from './energy/dto/structured-adjustment.dto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GridWise LLM API')
    .setDescription(
      'LLM-assisted operator directive interpretation and 24-hour campus energy optimization for the BUP CSE Fest 2026 preliminary round.',
    )
    .setVersion('1.0.0')
    .addTag('health', 'Readiness probe')
    .addTag('energy', 'Operator-note interpretation and energy optimization')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [
      SolarReductionAdjustmentDto,
      MinimumBatteryReserveAdjustmentDto,
      NoChargeWindowAdjustmentDto,
      NoDischargeWindowAdjustmentDto,
      MaxGridWindowAdjustmentDto,
    ],
  });
  SwaggerModule.setup('docs', app, document, {
    customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-standalone-preset.js',
    ],
  });

  app.getHttpAdapter().get('/', (_req, res) => {
    res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>GridWise LLM API</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem;">
  <h1>Team ThinkByte GridWise Server</h1>
  <h2>LLM Assisted Smart Campus Energy Optimization</h2>
  <p><a href="/docs">API documentation</a> &middot; <a href="/health">Health check</a></p>
</body>
</html>`);
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
