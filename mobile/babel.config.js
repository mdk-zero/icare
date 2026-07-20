module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo already injects the worklets/reanimated plugin on
    // SDK 54+; listing react-native-reanimated/plugin here as well
    // double-transforms worklets and crashes Reanimated 4 at runtime.
    presets: ['babel-preset-expo'],
  };
};
