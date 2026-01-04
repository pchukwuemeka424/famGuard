module.exports = function(api) {
  api.cache(true);
  
  // Check if we're in production mode
  // In EAS Build, NODE_ENV is set to 'production' for production builds
  // Using process.env directly to avoid caching conflicts
  const isProduction = process.env.NODE_ENV === 'production';
  
  const plugins = [
    'react-native-reanimated/plugin',
  ];
  
  // Skip console removal in production to avoid missing plugin error
  // The plugin is in devDependencies and may not be available in production builds
  // if (isProduction) {
  //   plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  // }
  
  return {
    presets: ['expo'],
    plugins,
  };
};

