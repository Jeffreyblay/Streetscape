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
        // Cesium's runtime assets, served at /cesium/* (see CESIUM_BASE_URL in index.html)
        ...['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
          src: `${cesiumBuild}/${dir}/**/*`,
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
