import { AuthGuard } from '@ghostfolio/client/core/auth.guard';

import { Routes } from '@angular/router';

import { AiChatPageComponent } from './ai-chat-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    component: AiChatPageComponent,
    path: '',
    title: 'AI Advisor'
  }
];
