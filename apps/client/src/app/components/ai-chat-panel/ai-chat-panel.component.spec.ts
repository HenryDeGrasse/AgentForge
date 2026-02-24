import { ChatMessage } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';

import { AiChatStateService } from '../../services/ai-chat-state.service';
import { AiChatPanelComponent } from './ai-chat-panel.component';

const USER_MSG: ChatMessage = { role: 'user', text: 'Hello' };
const ASSISTANT_MSG: ChatMessage = {
  confidence: 'high',
  role: 'assistant',
  sources: ['get_portfolio_summary'],
  text: 'Your portfolio is healthy.',
  warnings: []
};

function buildStateService(
  overrides: Partial<{
    messages: ChatMessage[];
    isOpen: boolean;
    isLoading: boolean;
    error: string | null;
  }> = {}
) {
  const {
    messages = [],
    isOpen = true,
    isLoading = false,
    error = null
  } = overrides;
  return {
    messages$: new BehaviorSubject<ChatMessage[]>(messages),
    isOpen$: new BehaviorSubject<boolean>(isOpen),
    isLoading$: new BehaviorSubject<boolean>(isLoading),
    error$: new BehaviorSubject<string | null>(error),
    close: jest.fn(),
    sendMessage: jest.fn(),
    clearConversation: jest.fn(),
    toggle: jest.fn(),
    open: jest.fn()
  };
}

describe('AiChatPanelComponent', () => {
  let fixture: ComponentFixture<AiChatPanelComponent>;
  let component: AiChatPanelComponent;
  let stateService: ReturnType<typeof buildStateService>;

  function setup(overrides: Parameters<typeof buildStateService>[0] = {}) {
    stateService = buildStateService(overrides);
    TestBed.configureTestingModule({
      imports: [AiChatPanelComponent, NoopAnimationsModule],
      providers: [
        { provide: AiChatStateService, useValue: stateService },
        { provide: DataService, useValue: { postAiChat: jest.fn() } }
      ]
    });
    fixture = TestBed.createComponent(AiChatPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('creates', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('is visible when isOpen is true', () => {
    setup({ isOpen: true });
    const panel = fixture.debugElement.query(By.css('.ai-panel'));
    expect(panel.nativeElement.classList.contains('open')).toBe(true);
  });

  it('is hidden when isOpen is false', () => {
    setup({ isOpen: false });
    const panel = fixture.debugElement.query(By.css('.ai-panel'));
    expect(panel.nativeElement.classList.contains('open')).toBe(false);
  });

  it('calls close() when close button clicked', () => {
    setup();
    const closeBtn = fixture.debugElement.query(By.css('.btn-close'));
    closeBtn.triggerEventHandler('click', null);
    expect(stateService.close).toHaveBeenCalled();
  });

  it('renders user messages', () => {
    setup({ messages: [USER_MSG] });
    const bubbles = fixture.debugElement.queryAll(By.css('.message-user'));
    expect(bubbles.length).toBe(1);
    expect(bubbles[0].nativeElement.textContent).toContain('Hello');
  });

  it('renders assistant messages', () => {
    setup({ messages: [ASSISTANT_MSG] });
    const bubbles = fixture.debugElement.queryAll(By.css('.message-assistant'));
    expect(bubbles.length).toBe(1);
    expect(bubbles[0].nativeElement.textContent).toContain(
      'Your portfolio is healthy.'
    );
  });

  it('renders both roles in a conversation', () => {
    setup({ messages: [USER_MSG, ASSISTANT_MSG] });
    expect(fixture.debugElement.queryAll(By.css('.message-user')).length).toBe(
      1
    );
    expect(
      fixture.debugElement.queryAll(By.css('.message-assistant')).length
    ).toBe(1);
  });

  it('shows confidence badge on assistant messages', () => {
    setup({ messages: [ASSISTANT_MSG] });
    const badge = fixture.debugElement.query(By.css('.confidence-badge'));
    expect(badge).toBeTruthy();
    expect(badge.nativeElement.textContent).toContain('high');
  });

  it('shows spinner when loading', () => {
    setup({ isLoading: true });
    const spinner = fixture.debugElement.query(By.css('.typing-indicator'));
    expect(spinner).toBeTruthy();
  });

  it('does not show spinner when not loading', () => {
    setup({ isLoading: false });
    const spinner = fixture.debugElement.query(By.css('.typing-indicator'));
    expect(spinner).toBeFalsy();
  });

  it('shows error banner when error exists', () => {
    setup({ error: 'Something went wrong.' });
    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain('Something went wrong.');
  });

  it('does not show error banner when no error', () => {
    setup({ error: null });
    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeFalsy();
  });

  it('calls sendMessage() on submit with text', () => {
    setup();
    component.inputControl.setValue('What is my risk?');
    component.onSend();
    expect(stateService.sendMessage).toHaveBeenCalledWith('What is my risk?');
  });

  it('clears input after send', () => {
    setup();
    component.inputControl.setValue('Hello');
    component.onSend();
    expect(component.inputControl.value).toBe('');
  });

  it('does not call sendMessage() for empty input', () => {
    setup();
    component.inputControl.setValue('   ');
    component.onSend();
    expect(stateService.sendMessage).not.toHaveBeenCalled();
  });

  it('shows warnings panel when warnings exist', () => {
    const msgWithWarnings: ChatMessage = {
      ...ASSISTANT_MSG,
      warnings: ['Response may be incomplete.']
    };
    setup({ messages: [msgWithWarnings] });
    const warnings = fixture.debugElement.query(By.css('.warnings-panel'));
    expect(warnings).toBeTruthy();
  });

  it('does not show warnings panel when warnings are empty', () => {
    setup({ messages: [ASSISTANT_MSG] });
    const warnings = fixture.debugElement.query(By.css('.warnings-panel'));
    expect(warnings).toBeFalsy();
  });

  it('calls clearConversation() on clear button click', () => {
    setup({ messages: [USER_MSG] });
    const clearBtn = fixture.debugElement.query(By.css('.btn-clear'));
    clearBtn.triggerEventHandler('click', null);
    expect(stateService.clearConversation).toHaveBeenCalled();
  });
});
