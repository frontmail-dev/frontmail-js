export { CLIENT_NAME, Frontmail, HistoryRequest, MAX_BATCH } from './client';
export type { BatchItemResult, FrontmailNodeOptions, HistoryItem, HistoryPage, HistoryQuery, SendInput } from './client';
export { SDK_MODULES, generateTypes, pascalCase } from './codegen';
export type { GenerateOptions, ParamDef, ParamType, TemplateSchema } from './codegen';
export {
  AuthError,
  BlockedError,
  FrontmailError,
  InsufficientCreditsError,
  NetworkError,
  RateLimitError,
  ValidationError,
  isFrontmailError,
} from '@frontmail/sdk-core';
export type {
  AttachmentInput,
  ErrorCode,
  FrontmailTemplates,
  MessageStatus,
  MessageStatusResponse,
  SendResult,
  TemplateId,
  TemplateParams,
} from '@frontmail/sdk-core';
export default Frontmail;
import { Frontmail } from './client';
