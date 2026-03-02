import { AiChatResponse, SseEvent } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AiChatStateService } from './ai-chat-state.service';

const MOCK_RESPONSE: AiChatResponse = {
  chartData: [],
  confidence: 'high',
  conversationId: 'conv-1',
  elapsedMs: 2000,
  estimatedCostUsd: 0.001,
  iterations: 1,
  response: 'Your portfolio looks healthy.',
  sources: ['get_portfolio_summary'],
  status: 'completed',
  toolCalls: 1,
  traceId: 'trace-abc123',
  warnings: []
};

/** Builds a stream of SSE events ending with a done event. */
function buildDoneStream(payload: AiChatResponse = MOCK_RESPONSE): SseEvent[] {
  return [{ type: 'done', payload } as SseEvent];
}

function configureModule(
  streamAiChat: jest.Mock,
  extras: Partial<{ postAiFeedback: jest.Mock }> = {}
): AiChatStateService {
  TestBed.configureTestingModule({
    providers: [
      AiChatStateService,
      {
        provide: DataService,
        useValue: {
          streamAiChat,
          postAiFeedback:
            extras.postAiFeedback ?? jest.fn().mockReturnValue(of(null))
        }
      }
    ]
  });
  return TestBed.inject(AiChatStateService);
}

// ─── success path ────────────────────────────────────────────────────────────
describe('AiChatStateService (success mock)', () => {
  let service: AiChatStateService;
  let mockStream: jest.Mock;

  beforeEach(() => {
    mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    service = configureModule(mockStream);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('should create', () => expect(service).toBeTruthy());

  it('starts closed', (done) => {
    service.isOpen$.subscribe((v) => {
      expect(v).toBe(false);
      done();
    });
  });

  it('starts with empty messages', (done) => {
    service.messages$.subscribe((msgs) => {
      expect(msgs).toEqual([]);
      done();
    });
  });

  it('starts with no error', (done) => {
    service.error$.subscribe((e) => {
      expect(e).toBeNull();
      done();
    });
  });

  it('starts not loading', (done) => {
    service.isLoading$.subscribe((v) => {
      expect(v).toBe(false);
      done();
    });
  });

  it('open() sets isOpen to true', (done) => {
    service.open();
    service.isOpen$.subscribe((v) => {
      expect(v).toBe(true);
      done();
    });
  });

  it('close() sets isOpen to false after open', (done) => {
    service.open();
    service.close();
    service.isOpen$.subscribe((v) => {
      expect(v).toBe(false);
      done();
    });
  });

  it('toggle() opens when closed', (done) => {
    service.toggle();
    service.isOpen$.subscribe((v) => {
      expect(v).toBe(true);
      done();
    });
  });

  it('toggle() closes when open', (done) => {
    service.open();
    service.toggle();
    service.isOpen$.subscribe((v) => {
      expect(v).toBe(false);
      done();
    });
  });

  it('does not send empty / whitespace messages', () => {
    service.sendMessage('   ');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs.length).toBe(0);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('appends user message immediately', () => {
    service.sendMessage('Hello');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs[0]).toEqual({ role: 'user', text: 'Hello' });
  });

  it('appends assistant message on done event', () => {
    service.sendMessage('Hello');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs.length).toBe(2);
    expect(msgs[1]).toMatchObject({
      chartData: [],
      confidence: 'high',
      role: 'assistant',
      sources: ['get_portfolio_summary'],
      text: 'Your portfolio looks healthy.',
      traceId: 'trace-abc123',
      warnings: []
    });
  });

  it('sets isLoading to false after done', () => {
    service.sendMessage('Hello');
    let loading: boolean;
    service.isLoading$.subscribe((v) => (loading = v));
    expect(loading).toBe(false);
  });

  it('emits messageSent$ on successful send', (done) => {
    service.messageSent$.subscribe(() => done());
    service.sendMessage('Hello');
  });

  it('emits messageSent$ once per send on success', () => {
    let emitCount = 0;
    service.messageSent$.subscribe(() => emitCount++);
    service.sendMessage('Hello');
    service.sendMessage('World');
    expect(emitCount).toBe(2);
  });

  it('accumulates multiple turns', () => {
    service.sendMessage('Hello');
    service.sendMessage('Tell me more');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs.length).toBe(4);
    expect(msgs[2].role).toBe('user');
    expect(msgs[3].role).toBe('assistant');
  });

  it('clearConversation resets messages', () => {
    service.sendMessage('Hello');
    service.clearConversation();
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs).toEqual([]);
  });

  it('clearConversation resets error', () => {
    service.clearConversation();
    let error: string | null;
    service.error$.subscribe((e) => (error = e));
    expect(error).toBeNull();
  });

  it('stores conversationId from done event', () => {
    service.sendMessage('Hello');
    let convId: string | null;
    service.conversationId$.subscribe((v) => (convId = v));
    expect(convId).toBe('conv-1');
  });
});

// ─── streaming events ────────────────────────────────────────────────────────
describe('AiChatStateService (streaming events)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sets activeTool$ on tool_call event', fakeAsync(() => {
    const events: SseEvent[] = [
      { type: 'tool_call', toolName: 'analyze_risk', iteration: 1 },
      {
        type: 'tool_result',
        toolName: 'analyze_risk',
        status: 'success',
        summary: 'done'
      },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);

    const toolHistory: (string | null)[] = [];
    service.activeTool$.subscribe((v) => toolHistory.push(v));

    service.sendMessage('Analyze risk');
    tick(100);

    expect(toolHistory).toContain('analyze_risk');
    expect(toolHistory[toolHistory.length - 1]).toBeNull();
  }));

  it('handles error SSE event', () => {
    const events: SseEvent[] = [
      { type: 'error', message: 'Something went wrong' }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);

    service.sendMessage('Hello');

    let error: string | null;
    service.error$.subscribe((e) => (error = e));
    expect(error).toBe('Something went wrong');
  });
});

// ─── error path ──────────────────────────────────────────────────────────────
describe('AiChatStateService (error mock)', () => {
  let service: AiChatStateService;

  beforeEach(() => {
    const mockStream = jest
      .fn()
      .mockReturnValue(throwError(() => new Error('API down')));
    service = configureModule(mockStream);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('sets error message on failure', () => {
    service.sendMessage('Hello');
    let error: string | null;
    service.error$.subscribe((e) => (error = e));
    expect(error).toBe('Failed to get a response. Please try again.');
  });

  it('sets isLoading to false after error', () => {
    service.sendMessage('Hello');
    let loading: boolean;
    service.isLoading$.subscribe((v) => (loading = v));
    expect(loading).toBe(false);
  });

  it('does not append assistant message on error', () => {
    service.sendMessage('Hello');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs.length).toBe(1);
  });

  it('does not emit messageSent$ on error', () => {
    let emitted = false;
    service.messageSent$.subscribe(() => (emitted = true));
    service.sendMessage('Hello');
    expect(emitted).toBe(false);
  });
});

// ─── tool call history ───────────────────────────────────────────────────────
describe('AiChatStateService (tool call history)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('resets toolCallHistory$ at the start of each sendMessage()', () => {
    const stream1: SseEvent[] = [
      { type: 'tool_call', toolName: 'analyze_risk', iteration: 1 },
      {
        type: 'tool_result',
        toolName: 'analyze_risk',
        status: 'success',
        summary: 'done'
      },
      { type: 'done', payload: MOCK_RESPONSE }
    ];
    const stream2: SseEvent[] = [{ type: 'done', payload: MOCK_RESPONSE }];

    const mockStream = jest
      .fn()
      .mockReturnValueOnce(of(...stream1))
      .mockReturnValueOnce(of(...stream2));
    const service = configureModule(mockStream);

    service.sendMessage('First');
    // After first message: history has one record
    let history: any[];
    service.toolCallHistory$.subscribe((h) => (history = h));
    expect(history.length).toBe(1);

    service.sendMessage('Second');
    // After second message (no tool calls): history reset to empty
    service.toolCallHistory$.subscribe((h) => (history = h));
    expect(history.length).toBe(0);
  });

  it('records tool_call event in toolCallHistory$', () => {
    const events: SseEvent[] = [
      { type: 'tool_call', toolName: 'get_portfolio_summary', iteration: 1 },
      {
        type: 'tool_result',
        toolName: 'get_portfolio_summary',
        status: 'success',
        summary: 'done'
      },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);
    service.sendMessage('Hello');

    let history: any[];
    service.toolCallHistory$.subscribe((h) => (history = h));

    expect(history.length).toBe(1);
    expect(history[0].name).toBe('get_portfolio_summary');
    expect(history[0].iteration).toBe(1);
  });

  it('marks tool record completed with status on tool_result event', () => {
    const events: SseEvent[] = [
      { type: 'tool_call', toolName: 'analyze_risk', iteration: 2 },
      {
        type: 'tool_result',
        toolName: 'analyze_risk',
        status: 'success',
        summary: 'Risk assessed'
      },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);
    service.sendMessage('Check risk');

    let history: any[];
    service.toolCallHistory$.subscribe((h) => (history = h));

    const record = history[0];
    expect(record.status).toBe('success');
    expect(record.summary).toBe('Risk assessed');
    expect(typeof record.endMs).toBe('number');
  });

  it('records multiple parallel tool calls in order', () => {
    const events: SseEvent[] = [
      { type: 'tool_call', toolName: 'analyze_risk', iteration: 1 },
      { type: 'tool_call', toolName: 'get_portfolio_summary', iteration: 1 },
      {
        type: 'tool_result',
        toolName: 'analyze_risk',
        status: 'success',
        summary: 'done'
      },
      {
        type: 'tool_result',
        toolName: 'get_portfolio_summary',
        status: 'success',
        summary: 'done'
      },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);
    service.sendMessage('Big question');

    let history: any[];
    service.toolCallHistory$.subscribe((h) => (history = h));

    expect(history.length).toBe(2);
    expect(history.map((r) => r.name)).toContain('analyze_risk');
    expect(history.map((r) => r.name)).toContain('get_portfolio_summary');
  });

  it('clears toolCallHistory$ on clearConversation()', () => {
    const events: SseEvent[] = [
      { type: 'tool_call', toolName: 'analyze_risk', iteration: 1 },
      {
        type: 'tool_result',
        toolName: 'analyze_risk',
        status: 'success',
        summary: 'done'
      },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);
    service.sendMessage('Hello');
    service.clearConversation();

    let history: any[];
    service.toolCallHistory$.subscribe((h) => (history = h));
    expect(history).toEqual([]);
  });
});

// ─── thinking steps ──────────────────────────────────────────────────────────
describe('AiChatStateService (thinking steps)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with empty thinkingSteps$', () => {
    const service = configureModule(jest.fn().mockReturnValue(of()));
    let steps: any[];
    service.thinkingSteps$.subscribe((s) => (steps = s));
    expect(steps).toEqual([]);
  });

  it('records thinking events in thinkingSteps$', () => {
    const events: SseEvent[] = [
      { type: 'thinking', iteration: 1, maxIterations: 15 },
      { type: 'thinking', iteration: 2, maxIterations: 15 },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);
    service.sendMessage('Complex question');

    let steps: any[];
    service.thinkingSteps$.subscribe((s) => (steps = s));

    expect(steps.length).toBe(2);
    expect(steps[0].iteration).toBe(1);
    expect(steps[0].maxIterations).toBe(15);
    expect(steps[1].iteration).toBe(2);
    expect(typeof steps[0].timestamp).toBe('number');
  });

  it('resets thinkingSteps$ at start of sendMessage()', () => {
    const stream1: SseEvent[] = [
      { type: 'thinking', iteration: 1, maxIterations: 15 },
      { type: 'done', payload: MOCK_RESPONSE }
    ];
    const stream2: SseEvent[] = [{ type: 'done', payload: MOCK_RESPONSE }];

    const mockStream = jest
      .fn()
      .mockReturnValueOnce(of(...stream1))
      .mockReturnValueOnce(of(...stream2));
    const service = configureModule(mockStream);

    service.sendMessage('First');
    let steps: any[];
    service.thinkingSteps$.subscribe((s) => (steps = s));
    expect(steps.length).toBe(1);

    service.sendMessage('Second');
    service.thinkingSteps$.subscribe((s) => (steps = s));
    expect(steps.length).toBe(0);
  });

  it('clears thinkingSteps$ on newConversation()', () => {
    const events: SseEvent[] = [
      { type: 'thinking', iteration: 1, maxIterations: 15 },
      { type: 'done', payload: MOCK_RESPONSE }
    ];

    const mockStream = jest.fn().mockReturnValue(of(...events));
    const service = configureModule(mockStream);
    service.sendMessage('Hello');
    service.newConversation();

    let steps: any[];
    service.thinkingSteps$.subscribe((s) => (steps = s));
    expect(steps).toEqual([]);
  });
});

// ─── feedback ─────────────────────────────────────────────────────────────────
describe('AiChatStateService (feedback)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('records feedback on a message with a traceId', () => {
    const mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    const mockFeedback = jest.fn().mockReturnValue(of(null));
    const service = configureModule(mockStream, {
      postAiFeedback: mockFeedback
    });

    service.sendMessage('Hello');

    let msgs: any[];
    service.messages$.subscribe((m) => (msgs = m));

    const assistantIndex = msgs.findIndex((m) => m.role === 'assistant');
    service.submitFeedback(assistantIndex, 'up');

    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs[assistantIndex].feedback).toBe('up');
  });

  it('calls postAiFeedback API with correct args when traceId is present', () => {
    const mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    const mockFeedback = jest.fn().mockReturnValue(of(null));
    const service = configureModule(mockStream, {
      postAiFeedback: mockFeedback
    });

    service.sendMessage('Hello');

    let msgs: any[];
    service.messages$.subscribe((m) => (msgs = m));
    const assistantIndex = msgs.findIndex((m) => m.role === 'assistant');

    service.submitFeedback(assistantIndex, 'up');

    expect(mockFeedback).toHaveBeenCalledWith({
      score: 'up',
      traceId: 'trace-abc123'
    });
  });

  it('toggles feedback off when the same score is submitted twice', () => {
    const mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    const service = configureModule(mockStream);

    service.sendMessage('Hello');

    let msgs: any[];
    service.messages$.subscribe((m) => (msgs = m));
    const assistantIndex = msgs.findIndex((m) => m.role === 'assistant');

    service.submitFeedback(assistantIndex, 'up');
    service.submitFeedback(assistantIndex, 'up'); // toggle off

    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs[assistantIndex].feedback).toBeUndefined();
  });

  it('does not call API when toggling feedback off', () => {
    const mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    const mockFeedback = jest.fn().mockReturnValue(of(null));
    const service = configureModule(mockStream, {
      postAiFeedback: mockFeedback
    });

    service.sendMessage('Hello');

    let msgs: any[];
    service.messages$.subscribe((m) => (msgs = m));
    const assistantIndex = msgs.findIndex((m) => m.role === 'assistant');

    service.submitFeedback(assistantIndex, 'up'); // first → calls API
    service.submitFeedback(assistantIndex, 'up'); // toggle off → no API call

    // Only called once (on the first 'up')
    expect(mockFeedback).toHaveBeenCalledTimes(1);
  });

  it('does not call API for a message without a traceId', () => {
    const responseWithoutTrace: AiChatResponse = {
      ...MOCK_RESPONSE,
      traceId: undefined
    };
    const mockStream = jest
      .fn()
      .mockReturnValue(
        of({ type: 'done', payload: responseWithoutTrace } as SseEvent)
      );
    const mockFeedback = jest.fn().mockReturnValue(of(null));
    const service = configureModule(mockStream, {
      postAiFeedback: mockFeedback
    });

    service.sendMessage('Hello');

    let msgs: any[];
    service.messages$.subscribe((m) => (msgs = m));
    const assistantIndex = msgs.findIndex((m) => m.role === 'assistant');

    service.submitFeedback(assistantIndex, 'down');
    expect(mockFeedback).not.toHaveBeenCalled();
  });

  it('ignores submitFeedback for out-of-range indices', () => {
    const mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    const service = configureModule(mockStream);

    service.sendMessage('Hello');
    // Should not throw
    expect(() => service.submitFeedback(999, 'up')).not.toThrow();
  });

  it('ignores submitFeedback for user messages', () => {
    const mockStream = jest.fn().mockReturnValue(of(...buildDoneStream()));
    const service = configureModule(mockStream);

    service.sendMessage('Hello');

    let msgs: any[];
    service.messages$.subscribe((m) => (msgs = m));
    const userIndex = msgs.findIndex((m) => m.role === 'user');

    service.submitFeedback(userIndex, 'up');
    service.messages$.subscribe((m) => (msgs = m));

    // User message should have no feedback field
    expect(msgs[userIndex].feedback).toBeUndefined();
  });
});
