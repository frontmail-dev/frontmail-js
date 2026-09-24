import { describe, expectTypeOf, it } from 'vitest';
import type { TemplateParams, UseSendEmail } from '../src';

interface ContactParams {
  name: string;
  age?: number;
}

// What `frontmail types` generates (against '@frontmail/react' in user code).
declare module '../src' {
  interface FrontmailTemplates {
    tpl_contact: ContactParams;
  }
}

describe('typed params', () => {
  it('uses the augmented FrontmailTemplates map', () => {
    expectTypeOf<TemplateParams<'tpl_contact'>>().toEqualTypeOf<ContactParams>();
    expectTypeOf<TemplateParams<'tpl_other'>>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<Parameters<UseSendEmail<'tpl_contact'>['send']>[0]>().toEqualTypeOf<ContactParams>();
  });
});
