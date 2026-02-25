import {
  AiChatResponse,
  ChatMessage,
  ConversationDetail
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AiChatStateService implements OnDestroy {
  public readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  public readonly isOpen$ = new BehaviorSubject<boolean>(false);
  public readonly isLoading$ = new BehaviorSubject<boolean>(false);
  public readonly error$ = new BehaviorSubject<string | null>(null);
  public readonly conversationId$ = new BehaviorSubject<string | null>(null);

  private readonly messageSentSubject = new Subject<void>();
  public readonly messageSent$: Observable<void> =
    this.messageSentSubject.asObservable();

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

    const conversationId = this.conversationId$.getValue();

    this.dataService
      .postAiChat({
        message: trimmed,
        ...(conversationId ? { conversationId } : {})
      })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        error: () => {
          this.error$.next('Failed to get a response. Please try again.');
          this.isLoading$.next(false);
        },
        next: (response: AiChatResponse) => {
          // Store conversationId from first response
          if (response.conversationId) {
            this.conversationId$.next(response.conversationId);
          }

          this.messages$.next([
            ...this.messages$.getValue(),
            {
              chartData: response.chartData,
              confidence: response.confidence,
              role: 'assistant',
              sources: response.sources,
              text: response.response,
              warnings: response.warnings
            }
          ]);
          this.isLoading$.next(false);
          this.messageSentSubject.next();
        }
      });
  }

  public loadConversation(id: string): void {
    this.isLoading$.next(true);
    this.error$.next(null);

    this.dataService
      .fetchAiConversation(id)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        error: () => {
          this.error$.next('Failed to load conversation.');
          this.isLoading$.next(false);
        },
        next: (detail: ConversationDetail) => {
          this.conversationId$.next(detail.id);
          this.messages$.next(
            detail.messages.map((m) => ({
              chartData: m.chartData,
              confidence: undefined,
              role: m.role,
              sources:
                m.role === 'assistant' ? m.requestedToolNames : undefined,
              text: m.content
            }))
          );
          this.isLoading$.next(false);
        }
      });
  }

  public newConversation(): void {
    this.messages$.next([]);
    this.conversationId$.next(null);
    this.error$.next(null);
  }

  public clearConversation(): void {
    this.messages$.next([]);
    this.conversationId$.next(null);
    this.error$.next(null);
  }

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }
}
