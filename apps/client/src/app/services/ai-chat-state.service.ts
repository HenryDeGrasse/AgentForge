import {
  AiChatResponse,
  ChatMessage,
  ConversationDetail,
  SseEvent,
  ThinkingStep,
  ToolCallRecord
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

  /**
   * Ordered list of tool calls made in the current (or most recent) turn.
   * Reset at the start of each new sendMessage().
   */
  public readonly toolCallHistory$ = new BehaviorSubject<ToolCallRecord[]>([]);

  /**
   * Agent thinking-step log for the current (or most recent) turn.
   * Reset at the start of each new sendMessage().
   */
  public readonly thinkingSteps$ = new BehaviorSubject<ThinkingStep[]>([]);

  private readonly messageSentSubject = new Subject<void>();
  public readonly messageSent$: Observable<void> =
    this.messageSentSubject.asObservable();

  private unsubscribeSubject = new Subject<void>();
  private currentStreamSubscription: Subscription | null = null;

  // Chunk throttling
  private pendingText = '';
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly CHUNK_FLUSH_MS = 80;

  // Per-turn tool timing
  private toolStartTimes = new Map<string, number>();

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
    this.toolCallHistory$.next([]);
    this.thinkingSteps$.next([]);
    this.toolStartTimes.clear();
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
    this.toolCallHistory$.next([]);
    this.thinkingSteps$.next([]);
  }

  public clearConversation(): void {
    this.cancelStream();
    this.messages$.next([]);
    this.conversationId$.next(null);
    this.error$.next(null);
    this.toolCallHistory$.next([]);
    this.thinkingSteps$.next([]);
  }

  /**
   * Record thumbs-up or thumbs-down feedback for a specific message.
   * The feedback is stored in-place on the message and submitted to the API
   * if the message carries a traceId.
   */
  public submitFeedback(messageIndex: number, score: 'down' | 'up'): void {
    const messages = [...this.messages$.getValue()];
    const msg = messages[messageIndex];

    if (!msg || msg.role !== 'assistant') {
      return;
    }

    // Toggle off if same score clicked again
    const newFeedback = msg.feedback === score ? undefined : score;
    messages[messageIndex] = { ...msg, feedback: newFeedback };
    this.messages$.next(messages);

    if (msg.traceId && newFeedback) {
      this.dataService
        .postAiFeedback({ score: newFeedback, traceId: msg.traceId })
        .pipe(takeUntil(this.unsubscribeSubject))
        .subscribe({
          error: (err) =>
            console.warn('[AiChatStateService] feedback submission failed', err)
        });
    }
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
    this.toolStartTimes.clear();
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

      case 'tool_call': {
        const key = `${event.toolName}:${event.iteration}`;
        this.toolStartTimes.set(key, Date.now());
        this.activeTool$.next(event.toolName);

        const record: ToolCallRecord = {
          iteration: event.iteration,
          name: event.toolName,
          startMs: Date.now()
        };
        this.toolCallHistory$.next([
          ...this.toolCallHistory$.getValue(),
          record
        ]);
        break;
      }

      case 'tool_result': {
        const key = `${event.toolName}:${this.findLastIteration(event.toolName)}`;
        const startMs = this.toolStartTimes.get(key) ?? Date.now();
        const endMs = Date.now();
        this.toolStartTimes.delete(key);

        // Update the last matching record in the history
        const history = this.toolCallHistory$.getValue().map((r) => {
          if (r.name === event.toolName && r.endMs === undefined) {
            return {
              ...r,
              endMs,
              durationMs: endMs - startMs,
              status: event.status,
              summary: event.summary
            };
          }
          return r;
        });
        this.toolCallHistory$.next(history);
        this.activeTool$.next(null);
        break;
      }

      case 'thinking': {
        const step: ThinkingStep = {
          iteration: event.iteration,
          maxIterations: event.maxIterations,
          timestamp: Date.now()
        };
        this.thinkingSteps$.next([...this.thinkingSteps$.getValue(), step]);
        break;
      }

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

  private findLastIteration(toolName: string): number {
    const history = this.toolCallHistory$.getValue();

    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].name === toolName && history[i].endMs === undefined) {
        return history[i].iteration;
      }
    }

    return 0;
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
        traceId: payload.traceId,
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
