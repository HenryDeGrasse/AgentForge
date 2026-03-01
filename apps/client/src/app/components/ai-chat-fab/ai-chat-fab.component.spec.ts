import { AiChatStateService } from '@ghostfolio/client/services/ai-chat-state.service';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';

import { AiChatFabComponent } from './ai-chat-fab.component';

function buildStateService(isOpen = false, isLoading = false) {
  return {
    isLoading$: new BehaviorSubject<boolean>(isLoading),
    isOpen$: new BehaviorSubject<boolean>(isOpen),
    toggle: jest.fn(),
    open: jest.fn(),
    close: jest.fn()
  };
}

function buildRouter(url = '/home') {
  const events$ = new Subject<NavigationEnd>();
  return {
    url,
    events: events$.asObservable(),
    _events$: events$ // expose for test control
  };
}

describe('AiChatFabComponent', () => {
  let fixture: ComponentFixture<AiChatFabComponent>;
  let component: AiChatFabComponent;
  let stateService: ReturnType<typeof buildStateService>;
  let router: ReturnType<typeof buildRouter>;

  function setup(
    url = '/home',
    overrides: { isOpen?: boolean; isLoading?: boolean } = {}
  ) {
    stateService = buildStateService(overrides.isOpen, overrides.isLoading);
    router = buildRouter(url);

    TestBed.configureTestingModule({
      imports: [AiChatFabComponent],
      providers: [
        { provide: AiChatStateService, useValue: stateService },
        { provide: Router, useValue: router }
      ]
    });

    fixture = TestBed.createComponent(AiChatFabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // ─── basic rendering ──────────────────────────────────────────────────────
  it('creates', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('renders the fab button', () => {
    setup();
    const btn = fixture.debugElement.query(By.css('.fab-btn'));
    expect(btn).toBeTruthy();
  });

  it('shows "AI Advisor" label when not loading', () => {
    setup('/home', { isLoading: false });
    const label = fixture.debugElement.query(By.css('.fab-label'));
    expect(label?.nativeElement.textContent).toContain('AI Advisor');
  });

  it('shows loading dots when isLoading is true', () => {
    setup('/home', { isLoading: true });
    const loading = fixture.debugElement.query(By.css('.fab-loading'));
    expect(loading).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.fab-label'))).toBeFalsy();
  });

  it('calls toggle() when button is clicked', () => {
    setup();
    const btn = fixture.debugElement.query(By.css('.fab-btn'));
    btn.triggerEventHandler('click', null);
    expect(stateService.toggle).toHaveBeenCalled();
  });

  // ─── visibility (hidden class) ────────────────────────────────────────────
  it('is NOT hidden when panel is closed', () => {
    setup('/home', { isOpen: false });
    expect(component.isHidden).toBe(false);
  });

  it('IS hidden when panel is open', () => {
    setup('/home', { isOpen: true });
    expect(component.isHidden).toBe(true);
  });

  it('hides when isOpen$ emits true', () => {
    setup('/home', { isOpen: false });
    (stateService.isOpen$ as BehaviorSubject<boolean>).next(true);
    fixture.detectChanges();
    expect(component.isHidden).toBe(true);
  });

  it('shows when isOpen$ emits false after being open', () => {
    setup('/home', { isOpen: true });
    (stateService.isOpen$ as BehaviorSubject<boolean>).next(false);
    fixture.detectChanges();
    expect(component.isHidden).toBe(false);
  });

  // ─── FAB overlap fix: has-page-fab on known routes ────────────────────────
  it('hasPageFab is false on /home', () => {
    setup('/home');
    expect(component.hasPageFab).toBe(false);
  });

  it('hasPageFab is false on /portfolio/analysis', () => {
    setup('/portfolio/analysis');
    expect(component.hasPageFab).toBe(false);
  });

  it('hasPageFab is TRUE on /accounts', () => {
    setup('/accounts');
    expect(component.hasPageFab).toBe(true);
  });

  it('hasPageFab is TRUE on /portfolio/activities', () => {
    setup('/portfolio/activities');
    expect(component.hasPageFab).toBe(true);
  });

  it('hasPageFab is TRUE on /account (user-account-access)', () => {
    setup('/account');
    expect(component.hasPageFab).toBe(true);
  });

  it('updates hasPageFab reactively on NavigationEnd to /accounts', () => {
    setup('/home');
    expect(component.hasPageFab).toBe(false);

    // Simulate navigation to /accounts
    (router as any)._events$.next(
      new NavigationEnd(1, '/accounts', '/accounts')
    );
    fixture.detectChanges();

    expect(component.hasPageFab).toBe(true);
  });

  it('updates hasPageFab reactively on NavigationEnd away from /accounts', () => {
    setup('/accounts');
    expect(component.hasPageFab).toBe(true);

    (router as any)._events$.next(
      new NavigationEnd(2, '/portfolio', '/portfolio')
    );
    fixture.detectChanges();

    expect(component.hasPageFab).toBe(false);
  });

  it('applies has-page-fab host class on page-FAB routes', () => {
    setup('/accounts');
    // The @HostBinding sets hasPageFab which Angular maps to the class
    expect(component.hasPageFab).toBe(true);
  });
});
