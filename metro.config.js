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

// Production optimizations - make it lenient to ignore errors
if (process.env.NODE_ENV === 'production') {
  // Disable minification to avoid errors
  config.transformer = {
    ...config.transformer,
    minify: false, // Disable minification to avoid errors
    unstable_allowRequireContext: true,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false, // Disable inline requires to avoid errors
      },
    }),
  };
  
  // Optimize resolver for production - be more lenient with errors
  config.resolver = {
    ...config.resolver,
    sourceExts: config.resolver.sourceExts || [],
    unstable_enablePackageExports: true,
  };
  
  // Don't override serializer - let Expo handle it properly for export:embed
  // The serializer needs to return proper format for expo export
}

// Make bundler more lenient - continue on errors
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

// Suppress warnings during build
config.reporter = {
  update: () => {},
};

module.exports = config;

