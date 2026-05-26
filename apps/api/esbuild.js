// Production bundle for the Fastify API.
//
// Bundles src/index.ts -> dist/index.js, inlining the workspace package
// (@aicrm/shared) but keeping node_modules external (resolved by node at
// runtime). This makes `node dist/index.js` work in production without the
// TS-source resolution that the dev runner (tsx) handles.
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

// Externalize every runtime dependency EXCEPT the workspace package, which we
// inline so the output has no TS-source imports left to resolve.
const external = Object.keys(pkg.dependencies ?? {}).filter(
  (d) => d !== "@aicrm/shared",
);

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/index.js",
  external,
  sourcemap: true,
  logLevel: "info",
  // Shim require/__dirname for any externalized CJS deps used in the ESM output.
  banner: {
    js: [
      "import { createRequire as __cr } from 'module';",
      "import { fileURLToPath as __f } from 'url';",
      "import { dirname as __d } from 'path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __f(import.meta.url);",
      "const __dirname = __d(__filename);",
    ].join("\n"),
  },
});
