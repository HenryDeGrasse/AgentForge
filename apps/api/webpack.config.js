const { composePlugins, withNx } = require('@nx/webpack');
const webpack = require('webpack');

module.exports = composePlugins(withNx(), (config, { options, context }) => {
  // Suppress optional NestJS peer dependency warnings that don't affect runtime
  config.plugins = config.plugins || [];
  config.plugins.push(
    new webpack.IgnorePlugin({
      resourceRegExp:
        /^(@nestjs\/(websockets|microservices)(\/.*)?|@fastify\/static)$/
    })
  );
  return config;
});
