/**
 * Example: upload AgentForge eval cases to LangSmith as a dataset.
 *
 * Requires: npm install langsmith
 * Set env: LANGCHAIN_API_KEY=<your key>
 *
 * Run: npx tsx examples/langsmith-upload.ts
 */
import {
  EvalCaseDefinition,
  loadAll,
  liveEligible
} from '@agentforge/finance-eval-dataset';
import { Client } from 'langsmith';

const client = new Client();
const DATASET_NAME = 'agentforge-finance-eval-v1';

async function main() {
  // Create or fetch the dataset
  let dataset: Awaited<ReturnType<typeof client.createDataset>>;
  try {
    dataset = await client.createDataset(DATASET_NAME, {
      description:
        'Finance AI agent eval cases from AgentForge — covers portfolio summary, risk analysis, tax, compliance, adversarial inputs, and multi-tool orchestration.'
    });
    console.log(`Created dataset: ${dataset.id}`);
  } catch {
    // Dataset already exists — find it
    for await (const ds of client.listDatasets({ datasetName: DATASET_NAME })) {
      dataset = ds;
      break;
    }
    console.log(`Using existing dataset: ${dataset!.id}`);
  }

  // Upload live-eligible cases only
  const cases = loadAll().filter(liveEligible);
  console.log(`Uploading ${cases.length} cases…`);

  for (const evalCase of cases) {
    await client.createExample(
      // inputs — what goes into the agent
      {
        message: evalCase.request.message,
        toolNames: evalCase.request.toolNames ?? null,
        profile: evalCase.profile
      },
      // outputs — the expected shape (used for reference by evaluators)
      {
        status: evalCase.expect.status,
        minConfidence: evalCase.expect.minConfidence,
        requiredTools: evalCase.expect.requiredTools,
        mustIncludeAny: evalCase.expect.mustIncludeAny,
        mustNotIncludeAny: evalCase.expect.mustNotIncludeAny
      },
      {
        datasetId: dataset!.id,
        metadata: {
          id: evalCase.id,
          category: evalCase.meta.category,
          subcategory: evalCase.meta.subcategory,
          difficulty: evalCase.meta.difficulty,
          stage: evalCase.meta.stage
        }
      }
    );
    console.log(`  ✓ ${evalCase.id}`);
  }

  console.log(
    `\nDone. View at: https://smith.langchain.com/datasets/${dataset!.id}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
