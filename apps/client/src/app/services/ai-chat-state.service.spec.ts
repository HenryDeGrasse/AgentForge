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
  warnings: []
};

/** Builds a stream of SSE events ending with a done event. */
function buildDoneStream(payload: AiChatResponse = MOCK_RESPONSE): SseEvent[] {
  return [{ type: 'done', payload } as SseEvent];
}

function configureModule(streamAiChat: jest.Mock): AiChatStateService {
  TestBed.configureTestingModule({
    providers: [
      AiChatStateService,
      { provide: DataService, useValue: { streamAiChat } }
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
    expect(msgs[1]).toEqual({
      actions: undefined,
      chartData: [],
      confidence: 'high',
      role: 'assistant',
      sources: ['get_portfolio_summary'],
      text: 'Your portfolio looks healthy.',
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

    // Capture all activeTool emissions
    const toolHistory: (string | null)[] = [];
    service.activeTool$.subscribe((v) => toolHistory.push(v));

    service.sendMessage('Analyze risk');
    tick(100);

    // Should have seen: null (initial), 'analyze_risk', null (tool_result), null (done)
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
