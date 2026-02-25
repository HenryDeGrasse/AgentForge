import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI evals workflow path coverage', () => {
  const workflowContent = readFileSync(
    join(__dirname, '../../../../.github/workflows/evals.yml'),
    'utf8'
  );

  it('includes core ai and test path filters', () => {
    expect(workflowContent).toContain("'apps/api/src/app/endpoints/ai/**'");
    expect(workflowContent).toContain("'apps/api/test/ai/**'");
  });

  it('includes shared module paths used by ai tools', () => {
    expect(workflowContent).toContain("'apps/api/src/app/order/**'");
    expect(workflowContent).toContain("'apps/api/src/app/symbol/**'");
    expect(workflowContent).toContain("'apps/api/src/services/benchmark/**'");
    expect(workflowContent).toContain("'apps/api/src/services/market-data/**'");
    expect(workflowContent).toContain(
      "'apps/api/src/services/symbol-profile/**'"
    );
  });
});
