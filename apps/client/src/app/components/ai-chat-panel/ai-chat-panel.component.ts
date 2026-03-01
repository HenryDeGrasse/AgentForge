import { AiChatChartComponent } from '@ghostfolio/client/components/ai-chat-chart/ai-chat-chart.component';
import { AiChatStateService } from '@ghostfolio/client/services/ai-chat-state.service';
import {
  ActionItem,
  ChatMessage,
  ConversationSummary
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { AsyncPipe } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';
import { BehaviorSubject, Subject } from 'rxjs';
import { filter, switchMap, takeUntil } from 'rxjs/operators';

// ─── Route → contextual suggestion chips ──────────────────────────────────────
const ROUTE_CHIPS: Record<string, string[]> = {
  accounts: [
    'Analyze my account diversification',
    'Which account has the best returns?',
    'Show my total balance breakdown',
    'Compare account performance'
  ],
  activities: [
    'Summarize my recent trades',
    'Estimate my tax liability this year',
    'Show my most active trading months',
    'What did I buy last quarter?'
  ],
  analysis: [
    'Show performance vs benchmark',
    'Compare my top 3 holdings',
    'How did my portfolio perform YTD?',
    'Analyze my worst performers'
  ],
  default: [
    'Summarize my holdings',
    'Analyze my risk',
    'Check diversification',
    'Compare performance',
    'Estimate taxes',
    'Suggest rebalancing'
  ],
  holdings: [
    'What is my riskiest position?',
    'Show sector exposure',
    'Suggest rebalancing my portfolio',
    'Which holdings are underperforming?'
  ],
  markets: [
    'How is the market affecting my portfolio?',
    'Show me correlated holdings',
    'Compare my ETFs to benchmarks'
  ],
  portfolio: [
    'Analyze my overall risk profile',
    'Suggest portfolio rebalancing',
    'What is my largest sector exposure?',
    'Run a stress test on my portfolio'
  ]
};

// ─── "What can I ask?" capability entries ─────────────────────────────────────
const CAPABILITIES: {
  desc: string;
  label: string;
  prompt: string;
  tool: string;
}[] = [
  {
    desc: 'Total value, top holdings, and allocation breakdown',
    label: 'Portfolio summary',
    prompt:
      'Give me a full summary of my portfolio — total value, top holdings, and allocation breakdown.',
    tool: 'get_portfolio_summary'
  },
  {
    desc: 'Concentration, sector, currency, and volatility risk',
    label: 'Risk analysis',
    prompt:
      'Analyze my portfolio risk — concentration, sector exposure, and any positions I should be concerned about.',
    tool: 'analyze_risk'
  },
  {
    desc: 'Compare your returns against benchmarks like S&P 500',
    label: 'Performance comparison',
    prompt: 'How has my portfolio performed compared to the S&P 500 this year?',
    tool: 'performance_compare'
  },
  {
    desc: 'Estimated short/long-term capital gains and unrealised gains',
    label: 'Tax estimates',
    prompt:
      'Estimate my capital gains tax exposure — both short-term and long-term.',
    tool: 'tax_estimate'
  },
  {
    desc: 'Flags over-concentration in single positions, sectors, asset classes, and cash — thresholds are configurable',
    label: 'Diversification check',
    prompt:
      'Check my portfolio diversification — flag anything that looks too concentrated.',
    tool: 'compliance_check'
  },
  {
    desc: 'Target-allocation suggestions with specific buy/sell trades',
    label: 'Rebalancing suggestions',
    prompt:
      'Suggest how I should rebalance my portfolio to improve diversification.',
    tool: 'rebalance_suggest'
  },
  {
    desc: 'What-if analysis — apply hypothetical trades to your portfolio',
    label: 'Trade simulation',
    prompt:
      'Simulate what happens to my portfolio if I buy $5,000 of VTI today.',
    tool: 'simulate_trades'
  },
  {
    desc: 'Apply market crash or custom shock scenarios',
    label: 'Stress testing',
    prompt:
      'Stress test my portfolio against a 2008-style market crash scenario.',
    tool: 'stress_test'
  },
  {
    desc: 'Live quotes, profiles, and price history for any symbol',
    label: 'Market data lookup',
    prompt: 'Show me the current price and profile for ',
    tool: 'market_data_lookup'
  },
  {
    desc: 'Filtered list of your past transactions with pagination',
    label: 'Transaction history',
    prompt: 'Show my transactions from the last 3 months.',
    tool: 'get_transaction_history'
  }
];

// Confidence badge tooltip copy
const CONFIDENCE_TOOLTIPS: Record<string, string> = {
  high: 'Response is backed by verified tool data with matching figures',
  low: 'Limited tool data available — consider verifying key figures independently',
  medium: 'Response uses tool data but some claims may be approximated'
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiChatChartComponent,
    AsyncPipe,
    MarkdownComponent,
    MatTooltipModule,
    ReactiveFormsModule
  ],
  selector: 'gf-ai-chat-panel',
  styleUrls: ['./ai-chat-panel.component.scss'],
  templateUrl: './ai-chat-panel.component.html'
})
export class AiChatPanelComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('messageList') private messageListRef: ElementRef<HTMLElement>;
  @ViewChild('inputEl') private inputRef: ElementRef<HTMLTextAreaElement>;

  public readonly messages$ = this.stateService.messages$;
  public readonly isOpen$ = this.stateService.isOpen$;
  public readonly isLoading$ = this.stateService.isLoading$;
  public readonly error$ = this.stateService.error$;
  public readonly streamingText$ = this.stateService.streamingText$;
  public readonly activeTool$ = this.stateService.activeTool$;
  public readonly isStreaming$ = this.stateService.isStreaming$;
  public readonly toolCallHistory$ = this.stateService.toolCallHistory$;

  /** Close the panel when Escape is pressed while it is open. */
  @HostListener('document:keydown.escape')
  public onEscape(): void {
    if (this.stateService.isOpen$.getValue()) {
      this.stateService.close();
    }
  }

  public inputControl = new FormControl('', { nonNullable: true });
  public showHistory = false;
  public conversations$ = new BehaviorSubject<ConversationSummary[]>([]);
  public suggestionChips: string[] = ROUTE_CHIPS['default'];
  public copiedIndex: number | null = null;
  public readonly confidenceTooltips = CONFIDENCE_TOOLTIPS;
  public readonly CAPABILITIES: typeof CAPABILITIES = CAPABILITIES;

  private shouldScrollToBottom = false;
  private unsubscribeSubject = new Subject<void>();
  private readonly refreshTrigger$ = new Subject<void>();

  public constructor(
    public readonly stateService: AiChatStateService,
    private readonly dataService: DataService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly router: Router
  ) {
    // Scroll to bottom whenever messages update
    this.messages$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => (this.shouldScrollToBottom = true));

    // Conversation list refresh pipeline — switchMap cancels stale in-flight requests
    this.refreshTrigger$
      .pipe(
        switchMap(() => this.dataService.fetchAiConversations()),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe({
        error: (err) => {
          console.error('Failed to refresh conversation list', err);
          this.changeDetectorRef.markForCheck();
        },
        next: (conversations) => {
          this.conversations$.next(conversations);
          this.changeDetectorRef.markForCheck();
        }
      });

    // Refresh drawer when a message is sent and history is already open
    this.stateService.messageSent$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        if (this.showHistory) {
          this.refreshConversations();
        }
      });

    // Auto-focus the textarea whenever the panel opens
    this.stateService.isOpen$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((isOpen) => {
        if (isOpen) {
          // Defer one tick so the panel's open CSS transition has started and
          // the element is interactive before we steal focus.
          setTimeout(() => {
            this.inputRef?.nativeElement?.focus();
          }, 50);
        }
      });

    // Update suggestion chips whenever the route changes
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe((e: NavigationEnd) => {
        this.suggestionChips = this.resolveChips(e.urlAfterRedirects);
        this.changeDetectorRef.markForCheck();
      });

    // Set chips for the initial route
    this.suggestionChips = this.resolveChips(this.router.url);
  }

  public ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public onSend(): void {
    const text = this.inputControl.value.trim();

    if (!text) {
      return;
    }

    this.stateService.sendMessage(text);
    this.inputControl.setValue('');
  }

  public onSuggestionClick(text: string): void {
    this.stateService.sendMessage(text);
  }

  /**
   * Pre-fill the textarea with a capability sample prompt so the user can
   * review and edit before sending. Focus is moved to the input.
   */
  public onCapabilityClick(prompt: string): void {
    this.inputControl.setValue(prompt);
    // Move cursor to end of text so the user can append immediately
    setTimeout(() => {
      const el = this.inputRef?.nativeElement;

      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  }

  public onActionClick(action: ActionItem): void {
    this.stateService.sendMessage(action.prompt);
  }

  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  public hasWarnings(msg: ChatMessage): boolean {
    return !!msg.warnings && msg.warnings.length > 0;
  }

  public toggleHistory(): void {
    this.showHistory = !this.showHistory;

    if (this.showHistory) {
      this.refreshConversations();
    }
  }

  public onSelectConversation(id: string): void {
    this.stateService.loadConversation(id);
    this.showHistory = false;
    this.changeDetectorRef.markForCheck();
  }

  public onNewConversation(): void {
    this.stateService.newConversation();
    this.showHistory = false;
    this.changeDetectorRef.markForCheck();
  }

  public onDeleteConversation(event: Event, id: string): void {
    event.stopPropagation();

    this.dataService
      .deleteAiConversation(id)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: () => {
          // Remove from list
          const current = this.conversations$.getValue();
          this.conversations$.next(current.filter((c) => c.id !== id));

          // If deleted the active conversation, reset
          if (this.stateService.conversationId$.getValue() === id) {
            this.stateService.newConversation();
            this.showHistory = false;
          }

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public onFeedback(messageIndex: number, score: 'down' | 'up'): void {
    this.stateService.submitFeedback(messageIndex, score);
  }

  /**
   * Copy an assistant message to the clipboard.
   * Shows a brief "Copied!" flash on the button.
   */
  public onCopyMessage(text: string, index: number): void {
    navigator.clipboard?.writeText(text).then(() => {
      this.copiedIndex = index;
      this.changeDetectorRef.markForCheck();

      setTimeout(() => {
        this.copiedIndex = null;
        this.changeDetectorRef.markForCheck();
      }, 1800);
    });
  }

  public getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return 'just now';
    }

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }

    const diffHours = Math.floor(diffMins / 60);

    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);

    return `${diffDays}d ago`;
  }

  /** Format elapsed milliseconds as "0.8s" or "12.3s". */
  public formatDuration(startMs: number, endMs: number): string {
    const sec = (endMs - startMs) / 1000;

    return `${sec.toFixed(1)}s`;
  }

  private resolveChips(url: string): string[] {
    const segments = url.split('?')[0].split('/').filter(Boolean);
    const segment = segments.at(0) ?? '';
    const sub = segments.at(1) ?? '';

    // Portfolio sub-routes get their own chips
    if (segment === 'portfolio') {
      return ROUTE_CHIPS[sub] ?? ROUTE_CHIPS['portfolio'];
    }

    return ROUTE_CHIPS[segment] ?? ROUTE_CHIPS['default'];
  }

  private refreshConversations(): void {
    this.refreshTrigger$.next();
  }

  private scrollToBottom(): void {
    try {
      const el = this.messageListRef?.nativeElement;

      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {}
  }
}
