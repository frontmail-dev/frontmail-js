// Entry for the UMD/CDN build: `window.frontmail` is this object.
import {
  AuthError,
  BlockedError,
  FrontmailError,
  InsufficientCreditsError,
  NetworkError,
  RateLimitError,
  ValidationError,
  getStatus,
  init,
  send,
  sendForm,
} from './index';

export default {
  init,
  send,
  sendForm,
  getStatus,
  FrontmailError,
  NetworkError,
  RateLimitError,
  ValidationError,
  AuthError,
  InsufficientCreditsError,
  BlockedError,
};
