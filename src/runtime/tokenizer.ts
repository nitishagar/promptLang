// Simplified token counter - in production would use tiktoken
export class TokenCounter {
  private static readonly AVG_CHARS_PER_TOKEN = 4;

  static countTokens(text: string, model: string = 'gpt-4'): number {
    // Simplified estimation
    // Real implementation would use tiktoken library
    const baseCount = Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN);

    // Adjust for different models
    const modelMultiplier = this.getModelMultiplier(model);
    return Math.ceil(baseCount * modelMultiplier);
  }

  static estimateCost(
    promptTokens: number,
    completionTokens: number,
    model: string
  ): { promptCost: number; completionCost: number; totalCost: number } {
    const pricing = this.getPricing(model);

    const promptCost = (promptTokens / 1000) * pricing.prompt;
    const completionCost = (completionTokens / 1000) * pricing.completion;

    return {
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost
    };
  }

  private static getModelMultiplier(model: string): number {
    if (model.includes('gpt-4')) return 1.0;
    if (model.includes('gpt-3.5')) return 1.1;
    return 1.2;
  }

  private static getPricing(model: string): { prompt: number; completion: number } {
    // Prices per 1K tokens (as of 2024)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4-32k': { prompt: 0.06, completion: 0.12 },
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 }
    };

    for (const [key, value] of Object.entries(pricing)) {
      if (model.includes(key)) {
        return value;
      }
    }

    return { prompt: 0.03, completion: 0.06 }; // Default to GPT-4 pricing
  }

  static truncateToMaxTokens(
    text: string,
    maxTokens: number,
    model: string = 'gpt-4'
  ): string {
    const currentTokens = this.countTokens(text, model);

    if (currentTokens <= maxTokens) {
      return text;
    }

    // Binary search for the right length
    let left = 0;
    let right = text.length;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      const truncated = text.slice(0, mid);
      const tokens = this.countTokens(truncated, model);

      if (tokens <= maxTokens) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }

    return text.slice(0, left) + '...';
  }
}