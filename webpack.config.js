// Copyright (C) 2017-2023 Smart code 203358507

const path = require('path');
const { execSync } = require('child_process');
const webpack = require('webpack');
const HtmlWebPackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const packageJson = require('./package.json');

const readPublicBuildConfig = () => {
    try {
        return Object.fromEntries(
            require('fs').readFileSync(path.join(__dirname, '.env'), 'utf8')
                .split(/\r?\n/)
                .flatMap((line) => {
                    const match = line.match(/^\s*(CINE_SUPABASE_URL|CINE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/);
                    if (!match) return [];
                    return [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]];
                }),
        );
    } catch (_error) {
        if (_error.code === 'ENOENT') return {};
        throw _error;
    }
};

const buildNonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let COMMIT_HASH = `${packageJson.version}-${buildNonce}`;

try {
    const gitHash = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    if (gitHash) {
        COMMIT_HASH = gitHash;
    }
} catch (_error) {
    COMMIT_HASH = `${packageJson.version}-${buildNonce}`;
}

module.exports = (env = {}, argv) => {
    const publicBuildConfig = readPublicBuildConfig();
    const target = env.target || 'all';
    const entries = target === 'app' ?
        { main: './src/index.js', worker: './node_modules/@stremio/stremio-core-web/worker.js' } :
        target === 'admin' ?
            { admin: './src/admin/index.tsx' } :
            {
                main: './src/index.js',
                admin: './src/admin/index.tsx',
                worker: './node_modules/@stremio/stremio-core-web/worker.js',
            };
    const outputDirectory = target === 'all' ? 'build' : path.join('build', target);

    return ({
        mode: argv.mode,
        devtool: argv.mode === 'production' ? false : 'eval-source-map',
        entry: entries,
        output: {
            path: path.join(__dirname, outputDirectory),
            filename: `${COMMIT_HASH}/scripts/[name].js`,
            clean: true,
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'babel-loader',
                            options: {
                                presets: [
                                    '@babel/preset-env',
                                    '@babel/preset-react'
                                ],
                            }
                        }
                    ]
                },
                {
                    test: /\.(ts|tsx)$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: {
                                transpileOnly: true,
                            }
                        }
                    ]
                },
                {
                    test: /\.less$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: MiniCssExtractPlugin.loader,
                            options: {
                                esModule: false
                            }
                        },
                        {
                            loader: 'css-loader',
                            options: {
                                esModule: false,
                                importLoaders: 2,
                                modules: {
                                    namedExport: false,
                                    localIdentName: '[local]-[hash:base64:5]'
                                }
                            }
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                postcssOptions: {
                                    plugins: [
                                        ['cssnano', {
                                            preset: [
                                                'advanced',
                                                {
                                                    autoprefixer: {
                                                        add: true,
                                                        remove: true,
                                                        flexbox: false,
                                                        grid: false
                                                    },
                                                    cssDeclarationSorter: true,
                                                    calc: false,
                                                    colormin: false,
                                                    convertValues: false,
                                                    discardComments: {
                                                        removeAll: true,
                                                    },
                                                    discardOverridden: false,
                                                    discardUnused: false,
                                                    mergeIdents: false,
                                                    normalizeDisplayValues: false,
                                                    normalizePositions: false,
                                                    normalizeRepeatStyle: false,
                                                    normalizeUnicode: false,
                                                    normalizeUrl: false,
                                                    reduceIdents: false,
                                                    reduceInitial: false,
                                                    zindex: false
                                                }
                                            ]
                                        }]
                                    ]
                                }
                            }
                        },
                        {
                            loader: 'less-loader',
                            options: {
                                lessOptions: {
                                    strictMath: true,
                                    ieCompat: false
                                }
                            }
                        }
                    ]
                },
                {
                    test: /\.(ttf|woff2)$/,
                    exclude: /node_modules/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'fonts/[name][ext][query]'
                    }
                },
                {
                    test: /\.(png|jpe?g|svg)$/,
                    exclude: /node_modules/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/[name][ext][query]'
                    }
                },
                {
                    test: /\.wasm$/,
                    type: 'asset/resource',
                    generator: {
                        filename: `${COMMIT_HASH}/binaries/[name][ext][query]`
                    }
                }
            ]
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js', '.json', '.less', '.wasm'],
            alias: {
                'stremio': path.resolve(__dirname, 'src'),
                'stremio-router': path.resolve(__dirname, 'src', 'router')
            }
        },
        devServer: {
            host: '0.0.0.0',
            port: 8081,
            static: false,
            hot: false,
            server: 'https',
            liveReload: false
        },
        optimization: {
            minimize: false
        },
        plugins: [
            new webpack.EnvironmentPlugin({
                SENTRY_DSN: env.SENTRY_DSN || null,
                CINE_SUPABASE_URL: env.CINE_SUPABASE_URL || process.env.CINE_SUPABASE_URL || publicBuildConfig.CINE_SUPABASE_URL || '',
                CINE_SUPABASE_ANON_KEY: env.CINE_SUPABASE_ANON_KEY || process.env.CINE_SUPABASE_ANON_KEY || publicBuildConfig.CINE_SUPABASE_ANON_KEY || '',
                DEBUG: argv.mode !== 'production',
                VERSION: packageJson.version,
                COMMIT_HASH
            }),
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer']
            }),
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'assets/favicons', to: 'favicons' },
                    { from: 'assets/images', to: 'images' },
                    { from: 'assets/icon.ico', to: 'assets/icon.ico' },
                    { from: 'assets/icon.png', to: 'assets/icon.png' },
                    { from: 'assets/screenshots/*.webp', to: 'screenshots/[name][ext]' },
                    { from: '.well-known', to: '.well-known' },
                    { from: 'manifest.json', to: 'manifest.json' },
                ]
            }),
            new MiniCssExtractPlugin({
                filename: `${COMMIT_HASH}/styles/[name].css`
            }),
            ...(target !== 'admin' ? [new HtmlWebPackPlugin({
                template: './src/index.html',
                chunks: ['main', 'worker'],
                inject: false,
                scriptLoading: 'blocking',
                faviconsPath: 'favicons',
                imagesPath: 'images',
            })] : []),
            ...(target !== 'app' ? [new HtmlWebPackPlugin({
                filename: 'admin.html',
                template: './src/admin.html',
                chunks: ['admin'],
                inject: false,
                scriptLoading: 'blocking',
                faviconsPath: 'favicons',
                imagesPath: 'images',
            })] : []),
        ].filter(Boolean)
    });
};
