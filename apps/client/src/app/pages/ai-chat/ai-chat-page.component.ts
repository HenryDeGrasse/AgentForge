import {
  AiChatConfidence,
  AiChatResponse
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';

export interface ChatMessage {
  confidence?: AiChatConfidence;
  role: 'assistant' | 'user';
  sources?: string[];
  text: string;
  warnings?: string[];
}

const DEFAULT_TOOL_NAMES = [
  'get_portfolio_summary',
  'get_transaction_history',
  'analyze_risk'
];

@Component({
  host: { class: 'page' },
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  selector: 'gf-ai-chat-page',
  styleUrls: ['./ai-chat-page.scss'],
  templateUrl: './ai-chat-page.html'
})
export class AiChatPageComponent implements OnDestroy {
  public error: string | null = null;
  public isLoading = false;
  public messageControl = new FormControl('', { nonNullable: true });
  public messages: ChatMessage[] = [];

  private unsubscribeSubject = new Subject<void>();

  public constructor(private readonly dataService: DataService) {}

  public sendMessage(): void {
    const text = this.messageControl.value.trim();

    if (!text) {
      return;
    }

    this.messages.push({ role: 'user', text });
    this.messageControl.setValue('');
    this.isLoading = true;
    this.error = null;

    this.dataService
      .postAiChat({ message: text, toolNames: DEFAULT_TOOL_NAMES })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        error: () => {
          this.error = 'Failed to get a response. Please try again.';
          this.isLoading = false;
        },
        next: (response: AiChatResponse) => {
          this.messages.push({
            confidence: response.confidence,
            role: 'assistant',
            sources: response.sources,
            text: response.response,
            warnings: response.warnings
          });
          this.isLoading = false;
        }
      });
  }

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }
}
