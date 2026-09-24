export { Frontmail, FrontmailKey, useFrontmail, CLIENT_NAME } from './plugin';
export type { FrontmailOptions } from './plugin';
export { useSendEmail } from './useSendEmail';
export type { SendStatus, UseSendEmail } from './useSendEmail';
export { FrontmailForm } from './FrontmailForm';
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

import { Frontmail } from './plugin';
export default Frontmail;

import type { FrontmailForm as FrontmailFormComponent } from './FrontmailForm';
declare module 'vue' {
  interface GlobalComponents {
    FrontmailForm: typeof FrontmailFormComponent;
  }
}
