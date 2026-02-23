import { AiChatResponse, ChatMessage } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const DEFAULT_TOOL_NAMES = [
  'get_portfolio_summary',
  'get_transaction_history',
  'analyze_risk'
];

@Injectable({ providedIn: 'root' })
export class AiChatStateService implements OnDestroy {
  public readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  public readonly isOpen$ = new BehaviorSubject<boolean>(false);
  public readonly isLoading$ = new BehaviorSubject<boolean>(false);
  public readonly error$ = new BehaviorSubject<string | null>(null);

  private unsubscribeSubject = new Subject<void>();

  public constructor(private readonly dataService: DataService) {}

  public open(): void {
    this.isOpen$.next(true);
  }

  public close(): void {
    this.isOpen$.next(false);
  }

  public toggle(): void {
    this.isOpen$.next(!this.isOpen$.getValue());
  }

  public sendMessage(text: string): void {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    // Append user bubble immediately
    this.messages$.next([
      ...this.messages$.getValue(),
      { role: 'user', text: trimmed }
    ]);

    this.error$.next(null);
    this.isLoading$.next(true);

    this.dataService
      .postAiChat({ message: trimmed, toolNames: DEFAULT_TOOL_NAMES })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        error: () => {
          this.error$.next('Failed to get a response. Please try again.');
          this.isLoading$.next(false);
        },
        next: (response: AiChatResponse) => {
          this.messages$.next([
            ...this.messages$.getValue(),
            {
              confidence: response.confidence,
              role: 'assistant',
              sources: response.sources,
              text: response.response,
              warnings: response.warnings
            }
          ]);
          this.isLoading$.next(false);
        }
      });
  }

  public clearConversation(): void {
    this.messages$.next([]);
    this.error$.next(null);
  }

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }
}
