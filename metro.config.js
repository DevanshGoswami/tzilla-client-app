const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');


const config = getDefaultConfig(__dirname);

// Disable watchman entirely
config.watchFolders = [];
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Block problematic directories
config.resolver.blockList = [
    /node_modules\/.*\/test\/.*/,
    /node_modules\/native-base\/lib\/typescript\/.*\/test\/.*/,
    /.*\/test\/.*/,
];

config.resolver.alias = {
    '@': path.resolve(__dirname, './'),
};

module.exports = {
    ...config,
    watchman: false,
};