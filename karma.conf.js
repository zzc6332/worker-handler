// Karma configuration
// Generated on Sun May 19 2024 15:37:14 GMT+0800 (GMT+08:00)

const path = require("path");
const webpackConfig = require("./webpack.common.config");

module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: "",

    // frameworks to use
    // available frameworks: https://www.npmjs.com/search?q=keywords:karma-adapter
    frameworks: ["mocha", "webpack"],

    // list of files / patterns to load in the browser
    files: ["test/**/*.test.ts"],

    // list of files / patterns to exclude
    exclude: [],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://www.npmjs.com/search?q=keywords:karma-preprocessor
    preprocessors: {
      "test/**/*.test.ts": ["webpack"],
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://www.npmjs.com/search?q=keywords:karma-reporter
    reporters: ["progress"],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    // logLevel: config.LOG_DEBUG,
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://www.npmjs.com/search?q=keywords:karma-launcher
    browsers: ["Chrome", "Firefox"],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser instances should be started simultaneously
    concurrency: Infinity,

    mime: {
      "text/x-typescript": ["ts"],
    },

    webpack: {
      mode: "development",
      // 输出一下打包产物，将其托管到 staticServer 中，以解决服务器请求 /base 路径上的文件时会 404 的情况
      output: {
        filename: "[name].js",
        path: path.join(__dirname, "./test/dist"),
        publicPath: "/base/",
        clean: true,
      },
      devtool: "inline-source-map",
      ...webpackConfig,
    },

    plugins: [
      "karma-webpack",
      "karma-mocha",
      "karma-chai",
      "karma-chrome-launcher",
      "karma-firefox-launcher",
      "karma-static-server",
    ],

    // 服务器请求 /base 路径上的内容会返回 404，所以开启一个 staticServer，将其代理到静态服务器目录中的打包输出目录中
    middleware: ["staticServer"],
    proxies: {
      "/base/": "/test/dist/",
    },

    client: {
      mocha: {
        timeout: 0,
      },
    },
  });
};
