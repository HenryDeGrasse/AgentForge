import { AiChatResponse } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AiChatStateService } from './ai-chat-state.service';

const MOCK_RESPONSE: AiChatResponse = {
  confidence: 'high',
  elapsedMs: 2000,
  estimatedCostUsd: 0.001,
  iterations: 1,
  response: 'Your portfolio looks healthy.',
  sources: ['get_portfolio_summary'],
  status: 'completed',
  toolCalls: 1,
  warnings: []
};

function configureModule(postAiChat: jest.Mock): AiChatStateService {
  TestBed.configureTestingModule({
    providers: [
      AiChatStateService,
      { provide: DataService, useValue: { postAiChat } }
    ]
  });
  return TestBed.inject(AiChatStateService);
}

// ─── success path ────────────────────────────────────────────────────────────
describe('AiChatStateService (success mock)', () => {
  let service: AiChatStateService;
  let mockPost: jest.Mock;

  beforeEach(() => {
    mockPost = jest.fn().mockReturnValue(of(MOCK_RESPONSE));
    service = configureModule(mockPost);
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
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('appends user message immediately', () => {
    service.sendMessage('Hello');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs[0]).toEqual({ role: 'user', text: 'Hello' });
  });

  it('appends assistant message on success', () => {
    service.sendMessage('Hello');
    let msgs: any[] = [];
    service.messages$.subscribe((m) => (msgs = m));
    expect(msgs.length).toBe(2);
    expect(msgs[1]).toEqual({
      confidence: 'high',
      role: 'assistant',
      sources: ['get_portfolio_summary'],
      text: 'Your portfolio looks healthy.',
      warnings: []
    });
  });

  it('sets isLoading to false after success', () => {
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
});

// ─── error path ──────────────────────────────────────────────────────────────
describe('AiChatStateService (error mock)', () => {
  let service: AiChatStateService;

  beforeEach(() => {
    const mockPost = jest
      .fn()
      .mockReturnValue(throwError(() => new Error('API down')));
    service = configureModule(mockPost);
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
