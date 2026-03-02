import { AiChatStateService } from '@ghostfolio/client/services/ai-chat-state.service';

import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  OnDestroy,
  OnInit
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

/**
 * Routes where the page renders its own page-level FAB (e.g. "Add Account").
 * On these routes the AI FAB shifts upward to avoid collision.
 */
const PAGE_FAB_ROUTES: string[] = [
  '/accounts',
  '/portfolio/activities',
  '/account' // user-account-access also has a FAB
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe],
  selector: 'gf-ai-chat-fab',
  styleUrls: ['./ai-chat-fab.component.scss'],
  templateUrl: './ai-chat-fab.component.html'
})
export class AiChatFabComponent implements OnInit, OnDestroy {
  @HostBinding('class.hidden') public isHidden = false;
  @HostBinding('class.has-page-fab') public hasPageFab = false;

  public isLoading$ = this.stateService.isLoading$;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    public readonly stateService: AiChatStateService,
    private readonly router: Router,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    this.stateService.isOpen$
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((isOpen) => {
        this.isHidden = isOpen;
        this.changeDetectorRef.markForCheck();
      });

    // Keep hasPageFab in sync with route changes
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe((e: NavigationEnd) => {
        this.hasPageFab = PAGE_FAB_ROUTES.some((route) =>
          e.urlAfterRedirects.startsWith(route)
        );
        this.changeDetectorRef.markForCheck();
      });

    // Evaluate immediately for the current route on first render
    this.hasPageFab = PAGE_FAB_ROUTES.some((route) =>
      this.router.url.startsWith(route)
    );
  }

  public ngOnDestroy(): void {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public onToggle(): void {
    this.stateService.toggle();
  }
}
