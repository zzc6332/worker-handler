// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const config = {
  mode: "production",
  entry: {
    main: "./src/main.ts",
    worker: "./src/worker.ts",
  },
  cache: false,
  output: {
    path: path.resolve(__dirname, "dist/release"),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/i,
        loader: "ts-loader",
        exclude: ["/node_modules/"],
        // options: { transpileOnly: true },
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
        type: "asset",
      },
      // Add your rules for custom modules here
      // Learn more about loaders from https://webpack.js.org/loaders/
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "src/package.release.json",
          to: "package.json",
        },
      ],
    }),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".json", "..."],
  },
  optimization: {
    usedExports: false,
  },
};

module.exports = () => config;
