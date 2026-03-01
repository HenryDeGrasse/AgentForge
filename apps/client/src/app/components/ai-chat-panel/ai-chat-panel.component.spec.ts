import {
  ChatMessage,
  ConversationSummary,
  ThinkingStep,
  ToolCallRecord
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { NavigationEnd, Router } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { BehaviorSubject, of, Subject } from 'rxjs';

import { AiChatStateService } from '../../services/ai-chat-state.service';
import { AiChatPanelComponent } from './ai-chat-panel.component';

const USER_MSG: ChatMessage = { role: 'user', text: 'Hello' };
const ASSISTANT_MSG: ChatMessage = {
  confidence: 'high',
  role: 'assistant',
  sources: ['get_portfolio_summary'],
  text: 'Your portfolio is healthy.',
  traceId: 'trace-xyz',
  warnings: []
};

function buildStateService(
  overrides: Partial<{
    messages: ChatMessage[];
    isOpen: boolean;
    isLoading: boolean;
    isStreaming: boolean;
    streamingText: string;
    activeTool: string | null;
    toolCallHistory: ToolCallRecord[];
    thinkingSteps: ThinkingStep[];
    error: string | null;
  }> = {}
) {
  const {
    messages = [],
    isOpen = true,
    isLoading = false,
    isStreaming = false,
    streamingText = '',
    activeTool = null,
    toolCallHistory = [],
    thinkingSteps = [],
    error = null
  } = overrides;

  return {
    messages$: new BehaviorSubject<ChatMessage[]>(messages),
    isOpen$: new BehaviorSubject<boolean>(isOpen),
    isLoading$: new BehaviorSubject<boolean>(isLoading),
    isStreaming$: new BehaviorSubject<boolean>(isStreaming),
    streamingText$: new BehaviorSubject<string>(streamingText),
    activeTool$: new BehaviorSubject<string | null>(activeTool),
    toolCallHistory$: new BehaviorSubject<ToolCallRecord[]>(toolCallHistory),
    thinkingSteps$: new BehaviorSubject<ThinkingStep[]>(thinkingSteps),
    error$: new BehaviorSubject<string | null>(error),
    conversationId$: new BehaviorSubject<string | null>(null),
    messageSent$: new Subject<void>(),
    close: jest.fn(),
    sendMessage: jest.fn(),
    clearConversation: jest.fn(),
    newConversation: jest.fn(),
    loadConversation: jest.fn(),
    submitFeedback: jest.fn(),
    toggle: jest.fn(),
    open: jest.fn()
  };
}

const MOCK_CONVERSATIONS: ConversationSummary[] = [
  {
    createdAt: '2026-02-25T10:00:00Z',
    id: 'conv-1',
    messageCount: 2,
    title: 'Summarize my holdings',
    updatedAt: '2026-02-25T10:01:00Z'
  }
];

function buildRouter(url = '/home') {
  const events$ = new Subject<NavigationEnd>();
  return {
    url,
    events: events$.asObservable(),
    _events$: events$
  };
}

describe('AiChatPanelComponent', () => {
  let fixture: ComponentFixture<AiChatPanelComponent>;
  let component: AiChatPanelComponent;
  let stateService: ReturnType<typeof buildStateService>;
  let router: ReturnType<typeof buildRouter>;

  function setup(
    overrides: Parameters<typeof buildStateService>[0] = {},
    url = '/home'
  ) {
    stateService = buildStateService(overrides);
    router = buildRouter(url);

    TestBed.configureTestingModule({
      imports: [AiChatPanelComponent, NoopAnimationsModule],
      providers: [
        provideMarkdown(),
        { provide: AiChatStateService, useValue: stateService },
        { provide: Router, useValue: router },
        {
          provide: DataService,
          useValue: {
            postAiChat: jest.fn(),
            fetchAiConversations: jest
              .fn()
              .mockReturnValue(of(MOCK_CONVERSATIONS)),
            deleteAiConversation: jest.fn().mockReturnValue(of(null))
          }
        }
      ]
    });
    fixture = TestBed.createComponent(AiChatPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // ─── basic rendering ──────────────────────────────────────────────────────
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

  it('shows backdrop element when panel is open', () => {
    setup({ isOpen: true });
    const backdrop = fixture.debugElement.query(By.css('.ai-backdrop'));
    expect(backdrop).toBeTruthy();
  });

  it('does not show backdrop when panel is closed', () => {
    setup({ isOpen: false });
    const backdrop = fixture.debugElement.query(By.css('.ai-backdrop'));
    expect(backdrop).toBeFalsy();
  });

  it('calls close() when backdrop is clicked', () => {
    setup({ isOpen: true });
    const backdrop = fixture.debugElement.query(By.css('.ai-backdrop'));
    backdrop.triggerEventHandler('click', null);
    expect(stateService.close).toHaveBeenCalled();
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

  it('renders assistant messages', fakeAsync(() => {
    setup({ messages: [ASSISTANT_MSG] });
    tick();
    fixture.detectChanges();
    const bubbles = fixture.debugElement.queryAll(By.css('.message-assistant'));
    expect(bubbles.length).toBe(1);
    expect(bubbles[0].nativeElement.textContent).toContain(
      'Your portfolio is healthy.'
    );
  }));

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

  it('shows spinner when loading and not streaming', () => {
    setup({ isLoading: true, isStreaming: false });
    const spinner = fixture.debugElement.query(By.css('.typing-indicator'));
    expect(spinner).toBeTruthy();
  });

  it('does not show spinner when not loading', () => {
    setup({ isLoading: false });
    const spinner = fixture.debugElement.query(By.css('.typing-indicator'));
    expect(spinner).toBeFalsy();
  });

  it('does not show spinner when streaming (streaming bubble takes precedence)', () => {
    setup({ isLoading: true, isStreaming: true, streamingText: 'Hello…' });
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

  // ─── streaming preview ────────────────────────────────────────────────────
  it('shows streaming preview bubble when isStreaming and streamingText present', fakeAsync(() => {
    setup({ isStreaming: true, streamingText: 'Analyzing…' });
    tick();
    fixture.detectChanges();
    const preview = fixture.debugElement.query(By.css('.streaming-preview'));
    expect(preview).toBeTruthy();
    // The markdown component renders asynchronously; just verify the container exists
    // and the markdown child is present (content verified in e2e)
    expect(preview.nativeElement).toBeTruthy();
  }));

  it('does not show streaming preview when not streaming', () => {
    setup({ isStreaming: false });
    const preview = fixture.debugElement.query(By.css('.streaming-preview'));
    expect(preview).toBeFalsy();
  });

  it('shows blinking cursor inside streaming preview', () => {
    setup({ isStreaming: true, streamingText: 'hello' });
    const cursor = fixture.debugElement.query(By.css('.cursor-blink'));
    expect(cursor).toBeTruthy();
  });

  // ─── keyboard shortcut label in header ───────────────────────────────────
  it('renders ⌘K shortcut badge in header', () => {
    setup();
    const shortcut = fixture.debugElement.query(By.css('.panel-shortcut'));
    expect(shortcut).toBeTruthy();
    expect(shortcut.nativeElement.textContent.trim()).toContain('⌘K');
  });

  // ─── confidence badge with tooltip ───────────────────────────────────────
  it('provides tooltip text for all confidence levels', () => {
    setup();
    // Verify the tooltip text map covers all three levels
    expect(component.confidenceTooltips['high']).toContain('verified');
    expect(component.confidenceTooltips['medium']).toContain('approximated');
    expect(component.confidenceTooltips['low']).toContain('verify');
  });

  it('confidence badge is rendered for each confidence level', () => {
    (['high', 'medium', 'low'] as const).forEach((level) => {
      const msg: ChatMessage = { ...ASSISTANT_MSG, confidence: level };
      setup({ messages: [msg] });
      const badge = fixture.debugElement.query(By.css(`.confidence-${level}`));
      expect(badge).toBeTruthy();
      TestBed.resetTestingModule();
    });
  });

  // ─── copy button ─────────────────────────────────────────────────────────
  it('renders a copy button on assistant messages', () => {
    setup({ messages: [ASSISTANT_MSG] });
    const copyBtn = fixture.debugElement.query(By.css('.copy-btn'));
    expect(copyBtn).toBeTruthy();
  });

  it('calls onCopyMessage() when copy button is clicked', () => {
    setup({ messages: [ASSISTANT_MSG] });
    const spy = jest
      .spyOn(component, 'onCopyMessage')
      .mockImplementation(jest.fn());
    const copyBtn = fixture.debugElement.query(By.css('.copy-btn'));
    copyBtn.triggerEventHandler('click', null);
    expect(spy).toHaveBeenCalled();
  });

  it('sets copiedIndex and resets it after delay', fakeAsync(() => {
    setup({ messages: [USER_MSG, ASSISTANT_MSG] });
    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true
    });
    expect(component.copiedIndex).toBeNull();
    component.onCopyMessage('Some text', 1);
    // Wait for the promise micro-task
    tick(0);
    expect(component.copiedIndex).toBe(1);
    // After 1800ms the index resets
    tick(1800);
    expect(component.copiedIndex).toBeNull();
  }));

  // ─── feedback buttons ─────────────────────────────────────────────────────
  it('renders feedback buttons when assistant message has traceId', () => {
    setup({ messages: [ASSISTANT_MSG] }); // ASSISTANT_MSG has traceId
    const feedbackBtns = fixture.debugElement.queryAll(By.css('.feedback-btn'));
    expect(feedbackBtns.length).toBe(2); // thumbs up + down
  });

  it('does not render feedback buttons when assistant message has no traceId', () => {
    const msgNoTrace: ChatMessage = { ...ASSISTANT_MSG, traceId: undefined };
    setup({ messages: [msgNoTrace] });
    const feedbackBtns = fixture.debugElement.queryAll(By.css('.feedback-btn'));
    expect(feedbackBtns.length).toBe(0);
  });

  it('calls stateService.submitFeedback with correct args on thumbs-up click', () => {
    setup({ messages: [USER_MSG, ASSISTANT_MSG] });
    const feedbackBtns = fixture.debugElement.queryAll(By.css('.feedback-btn'));
    const thumbsUp = feedbackBtns[0]; // first = up
    thumbsUp.triggerEventHandler('click', null);
    // assistant is at index 1 (user at 0)
    expect(stateService.submitFeedback).toHaveBeenCalledWith(1, 'up');
  });

  it('calls stateService.submitFeedback with "down" on thumbs-down click', () => {
    setup({ messages: [USER_MSG, ASSISTANT_MSG] });
    const feedbackBtns = fixture.debugElement.queryAll(By.css('.feedback-btn'));
    const thumbsDown = feedbackBtns[1];
    thumbsDown.triggerEventHandler('click', null);
    expect(stateService.submitFeedback).toHaveBeenCalledWith(1, 'down');
  });

  it('shows active state on thumbs-up button when feedback is "up"', () => {
    const msgWithFeedback: ChatMessage = {
      ...ASSISTANT_MSG,
      feedback: 'up'
    };
    setup({ messages: [msgWithFeedback] });
    const feedbackBtns = fixture.debugElement.queryAll(By.css('.feedback-btn'));
    expect(feedbackBtns[0].nativeElement.classList.contains('active')).toBe(
      true
    );
    expect(feedbackBtns[1].nativeElement.classList.contains('active')).toBe(
      false
    );
  });

  // ─── tool call timeline ───────────────────────────────────────────────────
  it('shows tool timeline while loading with tool call history', () => {
    const toolHistory: ToolCallRecord[] = [
      {
        endMs: undefined,
        iteration: 1,
        name: 'analyze_risk',
        startMs: Date.now()
      }
    ];
    setup({ isLoading: true, toolCallHistory: toolHistory });
    const timeline = fixture.debugElement.query(By.css('.tool-timeline'));
    expect(timeline).toBeTruthy();
  });

  it('does not show tool timeline when not loading', () => {
    const toolHistory: ToolCallRecord[] = [
      {
        endMs: Date.now(),
        iteration: 1,
        name: 'analyze_risk',
        startMs: Date.now() - 800,
        status: 'success'
      }
    ];
    setup({ isLoading: false, toolCallHistory: toolHistory });
    const timeline = fixture.debugElement.query(By.css('.tool-timeline'));
    expect(timeline).toBeFalsy();
  });

  it('renders each tool call as a tool-record', () => {
    const toolHistory: ToolCallRecord[] = [
      {
        endMs: undefined,
        iteration: 1,
        name: 'analyze_risk',
        startMs: Date.now()
      },
      {
        endMs: undefined,
        iteration: 1,
        name: 'get_portfolio_summary',
        startMs: Date.now()
      }
    ];
    setup({ isLoading: true, toolCallHistory: toolHistory });
    const records = fixture.debugElement.queryAll(By.css('.tool-record'));
    expect(records.length).toBe(2);
  });

  it('shows spinner for pending (incomplete) tool records', () => {
    const toolHistory: ToolCallRecord[] = [
      {
        endMs: undefined,
        iteration: 1,
        name: 'analyze_risk',
        startMs: Date.now()
      }
    ];
    setup({ isLoading: true, toolCallHistory: toolHistory });
    const spinner = fixture.debugElement.query(By.css('.tool-spinner'));
    expect(spinner).toBeTruthy();
  });

  it('shows duration for completed tool records', () => {
    const now = Date.now();
    const toolHistory: ToolCallRecord[] = [
      {
        endMs: now,
        iteration: 1,
        name: 'analyze_risk',
        startMs: now - 800,
        status: 'success'
      }
    ];
    setup({ isLoading: true, toolCallHistory: toolHistory });
    const duration = fixture.debugElement.query(
      By.css('.tool-record-duration')
    );
    expect(duration).toBeTruthy();
    expect(duration.nativeElement.textContent).toContain('s');
  });

  it('formatDuration returns seconds with 1 decimal place', () => {
    setup();
    expect(component.formatDuration(0, 800)).toBe('0.8s');
    expect(component.formatDuration(0, 1200)).toBe('1.2s');
    expect(component.formatDuration(0, 0)).toBe('0.0s');
  });

  // ─── thinking drawer ──────────────────────────────────────────────────────
  it('shows thinking toggle button when thinkingSteps exist', () => {
    const steps: ThinkingStep[] = [
      { iteration: 1, maxIterations: 15, timestamp: Date.now() }
    ];
    setup({ thinkingSteps: steps });
    const btn = fixture.debugElement.query(By.css('.btn-thinking'));
    expect(btn).toBeTruthy();
  });

  it('does not show thinking toggle button when no thinking steps', () => {
    setup({ thinkingSteps: [] });
    const btn = fixture.debugElement.query(By.css('.btn-thinking'));
    expect(btn).toBeFalsy();
  });

  it('toggles thinking drawer on button click', () => {
    const steps: ThinkingStep[] = [
      { iteration: 1, maxIterations: 15, timestamp: Date.now() }
    ];
    setup({ thinkingSteps: steps });

    expect(component.showThinking).toBe(false);
    const btn = fixture.debugElement.query(By.css('.btn-thinking'));
    btn.triggerEventHandler('click', null);
    expect(component.showThinking).toBe(true);

    btn.triggerEventHandler('click', null);
    expect(component.showThinking).toBe(false);
  });

  it('shows thinking drawer content when showThinking is true', fakeAsync(() => {
    const steps: ThinkingStep[] = [
      { iteration: 1, maxIterations: 15, timestamp: Date.now() },
      { iteration: 2, maxIterations: 15, timestamp: Date.now() }
    ];
    setup({ thinkingSteps: steps });

    // Toggle showThinking to true — this must be done via the public API
    // so OnPush change detection picks up the mutation.
    const btn = fixture.debugElement.query(By.css('.btn-thinking'));
    btn.triggerEventHandler('click', null);
    tick();
    fixture.detectChanges();

    const drawer = fixture.debugElement.query(By.css('.thinking-drawer'));
    expect(drawer).toBeTruthy();
    const stepEls = fixture.debugElement.queryAll(By.css('.thinking-step'));
    expect(stepEls.length).toBe(2);
  }));

  // ─── context-aware suggestion chips ──────────────────────────────────────
  it('shows default suggestion chips on /home route', () => {
    setup({}, '/home');
    expect(component.suggestionChips).toContain('Summarize my holdings');
    expect(component.suggestionChips).toContain('Analyze my risk');
  });

  it('shows accounts-specific chips on /accounts route', () => {
    setup({}, '/accounts');
    expect(component.suggestionChips).toContain(
      'Analyze my account diversification'
    );
    expect(component.suggestionChips).toContain(
      'Which account has the best returns?'
    );
  });

  it('shows activities-specific chips on /portfolio/activities route', () => {
    setup({}, '/portfolio/activities');
    expect(component.suggestionChips).toContain('Summarize my recent trades');
    expect(component.suggestionChips).toContain(
      'Estimate my tax liability this year'
    );
  });

  it('shows portfolio-specific chips on /portfolio route', () => {
    setup({}, '/portfolio');
    expect(component.suggestionChips).toContain(
      'Analyze my overall risk profile'
    );
  });

  it('updates suggestion chips reactively on NavigationEnd', () => {
    setup({}, '/home');
    expect(component.suggestionChips).toContain('Summarize my holdings');

    (router as any)._events$.next(
      new NavigationEnd(1, '/accounts', '/accounts')
    );
    fixture.detectChanges();

    expect(component.suggestionChips).toContain(
      'Analyze my account diversification'
    );
  });

  it('shows correct number of suggestion chips in grid', () => {
    setup({});
    const chips = fixture.debugElement.queryAll(By.css('.suggestion-chip'));
    expect(chips.length).toBe(component.suggestionChips.length);
  });

  // ─── drawer refresh after sendMessage ──────────────────────────────────────
  it('refreshes conversation list when messageSent$ fires and drawer is open', () => {
    setup();
    const dataService = TestBed.inject(DataService) as jest.Mocked<DataService>;
    dataService.fetchAiConversations.mockReturnValue(of(MOCK_CONVERSATIONS));

    component.showHistory = true;
    stateService.messageSent$.next();

    expect(dataService.fetchAiConversations).toHaveBeenCalled();
  });

  it('does not refresh conversation list when messageSent$ fires and drawer is closed', () => {
    setup();
    const dataService = TestBed.inject(DataService) as jest.Mocked<DataService>;

    component.showHistory = false;
    stateService.messageSent$.next();

    expect(dataService.fetchAiConversations).not.toHaveBeenCalled();
  });

  // ─── getRelativeTime ──────────────────────────────────────────────────────
  it('getRelativeTime returns "just now" for <1 min ago', () => {
    setup();
    const now = new Date().toISOString();
    expect(component.getRelativeTime(now)).toBe('just now');
  });

  it('getRelativeTime returns minutes ago', () => {
    setup();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(component.getRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('getRelativeTime returns hours ago', () => {
    setup();
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000
    ).toISOString();
    expect(component.getRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('getRelativeTime returns days ago', () => {
    setup();
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(component.getRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  // ─── Escape key ────────────────────────────────────────────────────────────
  it('calls stateService.close() when Escape is pressed while panel is open', () => {
    setup({ isOpen: true });
    component.onEscape();
    expect(stateService.close).toHaveBeenCalled();
  });

  it('does not call stateService.close() when Escape is pressed while panel is already closed', () => {
    setup({ isOpen: false });
    component.onEscape();
    expect(stateService.close).not.toHaveBeenCalled();
  });

  // ─── Auto-focus ────────────────────────────────────────────────────────────
  it('focuses the textarea input element when the panel opens', fakeAsync(() => {
    // Start with panel closed so we can observe the open transition
    setup({ isOpen: false });

    // Create a mock native element with a jest.fn() focus
    const mockTextarea = { focus: jest.fn() } as unknown as HTMLTextAreaElement;
    // Patch the private ViewChild reference
    (component as any).inputRef = { nativeElement: mockTextarea };

    // Now open the panel
    stateService.isOpen$.next(true);
    fixture.detectChanges();

    // The subscription uses setTimeout(50) before focusing
    tick(50);
    expect(mockTextarea.focus).toHaveBeenCalled();
  }));

  // ─── "What can I ask?" capability list ─────────────────────────────────────
  it('exposes 10 capability entries in the CAPABILITIES array', () => {
    setup();
    expect(component.CAPABILITIES).toHaveLength(10);
  });

  it('each capability entry has label, desc, prompt, and tool fields', () => {
    setup();
    for (const cap of component.CAPABILITIES) {
      expect(typeof cap.label).toBe('string');
      expect(typeof cap.desc).toBe('string');
      expect(typeof cap.prompt).toBe('string');
      expect(cap.prompt.length).toBeGreaterThan(0);
      expect(typeof cap.tool).toBe('string');
    }
  });

  it('renders the capability-list <details> element in empty state', () => {
    setup({ isOpen: true });
    fixture.detectChanges();
    const details = fixture.debugElement.query(By.css('.capability-list'));
    expect(details).toBeTruthy();
  });

  it('renders the correct number of capability items', () => {
    setup({ isOpen: true });
    fixture.detectChanges();
    const items = fixture.debugElement.queryAll(By.css('.capability-item'));
    expect(items).toHaveLength(10);
  });

  it('does not render the capability-list when messages are present', () => {
    setup({ isOpen: true, messages: [USER_MSG, ASSISTANT_MSG] });
    fixture.detectChanges();
    const details = fixture.debugElement.query(By.css('.capability-list'));
    expect(details).toBeNull();
  });

  it('onCapabilityClick pre-fills the input control with the capability prompt', () => {
    setup();
    const prompt =
      'Analyze my portfolio risk — concentration, sector exposure, and any positions I should be concerned about.';
    component.onCapabilityClick(prompt);
    expect(component.inputControl.value).toBe(prompt);
  });

  it('clicking a capability-item sets the input value', () => {
    setup({ isOpen: true });
    fixture.detectChanges();
    const firstItem = fixture.debugElement.query(By.css('.capability-item'));
    firstItem.triggerEventHandler('click', null);
    expect(component.inputControl.value).toBe(component.CAPABILITIES[0].prompt);
  });
});
