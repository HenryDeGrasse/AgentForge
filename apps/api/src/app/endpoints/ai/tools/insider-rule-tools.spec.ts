import { CreateInsiderRuleTool } from './create-insider-rule.tool';
import { DeleteInsiderRuleTool } from './delete-insider-rule.tool';
import { ListInsiderRulesTool } from './list-insider-rules.tool';
import { UpdateInsiderRuleTool } from './update-insider-rule.tool';

const CONTEXT = { userId: 'user-1' };

function buildInsiderService() {
  return {
    createRule: jest.fn().mockResolvedValue({
      id: 'rule-1',
      isActive: true,
      lookbackDays: 30,
      minValueUsd: 100_000,
      scope: 'top_n',
      side: 'sell',
      symbols: null,
      topN: 3
    }),
    deleteRule: jest.fn().mockResolvedValue({ count: 1 }),
    listRules: jest.fn().mockResolvedValue([
      {
        agentNotes: null,
        id: 'rule-1',
        isActive: true,
        lastCheckedAt: new Date('2026-02-28'),
        lastNotifiedAt: null,
        lookbackDays: 30,
        minValueUsd: 100_000,
        scope: 'top_n',
        side: 'sell',
        symbols: null,
        topN: 3
      }
    ]),
    updateRule: jest.fn().mockResolvedValue({ count: 1 })
  };
}

describe('CreateInsiderRuleTool', () => {
  it('has correct name', () => {
    const tool = new CreateInsiderRuleTool(buildInsiderService() as any);
    expect(tool.name).toBe('create_insider_monitoring_rule');
  });

  it('creates a rule and returns success envelope', async () => {
    const svc = buildInsiderService();
    const tool = new CreateInsiderRuleTool(svc as any);

    const result = await tool.execute(
      { minValueUsd: 100_000, scope: 'top_n', side: 'sell', topN: 3 },
      CONTEXT
    );

    expect(svc.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'top_n',
        side: 'sell',
        userId: 'user-1'
      })
    );
    expect(result.status).toBe('success');
    expect(result.data.rule.id).toBe('rule-1');
    expect(result.data.message).toContain('created successfully');
  });

  it('uppercases symbols before passing to service', async () => {
    const svc = buildInsiderService();
    const tool = new CreateInsiderRuleTool(svc as any);

    await tool.execute(
      { scope: 'symbols', side: 'any', symbols: ['nvda', 'aapl'] },
      CONTEXT
    );

    expect(svc.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        symbols: ['NVDA', 'AAPL']
      })
    );
  });
});

describe('ListInsiderRulesTool', () => {
  it('has correct name', () => {
    const tool = new ListInsiderRulesTool(buildInsiderService() as any);
    expect(tool.name).toBe('list_insider_monitoring_rules');
  });

  it('returns all rules for the user', async () => {
    const svc = buildInsiderService();
    const tool = new ListInsiderRulesTool(svc as any);

    const result = await tool.execute({} as any, CONTEXT);

    expect(result.status).toBe('success');
    expect(result.data.total).toBe(1);
    expect(result.data.rules[0].id).toBe('rule-1');
    expect(result.data.rules[0].lastCheckedAt).toBeDefined();
  });

  it('parses JSON symbols string', async () => {
    const svc = buildInsiderService();
    svc.listRules.mockResolvedValue([
      {
        agentNotes: null,
        id: 'rule-2',
        isActive: true,
        lastCheckedAt: null,
        lastNotifiedAt: null,
        lookbackDays: 30,
        minValueUsd: null,
        scope: 'symbols',
        side: 'any',
        symbols: '["NVDA","AAPL"]',
        topN: null
      }
    ]);
    const tool = new ListInsiderRulesTool(svc as any);

    const result = await tool.execute({} as any, CONTEXT);

    expect(result.data.rules[0].symbols).toEqual(['NVDA', 'AAPL']);
  });
});

describe('UpdateInsiderRuleTool', () => {
  it('has correct name', () => {
    const tool = new UpdateInsiderRuleTool(buildInsiderService() as any);
    expect(tool.name).toBe('update_insider_monitoring_rule');
  });

  it('updates a rule and returns success', async () => {
    const svc = buildInsiderService();
    const tool = new UpdateInsiderRuleTool(svc as any);

    const result = await tool.execute(
      { id: 'rule-1', isActive: false },
      CONTEXT
    );

    expect(svc.updateRule).toHaveBeenCalledWith({
      id: 'rule-1',
      updates: expect.objectContaining({ isActive: false }),
      userId: 'user-1'
    });
    expect(result.status).toBe('success');
    expect(result.data.updatedCount).toBe(1);
  });

  it('returns error status when rule not found', async () => {
    const svc = buildInsiderService();
    svc.updateRule.mockResolvedValue({ count: 0 });
    const tool = new UpdateInsiderRuleTool(svc as any);

    const result = await tool.execute(
      { id: 'nonexistent', isActive: false },
      CONTEXT
    );

    expect(result.status).toBe('error');
    expect(result.data.message).toContain('not found');
  });
});

describe('DeleteInsiderRuleTool', () => {
  it('has correct name', () => {
    const tool = new DeleteInsiderRuleTool(buildInsiderService() as any);
    expect(tool.name).toBe('delete_insider_monitoring_rule');
  });

  it('deletes a rule and returns success', async () => {
    const svc = buildInsiderService();
    const tool = new DeleteInsiderRuleTool(svc as any);

    const result = await tool.execute({ id: 'rule-1' }, CONTEXT);

    expect(svc.deleteRule).toHaveBeenCalledWith({
      id: 'rule-1',
      userId: 'user-1'
    });
    expect(result.status).toBe('success');
    expect(result.data.deletedCount).toBe(1);
  });

  it('returns error status when rule not found', async () => {
    const svc = buildInsiderService();
    svc.deleteRule.mockResolvedValue({ count: 0 });
    const tool = new DeleteInsiderRuleTool(svc as any);

    const result = await tool.execute({ id: 'nonexistent' }, CONTEXT);

    expect(result.status).toBe('error');
    expect(result.data.message).toContain('not found');
  });
});
