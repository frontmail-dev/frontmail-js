// Metro config for the pnpm workspace: the SDK is linked from ../../packages/sdk-react-native, which
// has its own devDependencies. React, React Native and the native modules must be single instances,
// so they are always resolved from this app.
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const SINGLETONS = ['react', 'react-native', 'react-native-webview', '@react-native-async-storage/async-storage'];
const fromApp = path.join(__dirname, 'package.json');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = SINGLETONS.some((m) => moduleName === m || moduleName.startsWith(m + '/'));
  return context.resolveRequest(singleton ? { ...context, originModulePath: fromApp } : context, moduleName, platform);
};

module.exports = config;
