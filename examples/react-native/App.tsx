import AsyncStorage from '@react-native-async-storage/async-storage';
import { FrontmailProvider, TurnstileWebView, asyncStorageProvider, useSendEmail } from '@frontmail/react-native';
import type { FrontmailOptions, TurnstileWebViewHandle } from '@frontmail/react-native';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

// EXPO_PUBLIC_* variables are inlined at build time (.env.local or the shell).
const env = {
  publicKey: process.env.EXPO_PUBLIC_FRONTMAIL_PUBLIC_KEY || 'pk_test',
  apiUrl: process.env.EXPO_PUBLIC_FRONTMAIL_API_URL || undefined,
  serviceId: process.env.EXPO_PUBLIC_FRONTMAIL_SERVICE_ID || null,
  templateId: process.env.EXPO_PUBLIC_FRONTMAIL_TEMPLATE_ID || 'tpl_contact',
  turnstileSiteKey: process.env.EXPO_PUBLIC_FRONTMAIL_TURNSTILE_SITE_KEY || '',
  turnstileBaseUrl: process.env.EXPO_PUBLIC_FRONTMAIL_TURNSTILE_BASE_URL || 'https://example.com',
};

// Module constant = stable options object for the provider.
const options: FrontmailOptions = {
  publicKey: env.publicKey,
  apiUrl: env.apiUrl,
  // At most one message per 30 s per device, persisted across app restarts.
  limitRate: { id: 'contact', throttle: 30_000 },
  storageProvider: asyncStorageProvider(AsyncStorage),
};

interface ContactParams {
  name: string;
  email: string;
  message: string;
}

export default function App() {
  return (
    <FrontmailProvider options={options}>
      <StatusBar style="auto" />
      <ContactScreen />
    </FrontmailProvider>
  );
}

function ContactScreen() {
  const { send, status, error, result, reset } = useSendEmail(env.serviceId, env.templateId);
  const [form, setForm] = useState<ContactParams>({ name: '', email: '', message: '' });
  const [token, setToken] = useState<string>();
  const turnstile = useRef<TurnstileWebViewHandle>(null);
  const needsToken = !!env.turnstileSiteKey;
  const canSend = status !== 'sending' && !!form.email && !!form.message && (!needsToken || !!token);

  const onSubmit = async () => {
    const sent = await send({ ...form }, { turnstileToken: token });
    // Turnstile tokens are single use – get a fresh one for the next attempt.
    setToken(undefined);
    turnstile.current?.reset();
    if (sent) setForm({ name: '', email: '', message: '' });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Contact us</Text>
        <Field label="Name" value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} />
        <Field
          label="Email"
          value={form.email}
          onChangeText={(email) => setForm((f) => ({ ...f, email }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field label="Message" value={form.message} onChangeText={(message) => setForm((f) => ({ ...f, message }))} multiline />

        {needsToken ? (
          <TurnstileWebView
            ref={turnstile}
            siteKey={env.turnstileSiteKey}
            baseUrl={env.turnstileBaseUrl}
            onToken={setToken}
            onExpire={() => setToken(undefined)}
            onError={(e) => console.warn(e.message)}
            style={styles.turnstile}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          disabled={!canSend}
          style={({ pressed }) => [styles.button, (!canSend || pressed) && styles.buttonDim]}
        >
          {status === 'sending' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send</Text>}
        </Pressable>

        <Text testID="status" style={styles.status}>
          {status === 'sent' && `Thanks! Message ${result?.messageId} is on its way.`}
          {status === 'held' && 'Accepted – it will be delivered shortly.'}
          {status === 'error' && `${error?.message} (${error?.code})`}
        </Text>
        {status === 'sent' || status === 'held' || status === 'error' ? (
          <Pressable onPress={reset}>
            <Text style={styles.link}>Reset</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...input }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} style={[styles.input, input.multiline && styles.multiline]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, paddingTop: 72, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  turnstile: { alignSelf: 'center' },
  button: { backgroundColor: '#4f46e5', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  status: { fontSize: 14 },
  link: { color: '#4f46e5' },
});
