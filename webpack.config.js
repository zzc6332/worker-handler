// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const isProduction = process.env.NODE_ENV == "production";
const useJs = process.env.NODE_ENV === "useJs";

const webpackConfig = require("./webpack.common.config");
const config = { ...webpackConfig };

module.exports = () => {
  if (isProduction) {
    config.mode = "production";
    config.entry = {
      main: "./src/main.ts",
      worker: "./src/worker.ts",
    };
    config.output = {
      path: path.resolve(__dirname, "dist/release"),
      clean: true,
      library: {
        name: "WorkerHandlerLib",
        type: "umd",
      },
    };
    config.optimization = {
      usedExports: false,
    };
    config.module.rules[0].options = {
      configFile: path.resolve(__dirname, "tsconfig.prod.json"),
      ignoreDiagnostics: [2589],
    };
    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "src/package.release.json",
            to: "package.json",
          },
          { from: "README.md", to: "README.md" },
          { from: "LICENSE", to: "LICENSE" },
        ],
      })
    );
  } else {
    config.mode = "development";
    config.entry = useJs ? "./demo/demo.main.js" : "./demo/demo.main.ts";
    config.output = {
      path: path.resolve(__dirname, "dist/demo"),
    };
    config.devServer = {
      open: true,
      host: "localhost",
    };
    config.devtool = "source-map";
    config.plugins = [
      new HtmlWebpackPlugin({
        template: "index.html",
      }),
    ];
    config.module.rules[0].options = { transpileOnly: true };
  }
  return config;
};
