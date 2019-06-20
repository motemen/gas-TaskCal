const path = require("path");
const HTMLPlugin = require("html-webpack-plugin");
const HTMLInlineSourcePlugin = require("html-webpack-inline-source-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const CDNPlugin = require("webpack-cdn-plugin");

module.exports = {
  context: path.join(__dirname, "frontend"),
  entry: "./main.ts",
  mode: "development",
  devtool: "inline-source-map",
  output: {
    filename: "bundle.inline-js"
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader"
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  plugins: [
    new HTMLPlugin({
      template: "index.html",
      inlineSource: ".inline-js$"
    }),
    new HTMLInlineSourcePlugin(),
    new CopyPlugin([
      {
        from: "*",
        to: ".",
        context: path.join(__dirname, "src")
      }
    ]),
    new CDNPlugin({
      modules: [
        {
          name: "vue",
          var: "Vue",
          path: "dist/vue.min.js"
        }
      ]
    })
  ]
};
