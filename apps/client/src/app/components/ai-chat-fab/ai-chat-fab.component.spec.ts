import { DataService } from '@ghostfolio/ui/services';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AiChatStateService } from '../../services/ai-chat-state.service';
import { AiChatFabComponent } from './ai-chat-fab.component';

function buildStateService(overrides: Partial<AiChatStateService> = {}) {
  return {
    isOpen$: of(false),
    isLoading$: of(false),
    toggle: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
    ...overrides
  };
}

describe('AiChatFabComponent', () => {
  let fixture: ComponentFixture<AiChatFabComponent>;
  let component: AiChatFabComponent;
  let stateService: ReturnType<typeof buildStateService>;

  function setup(overrides: Partial<AiChatStateService> = {}) {
    stateService = buildStateService(overrides);
    TestBed.configureTestingModule({
      imports: [AiChatFabComponent, NoopAnimationsModule],
      providers: [
        { provide: AiChatStateService, useValue: stateService },
        { provide: DataService, useValue: { postAiChat: jest.fn() } }
      ]
    });
    fixture = TestBed.createComponent(AiChatFabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('creates the component', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('renders a button', () => {
    setup();
    const btn = fixture.debugElement.query(By.css('button'));
    expect(btn).toBeTruthy();
  });

  it('hides when panel is open', () => {
    setup({ isOpen$: of(true) });
    const host = fixture.debugElement.nativeElement as HTMLElement;
    expect(host.classList.contains('hidden')).toBe(true);
  });

  it('shows when panel is closed', () => {
    setup({ isOpen$: of(false) });
    const host = fixture.debugElement.nativeElement as HTMLElement;
    expect(host.classList.contains('hidden')).toBe(false);
  });

  it('calls toggle() on button click', () => {
    setup();
    const btn = fixture.debugElement.query(By.css('button'));
    btn.triggerEventHandler('click', null);
    expect(stateService.toggle).toHaveBeenCalled();
  });

  it('shows loading indicator when loading', () => {
    setup({ isLoading$: of(true) });
    const loading = fixture.debugElement.query(By.css('.fab-loading'));
    expect(loading).toBeTruthy();
  });

  it('does not show loading indicator when idle', () => {
    setup({ isLoading$: of(false) });
    const loading = fixture.debugElement.query(By.css('.fab-loading'));
    expect(loading).toBeFalsy();
  });
});
