// Jest manual mock for langfuse — prevents ESM dynamic-import errors in test env.
// The LangfuseService constructor checks for LANGFUSE_PUBLIC_KEY; without it
// the real client is never instantiated, so this mock is sufficient for all
// unit tests. Live integration tests that actually need Langfuse set the key
// and run against the real service.

class MockLangfuse {
  trace() {
    return {
      update: jest.fn(),
      score: jest.fn()
    };
  }
  score() {}
  async flushAsync() {}
}

module.exports = {
  default: MockLangfuse,
  Langfuse: MockLangfuse
};
