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
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { BehaviorSubject, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AiChatChartComponent,
    AsyncPipe,
    MarkdownComponent,
    ReactiveFormsModule
  ],
  selector: 'gf-ai-chat-panel',
  styleUrls: ['./ai-chat-panel.component.scss'],
  templateUrl: './ai-chat-panel.component.html'
})
export class AiChatPanelComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('messageList') private messageListRef: ElementRef<HTMLElement>;

  public readonly messages$ = this.stateService.messages$;
  public readonly isOpen$ = this.stateService.isOpen$;
  public readonly isLoading$ = this.stateService.isLoading$;
  public readonly error$ = this.stateService.error$;
  public readonly streamingText$ = this.stateService.streamingText$;
  public readonly activeTool$ = this.stateService.activeTool$;
  public readonly isStreaming$ = this.stateService.isStreaming$;

  public inputControl = new FormControl('', { nonNullable: true });
  public showHistory = false;
  public conversations$ = new BehaviorSubject<ConversationSummary[]>([]);

  public readonly SUGGESTION_CHIPS = [
    'Summarize my holdings',
    'Analyze my risk',
    'Check compliance',
    'Compare performance',
    'Estimate taxes',
    'Suggest rebalancing'
  ];

  private shouldScrollToBottom = false;
  private unsubscribeSubject = new Subject<void>();
  private readonly refreshTrigger$ = new Subject<void>();

  public constructor(
    public readonly stateService: AiChatStateService,
    private readonly dataService: DataService,
    private readonly changeDetectorRef: ChangeDetectorRef
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
