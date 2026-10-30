const {getDefaultConfig}=require('expo/metro-config');
const {resolve}=require('node:path');
const config=getDefaultConfig(__dirname);
// Share only client-safe contracts/form helpers, never the server or its dependencies.
config.watchFolders=[...(config.watchFolders??[]),resolve(__dirname,'../src/lib')];
module.exports=config;
