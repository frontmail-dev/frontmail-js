export {
  CLIENT_NAME,
  createFrontmail,
  getDefaultFrontmail,
  getFrontmail,
  setFrontmail,
} from './frontmail.js';
export type { FrontmailInstance, FrontmailOptions, SendState, SendStatus } from './frontmail.js';
export { frontmailForm } from './action.js';
export type { FrontmailFormParams } from './action.js';
export { default as FrontmailForm } from './FrontmailForm.svelte';
export {
  AuthError,
  BlockedError,
  FrontmailError,
  InsufficientCreditsError,
  NetworkError,
  RateLimitError,
  ValidationError,
  createClient,
  formToParams,
  getTurnstileToken,
  isFrontmailError,
} from '@frontmail/sdk-core';
export type {
  Client,
  ClientOptions,
  ErrorCode,
  FrontmailTemplates,
  MessageStatusResponse,
  SendOptions,
  SendResult,
  TemplateId,
  TemplateParams,
  TurnstileApi,
  TurnstileRenderOptions,
} from '@frontmail/sdk-core';
