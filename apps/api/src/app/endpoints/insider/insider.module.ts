import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InsiderCacheService } from './insider-cache.service';
import { InsiderController } from './insider.controller';
import { InsiderService } from './insider.service';
import { INSIDER_DATA_PROVIDER_TOKEN } from './providers/insider-data-provider.interface';
import { SecApiInsiderDataProvider } from './providers/sec-api.provider';
import { StubInsiderDataProvider } from './providers/stub.provider';

@Module({
  controllers: [InsiderController],
  exports: [InsiderService, InsiderCacheService],
  imports: [ConfigModule, PortfolioModule, PrismaModule],
  providers: [
    InsiderCacheService,
    InsiderService,
    SecApiInsiderDataProvider,
    StubInsiderDataProvider,
    {
      provide: INSIDER_DATA_PROVIDER_TOKEN,
      useFactory: (
        secApiProvider: SecApiInsiderDataProvider,
        stubProvider: StubInsiderDataProvider
      ) => {
        const secApiKey = process.env.SEC_API_KEY;
        return secApiKey ? secApiProvider : stubProvider;
      },
      inject: [SecApiInsiderDataProvider, StubInsiderDataProvider]
    }
  ]
})
export class InsiderModule {}
