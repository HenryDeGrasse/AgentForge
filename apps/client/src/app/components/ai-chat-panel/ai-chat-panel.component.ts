import { AiChatStateService } from '@ghostfolio/client/services/ai-chat-state.service';
import { ChatMessage } from '@ghostfolio/common/interfaces';

import { AsyncPipe } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, ReactiveFormsModule],
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

  public inputControl = new FormControl('', { nonNullable: true });

  private shouldScrollToBottom = false;
  private unsubscribeSubject = new Subject<void>();

  public constructor(public readonly stateService: AiChatStateService) {
    // Scroll to bottom whenever messages update
    this.messages$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => (this.shouldScrollToBottom = true));
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

  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  public hasWarnings(msg: ChatMessage): boolean {
    return !!msg.warnings && msg.warnings.length > 0;
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
