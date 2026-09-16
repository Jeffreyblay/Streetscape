import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumBuild = 'node_modules/cesium/Build/Cesium'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        // Cesium's runtime assets, served at /cesium/* (see CESIUM_BASE_URL in index.html).
        // Only the parts this app uses are copied - see docs in README (Deployment).
        ...[
          'Workers/**/*',
          'Widgets/**/*',
          'ThirdParty/Workers/**/*',
          'ThirdParty/zip-module.wasm',
          'ThirdParty/wasm_splats_bg.wasm',
          'Assets/Images/**/*', // credit logos
          'Assets/approximateTerrainHeights.json', // needed to clamp buildings to terrain
          'Assets/Textures/waterNormals.jpg', // the water surface ripples
          'Assets/Textures/pin.svg',
        ].map((pattern) => ({
          src: `${cesiumBuild}/${pattern}`,
          dest: 'cesium',
          rename: { stripBase: 4 }, // node_modules/cesium/Build/Cesium
        })),
        // Prepared data from the Python pipeline, served at /data/*
        {
          src: '../data/processed/*.{json,geojson,png}',
          dest: 'data',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
})
