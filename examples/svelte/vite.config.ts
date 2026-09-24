import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [svelte()], server: { port: 5176 }, preview: { port: 4176 } });
