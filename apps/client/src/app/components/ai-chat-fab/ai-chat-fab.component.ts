import { AiChatStateService } from '@ghostfolio/client/services/ai-chat-state.service';

import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe],
  selector: 'gf-ai-chat-fab',
  styleUrls: ['./ai-chat-fab.component.scss'],
  templateUrl: './ai-chat-fab.component.html'
})
export class AiChatFabComponent implements OnInit, OnDestroy {
  @HostBinding('class.hidden') public isHidden = false;

  public isLoading$ = this.stateService.isLoading$;

  private unsubscribeSubject = new Subject<void>();

  public constructor(public readonly stateService: AiChatStateService) {}

  public ngOnInit(): void {
    this.stateService.isOpen$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((isOpen) => {
        this.isHidden = isOpen;
      });
  }

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public onToggle(): void {
    this.stateService.toggle();
  }
}
