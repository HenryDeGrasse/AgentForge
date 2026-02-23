import { AiChatResponse } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { AiChatPageComponent } from './ai-chat-page.component';

const MOCK_SUCCESS_RESPONSE: AiChatResponse = {
  confidence: 'high',
  elapsedMs: 3200,
  estimatedCostUsd: 0.002,
  iterations: 2,
  response: 'Your portfolio is well diversified.',
  sources: ['get_portfolio_summary', 'analyze_risk'],
  status: 'completed',
  toolCalls: 2,
  warnings: []
};

const MOCK_WARNING_RESPONSE: AiChatResponse = {
  ...MOCK_SUCCESS_RESPONSE,
  confidence: 'medium',
  warnings: [
    'No portfolio data tools were used; response may not reflect current data.'
  ]
};

function buildDataService(
  postAiChat: jest.Mock = jest.fn().mockReturnValue(of(MOCK_SUCCESS_RESPONSE))
) {
  return { postAiChat };
}

describe('AiChatPageComponent', () => {
  let component: AiChatPageComponent;
  let fixture: ComponentFixture<AiChatPageComponent>;
  let dataService: { postAiChat: jest.Mock };

  beforeEach(async () => {
    dataService = buildDataService();

    await TestBed.configureTestingModule({
      imports: [AiChatPageComponent, NoopAnimationsModule],
      providers: [{ provide: DataService, useValue: dataService }]
    }).compileComponents();

    fixture = TestBed.createComponent(AiChatPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ─── creation ─────────────────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ─── initial state ─────────────────────────────────────────────────────────

  it('starts with an empty message list', () => {
    expect(component.messages).toHaveLength(0);
  });

  it('starts with send disabled and no error', () => {
    expect(component.isLoading).toBe(false);
    expect(component.error).toBeNull();
  });

  // ─── submit behaviour ──────────────────────────────────────────────────────

  it('does not submit when message control is empty', () => {
    component.messageControl.setValue('');
    component.sendMessage();

    expect(dataService.postAiChat).not.toHaveBeenCalled();
    expect(component.messages).toHaveLength(0);
  });

  it('does not submit when message is whitespace only', () => {
    component.messageControl.setValue('   ');
    component.sendMessage();

    expect(dataService.postAiChat).not.toHaveBeenCalled();
  });

  it('appends user message immediately on submit', () => {
    component.messageControl.setValue('How is my portfolio?');
    component.sendMessage();

    expect(component.messages[0]).toMatchObject({
      role: 'user',
      text: 'How is my portfolio?'
    });
  });

  it('calls postAiChat with the trimmed message', () => {
    component.messageControl.setValue('  What are my risks?  ');
    component.sendMessage();

    expect(dataService.postAiChat).toHaveBeenCalledWith({
      message: 'What are my risks?',
      toolNames: expect.any(Array)
    });
  });

  it('clears the input after send', () => {
    component.messageControl.setValue('Hello');
    component.sendMessage();

    expect(component.messageControl.value).toBe('');
  });

  it('sets isLoading to true while request is in flight', () => {
    // Never resolves during this sync check
    dataService.postAiChat.mockReturnValue(new (require('rxjs').Subject)());

    component.messageControl.setValue('test');
    component.sendMessage();

    expect(component.isLoading).toBe(true);
  });

  // ─── success response ──────────────────────────────────────────────────────

  it('appends assistant message after successful response', () => {
    component.messageControl.setValue('Summarize my holdings');
    component.sendMessage();
    fixture.detectChanges();

    const assistant = component.messages.find((m) => m.role === 'assistant');

    expect(assistant).toBeDefined();
    expect(assistant?.text).toBe(MOCK_SUCCESS_RESPONSE.response);
  });

  it('stores confidence on the assistant message', () => {
    component.messageControl.setValue('What is my risk?');
    component.sendMessage();
    fixture.detectChanges();

    const assistant = component.messages.find((m) => m.role === 'assistant');

    expect(assistant?.confidence).toBe('high');
  });

  it('stores empty warnings array when none present', () => {
    component.messageControl.setValue('Hello');
    component.sendMessage();
    fixture.detectChanges();

    const assistant = component.messages.find((m) => m.role === 'assistant');

    expect(assistant?.warnings).toEqual([]);
  });

  it('stores warnings when response includes them', () => {
    dataService.postAiChat.mockReturnValue(of(MOCK_WARNING_RESPONSE));
    component.messageControl.setValue('Tell me something');
    component.sendMessage();
    fixture.detectChanges();

    const assistant = component.messages.find((m) => m.role === 'assistant');

    expect(assistant?.warnings).toHaveLength(1);
    expect(assistant?.warnings?.[0]).toContain('No portfolio data tools');
  });

  it('stores sources on the assistant message', () => {
    component.messageControl.setValue('Analyse risks');
    component.sendMessage();
    fixture.detectChanges();

    const assistant = component.messages.find((m) => m.role === 'assistant');

    expect(assistant?.sources).toEqual(MOCK_SUCCESS_RESPONSE.sources);
  });

  it('resets isLoading after success', () => {
    component.messageControl.setValue('Go');
    component.sendMessage();
    fixture.detectChanges();

    expect(component.isLoading).toBe(false);
  });

  it('clears error after a successful response', () => {
    component.error = 'Previous error';
    component.messageControl.setValue('retry');
    component.sendMessage();
    fixture.detectChanges();

    expect(component.error).toBeNull();
  });

  // ─── error response ─────────────────────────────────────────────────────────

  it('sets error message on HTTP failure', () => {
    dataService.postAiChat.mockReturnValue(
      throwError(() => new Error('Network error'))
    );

    component.messageControl.setValue('Oops');
    component.sendMessage();
    fixture.detectChanges();

    expect(component.error).toBe('Failed to get a response. Please try again.');
  });

  it('resets isLoading after failure', () => {
    dataService.postAiChat.mockReturnValue(throwError(() => new Error('500')));

    component.messageControl.setValue('fail');
    component.sendMessage();
    fixture.detectChanges();

    expect(component.isLoading).toBe(false);
  });

  it('keeps user message in history even after error', () => {
    dataService.postAiChat.mockReturnValue(throwError(() => new Error('err')));

    component.messageControl.setValue('Where did it go?');
    component.sendMessage();
    fixture.detectChanges();

    expect(component.messages[0]).toMatchObject({ role: 'user' });
  });

  // ─── multiple turns ────────────────────────────────────────────────────────

  it('accumulates messages across multiple sends', () => {
    component.messageControl.setValue('First question');
    component.sendMessage();
    fixture.detectChanges();

    component.messageControl.setValue('Second question');
    component.sendMessage();
    fixture.detectChanges();

    const userMessages = component.messages.filter((m) => m.role === 'user');
    const assistantMessages = component.messages.filter(
      (m) => m.role === 'assistant'
    );

    expect(userMessages).toHaveLength(2);
    expect(assistantMessages).toHaveLength(2);
  });
});
