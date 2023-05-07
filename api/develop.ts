import type { Handler } from "aws-lambda";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { v4 as uuidv4 } from "uuid";
import { execSync, ChildProcess } from "child_process";
import fs from "fs";
import getInstallationToken from "../src/utils/getInstallationToken";
import appClient from "../src/utils/appClient";
import {
  Configuration,
  ConfigurationParameters,
  CreateCompletionRequest,
  CreateCompletionResponse,
  CreateCompletionResponseChoicesInner,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  ChatCompletionRequestMessage,
  ChatCompletionResponseMessageRoleEnum,
  OpenAIApi,
} from "openai";
import { v4 } from "uuid";
import crypto from "crypto";
import { AxiosRequestConfig } from "axios";

// Try to remove
import PQueueMod from "p-queue";
import pRetry from "p-retry";
import type { Tiktoken, TiktokenModel } from "@dqbd/tiktoken";

const importTiktoken = async () => {
  try {
    const { encoding_for_model } = await import("@dqbd/tiktoken");
    return { encoding_for_model };
  } catch (error) {
    console.log(error);
    return { encoding_for_model: null };
  }
};

// Copied from axios/lib/helpers/isAbsoluteURL.js
function isAbsoluteURL(url: string) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

// Copied from axios/lib/helpers/combineURLs.js
function combineURLs(baseURL: string, relativeURL: string) {
  return relativeURL
    ? baseURL.replace(/\/+$/, "") + "/" + relativeURL.replace(/^\/+/, "")
    : baseURL;
}

function buildFullPath(baseURL: string, requestedURL: string) {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
}

function createRequest(config: unknown) {
  //@ts-ignore
  const headers = new Headers(config.headers || {});

  // HTTP basic authentication
  //@ts-ignore
  if (config.auth) {
    //@ts-ignore
    const username = config.auth.username || "";
    //@ts-ignore
    const password = config.auth.password
      ? //@ts-ignore
        decodeURI(encodeURIComponent(config.auth.password))
      : "";
    headers.set("Authorization", `Basic ${btoa(`${username}:${password}`)}`);
  }

  //@ts-ignore
  const method = config.method?.toUpperCase();
  const options: Record<string, unknown> = {
    headers,
    method,
  };
  if (method !== "GET" && method !== "HEAD") {
    //@ts-ignore
    options.body = config.data;

    // In these cases the browser will automatically set the correct Content-Type,
    // but only if that header hasn't been set yet. So that's why we're deleting it.
    //@ts-ignore
    if (isFormData(options.body) && isStandardBrowserEnv()) {
      headers.delete("Content-Type");
    }
  }
  //@ts-ignore
  if (config.mode) {
    //@ts-ignore
    options.mode = config.mode;
  }
  //@ts-ignore
  if (config.cache) {
    //@ts-ignore
    options.cache = config.cache;
  }
  //@ts-ignore
  if (config.integrity) {
    //@ts-ignore
    options.integrity = config.integrity;
  }
  //@ts-ignore
  if (config.redirect) {
    //@ts-ignore
    options.redirect = config.redirect;
  }
  //@ts-ignore
  if (config.referrer) {
    //@ts-ignore
    options.referrer = config.referrer;
  }
  //@ts-ignore
  if (config.timeout && config.timeout > 0) {
    //@ts-ignore
    options.signal = AbortSignal.timeout(config.timeout);
  }
  //@ts-ignore
  if (config.signal) {
    // this overrides the timeout signal if both are set
    //@ts-ignore
    options.signal = config.signal;
  }
  // This config is similar to XHR’s withCredentials flag, but with three available values instead of two.
  // So if withCredentials is not set, default value 'same-origin' will be used
  //@ts-ignore
  if (!isUndefined(config.withCredentials)) {
    //@ts-ignore
    options.credentials = config.withCredentials ? "include" : "omit";
  }
  // for streaming
  //@ts-ignore
  if (config.responseType === "stream") {
    //@ts-ignore
    options.headers.set("Accept", EventStreamContentType);
  }

  // @ts-ignore
  const fullPath = buildFullPath(config.baseURL, config.url);
  // @ts-ignore
  const url = buildURL(fullPath, config.params, config.paramsSerializer);

  // Expected browser to throw error if there is any wrong configuration value
  return new Request(url, options);
}

function enhanceError(
  error: Error,
  config: unknown,
  code: string,
  request: Request,
  response?: Response
) {
  // @ts-ignore
  error.config = config;
  if (code) {
    // @ts-ignore
    error.code = code;
  }

  // @ts-ignore
  error.request = request;
  // @ts-ignore
  error.response = response;
  // @ts-ignore
  error.isAxiosError = true;

  // @ts-ignore
  error.toJSON = function toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      // @ts-ignore
      description: this.description,
      // @ts-ignore
      number: this.number,
      // Mozilla
      // @ts-ignore
      fileName: this.fileName,
      // @ts-ignore
      lineNumber: this.lineNumber,
      // @ts-ignore
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      // @ts-ignore
      config: this.config,
      // @ts-ignore
      code: this.code,
      status:
        // @ts-ignore
        this.response && this.response.status ? this.response.status : null,
    };
  };
  return error;
}

function createError(
  message: string,
  config: unknown,
  code: string,
  request: Request,
  response?: Response
) {
  const error = new Error(message);
  return enhanceError(error, config, code, request, response);
}

async function getResponse(request: Request, config: unknown) {
  let stageOne;
  try {
    stageOne = await fetch(request);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return createError("Request aborted", config, "ECONNABORTED", request);
    }
    if (e instanceof Error && e.name === "TimeoutError") {
      return createError("Request timeout", config, "ECONNABORTED", request);
    }
    return createError("Network Error", config, "ERR_NETWORK", request);
  }

  const headers: Record<string, string> = {};
  stageOne.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const response = {
    ok: stageOne.ok,
    status: stageOne.status,
    statusText: stageOne.statusText,
    headers,
    config,
    request,
  };

  if (stageOne.status >= 200 && stageOne.status !== 204) {
    // @ts-ignore
    if (config.responseType === "stream") {
      const contentType = stageOne.headers.get("content-type");
      // @ts-ignore
      if (!contentType?.startsWith(EventStreamContentType)) {
        // If the content-type is not stream, response is most likely an error
        if (stageOne.status >= 400) {
          // If the error is a JSON, parse it. Otherwise, return as text
          if (contentType?.startsWith("application/json")) {
            // @ts-ignore
            response.data = await stageOne.json();
            return response;
          } else {
            // @ts-ignore
            response.data = await stageOne.text();
            return response;
          }
        }
        // If the non-stream response is also not an error, throw
        throw new Error(
          // @ts-ignore
          `Expected content-type to be ${EventStreamContentType}, Actual: ${contentType}`
        );
      }
      // @ts-ignore
      await getBytes(stageOne.body, getLines(getMessages(config.onmessage)));
    } else {
      // @ts-ignore
      switch (config.responseType) {
        case "arraybuffer":
          // @ts-ignore
          response.data = await stageOne.arrayBuffer();
          break;
        case "blob":
          // @ts-ignore
          response.data = await stageOne.blob();
          break;
        case "json":
          // @ts-ignore
          response.data = await stageOne.json();
          break;
        case "formData":
          // @ts-ignore
          response.data = await stageOne.formData();
          break;
        default:
          // @ts-ignore
          response.data = await stageOne.text();
          break;
      }
    }
  }

  return response;
}

async function fetchAdapter(config: unknown) {
  const request = createRequest(config);
  const data = await getResponse(request, config);

  return new Promise((resolve, reject) => {
    if (data instanceof Error) {
      reject(data);
    } else {
      // eslint-disable-next-line no-unused-expressions
      // @ts-ignore
      Object.prototype.toString.call(config.settle) === "[object Function]"
        ? // @ts-ignore
          config.settle(resolve, reject, data)
        : // @ts-ignore
          settle(resolve, reject, data);
    }
  });
}

const STATUS_NO_RETRY = [
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  406, // Not Acceptable
  407, // Proxy Authentication Required
  408, // Request Timeout
  409, // Conflict
];

interface AsyncCallerParams {
  /**
   * The maximum number of concurrent calls that can be made.
   * Defaults to `Infinity`, which means no limit.
   */
  maxConcurrency?: number;
  /**
   * The maximum number of retries that can be made for a single call,
   * with an exponential backoff between each attempt. Defaults to 6.
   */
  maxRetries?: number;
}

abstract class BaseCallbackHandlerMethodsClass {
  /**
   * Called at the start of an LLM or Chat Model run, with the prompt(s)
   * and the run ID.
   */
  handleLLMStart?(
    llm: { name: string },
    prompts: string[],
    runId: string,
    parentRunId?: string
  ): Promise<void> | void | Promise<CallbackManagerForLLMRun>;

  /**
   * Called when an LLM/ChatModel in `streaming` mode produces a new token
   */
  handleLLMNewToken?(
    token: string,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called if an LLM/ChatModel run encounters an error
   */
  handleLLMError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called at the end of an LLM/ChatModel run, with the output and the run ID.
   */
  handleLLMEnd?(
    output: LLMResult,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called at the start of a Chain run, with the chain name and inputs
   * and the run ID.
   */
  handleChainStart?(
    chain: { name: string },
    inputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> | Promise<CallbackManagerForChainRun>;

  /**
   * Called if a Chain run encounters an error
   */
  handleChainError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called at the end of a Chain run, with the outputs and the run ID.
   */
  handleChainEnd?(
    outputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called at the start of a Tool run, with the tool name and input
   * and the run ID.
   */
  handleToolStart?(
    tool: { name: string },
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> | Promise<CallbackManagerForToolRun>;

  /**
   * Called if a Tool run encounters an error
   */
  handleToolError?(
    err: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called at the end of a Tool run, with the tool output and the run ID.
   */
  handleToolEnd?(
    output: string,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  handleText?(text: string, runId: string, parentRunId?: string): Promise<void>;

  /**
   * Called when an agent is about to execute an action,
   * with the action and the run ID.
   */
  handleAgentAction?(
    action: AgentAction,
    runId: string,
    parentRunId?: string
  ): Promise<void>;

  /**
   * Called when an agent finishes execution, before it exits.
   * with the final output and the run ID.
   */
  handleAgentEnd?(
    action: AgentFinish,
    runId: string,
    parentRunId?: string
  ): Promise<void>;
}

type CallbackHandlerMethods = BaseCallbackHandlerMethodsClass;

type Callbacks =
  | CallbackManager
  | (BaseCallbackHandler | CallbackHandlerMethods)[];

interface BaseLanguageModelParams
  extends AsyncCallerParams,
    BaseLangChainParams {
  callbackManager?: CallbackManager;
}

interface BaseLangChainParams {
  verbose?: boolean;
  callbacks?: Callbacks;
}

abstract class BaseLangChain implements BaseLangChainParams {
  /**
   * Whether to print out response text.
   */
  verbose: boolean;

  callbacks?: Callbacks;

  constructor(params: BaseLangChainParams) {
    this.verbose = params.verbose || false;
    this.callbacks = params.callbacks;
  }
}

class AsyncCaller {
  protected maxConcurrency: AsyncCallerParams["maxConcurrency"];

  protected maxRetries: AsyncCallerParams["maxRetries"];

  private queue: typeof import("p-queue")["default"]["prototype"];

  constructor(params: AsyncCallerParams) {
    this.maxConcurrency = params.maxConcurrency ?? Infinity;
    this.maxRetries = params.maxRetries ?? 6;

    this.queue = new PQueueMod({ concurrency: this.maxConcurrency });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call<A extends any[], T extends (...args: A) => Promise<any>>(
    callable: T,
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> {
    return this.queue.add(
      () =>
        pRetry(
          () =>
            callable(...args).catch((error) => {
              // eslint-disable-next-line no-instanceof/no-instanceof
              if (error instanceof Error) {
                throw error;
              } else {
                throw new Error(error);
              }
            }),
          {
            onFailedAttempt(error) {
              if (
                error.message.startsWith("Cancel") ||
                error.message.startsWith("TimeoutError") ||
                error.message.startsWith("AbortError")
              ) {
                throw error;
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if ((error as any)?.code === "ECONNABORTED") {
                throw error;
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const status = (error as any)?.response?.status;
              if (status && STATUS_NO_RETRY.includes(+status)) {
                throw error;
              }
            },
            retries: this.maxRetries,
            randomize: true,
            // If needed we can change some of the defaults here,
            // but they're quite sensible.
          }
        ),
      { throwOnTimeout: true }
    );
  }

  fetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    return this.call(() =>
      fetch(...args).then((res) => (res.ok ? res : Promise.reject(res)))
    );
  }
}

type SerializedLLM = {
  _model: string;
  _type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

const getModelNameForTiktoken = (modelName: string): TiktokenModel => {
  if (modelName.startsWith("gpt-3.5-turbo-")) {
    return "gpt-3.5-turbo";
  }

  if (modelName.startsWith("gpt-4-32k-")) {
    return "gpt-4-32k";
  }

  if (modelName.startsWith("gpt-4-")) {
    return "gpt-4";
  }

  return modelName as TiktokenModel;
};

abstract class BaseLanguageModel
  extends BaseLangChain
  implements BaseLanguageModelParams
{
  /**
   * The async caller should be used by subclasses to make any async calls,
   * which will thus benefit from the concurrency and retry logic.
   */
  caller: AsyncCaller;
  constructor(params: BaseLanguageModelParams) {
    super({
      verbose: params.verbose,
      callbacks: params.callbacks ?? params.callbackManager,
    });
    this.caller = new AsyncCaller(params ?? {});
  }
  abstract generatePrompt(
    promptValues: BasePromptValue[],
    stop?: string[]
  ): Promise<LLMResult>;
  abstract _modelType(): string;
  abstract _llmType(): string;
  private _encoding?: Tiktoken;
  private _registry?: FinalizationRegistry<Tiktoken>;
  async getNumTokens(text: string) {
    // fallback to approximate calculation if tiktoken is not available
    let numTokens = Math.ceil(text.length / 4);

    try {
      if (!this._encoding) {
        const { encoding_for_model } = await importTiktoken();
        // modelName only exists in openai subclasses, but tiktoken only supports
        // openai tokenisers anyway, so for other subclasses we default to gpt2
        if (encoding_for_model) {
          this._encoding = encoding_for_model(
            "modelName" in this
              ? getModelNameForTiktoken(this.modelName as string)
              : "gpt2"
          );
          // We need to register a finalizer to free the tokenizer when the
          // model is garbage collected.
          this._registry = new FinalizationRegistry((t) => t.free());
          this._registry.register(this, this._encoding);
        }
      }

      if (this._encoding) {
        numTokens = this._encoding.encode(text).length;
      }
    } catch (error) {
      console.warn(
        "Failed to calculate number of tokens with tiktoken, falling back to approximate count",
        error
      );
    }

    return numTokens;
  }

  /**
   * Get the identifying parameters of the LLM.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _identifyingParams(): Record<string, any> {
    return {};
  }

  /**
   * Return a json-like object representing this LLM.
   */
  serialize(): SerializedLLM {
    return {
      ...this._identifyingParams(),
      _type: this._llmType(),
      _model: this._modelType(),
    };
  }
}

type MessageType = "human" | "ai" | "generic" | "system";

abstract class BaseChatMessage {
  /** The text of the message. */
  text: string;
  /** The name of the message sender in a multi-user chat. */
  name?: string;
  /** The type of the message. */
  abstract _getType(): MessageType;
  constructor(text: string) {
    this.text = text;
  }
}

abstract class BasePromptValue {
  abstract toString(): string;
  abstract toChatMessages(): BaseChatMessage[];
}

type Generation = {
  text: string;
  generationInfo?: Record<string, any>;
};

type LLMResult = {
  generations: Generation[][];
  llmOutput?: Record<string, any>;
};

type ChainValues = Record<string, any>;

type AgentAction = {
  tool: string;
  toolInput: string;
  log: string;
};

type AgentFinish = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  returnValues: Record<string, any>;
  log: string;
};

type AgentStep = {
  action: AgentAction;
  observation: string;
};

interface BaseCallbackHandlerInput {
  ignoreLLM?: boolean;
  ignoreChain?: boolean;
  ignoreAgent?: boolean;
}

abstract class BaseCallbackHandler
  extends BaseCallbackHandlerMethodsClass
  implements BaseCallbackHandlerInput
{
  abstract name: string;

  ignoreLLM = false;

  ignoreChain = false;

  ignoreAgent = false;

  constructor(input?: BaseCallbackHandlerInput) {
    super();
    if (input) {
      this.ignoreLLM = input.ignoreLLM ?? this.ignoreLLM;
      this.ignoreChain = input.ignoreChain ?? this.ignoreChain;
      this.ignoreAgent = input.ignoreAgent ?? this.ignoreAgent;
    }
  }

  copy(): BaseCallbackHandler {
    return new (this.constructor as new (
      input?: BaseCallbackHandlerInput
    ) => BaseCallbackHandler)(this);
  }

  static fromMethods(methods: CallbackHandlerMethods) {
    class Handler extends BaseCallbackHandler {
      name = v4();

      constructor() {
        super();
        Object.assign(this, methods);
      }
    }
    return new Handler();
  }
}

abstract class BaseCallbackManager extends BaseCallbackHandler {
  abstract setHandlers(handlers: BaseCallbackHandler[]): void;
  setHandler(handler: BaseCallbackHandler) {
    return this.setHandlers([handler]);
  }
}

type BaseCallbackManagerMethods = {
  [K in keyof CallbackHandlerMethods]?: (
    ...args: Parameters<Required<CallbackHandlerMethods>[K]>
  ) => Promise<unknown>;
};

class BaseRunManager {
  constructor(
    public readonly runId: string,
    protected readonly handlers: BaseCallbackHandler[],
    protected readonly inheritableHandlers: BaseCallbackHandler[],
    protected readonly _parentRunId?: string
  ) {}

  async handleText(text: string): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        try {
          await handler.handleText?.(text, this.runId, this._parentRunId);
        } catch (err) {
          console.error(
            `Error in handler ${handler.constructor.name}, handleText: ${err}`
          );
        }
      })
    );
  }
}

class CallbackManagerForLLMRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  async handleLLMNewToken(token: string): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreLLM) {
          try {
            await handler.handleLLMNewToken?.(
              token,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleLLMNewToken: ${err}`
            );
          }
        }
      })
    );
  }

  async handleLLMError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreLLM) {
          try {
            await handler.handleLLMError?.(
              err as Error,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleLLMError: ${err}`
            );
          }
        }
      })
    );
  }

  async handleLLMEnd(output: LLMResult): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreLLM) {
          try {
            await handler.handleLLMEnd?.(output, this.runId, this._parentRunId);
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleLLMEnd: ${err}`
            );
          }
        }
      })
    );
  }
}

export class CallbackManagerForToolRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  getChild(): CallbackManager {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const manager = new CallbackManager(this.runId);
    manager.setHandlers(this.inheritableHandlers);
    return manager;
  }

  async handleToolError(err: Error): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreAgent) {
          try {
            await handler.handleToolError?.(err, this.runId, this._parentRunId);
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleToolError: ${err}`
            );
          }
        }
      })
    );
  }

  async handleToolEnd(output: string): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreAgent) {
          try {
            await handler.handleToolEnd?.(
              output,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleToolEnd: ${err}`
            );
          }
        }
      })
    );
  }
}

export interface CallbackManagerOptions {
  verbose?: boolean;
  tracing?: boolean;
}

function ensureHandler(
  handler: BaseCallbackHandler | CallbackHandlerMethods
): BaseCallbackHandler {
  if ("name" in handler) {
    return handler;
  }

  return BaseCallbackHandler.fromMethods(handler);
}

class CallbackManager
  extends BaseCallbackManager
  implements BaseCallbackManagerMethods
{
  handlers: BaseCallbackHandler[];

  inheritableHandlers: BaseCallbackHandler[];

  name = "callback_manager";

  private readonly _parentRunId?: string;

  constructor(parentRunId?: string) {
    super();
    this.handlers = [];
    this.inheritableHandlers = [];
    this._parentRunId = parentRunId;
  }

  async handleLLMStart(
    llm: { name: string },
    prompts: string[],
    runId: string = uuidv4()
  ): Promise<CallbackManagerForLLMRun> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreLLM) {
          try {
            await handler.handleLLMStart?.(
              llm,
              prompts,
              runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleLLMStart: ${err}`
            );
          }
        }
      })
    );
    return new CallbackManagerForLLMRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  async handleChainStart(
    chain: { name: string },
    inputs: ChainValues,
    runId = uuidv4()
  ): Promise<CallbackManagerForChainRun> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreChain) {
          try {
            await handler.handleChainStart?.(
              chain,
              inputs,
              runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleChainStart: ${err}`
            );
          }
        }
      })
    );
    return new CallbackManagerForChainRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  async handleToolStart(
    tool: { name: string },
    input: string,
    runId = uuidv4()
  ): Promise<CallbackManagerForToolRun> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreAgent) {
          try {
            await handler.handleToolStart?.(
              tool,
              input,
              runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleToolStart: ${err}`
            );
          }
        }
      })
    );
    return new CallbackManagerForToolRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  addHandler(handler: BaseCallbackHandler, inherit = true): void {
    this.handlers.push(handler);
    if (inherit) {
      this.inheritableHandlers.push(handler);
    }
  }

  removeHandler(handler: BaseCallbackHandler): void {
    this.handlers = this.handlers.filter((_handler) => _handler !== handler);
    this.inheritableHandlers = this.inheritableHandlers.filter(
      (_handler) => _handler !== handler
    );
  }

  setHandlers(handlers: BaseCallbackHandler[], inherit = true): void {
    this.handlers = [];
    this.inheritableHandlers = [];
    for (const handler of handlers) {
      this.addHandler(handler, inherit);
    }
  }

  copy(
    additionalHandlers: BaseCallbackHandler[] = [],
    inherit = true
  ): CallbackManager {
    const manager = new CallbackManager(this._parentRunId);
    for (const handler of this.handlers) {
      const inheritable = this.inheritableHandlers.includes(handler);
      manager.addHandler(handler, inheritable);
    }
    for (const handler of additionalHandlers) {
      if (
        // Prevent multiple copies of console_callback_handler
        manager.handlers
          .filter((h) => h.name === "console_callback_handler")
          .some((h) => h.name === handler.name)
      ) {
        continue;
      }
      manager.addHandler(handler, inherit);
    }
    return manager;
  }

  static fromHandlers(handlers: CallbackHandlerMethods) {
    class Handler extends BaseCallbackHandler {
      name = uuidv4();

      constructor() {
        super();
        Object.assign(this, handlers);
      }
    }

    const manager = new this();
    manager.addHandler(new Handler());
    return manager;
  }

  static async configure(
    inheritableHandlers?: Callbacks,
    localHandlers?: Callbacks,
    options?: CallbackManagerOptions
  ): Promise<CallbackManager | undefined> {
    let callbackManager: CallbackManager | undefined;
    if (inheritableHandlers || localHandlers) {
      if (Array.isArray(inheritableHandlers) || !inheritableHandlers) {
        callbackManager = new CallbackManager();
        callbackManager.setHandlers(
          inheritableHandlers?.map(ensureHandler) ?? [],
          true
        );
      } else {
        callbackManager = inheritableHandlers;
      }
      callbackManager = callbackManager.copy(
        Array.isArray(localHandlers)
          ? localHandlers.map(ensureHandler)
          : localHandlers?.handlers,
        false
      );
    }
    if (options?.verbose) {
      if (!callbackManager) {
        callbackManager = new CallbackManager();
      }
      if (
        options?.verbose &&
        !callbackManager.handlers.some(
          (handler) => handler.name === ConsoleCallbackHandler.prototype.name
        )
      ) {
        const consoleHandler = new ConsoleCallbackHandler();
        callbackManager.addHandler(consoleHandler, true);
      }
    }
    return callbackManager;
  }
}

class ConsoleCallbackHandler extends BaseCallbackHandler {
  name = "console_callback_handler" as const;
  async handleChainStart(chain: { name: string }) {
    console.log(`Entering new ${chain.name} chain...`);
  }
  async handleChainEnd(_output: ChainValues) {
    console.log("Finished chain.");
  }
  async handleAgentAction(action: AgentAction) {
    console.log(action.log);
  }
  async handleToolEnd(output: string) {
    console.log(output);
  }
  async handleText(text: string) {
    console.log(text);
  }
  async handleAgentEnd(action: AgentFinish) {
    console.log(action.log);
  }
}

class SingletonCallbackManager extends CallbackManager {
  static instance: SingletonCallbackManager | undefined;
  constructor() {
    super();
  }
  static getInstance() {
    if (!SingletonCallbackManager.instance) {
      SingletonCallbackManager.instance = new SingletonCallbackManager();
      SingletonCallbackManager.instance.addHandler(
        new ConsoleCallbackHandler()
      );
    }
    return SingletonCallbackManager.instance;
  }
}
export function getCallbackManager() {
  return SingletonCallbackManager.getInstance();
}

abstract class Tool {
  verbose: boolean;
  callbackManager: CallbackManager;
  abstract name: string;
  abstract description: string;
  returnDirect = false;

  protected abstract _call(arg: string): Promise<string>;
  constructor(verbose = false, callbackManager?: CallbackManager) {
    this.verbose = verbose ?? !!callbackManager;
    this.callbackManager = callbackManager ?? getCallbackManager();
  }
  async call(arg: string, verbose = false) {
    const _verbose = (verbose ?? this.verbose).toString();
    await this.callbackManager.handleToolStart(
      { name: this.name },
      arg,
      _verbose
    );
    let result;
    try {
      result = await this._call(arg);
    } catch (e) {
      await this.callbackManager.handleToolError?.(e as Error, _verbose);
      throw e;
    }
    await this.callbackManager.handleToolEnd?.(result, _verbose);
    return result;
  }
}

const PREFIX = `Answer the following questions as best you can. You have access to the following tools:`;
const formatInstructions = (toolNames: string) => `Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [${toolNames}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question`;
const SUFFIX = `Begin!

Question: {input}
Thought:{agent_scratchpad}`;

type BaseMemory = {
  loadMemoryVariables: (memory: unknown) => Record<string, unknown>;
  saveContext: (context: unknown, output: Record<string, any>) => unknown;
};

abstract class BaseChain {
  memory?: BaseMemory;
  verbose: boolean;
  callbackManager: CallbackManager;
  abstract inputKeys: string[];
  constructor(
    memory?: BaseMemory,
    verbose?: boolean,
    callbackManager?: CallbackManager
  ) {
    this.memory = memory;
    this.verbose = verbose ?? !!callbackManager;
    this.callbackManager = callbackManager ?? getCallbackManager();
  }
  async run(input: string) {
    const isKeylessInput = this.inputKeys.length === 1;
    if (!isKeylessInput) {
      throw new Error(
        `Chain ${this._chainType()} expects multiple inputs, cannot use 'run' `
      );
    }
    const values = { [this.inputKeys[0]]: input };
    const returnValues = await this.call(values);
    if (returnValues.llmOutput) {
      return returnValues.llmOutput;
    }
    throw new Error(
      "return values have multiple keys, `run` only supported when one key currently"
    );
  }
  abstract _chainType(): string;
  abstract _call(values: Record<string, unknown>): Promise<ChainValues>;
  async call(values: Record<string, unknown>) {
    const fullValues = { ...values };
    if (!(this.memory == null)) {
      const newValues = await this.memory.loadMemoryVariables(values);
      for (const [key, value] of Object.entries(newValues)) {
        fullValues[key] = value;
      }
    }
    const _verbose = this.verbose.toString();
    await this.callbackManager.handleChainStart(
      { name: this._chainType() },
      fullValues,
      _verbose
    );
    let outputValues: ChainValues;
    try {
      outputValues = await this._call(fullValues);
    } catch (e) {
      await this.callbackManager.handleChainError?.(e as Error, _verbose);
      throw e;
    }
    await this.callbackManager.handleChainEnd?.(outputValues, _verbose);
    if (!(this.memory == null)) {
      await this.memory.saveContext(values, outputValues);
    }
    return outputValues;
  }
  async apply(inputs: Record<string, unknown>[]) {
    return Promise.all(inputs.map(async (i) => this.call(i)));
  }
}

interface ChainInputs extends BaseLangChainParams {
  memory?: BaseMemory;

  /**
   * @deprecated Use `callbacks` instead
   */
  callbackManager?: CallbackManager;
}

interface LLMChainInput extends ChainInputs {
  /** Prompt object to use */
  prompt: BasePromptTemplate;
  /** LLM Wrapper to use */
  llm: BaseLanguageModel;
  /** OutputParser to use */
  outputParser?: BaseOutputParser;
  /** Key to use for output, defaults to `text` */
  outputKey?: string;
}

class CallbackManagerForChainRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  getChild(): CallbackManager {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const manager = new CallbackManager(this.runId);
    manager.setHandlers(this.inheritableHandlers);
    return manager;
  }

  async handleChainError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreChain) {
          try {
            await handler.handleChainError?.(
              err as Error,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleChainError: ${err}`
            );
          }
        }
      })
    );
  }

  async handleChainEnd(output: ChainValues): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreChain) {
          try {
            await handler.handleChainEnd?.(
              output,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleChainEnd: ${err}`
            );
          }
        }
      })
    );
  }

  async handleAgentAction(action: AgentAction): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreAgent) {
          try {
            await handler.handleAgentAction?.(
              action,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleAgentAction: ${err}`
            );
          }
        }
      })
    );
  }

  async handleAgentEnd(action: AgentFinish): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        if (!handler.ignoreAgent) {
          try {
            await handler.handleAgentEnd?.(
              action,
              this.runId,
              this._parentRunId
            );
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleAgentEnd: ${err}`
            );
          }
        }
      })
    );
  }
}

export type SerializedPromptTemplate = {
  _type?: "prompt";
  input_variables: string[];
  template_format?: TemplateFormat;
  template?: string;
};

export type SerializedFewShotTemplate = {
  _type: "few_shot";
  input_variables: string[];
  examples: string | Record<string, string>[];
  example_prompt?: SerializedPromptTemplate;
  example_separator: string;
  prefix?: string;
  suffix?: string;
  template_format: TemplateFormat;
};

export type SerializedMessagePromptTemplate = {
  _type: "message";
  input_variables: string[];
  [key: string]: unknown;
};

/** Serialized Chat prompt template */
export type SerializedChatPromptTemplate = {
  _type?: "chat_prompt";
  input_variables: string[];
  template_format?: TemplateFormat;
  prompt_messages: SerializedMessagePromptTemplate[];
};

export type SerializedBasePromptTemplate =
  | SerializedFewShotTemplate
  | SerializedPromptTemplate
  | SerializedChatPromptTemplate;

type SerializedLLMChain = {
  _type: "llm_chain";
  llm?: SerializedLLM;
  prompt?: SerializedBasePromptTemplate;
};

class LLMChain extends BaseChain implements LLMChainInput {
  prompt: BasePromptTemplate;

  llm: BaseLanguageModel;

  outputKey = "text";

  outputParser?: BaseOutputParser;

  get inputKeys() {
    return this.prompt.inputVariables;
  }

  get outputKeys() {
    return [this.outputKey];
  }

  constructor(fields: LLMChainInput) {
    // @ts-ignore
    super(fields);
    this.prompt = fields.prompt;
    this.llm = fields.llm;
    this.outputKey = fields.outputKey ?? this.outputKey;
    this.outputParser = fields.outputParser ?? this.outputParser;
    if (this.prompt.outputParser) {
      if (this.outputParser) {
        throw new Error("Cannot set both outputParser and prompt.outputParser");
      }
      this.outputParser = this.prompt.outputParser;
    }
  }

  /** @ignore */
  async _getFinalOutput(
    generations: Generation[],
    promptValue: BasePromptValue,
    runManager?: CallbackManagerForChainRun
  ): Promise<unknown> {
    const completion = generations[0].text;
    let finalCompletion: unknown;
    if (this.outputParser) {
      finalCompletion = await this.outputParser.parseWithPrompt(
        completion,
        promptValue,
        runManager?.getChild()
      );
    } else {
      finalCompletion = completion;
    }
    return finalCompletion;
  }

  /** @ignore */
  async _call(
    values: ChainValues,
    runManager?: CallbackManagerForChainRun
  ): Promise<ChainValues> {
    let stop;
    if ("stop" in values && Array.isArray(values.stop)) {
      stop = values.stop;
    }
    const promptValue = await this.prompt.formatPromptValue(values);
    const { generations } = await this.llm.generatePrompt([promptValue], stop);
    return {
      [this.outputKey]: await this._getFinalOutput(
        generations[0],
        promptValue,
        runManager
      ),
    };
  }

  /**
   * Format prompt with values and pass to LLM
   *
   * @param values - keys to pass to prompt template
   * @param callbackManager - CallbackManager to use
   * @returns Completion from LLM.
   *
   * @example
   * ```ts
   * llm.predict({ adjective: "funny" })
   * ```
   */
  async predict(
    values: ChainValues,
    _callbackManager?: CallbackManager
  ): Promise<string> {
    const output = await this.call(values);
    return output[this.outputKey];
  }

  _chainType() {
    return "llm_chain" as const;
  }

  serialize(): SerializedLLMChain {
    return {
      _type: this._chainType(),
      llm: this.llm.serialize(),
      prompt: this.prompt.serialize(),
    };
  }
}

type StoppingMethod = "force" | "early" | "generate";

abstract class BaseAgent {
  abstract get inputKeys(): string[];

  get returnValues(): string[] {
    return ["output"];
  }

  get allowedTools(): string[] | undefined {
    return undefined;
  }

  _agentType(): string {
    throw new Error("Not implemented");
  }

  abstract _agentActionType(): string;

  returnStoppedResponse(
    earlyStoppingMethod: StoppingMethod,
    _steps: AgentStep[],
    _inputs: ChainValues,
    _callbackManager?: CallbackManager
  ): Promise<AgentFinish> {
    if (earlyStoppingMethod === "force") {
      return Promise.resolve({
        returnValues: { output: "Agent stopped due to max iterations." },
        log: "",
      });
    }

    throw new Error(`Invalid stopping method: ${earlyStoppingMethod}`);
  }

  async prepareForOutput(
    _returnValues: AgentFinish["returnValues"],
    _steps: AgentStep[]
  ): Promise<AgentFinish["returnValues"]> {
    return {};
  }
}

export abstract class BaseSingleActionAgent extends BaseAgent {
  _agentActionType(): string {
    return "single" as const;
  }

  abstract plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish>;
}

export abstract class BaseMultiActionAgent extends BaseAgent {
  _agentActionType(): string {
    return "multi" as const;
  }

  abstract plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction[] | AgentFinish>;
}

export interface LLMSingleActionAgentInput {
  llmChain: LLMChain;
  outputParser: AgentActionOutputParser;
  stop?: string[];
}

export class LLMSingleActionAgent extends BaseSingleActionAgent {
  llmChain: LLMChain;

  outputParser: AgentActionOutputParser;

  stop?: string[];

  constructor(input: LLMSingleActionAgentInput) {
    super();
    this.stop = input.stop;
    this.llmChain = input.llmChain;
    this.outputParser = input.outputParser;
  }

  get inputKeys(): string[] {
    return this.llmChain.inputKeys;
  }

  /**
   * Decide what to do given some input.
   *
   * @param steps - Steps the LLM has taken so far, along with observations from each.
   * @param inputs - User inputs.
   * @param callbackManager - Callback manager.
   *
   * @returns Action specifying what tool to use.
   */
  async plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish> {
    const output = await this.llmChain.call(
      {
        intermediate_steps: steps,
        stop: this.stop,
        ...inputs,
      }
      //callbackManager
    );
    return this.outputParser.parse(
      output[this.llmChain.outputKey],
      callbackManager
    );
  }
}

export interface AgentArgs {
  outputParser?: AgentActionOutputParser;

  callbacks?: CallbackManager[] | CallbackManager;
}

class ParseError extends Error {
  output: string;

  constructor(msg: string, output: string) {
    super(msg);
    this.output = output;
  }
}

export abstract class Agent extends BaseSingleActionAgent {
  llmChain: LLMChain;

  outputParser: AgentActionOutputParser;

  private _allowedTools?: string[] = undefined;

  get allowedTools(): string[] | undefined {
    return this._allowedTools;
  }

  get inputKeys(): string[] {
    return this.llmChain.inputKeys.filter((k) => k !== "agent_scratchpad");
  }

  constructor(input: {
    llmChain: LLMChain;
    allowedTools?: string[];
    outputParser: AgentActionOutputParser;
  }) {
    super();
    this.llmChain = input.llmChain;
    this._allowedTools = input.allowedTools;
    this.outputParser = input.outputParser;
  }

  /**
   * Prefix to append the observation with.
   */
  abstract observationPrefix(): string;

  /**
   * Prefix to append the LLM call with.
   */
  abstract llmPrefix(): string;

  abstract _agentType(): string;

  static createPrompt(
    _tools: Tool[],
    _fields?: Record<string, any>
  ): BasePromptTemplate {
    throw new Error("Not implemented");
  }

  /**
   * Validate that appropriate tools are passed in
   */
  static validateTools(_tools: Tool[]): void {}

  _stop(): string[] {
    return [`\n${this.observationPrefix()}`];
  }

  /**
   * Name of tool to use to terminate the chain.
   */
  finishToolName(): string {
    return "Final Answer";
  }

  /**
   * Construct a scratchpad to let the agent continue its thought process
   */
  async constructScratchPad(
    steps: AgentStep[]
  ): Promise<string | BaseChatMessage[]> {
    return steps.reduce(
      (thoughts, { action, observation }) =>
        thoughts +
        [
          action.log,
          `${this.observationPrefix()}${observation}`,
          this.llmPrefix(),
        ].join("\n"),
      ""
    );
  }

  private async _plan(
    steps: AgentStep[],
    inputs: ChainValues,
    suffix?: string,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish> {
    const thoughts = await this.constructScratchPad(steps);
    const newInputs: ChainValues = {
      ...inputs,
      agent_scratchpad: suffix ? `${thoughts}${suffix}` : thoughts,
    };

    if (this._stop().length !== 0) {
      newInputs.stop = this._stop();
    }

    const output = await this.llmChain.predict(newInputs);
    return this.outputParser.parse(output, callbackManager);
  }

  /**
   * Decide what to do given some input.
   *
   * @param steps - Steps the LLM has taken so far, along with observations from each.
   * @param inputs - User inputs.
   * @param callbackManager - Callback manager to use for this call.
   *
   * @returns Action specifying what tool to use.
   */
  plan(
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentAction | AgentFinish> {
    return this._plan(steps, inputs, undefined, callbackManager);
  }

  /**
   * Return response when agent has been stopped due to max iterations
   */
  async returnStoppedResponse(
    earlyStoppingMethod: StoppingMethod,
    steps: AgentStep[],
    inputs: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<AgentFinish> {
    if (earlyStoppingMethod === "force") {
      return {
        returnValues: { output: "Agent stopped due to max iterations." },
        log: "",
      };
    }

    if (earlyStoppingMethod === "generate") {
      try {
        const action = await this._plan(
          steps,
          inputs,
          "\n\nI now need to return a final answer based on the previous steps:",
          callbackManager
        );
        if ("returnValues" in action) {
          return action;
        }

        return { returnValues: { output: action.log }, log: action.log };
      } catch (err) {
        // fine to use instanceof because we're in the same module
        // eslint-disable-next-line no-instanceof/no-instanceof
        if (!(err instanceof ParseError)) {
          throw err;
        }
        return { returnValues: { output: err.output }, log: err.output };
      }
    }

    throw new Error(`Invalid stopping method: ${earlyStoppingMethod}`);
  }
}

const FORMAT_INSTRUCTIONS = `The way you use the tools is by specifying a json blob, denoted below by $JSON_BLOB
Specifically, this $JSON_BLOB should have a "action" key (with the name of the tool to use) and a "action_input" key (with the input to the tool going here). 
The $JSON_BLOB should only contain a SINGLE action, do NOT return a list of multiple actions. Here is an example of a valid $JSON_BLOB:

\`\`\`
{{
  "action": "calculator",
  "action_input": "1 + 2"
}}
\`\`\`

ALWAYS use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: 
\`\`\`
$JSON_BLOB
\`\`\`
Observation: the result of the action
... (this Thought/Action/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question`;

export abstract class BaseOutputParser<T = unknown> {
  /**
   * Parse the output of an LLM call.
   *
   * @param text - LLM output to parse.
   * @returns Parsed output.
   */
  abstract parse(
    text: string,
    callbacks?: CallbackManager[] | CallbackManager
  ): Promise<T>;

  async parseWithPrompt(
    text: string,
    _prompt: BasePromptValue,
    callbacks?: CallbackManager[] | CallbackManager
  ): Promise<T> {
    return this.parse(text, callbacks);
  }

  abstract getFormatInstructions(): string;

  _type(): string {
    throw new Error("_type not implemented");
  }
}

export abstract class AgentActionOutputParser extends BaseOutputParser<
  AgentAction | AgentFinish
> {}

export const FINAL_ANSWER_ACTION = "Final Answer:";
export class ZeroShotAgentOutputParser extends AgentActionOutputParser {
  finishToolName: string;

  constructor(fields?: Record<string, any>) {
    super();
    this.finishToolName = fields?.finishToolName || FINAL_ANSWER_ACTION;
  }

  async parse(text: string) {
    if (text.includes(this.finishToolName)) {
      const parts = text.split(this.finishToolName);
      const output = parts[parts.length - 1].trim();
      return {
        returnValues: { output },
        log: text,
      };
    }

    const match = /Action: (.*)\nAction Input: (.*)/s.exec(text);
    if (!match) {
      throw new Error(`Could not parse LLM output: ${text}`);
    }

    return {
      tool: match[1].trim(),
      toolInput: match[2].trim().replace(/^"+|"+$/g, "") ?? "",
      log: text,
    };
  }

  getFormatInstructions(): string {
    return FORMAT_INSTRUCTIONS;
  }
}

export interface AgentInput {
  llmChain: LLMChain;
  outputParser: AgentActionOutputParser;
  allowedTools?: string[];
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type ZeroShotAgentInput = Optional<AgentInput, "outputParser">;
interface ZeroShotCreatePromptArgs {
  suffix?: string;
  prefix?: string;
  inputVariables?: string[];
}

export class ZeroShotAgent extends Agent {
  constructor(input: ZeroShotAgentInput) {
    const outputParser = input?.outputParser ?? new ZeroShotAgentOutputParser();
    super({ ...input, outputParser });
  }

  _agentType() {
    return "zero-shot-react-description" as const;
  }

  observationPrefix() {
    return "Observation: ";
  }

  llmPrefix() {
    return "Thought:";
  }

  static validateTools(tools: Tool[]) {
    const invalidTool = tools.find((tool) => !tool.description);
    if (invalidTool) {
      const msg =
        `Got a tool ${invalidTool.name} without a description.` +
        ` This agent requires descriptions for all tools.`;
      throw new Error(msg);
    }
  }

  static createPrompt(tools: Tool[], args?: ZeroShotCreatePromptArgs) {
    const {
      prefix = PREFIX,
      suffix = SUFFIX,
      inputVariables = ["input", "agent_scratchpad"],
    } = args ?? {};
    const toolStrings = tools
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join("\n");

    const toolNames = tools.map((tool) => tool.name);

    const formatInstructions = renderTemplate(FORMAT_INSTRUCTIONS, "f-string", {
      tool_names: toolNames,
    });

    const template = [prefix, toolStrings, formatInstructions, suffix].join(
      "\n\n"
    );

    return new PromptTemplate({
      template,
      inputVariables,
    });
  }
}

class AgentExecutor extends BaseChain {
  agent: Agent;
  tools: Tool[];
  returnIntermediateSteps: boolean;
  maxIterations: number;
  earlyStoppingMethod: StoppingMethod = "force";
  get inputKeys() {
    return this.agent.inputKeys;
  }
  constructor(input: {
    memory: BaseMemory;
    verbose: boolean;
    callbackManager: CallbackManager;
    agent: Agent;
    tools: Tool[];
    maxIterations?: number;
    returnIntermediateSteps: boolean;
    earlyStoppingMethod: StoppingMethod;
  }) {
    super(input.memory, input.verbose, input.callbackManager);

    this.returnIntermediateSteps = false;
    this.maxIterations = 15;
    this.agent = input.agent;
    this.tools = input.tools;
    if (this.agent._agentActionType() === "multi") {
      for (const tool of this.tools) {
        if (tool.returnDirect) {
          throw new Error(
            `Tool with return direct ${tool.name} not supported for multi-action agent.`
          );
        }
      }
    }
    this.returnIntermediateSteps =
      input.returnIntermediateSteps ?? this.returnIntermediateSteps;
    this.maxIterations = input.maxIterations ?? this.maxIterations;
    this.earlyStoppingMethod =
      input.earlyStoppingMethod ?? this.earlyStoppingMethod;
  }
  shouldContinue(iterations: number) {
    return this.maxIterations === undefined || iterations < this.maxIterations;
  }
  async _call(inputs: ChainValues): Promise<ChainValues> {
    const toolsByName = Object.fromEntries(
      this.tools.map((t) => [t.name.toLowerCase(), t])
    );
    const steps: AgentStep[] = [];
    let iterations = 0;
    const getOutput = async (finishStep: AgentFinish) => {
      const { returnValues } = finishStep;
      const additional = await this.agent.prepareForOutput(returnValues, steps);
      if (this.returnIntermediateSteps) {
        return { ...returnValues, intermediateSteps: steps, ...additional };
      }
      await this.callbackManager.handleAgentEnd?.(
        finishStep,
        this.verbose.toString()
      );
      return { ...returnValues, ...additional };
    };
    while (this.shouldContinue(iterations)) {
      const output = await this.agent.plan(steps, inputs);
      // Check if the agent has finished
      if ("returnValues" in output) {
        return getOutput(output as AgentFinish);
      }
      let actions;
      if (Array.isArray(output)) {
        actions = output;
      } else {
        actions = [output];
      }
      const newSteps = await Promise.all(
        actions.map(async (action) => {
          await this.callbackManager.handleAgentAction?.(
            action,
            this.verbose.toString()
          );
          const tool = toolsByName[action.tool?.toLowerCase()];
          const observation = tool
            ? await tool.call(action.toolInput, this.verbose)
            : `${action.tool} is not a valid tool, try another one.`;
          return { action, observation };
        })
      );
      steps.push(...newSteps);
      const lastStep = steps[steps.length - 1];
      const lastTool = toolsByName[lastStep.action.tool?.toLowerCase()];
      if (lastTool?.returnDirect) {
        return getOutput({
          returnValues: { [this.agent.returnValues[0]]: lastStep.observation },
          log: "",
        });
      }
      iterations += 1;
    }
    const finish = await this.agent.returnStoppedResponse(
      this.earlyStoppingMethod,
      steps,
      inputs
    );
    return getOutput(finish);
  }
  _chainType() {
    return "agent_executor";
  }
  serialize() {
    throw new Error("Cannot serialize an AgentExecutor");
  }
}

const initializeAgentExecutor = async (
  tools: Tool[],
  llm: BaseLanguageModel,
  _verbose?: boolean,
  _callbackManager?: BaseCallbackManager
) => {
  const verbose = _verbose ?? !!_callbackManager;
  const callbackManager = _callbackManager ?? getCallbackManager();

  const prefix = PREFIX;
  const suffix = SUFFIX;
  const inputVariables = ["input", "agent_scratchpad"];
  const toolStrings = tools
    .map((tool) => `${tool.name}: ${tool.description}`)
    .join("\n");
  const toolNames = tools.map((tool) => tool.name).join("\n");
  const instructions = formatInstructions(toolNames);
  const template = [prefix, toolStrings, instructions, suffix].join("\n\n");
  const prompt = new PromptTemplate({
    template,
    inputVariables,
  });
  const chain = new LLMChain({ prompt, llm });

  return new AgentExecutor({
    agent: new ZeroShotAgent({
      llmChain: chain,
      allowedTools: tools.map((t) => t.name),
    }),
    tools,
    returnIntermediateSteps: true,
    verbose,
    // @ts-ignore
    callbackManager,
  });
};
interface BaseLanguageModelCallOptions {}
interface BaseLLMParams extends BaseLanguageModelParams {
  /**
   * @deprecated Use `maxConcurrency` instead
   */
  concurrency?: number;
  cache?: BaseCache | boolean;
}
abstract class BaseCache<T = Generation[]> {
  abstract lookup(prompt: string, llmKey: string): Promise<T | null>;

  abstract update(prompt: string, llmKey: string, value: T): Promise<void>;
}
const GLOBAL_MAP = new Map();
const getCacheKey = (...strings: string[]): string =>
  crypto.createHash("sha256").update(strings.join("_")).digest("base64");
class InMemoryCache<T = Generation[]> extends BaseCache<T> {
  private cache: Map<string, T>;

  constructor(map?: Map<string, T>) {
    super();
    this.cache = map ?? new Map();
  }

  lookup(prompt: string, llmKey: string): Promise<T | null> {
    return Promise.resolve(this.cache.get(getCacheKey(prompt, llmKey)) ?? null);
  }

  async update(prompt: string, llmKey: string, value: T): Promise<void> {
    this.cache.set(getCacheKey(prompt, llmKey), value);
  }

  static global(): InMemoryCache {
    return new InMemoryCache(GLOBAL_MAP);
  }
}
const RUN_KEY = "__run";
abstract class BaseLLM extends BaseLanguageModel {
  declare CallOptions: BaseLanguageModelCallOptions;

  cache?: BaseCache;

  constructor({ cache, concurrency, ...rest }: BaseLLMParams) {
    super(concurrency ? { maxConcurrency: concurrency, ...rest } : rest);
    if (typeof cache === "object") {
      this.cache = cache;
    } else if (cache) {
      this.cache = InMemoryCache.global();
    } else {
      this.cache = undefined;
    }
  }

  async generatePrompt(
    promptValues: BasePromptValue[],
    stop?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    const prompts: string[] = promptValues.map((promptValue) =>
      promptValue.toString()
    );
    return this.generate(prompts, stop, callbacks);
  }

  /**
   * Run the LLM on the given prompts and input.
   */
  abstract _generate(
    prompts: string[],
    stop?: string[] | this["CallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult>;

  /** @ignore */
  async _generateUncached(
    prompts: string[],
    stop?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    const callbackManager_ = await CallbackManager.configure(
      callbacks,
      this.callbacks,
      { verbose: this.verbose }
    );
    const runManager = await callbackManager_?.handleLLMStart(
      { name: this._llmType() },
      prompts
    );
    let output;
    try {
      output = await this._generate(prompts, stop, runManager);
    } catch (err) {
      await runManager?.handleLLMError(err);
      throw err;
    }

    await runManager?.handleLLMEnd(output);
    // This defines RUN_KEY as a non-enumerable property on the output object
    // so that it is not serialized when the output is stringified, and so that
    // it isnt included when listing the keys of the output object.
    Object.defineProperty(output, RUN_KEY, {
      value: runManager ? { runId: runManager?.runId } : undefined,
      configurable: true,
    });
    return output;
  }

  /**
   * Run the LLM on the given propmts an input, handling caching.
   */
  async generate(
    prompts: string[],
    stop?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    if (!Array.isArray(prompts)) {
      throw new Error("Argument 'prompts' is expected to be a string[]");
    }

    if (!this.cache) {
      return this._generateUncached(prompts, stop, callbacks);
    }

    const { cache } = this;
    const params = this.serialize();
    params.stop = stop;

    const llmStringKey = `${Object.entries(params).sort()}`;
    const missingPromptIndices: number[] = [];
    const generations = await Promise.all(
      prompts.map(async (prompt, index) => {
        const result = await cache.lookup(prompt, llmStringKey);
        if (!result) {
          missingPromptIndices.push(index);
        }
        return result;
      })
    );

    let llmOutput = {};
    if (missingPromptIndices.length > 0) {
      const results = await this._generateUncached(
        missingPromptIndices.map((i) => prompts[i]),
        stop,
        callbacks
      );
      await Promise.all(
        results.generations.map(async (generation, index) => {
          const promptIndex = missingPromptIndices[index];
          generations[promptIndex] = generation;
          return cache.update(prompts[promptIndex], llmStringKey, generation);
        })
      );
      llmOutput = results.llmOutput ?? {};
    }

    return { generations, llmOutput } as LLMResult;
  }

  /**
   * Convenience wrapper for {@link generate} that takes in a single string prompt and returns a single string output.
   */
  async call(
    prompt: string,
    stop?: string[] | this["CallOptions"],
    callbacks?: Callbacks
  ) {
    const { generations } = await this.generate([prompt], stop, callbacks);
    return generations[0][0].text;
  }

  /**
   * Get the identifying parameters of the LLM.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _identifyingParams(): Record<string, any> {
    return {};
  }

  /**
   * Return the string type key uniquely identifying this class of LLM.
   */
  abstract _llmType(): string;

  /**
   * Return a json-like object representing this LLM.
   */
  serialize(): SerializedLLM {
    return {
      ...this._identifyingParams(),
      _type: this._llmType(),
      _model: this._modelType(),
    };
  }

  _modelType(): string {
    return "base_llm" as const;
  }
}
type Kwargs = Record<string, any>;
interface OpenAIInput {
  /** Sampling temperature to use */
  temperature: number;

  /**
   * Maximum number of tokens to generate in the completion. -1 returns as many
   * tokens as possible given the prompt and the model's maximum context size.
   */
  maxTokens: number;

  /** Total probability mass of tokens to consider at each step */
  topP: number;

  /** Penalizes repeated tokens according to frequency */
  frequencyPenalty: number;

  /** Penalizes repeated tokens */
  presencePenalty: number;

  /** Number of completions to generate for each prompt */
  n: number;

  /** Generates `bestOf` completions server side and returns the "best" */
  bestOf: number;

  /** Dictionary used to adjust the probability of specific tokens being generated */
  logitBias?: Record<string, number>;

  /** Whether to stream the results or not. Enabling disables tokenUsage reporting */
  streaming: boolean;

  /** Model name to use */
  modelName: string;

  /** Holds any additional parameters that are valid to pass to {@link
   * https://platform.openai.com/docs/api-reference/completions/create |
   * `openai.createCompletion`} that are not explicitly specified on this class.
   */
  modelKwargs?: Kwargs;

  /** Batch size to use when passing multiple documents to generate */
  batchSize: number;

  /** List of stop words to use when generating */
  stop?: string[];

  /**
   * Timeout to use when making requests to OpenAI.
   */
  timeout?: number;
}
interface OpenAICallOptions extends BaseLanguageModelCallOptions {
  /**
   * List of stop words to use when generating
   */
  stop?: string[];

  /**
   * Additional options to pass to the underlying axios request.
   */
  options?: AxiosRequestConfig;
}

abstract class LLM extends BaseLLM {
  /**
   * Run the LLM on the given prompt and input.
   */
  abstract _call(
    prompt: string,
    stop?: string[] | this["CallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string>;

  async _generate(
    prompts: string[],
    stop?: string[] | this["CallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult> {
    const generations: Generation[][] = [];
    for (let i = 0; i < prompts.length; i += 1) {
      const text = await this._call(prompts[i], stop, runManager);
      generations.push([{ text }]);
    }
    return { generations };
  }
}

interface OpenAIBaseInput {
  /** Sampling temperature to use */
  temperature: number;

  /**
   * Maximum number of tokens to generate in the completion. -1 returns as many
   * tokens as possible given the prompt and the model's maximum context size.
   */
  maxTokens?: number;

  /** Total probability mass of tokens to consider at each step */
  topP: number;

  /** Penalizes repeated tokens according to frequency */
  frequencyPenalty: number;

  /** Penalizes repeated tokens */
  presencePenalty: number;

  /** Number of completions to generate for each prompt */
  n: number;

  /** Dictionary used to adjust the probability of specific tokens being generated */
  logitBias?: Record<string, number>;

  /** Whether to stream the results or not. Enabling disables tokenUsage reporting */
  streaming: boolean;

  /** Model name to use */
  modelName: string;

  /** Holds any additional parameters that are valid to pass to {@link
   * https://platform.openai.com/docs/api-reference/completions/create |
   * `openai.createCompletion`} that are not explicitly specified on this class.
   */
  modelKwargs?: Record<string, any>;

  /** List of stop words to use when generating */
  stop?: string[];

  /**
   * Timeout to use when making requests to OpenAI.
   */
  timeout?: number;
}

export interface OpenAIChatInput extends OpenAIBaseInput {
  /** ChatGPT messages to pass as a prefix to the prompt */
  prefixMessages?: ChatCompletionRequestMessage[];
}

export declare interface AzureOpenAIInput {
  /**
   * API version to use when making requests to Azure OpenAI.
   */
  azureOpenAIApiVersion?: string;

  /**
   * API key to use when making requests to Azure OpenAI.
   */
  azureOpenAIApiKey?: string;

  /**
   * Azure OpenAI API instance name to use when making requests to Azure OpenAI.
   * this is the name of the instance you created in the Azure portal.
   * e.g. "my-openai-instance"
   * this will be used in the endpoint URL: https://my-openai-instance.openai.azure.com/openai/deployments/{DeploymentName}/
   */
  azureOpenAIApiInstanceName?: string;

  /**
   * Azure OpenAI API deployment name to use for completions when making requests to Azure OpenAI.
   * This is the name of the deployment you created in the Azure portal.
   * e.g. "my-openai-deployment"
   * this will be used in the endpoint URL: https://{InstanceName}.openai.azure.com/openai/deployments/my-openai-deployment/
   */
  azureOpenAIApiDeploymentName?: string;

  /**
   * Azure OpenAI API deployment name to use for embedding when making requests to Azure OpenAI.
   * This is the name of the deployment you created in the Azure portal.
   * This will fallback to azureOpenAIApiDeploymentName if not provided.
   * e.g. "my-openai-deployment"
   * this will be used in the endpoint URL: https://{InstanceName}.openai.azure.com/openai/deployments/my-openai-deployment/
   */
  azureOpenAIApiEmbeddingsDeploymentName?: string;

  /**
   * Azure OpenAI API deployment name to use for completions when making requests to Azure OpenAI.
   * Completions are only available for gpt-3.5-turbo and text-davinci-003 deployments.
   * This is the name of the deployment you created in the Azure portal.
   * This will fallback to azureOpenAIApiDeploymentName if not provided.
   * e.g. "my-openai-deployment"
   * this will be used in the endpoint URL: https://{InstanceName}.openai.azure.com/openai/deployments/my-openai-deployment/
   */
  azureOpenAIApiCompletionsDeploymentName?: string;
}

class OpenAIChat extends LLM implements OpenAIChatInput, AzureOpenAIInput {
  declare CallOptions: OpenAICallOptions;

  temperature = 1;

  topP = 1;

  frequencyPenalty = 0;

  presencePenalty = 0;

  n = 1;

  logitBias?: Record<string, number>;

  maxTokens?: number;

  modelName = "gpt-3.5-turbo";

  prefixMessages?: ChatCompletionRequestMessage[];

  modelKwargs?: OpenAIChatInput["modelKwargs"];

  timeout?: number;

  stop?: string[];

  streaming = false;

  azureOpenAIApiVersion?: string;

  azureOpenAIApiKey?: string;

  azureOpenAIApiInstanceName?: string;

  azureOpenAIApiDeploymentName?: string;

  private client: OpenAIApi;

  private clientConfig: ConfigurationParameters & {
    isJsonMime: (mime: string) => boolean;
  };

  constructor(
    fields?: Partial<OpenAIChatInput> &
      Partial<AzureOpenAIInput> &
      BaseLLMParams & {
        openAIApiKey?: string;
      },
    configuration?: ConfigurationParameters
  ) {
    super(fields ?? {});

    const apiKey =
      fields?.openAIApiKey ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.OPENAI_API_KEY
        : undefined);

    const azureApiKey =
      fields?.azureOpenAIApiKey ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.AZURE_OPENAI_API_KEY
        : undefined);
    if (!azureApiKey && !apiKey) {
      throw new Error("(Azure) OpenAI API key not found");
    }

    const azureApiInstanceName =
      fields?.azureOpenAIApiInstanceName ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.AZURE_OPENAI_API_INSTANCE_NAME
        : undefined);

    const azureApiDeploymentName =
      fields?.azureOpenAIApiDeploymentName ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.AZURE_OPENAI_API_DEPLOYMENT_NAME
        : undefined);

    const azureApiVersion =
      fields?.azureOpenAIApiVersion ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.AZURE_OPENAI_API_VERSION
        : undefined);

    this.modelName = fields?.modelName ?? this.modelName;
    this.prefixMessages = fields?.prefixMessages ?? this.prefixMessages;
    this.modelKwargs = fields?.modelKwargs ?? {};
    this.timeout = fields?.timeout;

    this.temperature = fields?.temperature ?? this.temperature;
    this.topP = fields?.topP ?? this.topP;
    this.frequencyPenalty = fields?.frequencyPenalty ?? this.frequencyPenalty;
    this.presencePenalty = fields?.presencePenalty ?? this.presencePenalty;
    this.n = fields?.n ?? this.n;
    this.logitBias = fields?.logitBias;
    this.maxTokens = fields?.maxTokens;
    this.stop = fields?.stop;

    this.streaming = fields?.streaming ?? false;

    this.azureOpenAIApiVersion = azureApiVersion;
    this.azureOpenAIApiKey = azureApiKey;
    this.azureOpenAIApiInstanceName = azureApiInstanceName;
    this.azureOpenAIApiDeploymentName = azureApiDeploymentName;

    if (this.streaming && this.n > 1) {
      throw new Error("Cannot stream results when n > 1");
    }

    if (this.azureOpenAIApiKey) {
      if (!this.azureOpenAIApiInstanceName) {
        throw new Error("Azure OpenAI API instance name not found");
      }
      if (!this.azureOpenAIApiDeploymentName) {
        throw new Error("Azure OpenAI API deployment name not found");
      }
      if (!this.azureOpenAIApiVersion) {
        throw new Error("Azure OpenAI API version not found");
      }
    }

    this.clientConfig = {
      apiKey,
      isJsonMime: () => false,
      ...configuration,
    };
    this.client = new OpenAIApi(this.clientConfig);
  }

  /**
   * Get the parameters used to invoke the model
   */
  invocationParams(): Omit<CreateChatCompletionRequest, "messages"> {
    return {
      model: this.modelName,
      temperature: this.temperature,
      top_p: this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
      n: this.n,
      logit_bias: this.logitBias,
      max_tokens: this.maxTokens === -1 ? undefined : this.maxTokens,
      stop: this.stop,
      stream: this.streaming,
      ...this.modelKwargs,
    };
  }

  /** @ignore */
  _identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
      ...this.clientConfig,
    };
  }

  /**
   * Get the identifying parameters for the model
   */
  identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
      ...this.clientConfig,
    };
  }

  private formatMessages(prompt: string): ChatCompletionRequestMessage[] {
    const message: ChatCompletionRequestMessage = {
      role: "user",
      content: prompt,
    };
    return this.prefixMessages ? [...this.prefixMessages, message] : [message];
  }

  /** @ignore */
  async _call(
    prompt: string,
    stopOrOptions?: string[] | this["CallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const stop = Array.isArray(stopOrOptions)
      ? stopOrOptions
      : stopOrOptions?.stop;
    const options = Array.isArray(stopOrOptions)
      ? {}
      : stopOrOptions?.options ?? {};

    if (this.stop && stop) {
      throw new Error("Stop found in input and default params");
    }

    const params = this.invocationParams();
    params.stop = stop ?? params.stop;

    const data = params.stream
      ? await new Promise<CreateChatCompletionResponse>((resolve, reject) => {
          let response: CreateChatCompletionResponse;
          let rejected = false;
          this.completionWithRetry(
            {
              ...params,
              messages: this.formatMessages(prompt),
            },
            {
              ...options,
              adapter: fetchAdapter, // default adapter doesn't do streaming
              responseType: "stream",
              // @ts-ignore
              onmessage: (event) => {
                if (event.data?.trim?.() === "[DONE]") {
                  resolve(response);
                } else {
                  const message = JSON.parse(event.data) as {
                    id: string;
                    object: string;
                    created: number;
                    model: string;
                    choices: Array<{
                      index: number;
                      finish_reason: string | null;
                      delta: { content?: string; role?: string };
                    }>;
                  };

                  // on the first message set the response properties
                  if (!response) {
                    response = {
                      id: message.id,
                      object: message.object,
                      created: message.created,
                      model: message.model,
                      choices: [],
                    };
                  }

                  // on all messages, update choice
                  const part = message.choices[0];
                  if (part != null) {
                    let choice = response.choices.find(
                      (c) => c.index === part.index
                    );

                    if (!choice) {
                      choice = {
                        index: part.index,
                        finish_reason: part.finish_reason ?? undefined,
                      };
                      response.choices.push(choice);
                    }

                    if (!choice.message) {
                      choice.message = {
                        role: part.delta
                          ?.role as ChatCompletionResponseMessageRoleEnum,
                        content: part.delta?.content ?? "",
                      };
                    }

                    choice.message.content += part.delta?.content ?? "";
                    // eslint-disable-next-line no-void
                    void runManager?.handleLLMNewToken(
                      part.delta?.content ?? ""
                    );
                  }
                }
              },
            }
          ).catch((error) => {
            if (!rejected) {
              rejected = true;
              reject(error);
            }
          });
        })
      : await this.completionWithRetry(
          {
            ...params,
            messages: this.formatMessages(prompt),
          },
          options
        );

    return data.choices[0].message?.content ?? "";
  }

  /** @ignore */
  async completionWithRetry(
    request: CreateChatCompletionRequest,
    // @ts-ignore
    options?: StreamingAxiosConfiguration
  ) {
    if (!this.client) {
      const endpoint = this.azureOpenAIApiKey
        ? `https://${this.azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${this.azureOpenAIApiDeploymentName}`
        : this.clientConfig.basePath;
      const clientConfig = new Configuration({
        ...this.clientConfig,
        basePath: endpoint,
        baseOptions: {
          timeout: this.timeout,
          ...this.clientConfig.baseOptions,
        },
      });
      this.client = new OpenAIApi(clientConfig);
    }
    const axiosOptions = {
      ...this.clientConfig.baseOptions,
      ...options,
    };
    if (this.azureOpenAIApiKey) {
      axiosOptions.headers = {
        "api-key": this.azureOpenAIApiKey,
        ...axiosOptions.headers,
      };
      axiosOptions.params = {
        "api-version": this.azureOpenAIApiVersion,
        ...axiosOptions.params,
      };
    }
    return this.caller
      .call(
        this.client.createChatCompletion.bind(this.client),
        request,
        axiosOptions
      )
      .then((res) => res.data);
  }

  _llmType() {
    return "openai";
  }
}

class OpenAI extends BaseLLM implements OpenAIInput {
  declare CallOptions: OpenAICallOptions;

  temperature = 0.7;

  maxTokens = 256;

  topP = 1;

  frequencyPenalty = 0;

  presencePenalty = 0;

  n = 1;

  bestOf = 1;

  logitBias?: Record<string, number>;

  modelName = "text-davinci-003";

  modelKwargs?: Kwargs;

  batchSize = 20;

  timeout?: number;

  stop?: string[];

  streaming = false;

  // @ts-ignore
  private client: OpenAIApi;

  // @ts-ignore
  private clientConfig: ConfigurationParameters;

  constructor(
    fields?: Partial<OpenAIInput> &
      BaseLLMParams & {
        openAIApiKey?: string;
      },
    configuration?: ConfigurationParameters
  ) {
    if (
      fields?.modelName?.startsWith("gpt-3.5-turbo") ||
      fields?.modelName?.startsWith("gpt-4")
    ) {
      // eslint-disable-next-line no-constructor-return, @typescript-eslint/no-explicit-any
      return new OpenAIChat(fields, configuration) as any as OpenAI;
    }
    super(fields ?? {});

    const apiKey =
      fields?.openAIApiKey ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.OPENAI_API_KEY
        : undefined);
    if (!apiKey) {
      throw new Error("OpenAI API key not found");
    }

    this.modelName = fields?.modelName ?? this.modelName;
    this.modelKwargs = fields?.modelKwargs ?? {};
    this.batchSize = fields?.batchSize ?? this.batchSize;
    this.timeout = fields?.timeout;

    this.temperature = fields?.temperature ?? this.temperature;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;
    this.topP = fields?.topP ?? this.topP;
    this.frequencyPenalty = fields?.frequencyPenalty ?? this.frequencyPenalty;
    this.presencePenalty = fields?.presencePenalty ?? this.presencePenalty;
    this.n = fields?.n ?? this.n;
    this.bestOf = fields?.bestOf ?? this.bestOf;
    this.logitBias = fields?.logitBias;
    this.stop = fields?.stop;

    this.streaming = fields?.streaming ?? false;

    if (this.streaming && this.n > 1) {
      throw new Error("Cannot stream results when n > 1");
    }

    if (this.streaming && this.bestOf > 1) {
      throw new Error("Cannot stream results when bestOf > 1");
    }

    this.clientConfig = {
      apiKey,
      ...configuration,
    };
  }

  /**
   * Get the parameters used to invoke the model
   */
  invocationParams(): CreateCompletionRequest & Kwargs {
    return {
      model: this.modelName,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      top_p: this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
      n: this.n,
      best_of: this.bestOf,
      logit_bias: this.logitBias,
      stop: this.stop,
      stream: this.streaming,
      ...this.modelKwargs,
    };
  }

  _identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
      ...this.clientConfig,
    };
  }

  /**
   * Get the identifying parameters for the model
   */
  identifyingParams() {
    return this._identifyingParams();
  }

  /**
   * Call out to OpenAI's endpoint with k unique prompts
   *
   * @param prompts - The prompts to pass into the model.
   * @param [stop] - Optional list of stop words to use when generating.
   * @param [runManager] - Optional callback manager to use when generating.
   *
   * @returns The full LLM output.
   *
   * @example
   * ```ts
   * import { OpenAI } from "langchain/llms/openai";
   * const openai = new OpenAI();
   * const response = await openai.generate(["Tell me a joke."]);
   * ```
   */
  async _generate(
    prompts: string[],
    stopOrOptions?: string[] | this["CallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult> {
    const stop = Array.isArray(stopOrOptions)
      ? stopOrOptions
      : stopOrOptions?.stop;
    const options = Array.isArray(stopOrOptions)
      ? {}
      : stopOrOptions?.options ?? {};
    // @ts-ignore
    const subPrompts = chunkArray(prompts, this.batchSize);
    const choices: CreateCompletionResponseChoicesInner[] = [];
    // @ts-ignore
    const tokenUsage: TokenUsage = {};

    if (this.stop && stop) {
      throw new Error("Stop found in input and default params");
    }

    const params = this.invocationParams();
    params.stop = stop ?? params.stop;

    if (params.max_tokens === -1) {
      if (prompts.length !== 1) {
        throw new Error(
          "max_tokens set to -1 not supported for multiple inputs"
        );
      }
      // @ts-ignore
      params.max_tokens = await calculateMaxTokens({
        prompt: prompts[0],
        // Cast here to allow for other models that may not fit the union
        modelName: this.modelName as TiktokenModel,
      });
    }

    for (let i = 0; i < subPrompts.length; i += 1) {
      const data = params.stream
        ? await new Promise<CreateCompletionResponse>((resolve, reject) => {
            const choice: CreateCompletionResponseChoicesInner = {};
            let response: Omit<CreateCompletionResponse, "choices">;
            let rejected = false;
            this.completionWithRetry(
              {
                ...params,
                prompt: subPrompts[i],
              },
              {
                ...options,
                responseType: "stream",
                // @ts-ignore
                onmessage: (event) => {
                  if (event.data?.trim?.() === "[DONE]") {
                    resolve({
                      ...response,
                      choices: [choice],
                    });
                  } else {
                    const message = JSON.parse(event.data) as Omit<
                      CreateCompletionResponse,
                      "usage"
                    >;

                    // on the first message set the response properties
                    if (!response) {
                      response = {
                        id: message.id,
                        object: message.object,
                        created: message.created,
                        model: message.model,
                      };
                    }

                    // on all messages, update choice
                    const part = message.choices[0];
                    if (part != null) {
                      choice.text = (choice.text ?? "") + (part.text ?? "");
                      choice.finish_reason = part.finish_reason;
                      choice.logprobs = part.logprobs;
                      // eslint-disable-next-line no-void
                      void runManager?.handleLLMNewToken(part.text ?? "");
                    }
                  }
                },
              }
            ).catch((error) => {
              if (!rejected) {
                rejected = true;
                reject(error);
              }
            });
          })
        : await this.completionWithRetry(
            {
              ...params,
              prompt: subPrompts[i],
            },
            options
          );

      choices.push(...data.choices);

      const {
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        total_tokens: totalTokens,
      } = data.usage ?? {};

      if (completionTokens) {
        tokenUsage.completionTokens =
          (tokenUsage.completionTokens ?? 0) + completionTokens;
      }

      if (promptTokens) {
        tokenUsage.promptTokens = (tokenUsage.promptTokens ?? 0) + promptTokens;
      }

      if (totalTokens) {
        tokenUsage.totalTokens = (tokenUsage.totalTokens ?? 0) + totalTokens;
      }
    }

    // @ts-ignore
    const generations = chunkArray(choices, this.n).map((promptChoices) =>
      // @ts-ignore
      promptChoices.map((choice) => ({
        text: choice.text ?? "",
        generationInfo: {
          finishReason: choice.finish_reason,
          logprobs: choice.logprobs,
        },
      }))
    );
    return {
      generations,
      llmOutput: { tokenUsage },
    };
  }

  /** @ignore */
  async completionWithRetry(
    request: CreateCompletionRequest,
    // @ts-ignore
    options?: StreamingAxiosConfiguration
  ) {
    if (!this.client) {
      const clientConfig = new Configuration({
        ...this.clientConfig,
        baseOptions: {
          timeout: this.timeout,
          adapter: fetchAdapter,
          ...this.clientConfig.baseOptions,
        },
      });
      this.client = new OpenAIApi(clientConfig);
    }
    return this.caller
      .call(this.client.createCompletion.bind(this.client), request, options)
      .then((res) => res.data);
  }

  _llmType() {
    return "openai";
  }
}

/**
 * PromptLayer wrapper to OpenAI
 * @augments OpenAI
 */
export class PromptLayerOpenAI extends OpenAI {
  promptLayerApiKey?: string;

  plTags?: string[];

  constructor(
    fields?: ConstructorParameters<typeof OpenAI>[0] & {
      promptLayerApiKey?: string;
      plTags?: string[];
    }
  ) {
    super(fields);

    this.plTags = fields?.plTags ?? [];
    this.promptLayerApiKey =
      fields?.promptLayerApiKey ??
      (typeof process !== "undefined"
        ? // eslint-disable-next-line no-process-env
          process.env?.PROMPTLAYER_API_KEY
        : undefined);

    if (!this.promptLayerApiKey) {
      throw new Error("Missing PromptLayer API key");
    }
  }

  async completionWithRetry(
    request: CreateCompletionRequest,
    // @ts-ignore
    options?: StreamingAxiosConfiguration
  ) {
    if (request.stream) {
      return super.completionWithRetry(request, options);
    }

    const requestStartTime = Date.now();
    const response = await super.completionWithRetry(request);
    const requestEndTime = Date.now();

    // https://github.com/MagnivOrg/promptlayer-js-helper
    await this.caller.call(fetch, "https://api.promptlayer.com/track-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        function_name: "openai.Completion.create",
        args: [],
        kwargs: { engine: request.model, prompt: request.prompt },
        tags: this.plTags ?? [],
        request_response: response,
        request_start_time: Math.floor(requestStartTime / 1000),
        request_end_time: Math.floor(requestEndTime / 1000),
        api_key: this.promptLayerApiKey,
      }),
    });

    return response;
  }
}

class GithubCodeSearchTool extends Tool {
  name = "Github Code Search";
  description = `Code search looks through the files hosted on GitHub. You can also filter the results:
- install repo:charles/privaterepo	  Find all instances of install in code from the repository charles/privaterepo.
- shogun user:heroku	  Find references to shogun from all public heroku repositories.
- join extension:coffee 	Find all instances of join in code with coffee extension.
- system size:>1000	  Find all instances of system in code of file size greater than 1000kbs.
- examples path:/docs/	  Find all examples in the path /docs/.
- replace fork:true	  Search replace in the source code of forks.`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.search
      .code({
        q: input,
      })
      .then((res) => {
        return JSON.stringify(res.data);
      });
  }
}

class GithubIssueGetTool extends Tool {
  name = "Github Issue Get";
  description = `Get an issue from a GitHub repository. Please format your input as a JSON object with the following parameters:
- owner: (string) [REQUIRED] The account owner of the repository. The name is not case sensitive.
- repo: (string) [REQUIRED] The name of the repository. The name is not case sensitive.
- issue_number: (number) [REQUIRED] The number that identifies the issue.`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.issues
      .get(JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, "")))
      .then((res) => {
        return JSON.stringify(res.data, null, 2);
      })
      .catch((e) => {
        return JSON.stringify(e.response.data);
      });
  }
}

class GithubPullRequestCreateTool extends Tool {
  name = "Github Pull Request Create";
  description = `Create a pull request. Please format your input as a JSON object with the following parameters:
- owner: (string) [REQUIRED] The account owner of the repository. The name is not case sensitive.
- repo: (string) [REQUIRED] The name of the repository. The name is not case sensitive.
- title: (string) [REQUIRED] The title of the new pull request. To close a GitHub issue with this pull request, include the keyword "Closes" followed by the issue number in the pull request's title.
- head: (string) [REQUIRED] The name of the branch where your changes are implemented. Make sure you have changes committed on a separate branch before you create a pull request.
- base: (string) [REQUIRED] The name of the branch you want the changes pulled into. This should be an existing branch on the current repository. You cannot submit a pull request to one repository that requests a merge to a base of another repository.
- body: (string) [OPTIONAL] The contents of the pull request.`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.pulls
      .create(JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, "")))
      .then((res) => {
        return JSON.stringify(res.data, null, 2);
      })
      .catch((e) => {
        return JSON.stringify(e.response.data);
      });
  }
}

class GithubBranchGetTool extends Tool {
  name = "Github Branch Get";
  description = `Get a branch from a GitHub repository. Please format your input as a JSON object with the following parameters:
  - owner: (string) [REQUIRED] The account owner of the repository. The name is not case sensitive.
  - repo: (string) [REQUIRED] The name of the repository. The name is not case sensitive.
  - branch: (string) [REQUIRED] The name of the branch. Cannot contain wildcard characters`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.repos
      .getBranch(
        JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, ""))
      )
      .then((res) => {
        return JSON.stringify(res.data, null, 2);
      })
      .catch((e) => {
        return JSON.stringify(e.response.data);
      });
  }
}

class GitCloneRepository extends Tool {
  name = "Git Clone Repository";
  description = `Clone a repository from GitHub into a new local directory. Please format your input as a url in the format https://github.com/[owner]/[repo].`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const dir = input
      .split("/")
      .slice(-1)[0]
      .replace(/\.git$/, "");
    try {
      execSync(`git clone ${input}`);
      process.chdir(input);
      return `Cloned repository and changed current directory into ${dir}.`;
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        const err = e.stderr.toString();
        if (
          /^fatal: destination path '[^']+' already exists and is not an empty directory/.test(
            err
          )
        ) {
          return `Directory ${dir} already exists. This is probably your cloned repository, change your current directory to it.`;
        }
        return err;
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class ProcessChDir extends Tool {
  name = "Change Current Directory";
  description = `Switch your current working directory. Please format your input as the path to the directory relative your current working directory.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    process.chdir(input);
    return `Changed current directory into ${input}.`;
  }
}

class GitCheckoutNewBranch extends Tool {
  name = "Git Checkout New Branch";
  description = `Create a new branch in a local repository. Please format your input as a JSON object with the following parameters:
- branch: (string) [REQUIRED] The name of the branch. Cannot contain wildcard characters
- root: (string) [REQUIRED] The path to the root of the repository. Should always use /tmp/[repo]`;
  async _call(input: string) {
    const { branch, root } = JSON.parse(
      input.trim().replace(/^```/, "").replace(/```$/, "")
    );
    if (!fs.existsSync(root)) {
      return `Directory ${root} does not exist. Please clone the repository first.`;
    }
    if (process.cwd() !== root) {
      process.chdir(root);
    }
    try {
      const result = execSync(`git checkout -b ${branch}`);
      return result.toString();
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitCheckoutBranch extends Tool {
  name = "Git Checkout Branch";
  description = `Switch to a branch in a local repository. This command does not switch your current working directory. Please format your input as a string representing just the branch name.`;
  async _call(input: string) {
    try {
      const result = execSync(`git checkout ${input}`);
      return result.toString();
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitAddFile extends Tool {
  name = "Git Add File";
  description = `Add file contents to be staged for a commit. Please format your input as a path to the file, relative to the current directory.`;
  async _call(input: string) {
    try {
      execSync(`git add ${input}`);
      return `Successfully added ${input} to the staging area.`;
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitStatus extends Tool {
  name = "Git Status";
  description = `View all of the changes made to the repository since the last commit. The only acceptable input is "status".`;
  async _call(input: string) {
    try {
      return execSync(`git status`).toString();
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitCommit extends Tool {
  name = "Git Commit";
  description = `Record all files added to the staging area as changes to the repository. Please format your input as a message summarizing the word done for the commit`;
  async _call(input: string) {
    const out = execSync(`git commit -m "${input}"`).toString();
    if (out === "nothing to commit, working tree clean") return out;
    return `Successfully committed changes.`;
  }
}

class GitPushBranch extends Tool {
  name = "Git Push Branch";
  description = `Push your local branch to the remote repository. Please format your input as the name of the branch to push.`;
  async _call(input: string) {
    execSync(`git push origin "${input}"`, { stdio: "inherit" });
    return `Successfully pushed branch to remote repository.`;
  }
}

class GitListBranches extends Tool {
  name = "Git List Branches";
  description = `List the branches in your local repository. The only acceptable input is the word "list".`;
  async _call(_input: string) {
    const result = execSync(`git branch`).toString();
    const branches = result.split("\n").map((b) => b.trim());
    const currentIndex = branches.findIndex((b) => b.startsWith("*"));
    branches[currentIndex] = branches[currentIndex].replace(/^\*\s*/, "");
    const current = branches[currentIndex];
    return `You're currently on branch ${current}. The following branches are available:\n${branches.join(
      "\n"
    )}`;
  }
}

class FsReadFile extends Tool {
  name = "Fs Read File";
  description = `Read a file from the filesystem. Please format your input as a path relative to your current directory.`;
  async _call(input: string) {
    return fs.readFileSync(input.trim(), "utf8");
  }
}

class FsListFiles extends Tool {
  name = "Fs List Files";
  description = `List the files in a directory. Please format your input as a path relative to your current directory.`;
  async _call(input: string) {
    return `The files in the ${input} directory include: ${fs
      .readdirSync(input.trim(), "utf8")
      .join(", ")}`;
  }
}

class FsInsertText extends Tool {
  name = "Fs Insert Text";
  description = `Insert text to a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- text: (string) [REQUIRED] The text to insert into the file.
- position: (number) [OPTIONAL] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.`;
  async _call(input: string) {
    const {
      path,
      text,
      position = text.length,
    } = JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, ""));
    const content = fs.readFileSync(path.trim(), "utf8");
    const newContent = `${content.slice(0, position)}${text}${content.slice(
      position
    )}`;
    fs.writeFileSync(path, newContent);
    return `Successfully inserted text into ${path}.`;
  }
}

class FsRemoveText extends Tool {
  name = "Fs Remove Text";
  description = `Remove text from a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- position: (number) [REQUIRED] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.
- length: (number) [REQUIRED] The length of the text to remove from the file.`;
  async _call(input: string) {
    const { path, length, position } = JSON.parse(
      input.trim().replace(/^```/, "").replace(/```$/, "")
    );
    const content = fs.readFileSync(input.trim(), "utf8");
    const newContent = `${content.slice(0, position)}${content.slice(
      position + length
    )}`;
    fs.writeFileSync(path, newContent);
    return `Successfully inserted text into ${path}.`;
  }
}

abstract class BasePromptTemplate implements BasePromptTemplateInput {
  // @ts-ignore
  inputVariables: string[];

  outputParser?: BaseOutputParser;

  partialVariables?: InputValues;

  constructor(input: BasePromptTemplateInput) {
    const { inputVariables } = input;
    if (inputVariables.includes("stop")) {
      throw new Error(
        "Cannot have an input variable named 'stop', as it is used internally, please rename."
      );
    }
    Object.assign(this, input);
  }

  abstract partial(values: PartialValues): Promise<BasePromptTemplate>;

  async mergePartialAndUserVariables(
    userVariables: InputValues
  ): Promise<InputValues> {
    const partialVariables = this.partialVariables ?? {};
    const partialValues: InputValues = {};

    for (const [key, value] of Object.entries(partialVariables)) {
      if (typeof value === "string") {
        partialValues[key] = value;
      } else {
        partialValues[key] = await value();
      }
    }

    const allKwargs = { ...partialValues, ...userVariables };
    return allKwargs;
  }

  /**
   * Format the prompt given the input values.
   *
   * @param values - A dictionary of arguments to be passed to the prompt template.
   * @returns A formatted prompt string.
   *
   * @example
   * ```ts
   * prompt.format({ foo: "bar" });
   * ```
   */
  abstract format(values: InputValues): Promise<string>;

  /**
   * Format the prompt given the input values and return a formatted prompt value.
   * @param values
   * @returns A formatted PromptValue.
   */
  abstract formatPromptValue(values: InputValues): Promise<BasePromptValue>;

  /**
   * Return the string type key uniquely identifying this class of prompt template.
   */
  abstract _getPromptType(): string;

  /**
   * Return a json-like object representing this prompt template.
   */
  abstract serialize(): SerializedBasePromptTemplate;
}

abstract class BaseStringPromptTemplate extends BasePromptTemplate {
  async formatPromptValue(values: InputValues): Promise<BasePromptValue> {
    const formattedPrompt = await this.format(values);
    // @ts-ignore
    return new StringPromptValue(formattedPrompt);
  }
}

type PartialValues = Record<
  string,
  string | (() => Promise<string>) | (() => string)
>;

interface BasePromptTemplateInput {
  /**
   * A list of variable names the prompt template expects
   */
  inputVariables: string[];

  /**
   * How to parse the output of calling an LLM on this formatted prompt
   */
  outputParser?: BaseOutputParser;

  /** Partial variables */
  partialVariables?: PartialValues;
}

type TemplateFormat = "f-string" | "jinja-2";

interface PromptTemplateInput extends BasePromptTemplateInput {
  /**
   * The prompt template
   */
  template: string;

  /**
   * The format of the prompt template. Options are 'f-string', 'jinja-2'
   *
   * @defaultValue 'f-string'
   */
  templateFormat?: TemplateFormat;

  /**
   * Whether or not to try validating the template on initialization
   *
   * @defaultValue `true`
   */
  validateTemplate?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InputValues = Record<string, any>;

type ParsedFStringNode =
  | { type: "literal"; text: string }
  | { type: "variable"; name: string };

type Interpolator = (template: string, values: InputValues) => string;
const parseFString = (template: string): ParsedFStringNode[] => {
  // Core logic replicated from internals of pythons built in Formatter class.
  // https://github.com/python/cpython/blob/135ec7cefbaffd516b77362ad2b2ad1025af462e/Objects/stringlib/unicode_format.h#L700-L706
  const chars = template.split("");
  const nodes: ParsedFStringNode[] = [];

  const nextBracket = (bracket: "}" | "{" | "{}", start: number) => {
    for (let i = start; i < chars.length; i += 1) {
      if (bracket.includes(chars[i])) {
        return i;
      }
    }
    return -1;
  };

  let i = 0;
  while (i < chars.length) {
    if (chars[i] === "{" && i + 1 < chars.length && chars[i + 1] === "{") {
      nodes.push({ type: "literal", text: "{" });
      i += 2;
    } else if (
      chars[i] === "}" &&
      i + 1 < chars.length &&
      chars[i + 1] === "}"
    ) {
      nodes.push({ type: "literal", text: "}" });
      i += 2;
    } else if (chars[i] === "{") {
      const j = nextBracket("}", i);
      if (j < 0) {
        throw new Error("Unclosed '{' in template.");
      }

      nodes.push({
        type: "variable",
        name: chars.slice(i + 1, j).join(""),
      });
      i = j + 1;
    } else if (chars[i] === "}") {
      throw new Error("Single '}' in template.");
    } else {
      const next = nextBracket("{}", i);
      const text = (next < 0 ? chars.slice(i) : chars.slice(i, next)).join("");
      nodes.push({ type: "literal", text });
      i = next < 0 ? chars.length : next;
    }
  }
  return nodes;
};

const interpolateFString = (template: string, values: InputValues) =>
  parseFString(template).reduce((res, node) => {
    if (node.type === "variable") {
      if (node.name in values) {
        return res + values[node.name];
      }
      throw new Error(`Missing value for input ${node.name}`);
    }

    return res + node.text;
  }, "");

const DEFAULT_FORMATTER_MAPPING: Record<TemplateFormat, Interpolator> = {
  "f-string": interpolateFString,
  "jinja-2": (_: string, __: InputValues) => "",
};

const renderTemplate = (
  template: string,
  templateFormat: TemplateFormat,
  inputValues: InputValues
) => DEFAULT_FORMATTER_MAPPING[templateFormat](template, inputValues);

const checkValidTemplate = (
  template: string,
  templateFormat: TemplateFormat,
  inputVariables: string[]
) => {
  if (!(templateFormat in DEFAULT_FORMATTER_MAPPING)) {
    const validFormats = Object.keys(DEFAULT_FORMATTER_MAPPING);
    throw new Error(`Invalid template format. Got \`${templateFormat}\`;
                         should be one of ${validFormats}`);
  }
  try {
    const dummyInputs: InputValues = inputVariables.reduce((acc, v) => {
      acc[v] = "foo";
      return acc;
    }, {} as Record<string, string>);
    renderTemplate(template, templateFormat, dummyInputs);
  } catch {
    throw new Error("Invalid prompt schema.");
  }
};

class PromptTemplate
  extends BaseStringPromptTemplate
  implements PromptTemplateInput
{
  // @ts-ignore
  template: string;

  templateFormat: TemplateFormat = "f-string";

  validateTemplate = true;

  constructor(input: PromptTemplateInput) {
    super(input);
    Object.assign(this, input);

    if (this.validateTemplate) {
      let totalInputVariables = this.inputVariables;
      if (this.partialVariables) {
        totalInputVariables = totalInputVariables.concat(
          Object.keys(this.partialVariables)
        );
      }
      checkValidTemplate(
        // @ts-ignore
        this.template,
        this.templateFormat,
        totalInputVariables
      );
    }
  }

  _getPromptType(): "prompt" {
    return "prompt";
  }

  async format(values: InputValues): Promise<string> {
    const allValues = await this.mergePartialAndUserVariables(values);
    return renderTemplate(this.template, this.templateFormat, allValues);
  }

  /**
   * Take examples in list format with prefix and suffix to create a prompt.
   *
   * Intendend to be used a a way to dynamically create a prompt from examples.
   *
   * @param examples - List of examples to use in the prompt.
   * @param suffix - String to go after the list of examples. Should generally set up the user's input.
   * @param inputVariables - A list of variable names the final prompt template will expect
   * @param exampleSeparator - The separator to use in between examples
   * @param prefix - String that should go before any examples. Generally includes examples.
   *
   * @returns The final prompt template generated.
   */
  static fromExamples(
    examples: string[],
    suffix: string,
    inputVariables: string[],
    exampleSeparator = "\n\n",
    prefix = ""
  ) {
    const template = [prefix, ...examples, suffix].join(exampleSeparator);
    return new PromptTemplate({
      inputVariables,
      template,
    });
  }

  async partial(values: PartialValues): Promise<PromptTemplate> {
    const promptDict: PromptTemplateInput = { ...this };
    promptDict.inputVariables = this.inputVariables.filter(
      (iv) => !(iv in values)
    );
    promptDict.partialVariables = {
      ...(this.partialVariables ?? {}),
      ...values,
    };
    return new PromptTemplate(promptDict);
  }

  serialize(): SerializedPromptTemplate {
    if (this.outputParser !== undefined) {
      throw new Error(
        "Cannot serialize a prompt template with an output parser"
      );
    }
    return {
      _type: this._getPromptType(),
      input_variables: this.inputVariables,
      template: this.template,
      template_format: this.templateFormat,
    };
  }
}

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
  type: z.literal("User").or(z.literal("Organization")),
});

const template =
  "You are an engineer working on the GitHub repository: {repo_full}. You have just been assigned to issue {issue}. Create a pull request that will close this issue.";
const prompt = new PromptTemplate({
  template: template,
  inputVariables: ["repo_full", "issue", "title", "body"],
});
const model = new OpenAI({ temperature: 0, modelName: "gpt-3.5-turbo" });
// const chain = new LLMChain({ llm: model, prompt: prompt });

const develop: Handler = async (evt: unknown) => {
  const { issue, repo, owner, type } = zArgs.parse(evt);
  // TODO - need to refresh token if it's expired
  // const auth = await getInstallationToken(type, owner);
  process.chdir("/tmp");
  const auth = process.env.GITHUB_TOKEN;
  const tools: Tool[] = [
    new GithubCodeSearchTool({ auth }),
    new GithubIssueGetTool({ auth }),
    new GithubPullRequestCreateTool({ auth }),
    new GithubBranchGetTool({ auth }),
    new GitCloneRepository(),
    new GitCheckoutNewBranch(),
    new GitCheckoutBranch(),
    new GitListBranches(),
    new GitStatus(),
    new FsReadFile(),
    new FsInsertText(),
    new FsRemoveText(),
    new GitAddFile(),
    new GitCommit(),
    new GitPushBranch(),
    new ProcessChDir(),
    new FsListFiles(),
  ];
  const executor = await initializeAgentExecutor(tools, model, true);
  console.log("loaded executor");
  const input = await prompt.format({
    repo_full: `${owner}/${repo}`,
    issue: issue,
  });
  console.log("Ready to call");
  return await executor.call({ input });
};

export default develop;
