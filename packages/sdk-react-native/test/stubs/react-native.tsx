// Minimal `react-native` stub for tests (vitest alias): DOM-backed primitives only.
import { createElement } from 'react';
import type { ReactNode } from 'react';

export const Platform = { OS: 'ios' as const, select: <T,>(o: { ios?: T; default?: T }) => o.ios ?? o.default };
export function View({ children, testID }: { children?: ReactNode; testID?: string }) {
  return createElement('div', { 'data-testid': testID }, children);
}
export function Text({ children }: { children?: ReactNode }) {
  return createElement('span', null, children);
}
