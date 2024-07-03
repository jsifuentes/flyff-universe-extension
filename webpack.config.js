const path = require('path');
const { sourceMapsEnabled } = require('process');
const WebpackObfuscator = require('webpack-obfuscator');

const shouldObfuscate = process.env.NODE_ENV === 'production';
const plugins = [];

if (shouldObfuscate) {
  plugins.push(
	new WebpackObfuscator ({
        compact: false,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        numbersToExpressions: true,
        simplify: true,
        stringArrayShuffle: true,
        splitStrings: true,
        stringArrayThreshold: 1,
		splitStringsChunkLength: 5,
		deadCodeInjection: true,
		transformObjectKeys: true,
		renameProperties: true,
		renameGlobals: true,
    }, []),
  );
}

module.exports = {
  entry: {
	'content-script': './src/content-script/index.js',
},
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  watch: process.env.NODE_ENV !== 'production',
  plugins,
  devtool: "source-map",
};