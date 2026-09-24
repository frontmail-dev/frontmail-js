import { Frontmail } from '@frontmail/vue';
import { createApp } from 'vue';
import App from './App.vue';
import { config } from './config';

createApp(App).use(Frontmail, { publicKey: config.publicKey, apiUrl: config.apiUrl }).mount('#app');
