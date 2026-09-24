import { renderTurnstile } from '@frontmail/sdk-core';
import type { FrontmailError, SendOptions, SendResult, TurnstileApi, TurnstileRenderOptions } from '@frontmail/sdk-core';
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import { useSendEmail } from './useSendEmail';

/**
 * `<FrontmailForm service-id template-id turnstile-site-key>` – submits its fields (and files)
 * via `sendForm`. Default slot props: `{ status, error, result }`.
 * Emits `success(result)`, `error(error)` and `status(status)`.
 */
export const FrontmailForm = defineComponent({
  name: 'FrontmailForm',
  props: {
    serviceId: { type: String as PropType<string | null>, default: null },
    templateId: { type: String, required: true },
    turnstileSiteKey: { type: String, default: undefined },
    turnstileOptions: { type: Object as PropType<Omit<TurnstileRenderOptions, 'sitekey'>>, default: undefined },
    sendOptions: { type: Object as PropType<SendOptions>, default: undefined },
    resetOnSuccess: { type: Boolean, default: true },
  },
  emits: {
    success: (_result: SendResult) => true,
    error: (_error: FrontmailError) => true,
    status: (_status: string) => true,
  },
  setup(props, { slots, emit }) {
    const { status, error, result, sendForm } = useSendEmail(
      () => props.serviceId,
      () => props.templateId,
    );
    const widgetEl = ref<HTMLElement | null>(null);
    let turnstile: { api: TurnstileApi; widgetId: string | undefined } | null = null;
    let unmounted = false;

    watch(status, (s) => emit('status', s));

    onMounted(async () => {
      if (!props.turnstileSiteKey || !widgetEl.value) return;
      try {
        const r = await renderTurnstile(widgetEl.value, { ...props.turnstileOptions, sitekey: props.turnstileSiteKey });
        if (unmounted) r.api.remove(r.widgetId);
        else turnstile = r;
      } catch (e) {
        emit('error', e as FrontmailError);
      }
    });
    onBeforeUnmount(() => {
      unmounted = true;
      turnstile?.api.remove(turnstile.widgetId);
    });

    async function onSubmit(e: Event) {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const r = await sendForm(form, props.sendOptions);
      turnstile?.api.reset(turnstile.widgetId);
      if (r) {
        if (props.resetOnSuccess) form.reset();
        emit('success', r);
      } else if (error.value) {
        emit('error', error.value);
      }
    }

    return () =>
      h('form', { onSubmit, 'data-status': status.value, 'aria-busy': status.value === 'sending' }, [
        slots.default?.({ status: status.value, error: error.value, result: result.value }),
        props.turnstileSiteKey ? h('div', { ref: widgetEl, class: 'frontmail-turnstile' }) : null,
      ]);
  },
});
