// Expo Go publishing override; native builds keep app.json's appVersion policy.
module.exports = ({ config }) => ({
  ...config,
  ...(process.env.CLOSER_EXPO_GO === '1' ? { runtimeVersion: 'exposdk:57.0.0' } : {}),
});
