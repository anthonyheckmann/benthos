/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const path = require('path');
const {normalizeUrl, docuHash, aliasedSitePath} = require('@docusaurus/utils');

const {generateCookbookPosts} = require('./cookbookUtils');

const DEFAULT_OPTIONS = {
  path: 'cookbooks', // Path to data on filesystem, relative to site dir.
  routeBasePath: 'cookbooks', // URL Route.
  include: ['*.md', '*.mdx'], // Extensions to include.
  guideListComponent: '@theme/CookbookListPage',
  guidePostComponent: '@theme/CookbookPage',
  remarkPlugins: [],
  rehypePlugins: [],
  truncateMarker: /<!--\s*(truncate)\s*-->/, // string or regex
};

module.exports = pluginContentCookbook;

function pluginContentCookbook(context, opts) {
  const options = {...DEFAULT_OPTIONS, ...opts};
  const {siteDir, generatedFilesDir} = context;
  const contentPath = path.resolve(siteDir, options.path);
  const dataDir = path.join(
    generatedFilesDir,
    'cookbooks',
  );

  return {
    name: 'cookbooks',

    getPathsToWatch() {
      const {include = []} = options;
      const globPattern = include.map(pattern => `${contentPath}/${pattern}`);
      return [...globPattern];
    },

    // Fetches guide contents and returns metadata for the necessary routes.
    async loadContent() {
      const guidePosts = await generateCookbookPosts(contentPath, context, options);
      if (!guidePosts) {
        return null;
      }

      return {
        guidePosts,
      };
    },

    async contentLoaded({content, actions}) {
      if (!content) {
        return;
      }

      const {
        guideListComponent,
        guidePostComponent,
      } = options;

      const aliasedSource = (source) =>
        `~cookbook/${path.relative(dataDir, source)}`;
      const {addRoute, createData} = actions;
      const {
        guidePosts,
      } = content;

      // Create routes for guide entries.
      await Promise.all(
        guidePosts.map(async guidePost => {
          const {metadata} = guidePost;
          await createData(
            // Note that this created data path must be in sync with metadataPath provided to mdx-loader
            `${docuHash(metadata.source)}.json`,
            JSON.stringify(metadata, null, 2),
          );

          addRoute({
            path: metadata.permalink,
            component: guidePostComponent,
            exact: true,
            modules: {
              content: metadata.source,
            },
          });
        }),
      );

      const {routeBasePath} = options;
      const {
        siteConfig: {baseUrl = ''},
      } = context;
      const basePageUrl = normalizeUrl([baseUrl, routeBasePath]);

      const listPageMetadataPath = await createData(
        `${docuHash(`${basePageUrl}`)}.json`,
        JSON.stringify({}, null, 2),
      );

      let basePageItems = guidePosts.map(guidePost => {
        const {metadata} = guidePost;
        // To tell routes.js this is an import and not a nested object to recurse.
        return {
          content: {
            __import: true,
            path: metadata.source,
            query: {
              truncated: true,
            },
          },
        };
      });

      addRoute({
        path: basePageUrl,
        component: guideListComponent,
        exact: true,
        modules: {
          items: basePageItems,
          metadata: aliasedSource(listPageMetadataPath),
        },
      });
    },

    configureWebpack(
      _config,
      isServer,
      {getBabelLoader, getCacheLoader},
    ) {
      const {rehypePlugins, remarkPlugins, truncateMarker} = options;
      return {
        resolve: {
          alias: {
            '~cookbook': dataDir,
          },
        },
        module: {
          rules: [
            {
              test: /(\.mdx?)$/,
              include: [contentPath],
              use: [
                getCacheLoader(isServer),
                getBabelLoader(isServer),
                {
                  loader: '@docusaurus/mdx-loader',
                  options: {
                    remarkPlugins,
                    rehypePlugins,
                    // Note that metadataPath must be the same/ in-sync as the path from createData for each MDX
                    metadataPath: (mdxPath) => {
                      const aliasedSource = aliasedSitePath(mdxPath, siteDir);
                      return path.join(
                        dataDir,
                        `${docuHash(aliasedSource)}.json`,
                      );
                    },
                  },
                },
                {
                  loader: path.resolve(__dirname, './markdownLoader.js'),
                  options: {
                    truncateMarker,
                  },
                },
              ].filter(Boolean),
            },
          ],
        },
      };
    },
  };
}
