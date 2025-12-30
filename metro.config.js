// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Explicitly set project root to handle paths with spaces
config.projectRoot = __dirname;
config.watchFolders = [__dirname];

// Ensure node_modules is properly watched
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
  ],
};

module.exports = config;

