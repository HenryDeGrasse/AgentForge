import { DataService } from '@ghostfolio/ui/services';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { AiChatStateService } from '../../services/ai-chat-state.service';
import { AiChatPageComponent } from './ai-chat-page.component';

function buildStateService() {
  return {
    open: jest.fn(),
    close: jest.fn(),
    toggle: jest.fn(),
    isOpen$: { subscribe: jest.fn() },
    isLoading$: { subscribe: jest.fn() },
    messages$: { subscribe: jest.fn() },
    error$: { subscribe: jest.fn() }
  };
}

describe('AiChatPageComponent', () => {
  let component: AiChatPageComponent;
  let fixture: ComponentFixture<AiChatPageComponent>;
  let stateService: ReturnType<typeof buildStateService>;
  let router: Router;

  beforeEach(async () => {
    stateService = buildStateService();

    await TestBed.configureTestingModule({
      imports: [
        AiChatPageComponent,
        RouterTestingModule.withRoutes([
          { path: '', component: AiChatPageComponent }
        ])
      ],
      providers: [
        { provide: AiChatStateService, useValue: stateService },
        { provide: DataService, useValue: { postAiChat: jest.fn() } }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(AiChatPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('opens the AI chat panel on init', () => {
    expect(stateService.open).toHaveBeenCalled();
  });

  it('redirects to root on init', () => {
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
