// Live-model provider: interface stub only (plan step 6). It never calls the network here.
export function createOpenAIModel() {
  return {
    name: 'openai',
    async extract() {
      throw new Error('OpenAI provider is not configured (stub: no network calls in this build)');
    },
  };
}
