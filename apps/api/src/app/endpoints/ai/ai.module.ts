import { AccountBalanceService } from '@ghostfolio/api/app/account-balance/account-balance.service';
import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { ReactAgentService } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';
import { LLM_CLIENT_TOKEN } from '@ghostfolio/api/app/endpoints/ai/llm/llm-client.interface';
import { OpenAiClientService } from '@ghostfolio/api/app/endpoints/ai/llm/openai-client.service';
import { AnalyzeRiskTool } from '@ghostfolio/api/app/endpoints/ai/tools/analyze-risk.tool';
import { ComplianceCheckTool } from '@ghostfolio/api/app/endpoints/ai/tools/compliance-check.tool';
import { CreateInsiderRuleTool } from '@ghostfolio/api/app/endpoints/ai/tools/create-insider-rule.tool';
import { DeleteInsiderRuleTool } from '@ghostfolio/api/app/endpoints/ai/tools/delete-insider-rule.tool';
import { GetInsiderActivityTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-insider-activity.tool';
import { GetPortfolioSummaryTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-portfolio-summary.tool';
import { GetTransactionHistoryTool } from '@ghostfolio/api/app/endpoints/ai/tools/get-transaction-history.tool';
import { ListInsiderRulesTool } from '@ghostfolio/api/app/endpoints/ai/tools/list-insider-rules.tool';
import { MarketDataLookupTool } from '@ghostfolio/api/app/endpoints/ai/tools/market-data-lookup.tool';
import { PerformanceCompareTool } from '@ghostfolio/api/app/endpoints/ai/tools/performance-compare.tool';
import { RebalanceSuggestTool } from '@ghostfolio/api/app/endpoints/ai/tools/rebalance-suggest.tool';
import { SimulateTradesTool } from '@ghostfolio/api/app/endpoints/ai/tools/simulate-trades.tool';
import { StressTestTool } from '@ghostfolio/api/app/endpoints/ai/tools/stress-test.tool';
import { TaxEstimateTool } from '@ghostfolio/api/app/endpoints/ai/tools/tax-estimate.tool';
import { ToolRegistry } from '@ghostfolio/api/app/endpoints/ai/tools/tool.registry';
import { AI_TOOL_DEFINITIONS_TOKEN } from '@ghostfolio/api/app/endpoints/ai/tools/tool.types';
import { UpdateInsiderRuleTool } from '@ghostfolio/api/app/endpoints/ai/tools/update-insider-rule.tool';
import { InsiderModule } from '@ghostfolio/api/app/endpoints/insider/insider.module';
import { OrderModule } from '@ghostfolio/api/app/order/order.module';
import { PortfolioCalculatorFactory } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator.factory';
import { CurrentRateService } from '@ghostfolio/api/app/portfolio/current-rate.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { RulesService } from '@ghostfolio/api/app/portfolio/rules.service';
import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { SymbolModule } from '@ghostfolio/api/app/symbol/symbol.module';
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

import { ActionExtractorService } from './action-extractor.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChartDataExtractorService } from './chart-data-extractor.service';
import { ChatConversationService } from './chat-conversation.service';
import { ResponseVerifierService } from './verification/response-verifier.service';

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
    InsiderModule,
    MarketDataModule,
    OrderModule,
    PortfolioSnapshotQueueModule,
    PrismaModule,
    PropertyModule,
    RedisCacheModule,
    SymbolModule,
    SymbolProfileModule,
    UserModule
  ],
  providers: [
    AccountBalanceService,
    AccountService,
    ActionExtractorService,
    AiService,
    ChartDataExtractorService,
    ChatConversationService,
    CurrentRateService,
    MarketDataService,
    OpenAiClientService,
    PortfolioCalculatorFactory,
    ReactAgentService,
    ResponseVerifierService,
    AnalyzeRiskTool,
    ComplianceCheckTool,
    CreateInsiderRuleTool,
    DeleteInsiderRuleTool,
    GetInsiderActivityTool,
    GetPortfolioSummaryTool,
    GetTransactionHistoryTool,
    ListInsiderRulesTool,
    MarketDataLookupTool,
    PerformanceCompareTool,
    RebalanceSuggestTool,
    SimulateTradesTool,
    StressTestTool,
    TaxEstimateTool,
    UpdateInsiderRuleTool,
    ToolRegistry,
    PortfolioService,
    RulesService,
    {
      inject: [
        AnalyzeRiskTool,
        ComplianceCheckTool,
        CreateInsiderRuleTool,
        DeleteInsiderRuleTool,
        GetInsiderActivityTool,
        GetPortfolioSummaryTool,
        GetTransactionHistoryTool,
        ListInsiderRulesTool,
        MarketDataLookupTool,
        PerformanceCompareTool,
        RebalanceSuggestTool,
        SimulateTradesTool,
        StressTestTool,
        TaxEstimateTool,
        UpdateInsiderRuleTool
      ],
      provide: AI_TOOL_DEFINITIONS_TOKEN,
      useFactory: (
        analyzeRiskTool,
        complianceCheckTool,
        createInsiderRuleTool,
        deleteInsiderRuleTool,
        getInsiderActivityTool,
        getPortfolioSummaryTool,
        getTransactionHistoryTool,
        listInsiderRulesTool,
        marketDataLookupTool,
        performanceCompareTool,
        rebalanceSuggestTool,
        simulateTradesTool,
        stressTestTool,
        taxEstimateTool,
        updateInsiderRuleTool
      ) => {
        return [
          getPortfolioSummaryTool,
          getTransactionHistoryTool,
          analyzeRiskTool,
          marketDataLookupTool,
          performanceCompareTool,
          taxEstimateTool,
          complianceCheckTool,
          rebalanceSuggestTool,
          simulateTradesTool,
          stressTestTool,
          getInsiderActivityTool,
          createInsiderRuleTool,
          listInsiderRulesTool,
          updateInsiderRuleTool,
          deleteInsiderRuleTool
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
