import { AccountBalanceService } from '@ghostfolio/api/app/account-balance/account-balance.service';
import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { LLM_CLIENT_TOKEN } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { OpenAiClientService } from '@ghostfolio/api/app/endpoints/ai/llm/openai-client.service';
import { AnalyzeRiskTool } from '@ghostfolio/api/app/endpoints/ai/tools/analyze-risk.tool';
import { GetPortfolioSummaryTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-portfolio-summary.tool';
import { GetTransactionHistoryTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-transaction-history.tool';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { AI_TOOL_DEFINITIONS_TOKEN } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { OrderModule } from '@ghostfolio/api/app/order/order.module';
import { PortfolioCalculatorFactory } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator.factory';
import { CurrentRateService } from '@ghostfolio/api/app/portfolio/current-rate.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { RulesService } from '@ghostfolio/api/app/portfolio/rules.service';
import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { ApiModule } from '@ghostfolio/api/services/api/api.module';
import { BenchmarkModule } from '@ghostfolio/api/services/benchmark/benchmark.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { I18nModule } from '@ghostfolio/api/services/i18n/i18n.module';
import { ImpersonationModule } from '@ghostfolio/api/services/impersonation/impersonation.module';
import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';
import { PortfolioSnapshotQueueModule } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.module';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';

import { Module } from '@nestjs/common';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  controllers: [AiController],
  imports: [
    ApiModule,
    BenchmarkModule,
    ConfigurationModule,
    DataProviderModule,
    ExchangeRateDataModule,
    I18nModule,
    ImpersonationModule,
    MarketDataModule,
    OrderModule,
    PortfolioSnapshotQueueModule,
    PrismaModule,
    PropertyModule,
    RedisCacheModule,
    SymbolProfileModule,
    UserModule
  ],
  providers: [
    AccountBalanceService,
    AccountService,
    AiService,
    CurrentRateService,
    MarketDataService,
    OpenAiClientService,
    PortfolioCalculatorFactory,
    ReactAgentService,
    AnalyzeRiskTool,
    GetPortfolioSummaryTool,
    GetTransactionHistoryTool,
    ToolRegistry,
    PortfolioService,
    RulesService,
    {
      inject: [
        AnalyzeRiskTool,
        GetPortfolioSummaryTool,
        GetTransactionHistoryTool
      ],
      provide: AI_TOOL_DEFINITIONS_TOKEN,
      useFactory: (
        analyzeRiskTool,
        getPortfolioSummaryTool,
        getTransactionHistoryTool
      ) => {
        return [
          getPortfolioSummaryTool,
          getTransactionHistoryTool,
          analyzeRiskTool
        ];
      }
    },
    {
      provide: LLM_CLIENT_TOKEN,
      useExisting: OpenAiClientService
    }
  ]
})
export class AiModule {}
