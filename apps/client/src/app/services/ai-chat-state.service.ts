import {
  AiChatResponse,
  ChatMessage,
  ConversationDetail,
  SseEvent
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AiChatStateService implements OnDestroy {
  public readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  public readonly isOpen$ = new BehaviorSubject<boolean>(false);
  public readonly isLoading$ = new BehaviorSubject<boolean>(false);
  public readonly error$ = new BehaviorSubject<string | null>(null);
  public readonly conversationId$ = new BehaviorSubject<string | null>(null);

  /** Accumulated plaintext during streaming (not markdown). */
  public readonly streamingText$ = new BehaviorSubject<string>('');

  /** Currently executing tool name, or null. */
  public readonly activeTool$ = new BehaviorSubject<string | null>(null);

  /** Whether a stream is actively in progress. */
  public readonly isStreaming$ = new BehaviorSubject<boolean>(false);

  private readonly messageSentSubject = new Subject<void>();
  public readonly messageSent$: Observable<void> =
    this.messageSentSubject.asObservable();

  private unsubscribeSubject = new Subject<void>();
  private currentStreamSubscription: Subscription | null = null;

  // Chunk throttling
  private pendingText = '';
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly CHUNK_FLUSH_MS = 80;

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

    // Cancel any in-flight stream
    this.cancelStream();

    // Append user bubble immediately
    this.messages$.next([
      ...this.messages$.getValue(),
      { role: 'user', text: trimmed }
    ]);

    this.error$.next(null);
    this.isLoading$.next(true);
    this.isStreaming$.next(true);
    this.streamingText$.next('');
    this.activeTool$.next(null);
    this.pendingText = '';

    const conversationId = this.conversationId$.getValue();

    // Start chunk flush timer
    this.flushTimer = setInterval(() => {
      if (this.pendingText) {
        this.streamingText$.next(
          this.streamingText$.getValue() + this.pendingText
        );
        this.pendingText = '';
      }
    }, AiChatStateService.CHUNK_FLUSH_MS);

    this.currentStreamSubscription = this.dataService
      .streamAiChat({
        message: trimmed,
        ...(conversationId ? { conversationId } : {})
      })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        error: () => {
          this.stopFlushTimer();
          this.error$.next('Failed to get a response. Please try again.');
          this.isLoading$.next(false);
          this.isStreaming$.next(false);
          this.activeTool$.next(null);
          this.streamingText$.next('');
        },
        next: (event: SseEvent) => {
          this.handleStreamEvent(event);
        },
        complete: () => {
          this.stopFlushTimer();
          this.isStreaming$.next(false);
          this.activeTool$.next(null);
        }
      });
  }

  public loadConversation(id: string): void {
    this.cancelStream();
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
    this.cancelStream();
    this.messages$.next([]);
    this.conversationId$.next(null);
    this.error$.next(null);
  }

  public clearConversation(): void {
    this.cancelStream();
    this.messages$.next([]);
    this.conversationId$.next(null);
    this.error$.next(null);
  }

  public ngOnDestroy(): void {
    this.cancelStream();
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private cancelStream(): void {
    if (this.currentStreamSubscription) {
      this.currentStreamSubscription.unsubscribe();
      this.currentStreamSubscription = null;
    }

    this.stopFlushTimer();
    this.isStreaming$.next(false);
    this.activeTool$.next(null);
    this.streamingText$.next('');
    this.pendingText = '';
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining pending text
    if (this.pendingText) {
      this.streamingText$.next(
        this.streamingText$.getValue() + this.pendingText
      );
      this.pendingText = '';
    }
  }

  private handleStreamEvent(event: SseEvent): void {
    switch (event.type) {
      case 'response_chunk':
        // Buffer text chunks for throttled flushing
        this.pendingText += event.text;
        break;

      case 'tool_call':
        this.activeTool$.next(event.toolName);
        break;

      case 'tool_result':
        this.activeTool$.next(null);
        break;

      case 'thinking':
        // Could be used for UI state in the future
        break;

      case 'done':
        this.finalizeStreamResponse(event.payload);
        break;

      case 'error':
        this.stopFlushTimer();
        this.error$.next(event.message);
        this.isLoading$.next(false);
        this.isStreaming$.next(false);
        this.activeTool$.next(null);
        this.streamingText$.next('');
        break;

      case 'heartbeat':
        // Keep-alive, no action needed
        break;
    }
  }

  private finalizeStreamResponse(payload: AiChatResponse): void {
    this.stopFlushTimer();

    if (payload.conversationId) {
      this.conversationId$.next(payload.conversationId);
    }

    this.messages$.next([
      ...this.messages$.getValue(),
      {
        actions: payload.actions,
        chartData: payload.chartData,
        confidence: payload.confidence,
        role: 'assistant',
        sources: payload.sources,
        text: payload.response,
        warnings: payload.warnings
      }
    ]);

    this.isLoading$.next(false);
    this.isStreaming$.next(false);
    this.streamingText$.next('');
    this.activeTool$.next(null);
    this.messageSentSubject.next();
  }
}
