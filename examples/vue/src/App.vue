<script setup lang="ts">
import { FrontmailForm, useSendEmail } from '@frontmail/vue';
import type { SendResult } from '@frontmail/vue';
import { ref } from 'vue';
import { config } from './config';

const messageId = ref('');
function onSuccess(result: SendResult) {
  messageId.value = result.messageId;
}

// Composable API: send params without a <form>.
const quick = useSendEmail(config.serviceId, config.templateId);
const quickEmail = ref('');
function sendQuick() {
  void quick.send({ name: 'Newsletter', email: quickEmail.value, message: 'Please subscribe me.' });
}
</script>

<template>
  <main class="page">
    <h1>Contact us (Vue)</h1>
    <FrontmailForm
      :service-id="config.serviceId"
      :template-id="config.templateId"
      :turnstile-site-key="config.turnstileSiteKey"
      data-testid="contact-form"
      class="form"
      @success="onSuccess"
    >
      <template #default="{ status, error }">
        <label>Name <input name="name" data-testid="name" required /></label>
        <label>Email <input name="email" type="email" data-testid="email" required /></label>
        <label>Message <textarea name="message" data-testid="message" required></textarea></label>
        <button type="submit" data-testid="submit" :disabled="status === 'sending'">Send</button>
        <p>Status: <strong data-testid="status">{{ status }}</strong></p>
        <p data-testid="message-id">{{ messageId }}</p>
        <p data-testid="error" role="alert" class="error">{{ error ? `${error.code}: ${error.message}` : '' }}</p>
      </template>
    </FrontmailForm>

    <section>
      <h2>Quick message (useSendEmail)</h2>
      <input v-model="quickEmail" name="quick-email" data-testid="quick-email" />
      <button type="button" data-testid="quick-submit" @click="sendQuick">Send</button>
      <p>Status: <strong data-testid="quick-status">{{ quick.status.value }}</strong> {{ quick.error.value?.code }}</p>
    </section>
  </main>
</template>

<style>
.page { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
.form { display: grid; gap: 0.75rem; }
.error { color: #b00020; }
</style>
