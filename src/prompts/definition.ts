import { TemplateEngine } from '../templates/engine';
import { Schema } from '../types/schema';
import { Prompt, PromptBuilder } from '../composition/operators';

export interface PromptConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export class PromptDefinition<TInput, TOutput> {
  private template: string;
  private inputSchema?: Schema;
  private outputSchema?: Schema;
  private config: PromptConfig;
  private validators: Array<(value: TOutput) => boolean> = [];
  private preprocessors: Array<(input: TInput) => TInput> = [];
  private postprocessors: Array<(output: TOutput) => TOutput> = [];

  constructor(
    template: string,
    config: PromptConfig = {}
  ) {
    this.template = template;
    this.config = {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
      ...config
    };
  }

  withInput(schema: Schema): this {
    this.inputSchema = schema;
    return this;
  }

  withOutput(schema: Schema): this {
    this.outputSchema = schema;
    return this;
  }

  withConfig(config: Partial<PromptConfig>): this {
    this.config = { ...this.config, ...config };
    return this;
  }

  preprocess(fn: (input: TInput) => TInput): this {
    this.preprocessors.push(fn);
    return this;
  }

  postprocess(fn: (output: TOutput) => TOutput): this {
    this.postprocessors.push(fn);
    return this;
  }

  validate(fn: (value: TOutput) => boolean): this {
    this.validators.push(fn);
    return this;
  }

  compile(input: TInput): Prompt<TOutput> {
    return async () => {
      try {
        // Apply preprocessors
        let processedInput = input;
        for (const preprocessor of this.preprocessors) {
          processedInput = preprocessor(processedInput);
        }

        // Validate input
        if (this.inputSchema) {
          const validation = this.inputSchema.validate(processedInput);
          if (!validation.valid) {
            return {
              kind: 'error',
              error: new Error(`Input validation failed: ${JSON.stringify(validation.errors)}`)
            };
          }
        }

        // Render template
        const engine = new TemplateEngine({
          schemas: new Map([
            ['input_schema', this.inputSchema],
            ['output_schema', this.outputSchema]
          ].filter(([, v]) => v != null) as Array<[string, Schema]>)
        });

        const renderedPrompt = engine.render(this.template, processedInput as any);

        // Create request payload
        const payload = this.createPayload(renderedPrompt);

        // Execute (placeholder - would call actual API)
        const response = await this.executePrompt(payload);

        // Parse response
        let output: TOutput;
        if (this.outputSchema) {
          const parseResult = this.outputSchema.parse(response);
          if (!parseResult.success) {
            return {
              kind: 'error',
              error: new Error(`Output parsing failed: ${JSON.stringify(parseResult.errors)}`)
            };
          }
          output = parseResult.value as TOutput;
        } else {
          // Using 'as unknown as TOutput' to handle the type safely
          output = response as unknown as TOutput;
        }

        // Apply postprocessors
        for (const postprocessor of this.postprocessors) {
          output = postprocessor(output);
        }

        // Validate output
        for (const validator of this.validators) {
          if (!validator(output)) {
            return {
              kind: 'error',
              error: new Error('Output validation failed')
            };
          }
        }

        return { kind: 'success', value: output };
      } catch (error) {
        return {
          kind: 'error',
          error: error as Error
        };
      }
    };
  }

  private createPayload(prompt: string): any {
    const payload: any = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens
    };

    if (this.config.topP !== undefined) {
      payload.top_p = this.config.topP;
    }

    if (this.config.frequencyPenalty !== undefined) {
      payload.frequency_penalty = this.config.frequencyPenalty;
    }

    if (this.config.presencePenalty !== undefined) {
      payload.presence_penalty = this.config.presencePenalty;
    }

    if (this.config.stopSequences) {
      payload.stop = this.config.stopSequences;
    }

    if (this.outputSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: this.outputSchema.toOpenAISchema()
        }
      };
    }

    return payload;
  }

  private async executePrompt(payload: any): Promise<string> {
    // Placeholder - in real implementation would call OpenAI API
    console.log('Would execute prompt with payload:', payload);

    // Simulate response
    if (this.outputSchema) {
      return JSON.stringify({
        name: "John Doe",
        email: "john@example.com",
        experience: []
      });
    }

    return "Sample response";
  }

  // Create a PromptBuilder for this definition
  toBuilder(input: TInput): PromptBuilder<TOutput> {
    return new PromptBuilder(this.compile(input));
  }
}

// Helper function to create prompts
export function defprompt<TInput = any, TOutput = any>(
  template: string,
  config?: PromptConfig
): PromptDefinition<TInput, TOutput> {
  return new PromptDefinition<TInput, TOutput>(template, config);
}