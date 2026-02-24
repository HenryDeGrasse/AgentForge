import { AiChatStateService } from '@ghostfolio/client/services/ai-chat-state.service';

import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Standalone full-page AI chat view.
 * Opens the persistent AI chat panel and redirects to the home page
 * so the user can see their portfolio while chatting.
 */
@Component({
  host: { class: 'page' },
  imports: [CommonModule],
  selector: 'gf-ai-chat-page',
  template: ''
})
export class AiChatPageComponent implements OnInit {
  public constructor(
    private readonly aiChatStateService: AiChatStateService,
    private readonly router: Router
  ) {}

  public ngOnInit(): void {
    this.aiChatStateService.open();
    this.router.navigate(['/']);
  }
}
