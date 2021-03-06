import path from 'path'
import fs from 'fs'
import webpack from 'webpack'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import HTMLWebpackPlugin from 'html-webpack-plugin'
import TerserWebpackPlugin from 'terser-webpack-plugin'
import OptimizeCSSAssetsPlugin from 'optimize-css-assets-webpack-plugin'
// @ts-ignore
import safePostCSSParser from 'postcss-safe-parser'
import InlineChunkHTMLPlugin from 'react-dev-utils/InlineChunkHtmlPlugin'
import InterpolateHTMLPlugin from 'react-dev-utils/InterpolateHtmlPlugin'
import nodeExternals from 'webpack-node-externals'
import webpackMerge from 'webpack-merge'
import ora from 'ora'
import HTMLAttributePlugin from './HTMLAttributePlugin'
import { getConfig, Config } from './config'

export function createWebpackConfig(isServer: boolean): webpack.Configuration {
  const config = getConfig()

  const resolveAppPath = (p: string) => path.resolve(config.rootDir, p)

  const plugins = getPlugins(isServer, config)
  const optimization = getOptimization(isServer, config)

  const webpackConfig: webpack.Configuration = {
    bail: true,
    mode: config.isDev ? 'development' : 'production',
    // only client and in development mode
    devtool: (config.isDev && !isServer) ? 'cheap-module-eval-source-map' : false,
    stats: 'errors-warnings',
    target: isServer ? 'node' : 'web',
    entry: {
      app: isServer ? config.serverEntry : resolveAppPath('src/index.tsx')
    },
    output: {
      path: path.join(config.distDir, isServer ? 'server' : 'client'),
      publicPath: config.publicPath,
      filename: (!isServer && !config.isDev) ? 'js/[name].[chunkhash:5].js' : '[name].js',
      chunkFilename: (!isServer && !config.isDev) ? 'js/[name].[chunkhash:5].chunk.js' : '[name].chunk.js',
      libraryTarget: isServer ? 'commonjs' : 'umd',
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        'server-renderer': isServer
          ? 'server-renderer/lib/server.js'
          : 'server-renderer/lib/client.js',
        src: resolveAppPath('src'),
      },
    },
    module: {
      rules: [
        {
          test: /\.(t|j)sx?$/,
          include: resolveAppPath('src'),
          loader: require.resolve('babel-loader'),
          options: getBabelLoaderOptions(isServer),
        },
        {
          test: /\.s?css$/,
          oneOf: [
            {
              test: (modulePath: string) => {
                const basename = path.basename(modulePath)
                // 大写开头的就当做 css module
                return /^[A-Z]/.test(basename)
              },
              use: getStyleLoaders(isServer, true, config),
            },
            {
              use: getStyleLoaders(isServer, false, config),
            }
          ],
        },
      ]
    },
    externals: isServer ? [nodeExternals()] : undefined,
    plugins,
    optimization,
    node: {
      __dirname: isServer,
      __filename: isServer,
    }
  }

  return mergeConfig(webpackConfig, isServer, config)
}

function mergeConfig(
  webpackConfig: webpack.Configuration, 
  isServer: boolean, 
  config: Config
): webpack.Configuration {
  if (config.configureWebpack) {
    if (typeof config.configureWebpack === 'function') {
      return config.configureWebpack(webpackConfig, isServer, config)
    }

    return webpackMerge.smart(webpackConfig, config.configureWebpack)
  }

  return webpackConfig
}

function getBabelLoaderOptions(isServer: boolean) {
  const presets = [
    require.resolve('@babel/preset-react'),
    [
      require.resolve('@babel/preset-typescript'),
      {
        isTSX: true,
        allExtensions: true,
        allowNamespaces: false,
      }
    ],
  ]
  if (!isServer) {
    presets.push(require.resolve('@babel/preset-env'))
  }
  return {
    plugins: isServer
      ? [require.resolve('@babel/plugin-proposal-class-properties')]
      : [
        require.resolve('@babel/plugin-proposal-class-properties'),
        [
          require.resolve('@babel/plugin-transform-runtime'),
          {
            helpers: true,
            regenerator: true,
            useESModules: false,
          },
        ],
      ],
    presets,
  }
}

function getProgressPlugin() {
  const spinner = ora()
  return new webpack.ProgressPlugin((percentage: number, msg: string) => {
    if (!spinner.isSpinning) {
      spinner.start()
    }
    spinner.text = `${(percentage * 100).toFixed(2)}% ${msg}`
    if (percentage === 1) {
      spinner.stop()
    }
  })
}

function getPlugins(isServer: boolean, config: Config): webpack.Plugin[] {
  const envVariables = getEnvVariables(config)

  const plugins: webpack.Plugin[] = [
    new webpack.DefinePlugin(envVariables.stringified),
  ]

  if (isServer || !config.isDev) {
    plugins.push(
      getProgressPlugin()
    )
  }
  if (isServer && config.isDev) {
    plugins.push(
      new HTMLWebpackPlugin({
        template: config.htmlTemplatePath,
        filename: config.builtHTMLPath,
      }) as any,
      new InterpolateHTMLPlugin(HTMLWebpackPlugin, envVariables.raw as any),
      new HTMLAttributePlugin(config.htmlAttributes),
    )
  }

  if (!isServer && !config.isDev) {
    plugins.push(
      new MiniCssExtractPlugin({
        filename: 'style/[name].[contenthash:5].css',
        chunkFilename: 'style/[name].[contenthash:5].css',
      }),
      new HTMLWebpackPlugin({
        template: config.htmlTemplatePath,
        filename: config.builtHTMLPath,
        // 将 runtime.[hash].js 内联引入
        inlineSource: /runtime.(\w)*\.js$/,
      }) as any,
      new InterpolateHTMLPlugin(HTMLWebpackPlugin, envVariables.raw as any),
      new HTMLAttributePlugin(config.htmlAttributes),
      new InlineChunkHTMLPlugin(HTMLWebpackPlugin, [/runtime.(\w)*\.js$/])
    )
  }
  return plugins
}

function getOptimization(isServer: boolean, config: Config): webpack.Options.Optimization | undefined {
  if (isServer || config.isDev) {
    return undefined
  }
  const useSourceMap = !isServer && !config.isDev
  return {
    minimizer: [
      new TerserWebpackPlugin({
        extractComments: false,
        terserOptions: {
          sourceMap: useSourceMap,
          safari10: true,
          output: {
            comments: false,
          }
        }
      }),
      new OptimizeCSSAssetsPlugin({
        cssProcessorOptions: {
          parser: safePostCSSParser,
          map: {
            inline: false,
            annotation: true,
          },
        },
      }),
    ],
    splitChunks: {
      chunks: 'all',
      name: true,
      cacheGroups: {
        vonders: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vonders',
          priority: 10,
        },
      },
    },
    runtimeChunk: {
      name: 'runtime',
    },
  }
}

function getStyleLoaders(isServer: boolean, isModule: boolean, config: Config): webpack.RuleSetUse {
  const useSourceMap = !isServer && !config.isDev
  const cssLoader = {
    loader: require.resolve('css-loader'),
    options: {
      importLoaders: 1,
      modules: isModule && {
        localIdentName: '[name]-[local]',
      },
      // .hello-world 转成 classes.helloWorld
      localsConvention: 'camelCaseOnly',
      sourceMap: useSourceMap,
    },
  }

  const styleLoader = isServer
    ? require.resolve('isomorphic-style-loader')
    : config.isDev
      ? require.resolve('style-loader')
      : MiniCssExtractPlugin.loader

  const loaders: webpack.RuleSetUse = [
    styleLoader,
    cssLoader,
  ]

  if (!isServer && !config.isDev) {
    loaders.push({
      loader: require.resolve('postcss-loader'),
      options: {
        ident: 'postcss',
        plugins: () => [
          require('postcss-flexbugs-fixes'),
          require('postcss-preset-env')({
            autoprefixer: {
              flexbox: 'no-2009',
            },
            stage: 3,
          }),
        ],
        sourceMap: useSourceMap,
      }
    })
  }

  loaders.push({
    loader: require.resolve('sass-loader'),
    options: {
      prependData: config.sassData || '',
      sourceMap: useSourceMap,
    }
  })
  return loaders
}

function getEnvVariables(config: Config) {
  const filename = `.env.${process.env.NODE_ENV}.local`

  const fullPath = path.join(config.rootDir, filename)
  if (fs.existsSync(fullPath)) {
    const fileContent = fs.readFileSync(fullPath, 'utf-8')
    fileContent.split('\n').forEach(line => {
      if (!line.includes('=')) {
        return
      }
      const [key, value] = line.split('=')
      process.env[key] = value
    })
  }

  if (config.env && typeof config.env === 'object') {
    Object.keys(config.env).forEach(key => {
      process.env[key] = config.env[key]
    })
  }

  const variables = Object.keys(process.env)
    .reduce((variables, envKey) => {
      if (envKey.startsWith('APP_')) {
        variables[envKey] = process.env[envKey] as string
      }
      return variables
    }, { 
      NODE_ENV: process.env.NODE_ENV, 
      PORT: config.port,
      PUBLIC_URL: config.publicPath || '/',
    } as Record<string, string | number>)

  return {
    stringified: {
      'process.env': Object.keys(variables).reduce((env, key) => {
        env[key] = JSON.stringify(variables[key])
        return env
      }, {} as Record<string, string>)
    },
    raw: variables,
  }
}